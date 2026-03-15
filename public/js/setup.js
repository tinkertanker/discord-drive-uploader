const setupTokenStorageKey = 'discord-drive-setup-token';
const setupAuthRequired = getMeta('setup-auth-required') === 'true';
const DEFAULT_DISCORD_FOLDER_NAME = 'default-for-discord';
let currentStep = 2;
let selectedFolderId = null;
let selectedFolderName = null;
let createDefaultFolder = false;
let selectedChannelFolderId = null;
let selectedChannelFolderName = null;
let folders = [];
let googlePickerConfig = null;
let pickerApiReadyPromise = null;
const channelConfigs = new Map();
let guilds = [];

function getStoredSetupToken() {
  return sessionStorage.getItem(setupTokenStorageKey) || '';
}

function clearStoredSetupToken() {
  sessionStorage.removeItem(setupTokenStorageKey);
}

function requestSetupToken() {
  const token = window.prompt('Enter setup token configured on the server');
  if (!token) return '';

  const trimmed = token.trim();
  if (!trimmed) return '';

  sessionStorage.setItem(setupTokenStorageKey, trimmed);
  return trimmed;
}

function getSetupToken() {
  if (!setupAuthRequired) return '';

  let token = getStoredSetupToken();
  if (token) return token;

  token = requestSetupToken();
  return token;
}

function withSetupAuthHeaders(extra = {}) {
  if (!setupAuthRequired) {
    return extra;
  }

  const token = getSetupToken();
  if (!token) {
    throw new Error('Setup token required');
  }

  return {
    ...extra,
    'X-Setup-Token': token
  };
}

function throwIfUnauthorized(response) {
  if (response.status !== 401 && response.status !== 403) {
    return false;
  }

  clearStoredSetupToken();
  throw new Error('Invalid or expired setup token');
}

function nextStep() {
  showStep(currentStep + 1);
}

function showStep(step) {
  document.querySelectorAll('.step').forEach((el) => {
    el.classList.remove('active');
  });

  const stepElement = document.querySelector(`[data-step="${step}"]`);
  if (!stepElement) return;

  stepElement.classList.add('active');
  currentStep = step;

  if (step === 3) {
    loadDefaultFolderStep();
  } else if (step === 5) {
    loadMappingStep();
  } else if (step === 6) {
    generateInviteLink();
    loadSetupComplete();
  }
}

function resetToGoogleDriveStep(message) {
  folders = [];
  googlePickerConfig = null;
  selectedFolderId = null;
  selectedFolderName = null;
  createDefaultFolder = false;
  selectedChannelFolderId = null;
  selectedChannelFolderName = null;

  const params = new URLSearchParams(window.location.search);
  params.delete('step');
  params.delete('oauth');
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, '', nextUrl);

  showStep(2);
  if (message) {
    showError(message);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setLinkFeedback(message, isError = false) {
  const feedback = document.getElementById('link-feedback');
  feedback.textContent = message;
  feedback.style.color = isError ? 'var(--error)' : 'var(--secondary-color)';
  feedback.classList.toggle('show', Boolean(message));
}

function showError(message) {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = message;
  errorEl.classList.add('show');
  setTimeout(() => errorEl.classList.remove('show'), 5000);
}

function parseResponseError(response, fallback) {
  return response.json().then((payload) => payload.error || fallback);
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return (el?.value || '').trim();
}

function setButtonLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? 'Loading...' : button.dataset.defaultText || 'Continue';
}

function formatChannelLabel(channelId) {
  return escapeHtml(String(channelId));
}

function updateChannelFolderSummary() {
  const selectedFolder = document.getElementById('selected-channel-folder');
  if (!selectedFolder) return;

  if (!selectedChannelFolderId || !selectedChannelFolderName) {
    selectedFolder.innerHTML = '<p class="info">No Google Drive folder selected yet.</p>';
    return;
  }

  selectedFolder.innerHTML = `
    <div class="picker-selection">
      <strong>Selected folder</strong>
      <span>${escapeHtml(selectedChannelFolderName)}</span>
    </div>
  `;
}

async function apiGet(path) {
  const headers = withSetupAuthHeaders({
    'Content-Type': 'application/json'
  });
  return fetch(path, { headers });
}

async function apiPost(path, body) {
  const headers = withSetupAuthHeaders({
    'Content-Type': 'application/json'
  });
  return fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

async function startGoogleAuth() {
  try {
    window.location.href = '/auth/google/start';
  } catch {
    showError('Failed to start Google authentication');
  }
}

async function loadGooglePickerConfig(forceRefresh = false) {
  if (googlePickerConfig && !forceRefresh) {
    return googlePickerConfig;
  }

  const response = await apiGet('/api/google-picker-config');
  throwIfUnauthorized(response);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Unable to prepare Google Drive picker');
  }

  googlePickerConfig = await response.json();
  return googlePickerConfig;
}

async function ensureGooglePickerLoaded() {
  if (window.google?.picker) {
    return;
  }

  if (!window.gapi) {
    throw new Error('Google Picker library failed to load');
  }

  if (!pickerApiReadyPromise) {
    pickerApiReadyPromise = new Promise((resolve, reject) => {
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Failed to load Google Picker'))
      });
    });
  }

  await pickerApiReadyPromise;
}

function updateDefaultFolderSummary() {
  const selectedFolder = document.getElementById('selected-folder');
  const continueButton = document.getElementById('continue-folder');
  if (!selectedFolder) return;

  if (!selectedFolderId || !selectedFolderName) {
    selectedFolder.innerHTML = createDefaultFolder
      ? `<p class="info">No parent folder selected yet. We will create <code>${escapeHtml(DEFAULT_DISCORD_FOLDER_NAME)}</code> inside the folder you pick.</p>`
      : '<p class="info">No fallback folder selected yet.</p>';
    if (continueButton) {
      continueButton.disabled = true;
    }
    return;
  }

  if (createDefaultFolder) {
    selectedFolder.innerHTML = `
      <div class="picker-selection">
        <strong>Selected parent folder</strong>
        <span>${escapeHtml(selectedFolderName)}</span>
        <small>A new <code>${escapeHtml(DEFAULT_DISCORD_FOLDER_NAME)}</code> folder will be created inside this location and used for uploads.</small>
      </div>
    `;
  } else {
    selectedFolder.innerHTML = `
      <div class="picker-selection">
        <strong>Selected folder</strong>
        <span>${escapeHtml(selectedFolderName)}</span>
      </div>
    `;
  }

  if (continueButton) {
    continueButton.disabled = false;
  }
}

function renderDefaultFolderPicker() {
  const folderList = document.getElementById('folder-list');
  if (!folderList) return;

  folderList.innerHTML = `
    <div class="picker-launcher">
      <label class="checkbox-option" for="create-default-folder-checkbox">
        <input type="checkbox" id="create-default-folder-checkbox">
        <span>Create a <code>${escapeHtml(DEFAULT_DISCORD_FOLDER_NAME)}</code> folder here for me</span>
      </label>
      <p class="info compact-info">If ticked, the folder you choose becomes the parent folder and we will create a new upload folder inside it.</p>
      <button class="btn btn-primary" id="open-default-folder-picker" data-default-text="Choose folder in Google Drive">
        Choose folder in Google Drive
      </button>
      <div id="selected-folder"></div>
    </div>
  `;

  const checkbox = document.getElementById('create-default-folder-checkbox');
  if (checkbox) {
    checkbox.checked = createDefaultFolder;
    checkbox.addEventListener('change', (event) => {
      createDefaultFolder = event.currentTarget.checked;
      updateDefaultFolderSummary();
    });
  }

  document.getElementById('open-default-folder-picker')?.addEventListener('click', openDefaultFolderPicker);
  updateDefaultFolderSummary();
}

async function loadDefaultFolderStep() {
  const folderList = document.getElementById('folder-list');
  if (!folderList) return;

  folderList.innerHTML = '<div class="loading">Preparing Google Drive picker...</div>';

  try {
    const config = await loadGooglePickerConfig();
    if (!config.accessToken) {
      throw new Error('Google Drive session is missing or expired');
    }

    renderDefaultFolderPicker();
  } catch (error) {
    console.error(error);
    resetToGoogleDriveStep(error.message || 'Connect Google Drive first before choosing a folder.');
  }
}

async function openDriveFolderPicker(title, onPicked) {
  const config = await loadGooglePickerConfig(true);
  if (!config.accessToken) {
    throw new Error('Google Drive session is missing or expired');
  }

  await ensureGooglePickerLoaded();

  const ViewId = window.google.picker.ViewId;
  const DocsView = window.google.picker.DocsView;

  // My Drive (includes Shared drives when SUPPORT_DRIVES is enabled)
  const myDriveView = new DocsView(ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setEnableDrives(true);

  // Shared with me
  const sharedWithMeView = new DocsView(ViewId.DOCS)
    .setOwnedByMe(false)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);

  // Starred
  const starredView = new DocsView(ViewId.DOCS)
    .setStarred(true)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);

  let pickerBuilder = new window.google.picker.PickerBuilder()
    .setOAuthToken(config.accessToken)
    .setOrigin(window.location.origin)
    .addView(myDriveView)
    .addView(sharedWithMeView)
    .addView(starredView)
    .setTitle(title)
    .setCallback((data) => {
      if (data.action !== window.google.picker.Action.PICKED || !data.docs?.length) {
        return;
      }

      const doc = data.docs[0];
      // Only accept folder selection
      if (doc.mimeType !== 'application/vnd.google-apps.folder') {
        showError('Please select a folder, not a file.');
        return;
      }
      onPicked({
        id: doc.id,
        name: doc.name || doc.title || 'Unnamed folder'
      });
    });

  if (config.apiKey) {
    pickerBuilder = pickerBuilder.setDeveloperKey(config.apiKey);
  }

  if (config.appId) {
    pickerBuilder = pickerBuilder.setAppId(config.appId);
  }

  if (window.google.picker.Feature?.SUPPORT_DRIVES) {
    pickerBuilder = pickerBuilder.enableFeature(window.google.picker.Feature.SUPPORT_DRIVES);
  }

  const picker = pickerBuilder.build();
  picker.setVisible(true);
}

async function openDefaultFolderPicker(event) {
  const button = event.currentTarget;
  setButtonLoading(button, true);

  try {
    const pickerTitle = createDefaultFolder
      ? 'Select where to create your default-for-discord folder'
      : 'Select a default Google Drive folder';

    await openDriveFolderPicker(pickerTitle, (folder) => {
      selectedFolderId = folder.id;
      selectedFolderName = folder.name;
      updateDefaultFolderSummary();
    });
  } catch (error) {
    showError(error.message);
  } finally {
    setButtonLoading(button, false);
  }
}

async function loadFolders() {
  const folderList = document.getElementById('folder-list');
  folderList.innerHTML = '<div class="loading">Loading folders...</div>';

  try {
    const response = await apiGet('/api/folders');
    throwIfUnauthorized(response);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Unable to fetch folders');
    }

    const rawBody = await response.text();
    if (!rawBody.trim()) {
      throw new Error('Google Drive session is missing or expired');
    }

    const data = JSON.parse(rawBody);
    folders = data.folders || data;
    if (!folders || folders.length === 0) {
      folderList.innerHTML = '<div class="loading">No folders found</div>';
      return;
    }

    folderList.innerHTML = folders
      .map((folder) => `
        <button class="btn btn-secondary folder-item" data-folder-id="${folder.id}" data-folder-name="${folder.name}">
          ${folder.name}
        </button>
      `).join('');

    folderList.querySelectorAll('.folder-item').forEach((button) => {
      button.addEventListener('click', () => {
        selectFolder(button.dataset.folderId, button.dataset.folderName, button);
      });
    });
  } catch (error) {
    console.error(error);
    resetToGoogleDriveStep(error.message || 'Connect Google Drive first before choosing a folder.');
  }
}

function selectFolder(folderId, folderName, element) {
  document.querySelectorAll('.folder-item').forEach((el) => el.classList.remove('selected'));
  element.classList.add('selected');
  selectedFolderId = folderId;
  selectedFolderName = folderName;
  const continueButton = document.getElementById('continue-folder');
  if (continueButton) {
    continueButton.disabled = false;
  }
}

async function saveFolderAndContinue() {
  if (!selectedFolderId) {
    showError('Please select a folder');
    return;
  }

  const button = document.getElementById('continue-folder');
  setButtonLoading(button, true);
  try {
    const response = await apiPost('/api/config-folder', {
      folderId: selectedFolderId,
      folderName: selectedFolderName,
      createDefaultFolder
    });
    throwIfUnauthorized(response);
    if (!response.ok) {
      const message = await parseResponseError(response, 'Failed to save folder configuration');
      throw new Error(message);
    }

    const result = await response.json();
    if (result.folder?.id && result.folder?.name) {
      selectedFolderId = result.folder.id;
      selectedFolderName = result.folder.name;
    }

    nextStep();
  } catch (error) {
    showError(`Failed to save folder: ${error.message}`);
  } finally {
    setButtonLoading(button, false);
  }
}

function addContinueButtonToFolderStep() {
  const stepThree = document.querySelector('[data-step="3"]');
  if (document.getElementById('continue-folder')) return;

  const button = document.createElement('button');
  button.id = 'continue-folder';
  button.className = 'btn btn-primary';
  button.dataset.defaultText = 'Continue';
  button.textContent = 'Continue';
  button.disabled = !selectedFolderId;
  button.addEventListener('click', saveFolderAndContinue);
  stepThree.appendChild(button);
}

function addLoadingText(button, loadingText) {
  button.textContent = loadingText;
  button.disabled = true;
}

function clearLoadingText(button, text) {
  button.textContent = text;
  button.disabled = false;
}

async function saveDiscordToken() {
  const token = getInputValue('discord-token');
  if (!token) {
    showError('Please enter your Discord bot token');
    return;
  }

  const button = document.querySelector('[data-step="4"] .btn-primary');
  addLoadingText(button, 'Saving...');
  try {
    const response = await apiPost('/api/config-discord', {
      token
    });
    throwIfUnauthorized(response);
    if (!response.ok) {
      const message = await parseResponseError(response, 'Failed to save Discord token');
      throw new Error(message);
    }

    nextStep();
  } catch (error) {
    showError(error.message);
  } finally {
    clearLoadingText(button, 'Continue');
  }
}

async function loadGuilds() {
  const response = await apiGet('/api/bot-guilds');
  throwIfUnauthorized(response);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.guilds || [];
}

async function loadGuildChannels(guildId) {
  const response = await apiGet(`/api/guild-channels?guildId=${encodeURIComponent(guildId)}`);
  throwIfUnauthorized(response);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.channels || [];
}

async function loadChannelConfigs() {
  const response = await apiGet('/api/channel-configs');
  throwIfUnauthorized(response);
  if (!response.ok) return [];

  const data = await response.json();
  return data.configs || [];
}

async function loadMappingStep() {
  const guildSelector = document.getElementById('guild-selector');
  const channelSelector = document.getElementById('channel-selector');
  const folderPickerButton = document.getElementById('open-channel-folder-picker');
  if (!guildSelector || !channelSelector || !folderPickerButton) return;

  setLinkFeedback('');

  guildSelector.innerHTML = '<option value="">Loading servers...</option>';
  channelSelector.innerHTML = '<option value="">Select a server first</option>';
  updateChannelFolderSummary();

  guilds = await loadGuilds();
  guildSelector.innerHTML = guilds.length
    ? '<option value="">Select a server</option>'
    : '<option value="">Invite the bot to a server first</option>';
  if (!guilds.length) {
    channelSelector.disabled = true;
    document.getElementById('link-channel-btn').disabled = true;
  } else {
    document.getElementById('link-channel-btn').disabled = false;
  }

  guilds.forEach((guild) => {
    const option = document.createElement('option');
    option.value = guild.id;
    option.textContent = guild.name;
    guildSelector.appendChild(option);
  });

  const links = await loadChannelConfigs();
  channelConfigs.clear();
  links.forEach((config) => {
    channelConfigs.set(`${config.guildId}:${config.channelId}`, config);
  });
  renderChannelLinks();

  guildSelector.onchange = onGuildSelectionChange;
  if (guilds.length > 0) {
    channelSelector.disabled = true;
  }
}

async function onGuildSelectionChange(event) {
  const guildSelector = event.target;
  const channelSelector = document.getElementById('channel-selector');

  if (!guildSelector.value) {
    channelSelector.innerHTML = '<option value="">Select a server first</option>';
    channelSelector.disabled = true;
    return;
  }

  channelSelector.disabled = false;
  channelSelector.innerHTML = '<option value="">Loading channels...</option>';
  const channels = await loadGuildChannels(guildSelector.value);
  if (!channels.length) {
    channelSelector.innerHTML = '<option value="">No text channels found</option>';
    return;
  }

  channelSelector.innerHTML = '<option value="">Select a channel</option>';
  channels.forEach((channel) => {
    const option = document.createElement('option');
    option.value = channel.id;
    option.textContent = channel.name;
    channelSelector.appendChild(option);
  });
}

function renderChannelLinks() {
  const list = document.getElementById('channel-links-list');
  if (!list) return;

  if (channelConfigs.size === 0) {
    list.innerHTML = '<p class="info">No linked channels yet.</p>';
    return;
  }

  const rows = Array.from(channelConfigs.values())
    .sort((a, b) => `${a.guildName}|${a.channelId}`.localeCompare(`${b.guildName}|${b.channelId}`))
    .map((config) => {
      const key = `${config.guildId}:${config.channelId}`;
      return `
        <div class="mapping-item">
          <div>
            <strong>${config.guildName || config.guildId}</strong><br>
            <small>${formatChannelLabel(config.channelId)} → ${config.folderName || 'No folder'}</small>
          </div>
          <div class="actions">
            <button class="btn btn-primary" data-action="toggle" data-key="${key}">
              ${config.enabled ? 'Stop sync' : 'Start sync'}
            </button>
            <button class="btn btn-secondary" data-action="remove" data-key="${key}">Remove</button>
          </div>
        </div>
      `;
    })
    .join('');

  list.innerHTML = rows;

  list.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const config = channelConfigs.get(key);
      if (!config) return;

      const enabled = !config.enabled;
      btn.disabled = true;
      try {
        await updateChannelMapping(config.guildId, config.channelId, {
          enabled
        });
        await loadMappingStep();
      } catch (error) {
        setLinkFeedback(error.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  list.querySelectorAll('[data-action="remove"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const config = channelConfigs.get(key);
      if (!config) return;

      btn.disabled = true;
      try {
        await removeChannelMapping(config.guildId, config.channelId);
        await loadMappingStep();
      } catch (error) {
        setLinkFeedback(error.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function linkChannelToFolder() {
  const guildId = getInputValue('guild-selector');
  const channelId = getInputValue('channel-selector');
  const folderId = selectedChannelFolderId;
  const folderName = selectedChannelFolderName;

  if (!guildId || !channelId || !folderId || !folderName) {
    setLinkFeedback('Pick a server, channel, and folder before linking.', true);
    return;
  }

  setLinkFeedback('');
  const button = document.getElementById('link-channel-btn');
  addLoadingText(button, 'Linking...');

  try {
    const response = await apiPost('/api/config-channel', {
      guildId,
      channelId,
      folderId,
      folderName
    });
    throwIfUnauthorized(response);
    if (!response.ok) {
      const message = await parseResponseError(response, 'Failed to link channel');
      throw new Error(message);
    }

    await loadMappingStep();
    setLinkFeedback('Channel linked.');
  } catch (error) {
    setLinkFeedback(error.message, true);
  } finally {
    clearLoadingText(button, 'Link channel to folder');
  }
}

async function updateChannelMapping(guildId, channelId, updates) {
  const response = await apiPost('/api/config-channel', {
    guildId,
    channelId,
    enabled: updates.enabled,
    folderId: updates.folderId,
    folderName: updates.folderName
  });
  throwIfUnauthorized(response);
  if (!response.ok) {
    const message = await parseResponseError(response, 'Failed to update channel mapping');
    throw new Error(message);
  }
}

async function removeChannelMapping(guildId, channelId) {
  const response = await apiPost('/api/config-channel', {
    guildId,
    channelId,
    remove: true
  });
  throwIfUnauthorized(response);
  if (!response.ok) {
    const message = await parseResponseError(response, 'Failed to remove channel mapping');
    throw new Error(message);
  }
}

function setupMappingActions() {
  const button = document.getElementById('link-channel-btn');
  button?.addEventListener('click', linkChannelToFolder);
  document.getElementById('open-channel-folder-picker')?.addEventListener('click', openChannelFolderPicker);
}

async function openChannelFolderPicker(event) {
  const button = event.currentTarget;
  setButtonLoading(button, true);

  try {
    await openDriveFolderPicker('Select a Google Drive folder for this channel', (folder) => {
      selectedChannelFolderId = folder.id;
      selectedChannelFolderName = folder.name;
      updateChannelFolderSummary();
    });
  } catch (error) {
    showError(error.message);
  } finally {
    setButtonLoading(button, false);
  }
}

function generateInviteLink() {
  const appId = getMeta('discord-app-id');
  if (!appId) return;

  const permissions = '3072';
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${appId}&permissions=${permissions}&scope=bot%20applications.commands`;
  document.getElementById('bot-invite').value = inviteUrl;
}

function copyInviteLink(event) {
  const inviteInput = document.getElementById('bot-invite');
  inviteInput.select();
  document.execCommand('copy');

  const btn = event.target;
  const previous = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(() => {
    btn.textContent = previous;
  }, 2000);
}

function getMeta(name) {
  const element = document.querySelector(`meta[name="${name}"]`);
  return element ? element.content : null;
}

async function loadSetupComplete() {
  try {
    const responseWithAuth = await apiGet('/api/setup-complete');
    throwIfUnauthorized(responseWithAuth);
    if (!responseWithAuth.ok) return;

    const data = await responseWithAuth.json();
    document.getElementById('setup-status').textContent = data.message;
  } catch (error) {
    console.error('Failed to load setup status:', error);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  addContinueButtonToFolderStep();
  setupMappingActions();

  const params = new URLSearchParams(window.location.search);
  if (params.get('step') === '3' || params.get('oauth') === 'success') {
    showStep(3);
  }

  const error = params.get('error');
  if (error === 'unauthorized_email') {
    const email = params.get('email') || 'this Google account';
    const allowed = params.get('allowed');
    const allowedText = allowed ? `@${allowed.split(',')[0]}` : 'an approved domain';
    const used = email.includes('@') ? email.split('@')[1] : email;
    showError(`This bot is restricted to ${allowedText}. You signed in with ${used}. Please use an approved Google account.`);
  }
});
