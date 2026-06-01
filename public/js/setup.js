const setupTokenStorageKey = 'discord-drive-setup-token';
const setupAuthRequired = getMeta('setup-auth-required') === 'true';
const SETUP_STEPS = ['google', 'folder', 'token'];
const THEME_META_COLORS = { light: '#f7f8fa', dark: '#0e1116' };

const state = {
  configured: { google: false, defaultFolder: false, discord: false },
  defaultFolder: null,
  guilds: [],
  guildNames: new Map(),
  channelNames: new Map(),
  links: [],
  // draft folder selections
  defaultDraft: { id: null, name: null, create: false },
  channelDraft: { id: null, name: null },
};

let googlePickerConfig = null;
let pickerApiReadyPromise = null;
let toastTimer = null;

/* ───────────────────────── small helpers ───────────────────────── */
function getMeta(name) {
  return document.querySelector(`meta[name="${name}"]`)?.content || null;
}
function el(id) {
  return document.getElementById(id);
}
function show(node, visible) {
  if (node) node.hidden = !visible;
}
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function setBusy(button, busy, busyText = 'Working…') {
  if (!button) return;
  if (busy) {
    button.dataset.idle = button.dataset.idle || button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.idle || button.textContent;
    button.disabled = false;
  }
}
function toast(message, isError = false) {
  const node = el('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      node.classList.remove('show');
      setTimeout(() => {
        node.hidden = true;
      }, 200);
    },
    isError ? 5000 : 2600
  );
}

/* ───────────────────────── setup-token auth ────────────────────── */
function requestSetupToken() {
  const token = window.prompt('Enter the setup token configured on the server');
  const trimmed = (token || '').trim();
  if (trimmed) sessionStorage.setItem(setupTokenStorageKey, trimmed);
  return trimmed;
}
function getSetupToken() {
  if (!setupAuthRequired) return '';
  return sessionStorage.getItem(setupTokenStorageKey) || requestSetupToken();
}
function withSetupAuthHeaders(extra = {}) {
  if (!setupAuthRequired) return extra;
  const token = getSetupToken();
  if (!token) throw new Error('Setup token required');
  return { ...extra, 'X-Setup-Token': token };
}
function throwIfUnauthorized(response) {
  if (response.status === 401 || response.status === 403) {
    sessionStorage.removeItem(setupTokenStorageKey);
    throw new Error('Invalid or expired setup token');
  }
}

/* ───────────────────────── api ─────────────────────────────────── */
async function apiGet(path) {
  return fetch(path, { headers: withSetupAuthHeaders({ 'Content-Type': 'application/json' }) });
}
async function apiPost(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: withSetupAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}
async function errorText(response, fallback) {
  return response
    .json()
    .then((payload) => payload.error || fallback)
    .catch(() => fallback);
}

/* ───────────────────────── google picker ───────────────────────── */
async function loadGooglePickerConfig(forceRefresh = false) {
  if (googlePickerConfig && !forceRefresh) return googlePickerConfig;
  const response = await apiGet('/api/google-picker-config');
  throwIfUnauthorized(response);
  if (!response.ok)
    throw new Error(await errorText(response, 'Unable to prepare Google Drive picker'));
  googlePickerConfig = await response.json();
  return googlePickerConfig;
}
async function ensureGooglePickerLoaded() {
  if (window.google?.picker) return;
  if (!window.gapi) throw new Error('Google Picker library failed to load');
  if (!pickerApiReadyPromise) {
    pickerApiReadyPromise = new Promise((resolve, reject) => {
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Failed to load Google Picker')),
      });
    });
  }
  await pickerApiReadyPromise;
}
async function openDriveFolderPicker(title, onPicked) {
  const config = await loadGooglePickerConfig(true);
  if (!config.accessToken) throw new Error('Google Drive session is missing or expired');
  await ensureGooglePickerLoaded();

  const { ViewId, DocsView, PickerBuilder, Action, Feature } = window.google.picker;
  const myDrive = new DocsView(ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setEnableDrives(true);
  const sharedWithMe = new DocsView(ViewId.DOCS)
    .setOwnedByMe(false)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);
  const starred = new DocsView(ViewId.DOCS)
    .setStarred(true)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);

  let builder = new PickerBuilder()
    .setOAuthToken(config.accessToken)
    .setOrigin(window.location.origin)
    .addView(myDrive)
    .addView(sharedWithMe)
    .addView(starred)
    .setTitle(title)
    .setCallback((data) => {
      if (data.action !== Action.PICKED || !data.docs?.length) return;
      const doc = data.docs[0];
      if (doc.mimeType !== 'application/vnd.google-apps.folder') {
        toast('Please pick a folder, not a file.', true);
        return;
      }
      onPicked({ id: doc.id, name: doc.name || doc.title || 'Unnamed folder' });
    });

  if (config.apiKey) builder = builder.setDeveloperKey(config.apiKey);
  if (config.appId) builder = builder.setAppId(config.appId);
  if (Feature?.SUPPORT_DRIVES) builder = builder.enableFeature(Feature.SUPPORT_DRIVES);
  builder.build().setVisible(true);
}

/* ───────────────────────── data loads ──────────────────────────── */
async function loadStatus() {
  const response = await apiGet('/api/setup-complete');
  throwIfUnauthorized(response);
  if (!response.ok) throw new Error(await errorText(response, 'Failed to load setup status'));
  const data = await response.json();
  state.configured = data.configured || { google: false, defaultFolder: false, discord: false };
  state.defaultFolder = data.defaultFolder || null;
  return data;
}
async function loadGuilds() {
  const response = await apiGet('/api/bot-guilds');
  throwIfUnauthorized(response);
  if (!response.ok) return [];
  return (await response.json()).guilds || [];
}
async function loadGuildChannels(guildId) {
  const response = await apiGet(`/api/guild-channels?guildId=${encodeURIComponent(guildId)}`);
  throwIfUnauthorized(response);
  if (!response.ok) return [];
  return (await response.json()).channels || [];
}
async function loadChannelConfigs() {
  const response = await apiGet('/api/channel-configs');
  throwIfUnauthorized(response);
  if (!response.ok) return [];
  return (await response.json()).configs || [];
}

/* ───────────────────────── view routing ────────────────────────── */
function isFullyConfigured() {
  const c = state.configured;
  return Boolean(c.google && c.defaultFolder && c.discord);
}
function firstIncompleteStep() {
  if (!state.configured.google) return 'google';
  if (!state.configured.defaultFolder) return 'folder';
  return 'token';
}

async function refresh() {
  try {
    await loadStatus();
  } catch (error) {
    toast(error.message || 'Could not reach the server.', true);
    return;
  }

  if (isFullyConfigured()) {
    show(el('setup-view'), false);
    await renderDashboard();
  } else {
    show(el('dashboard-view'), false);
    show(el('status-chips'), false);
    renderSetup(firstIncompleteStep());
  }
}

/* ───────────────────────── setup view ──────────────────────────── */
function renderSetup(step) {
  show(el('setup-view'), true);

  document.querySelectorAll('#stepper .stepper-item').forEach((item) => {
    const target = item.dataset.step;
    const isDone = SETUP_STEPS.indexOf(target) < SETUP_STEPS.indexOf(step);
    item.classList.toggle('active', target === step);
    item.classList.toggle('done', isDone);
  });

  document.querySelectorAll('#setup-view .panel').forEach((panel) => {
    panel.hidden = panel.dataset.step !== step;
  });

  if (step === 'folder') resetDefaultDraft('setup');
}

/* ───────────────────────── dashboard view ──────────────────────── */
async function renderDashboard() {
  show(el('dashboard-view'), true);
  renderStatusChips();
  renderDefaultFolder();

  let guilds = [];
  let links = [];
  try {
    [guilds, links] = await Promise.all([loadGuilds(), loadChannelConfigs()]);
  } catch (error) {
    toast(error.message || 'Failed to load channel links.', true);
  }
  state.guilds = guilds;
  state.guildNames = new Map(guilds.map((g) => [g.id, g.name]));
  state.links = links;

  renderInviteCallout();
  renderGuildOptions();
  renderLinks();

  // Resolve channel names in the background, then re-render the rows.
  await resolveChannelNames(links);
  renderLinks();
}

async function resolveChannelNames(links) {
  const guildIds = [...new Set(links.map((link) => link.guildId))].filter((id) =>
    state.guildNames.has(id)
  );
  try {
    const results = await Promise.all(
      guildIds.map((guildId) => loadGuildChannels(guildId).then((channels) => [guildId, channels]))
    );
    for (const [guildId, channels] of results) {
      for (const channel of channels) {
        state.channelNames.set(`${guildId}:${channel.id}`, channel.name);
      }
    }
  } catch {
    // Best-effort enhancement only — fall back to raw channel IDs on failure.
  }
}

function renderStatusChips() {
  const host = el('status-chips');
  if (!host) return;
  const chips = [
    ['Google', state.configured.google],
    ['Folder', state.configured.defaultFolder],
    ['Bot', state.configured.discord],
  ];
  host.innerHTML = chips
    .map(([label, on]) => `<span class="chip ${on ? 'on' : ''}">${label}</span>`)
    .join('');
  show(host, true);
}

function renderDefaultFolder() {
  const node = el('default-folder-name');
  if (node) node.textContent = state.defaultFolder?.name || 'Not set';
}

function renderInviteCallout() {
  const noGuilds = state.guilds.length === 0;
  show(el('invite-callout'), noGuilds);
  if (noGuilds) {
    const appId = getMeta('discord-app-id');
    const input = el('bot-invite');
    if (appId && input) {
      input.value = `https://discord.com/api/oauth2/authorize?client_id=${appId}&permissions=3072&scope=bot%20applications.commands`;
    }
  }
  // Hide the "add link" affordance until the bot is in at least one server.
  show(el('add-link-toggle'), !noGuilds);
}

function renderGuildOptions() {
  const select = el('guild-selector');
  if (!select) return;
  select.innerHTML = state.guilds.length
    ? '<option value="">Select a server</option>'
    : '<option value="">No servers yet</option>';
  state.guilds.forEach((guild) => {
    const option = document.createElement('option');
    option.value = guild.id;
    option.textContent = guild.name;
    select.appendChild(option);
  });
}

function renderLinks() {
  const list = el('links-list');
  if (!list) return;

  if (!state.links.length) {
    list.className = 'empty';
    list.textContent = state.guilds.length
      ? 'No channels linked yet. Use “Add link” to map a channel to a Drive folder.'
      : 'Invite the bot to a server to start linking channels.';
    return;
  }

  list.className = 'links';
  const rows = [...state.links]
    .sort((a, b) => {
      const an = state.guildNames.get(a.guildId) || a.guildId;
      const bn = state.guildNames.get(b.guildId) || b.guildId;
      return `${an}${a.channelId}`.localeCompare(`${bn}${b.channelId}`);
    })
    .map((config) => {
      const key = `${config.guildId}:${config.channelId}`;
      const server = escapeHtml(state.guildNames.get(config.guildId) || 'Unknown server');
      const channelName = state.channelNames.get(key);
      const channel = channelName
        ? `#${escapeHtml(channelName)}`
        : escapeHtml(String(config.channelId));
      const target = config.useDefault
        ? 'Default folder'
        : escapeHtml(config.folderName || 'No folder');
      return `
        <div class="link-row" data-key="${key}">
          <div class="link-main">
            <div class="link-title">
              <span>${server}</span>
              <span class="link-channel">${channel}</span>
              <span class="pill ${config.enabled ? 'on' : 'off'}">${config.enabled ? 'Syncing' : 'Paused'}</span>
            </div>
            <p class="link-target">→ ${target}</p>
          </div>
          <div class="link-actions">
            <button class="btn btn-secondary" data-action="toggle">${config.enabled ? 'Pause' : 'Resume'}</button>
            <button class="btn btn-danger" data-action="remove">Remove</button>
          </div>
        </div>`;
    })
    .join('');
  list.innerHTML = rows;
}

/* ───────────────────────── folder draft helpers ────────────────── */
function resetDefaultDraft(scope) {
  state.defaultDraft = { id: null, name: null, create: false };
  const prefix = scope === 'setup' ? 'setup' : 'dash';
  const checkbox = el(`${prefix}-create-folder`);
  if (checkbox) checkbox.checked = false;
  updateDefaultPicked(scope);
}
function updateDefaultPicked(scope) {
  const prefix = scope === 'setup' ? 'setup' : 'dash';
  const picked = el(`${prefix}-folder-picked`);
  const saveBtn = el(`${prefix}-save-folder`);
  const { id, name, create } = state.defaultDraft;
  if (!id) {
    if (picked) {
      picked.className = 'picked muted';
      picked.textContent = create
        ? 'Pick the parent folder for the new folder.'
        : 'No folder selected yet.';
    }
    if (saveBtn) saveBtn.disabled = true;
    return;
  }
  if (picked) {
    picked.className = 'picked set';
    picked.textContent = create ? `Create inside: ${name}` : `Selected: ${name}`;
  }
  if (saveBtn) saveBtn.disabled = false;
}
function updateChannelPicked() {
  const picked = el('channel-folder-picked');
  if (!picked) return;
  if (state.channelDraft.id) {
    picked.className = 'picked set';
    picked.textContent = `Selected: ${state.channelDraft.name}`;
  } else {
    picked.className = 'picked muted';
    picked.textContent = 'Folder optional — leave unset to use the default.';
  }
}

/* ───────────────────────── actions ─────────────────────────────── */
function startGoogleAuth() {
  window.location.href = '/auth/google/start';
}

async function pickDefaultFolder(scope) {
  const create = state.defaultDraft.create;
  try {
    await openDriveFolderPicker(
      create
        ? 'Pick where to create the default-for-discord folder'
        : 'Pick the default Drive folder',
      (folder) => {
        state.defaultDraft.id = folder.id;
        state.defaultDraft.name = folder.name;
        updateDefaultPicked(scope);
      }
    );
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveDefaultFolder(scope, button) {
  const { id, name, create } = state.defaultDraft;
  if (!id) {
    toast('Pick a folder first.', true);
    return;
  }
  setBusy(button, true, 'Saving…');
  try {
    const response = await apiPost('/api/config-folder', {
      folderId: id,
      folderName: name,
      createDefaultFolder: create,
    });
    throwIfUnauthorized(response);
    if (!response.ok) throw new Error(await errorText(response, 'Failed to save folder'));
    const result = await response.json();
    state.defaultFolder = result.folder || { id, name };
    state.configured.defaultFolder = true;
    toast(result.message || 'Default folder saved.');
    if (scope === 'setup') {
      await refresh();
    } else {
      resetDefaultDraft('dash');
      show(el('change-default-panel'), false);
      renderDefaultFolder();
      renderStatusChips();
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

async function saveDiscordToken(button) {
  const token = (el('discord-token')?.value || '').trim();
  if (!token) {
    toast('Paste the bot token first.', true);
    return;
  }
  setBusy(button, true, 'Saving…');
  try {
    const response = await apiPost('/api/config-discord', { token });
    throwIfUnauthorized(response);
    if (!response.ok) throw new Error(await errorText(response, 'Failed to save token'));
    state.configured.discord = true;
    toast('Setup complete.');
    await refresh();
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

async function onGuildChange(event) {
  const channelSelect = el('channel-selector');
  if (!channelSelect) return;
  const guildId = event.target.value;
  if (!guildId) {
    channelSelect.innerHTML = '<option value="">Select a server first</option>';
    channelSelect.disabled = true;
    return;
  }
  channelSelect.disabled = false;
  channelSelect.innerHTML = '<option value="">Loading channels…</option>';
  const channels = await loadGuildChannels(guildId);
  if (!channels.length) {
    channelSelect.innerHTML = '<option value="">No text channels</option>';
    channelSelect.disabled = true;
    return;
  }
  channelSelect.innerHTML = '<option value="">Select a channel</option>';
  channels.forEach((channel) => {
    const option = document.createElement('option');
    option.value = channel.id;
    option.textContent = channel.name;
    channelSelect.appendChild(option);
  });
}

async function pickChannelFolder() {
  try {
    await openDriveFolderPicker('Pick a Drive folder for this channel', (folder) => {
      state.channelDraft = { id: folder.id, name: folder.name };
      updateChannelPicked();
    });
  } catch (error) {
    toast(error.message, true);
  }
}

async function submitLink({ useDefault }, button) {
  const guildId = el('guild-selector')?.value || '';
  const channelId = el('channel-selector')?.value || '';
  if (!guildId || !channelId) {
    toast('Pick a server and channel first.', true);
    return;
  }
  if (!useDefault && !state.channelDraft.id) {
    toast('Choose a folder, or use “Link to default folder”.', true);
    return;
  }
  setBusy(button, true, 'Linking…');
  try {
    const payload = useDefault
      ? { guildId, channelId }
      : {
          guildId,
          channelId,
          folderId: state.channelDraft.id,
          folderName: state.channelDraft.name,
        };
    const response = await apiPost('/api/config-channel', payload);
    throwIfUnauthorized(response);
    if (!response.ok) throw new Error(await errorText(response, 'Failed to link channel'));
    state.channelDraft = { id: null, name: null };
    updateChannelPicked();
    show(el('add-link-panel'), false);
    toast('Channel linked.');
    await renderDashboard();
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

async function toggleLink(config, button) {
  setBusy(button, true, '…');
  try {
    const response = await apiPost('/api/config-channel', {
      guildId: config.guildId,
      channelId: config.channelId,
      enabled: !config.enabled,
      ...(config.useDefault ? {} : { folderId: config.folderId, folderName: config.folderName }),
    });
    throwIfUnauthorized(response);
    if (!response.ok) throw new Error(await errorText(response, 'Failed to update link'));
    await renderDashboard();
  } catch (error) {
    toast(error.message, true);
    setBusy(button, false);
  }
}

async function removeLink(config, button) {
  setBusy(button, true, '…');
  try {
    const response = await apiPost('/api/config-channel', {
      guildId: config.guildId,
      channelId: config.channelId,
      remove: true,
    });
    throwIfUnauthorized(response);
    if (!response.ok) throw new Error(await errorText(response, 'Failed to remove link'));
    toast('Link removed.');
    await renderDashboard();
  } catch (error) {
    toast(error.message, true);
    setBusy(button, false);
  }
}

function copyInvite(button) {
  const input = el('bot-invite');
  if (!input?.value) return;
  const done = () => {
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy'), 1600);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(input.value)
      .then(done)
      .catch(() => {
        input.select();
        document.execCommand('copy');
        done();
      });
    return;
  }
  input.select();
  document.execCommand('copy');
  done();
}

/* ───────────────────────── wiring ──────────────────────────────── */
function bindEvents() {
  el('google-signin')?.addEventListener('click', startGoogleAuth);

  // setup folder step
  el('setup-create-folder')?.addEventListener('change', (e) => {
    state.defaultDraft.create = e.target.checked;
    updateDefaultPicked('setup');
  });
  el('setup-pick-folder')?.addEventListener('click', () => pickDefaultFolder('setup'));
  el('setup-save-folder')?.addEventListener('click', (e) =>
    saveDefaultFolder('setup', e.currentTarget)
  );

  // setup token step
  el('setup-save-token')?.addEventListener('click', (e) => saveDiscordToken(e.currentTarget));
  el('discord-token')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveDiscordToken(el('setup-save-token'));
  });

  // dashboard: change default folder
  el('change-default-toggle')?.addEventListener('click', () => {
    const panel = el('change-default-panel');
    const opening = panel?.hidden;
    if (opening) resetDefaultDraft('dash');
    show(panel, opening);
  });
  el('dash-create-folder')?.addEventListener('change', (e) => {
    state.defaultDraft.create = e.target.checked;
    updateDefaultPicked('dash');
  });
  el('dash-pick-folder')?.addEventListener('click', () => pickDefaultFolder('dash'));
  el('dash-save-folder')?.addEventListener('click', (e) =>
    saveDefaultFolder('dash', e.currentTarget)
  );
  el('dash-cancel-folder')?.addEventListener('click', () => {
    resetDefaultDraft('dash');
    show(el('change-default-panel'), false);
  });

  // dashboard: add link
  el('add-link-toggle')?.addEventListener('click', () => {
    const panel = el('add-link-panel');
    const opening = panel?.hidden;
    if (opening) {
      state.channelDraft = { id: null, name: null };
      updateChannelPicked();
    }
    show(panel, opening);
  });
  el('cancel-add-link')?.addEventListener('click', () => show(el('add-link-panel'), false));
  el('guild-selector')?.addEventListener('change', onGuildChange);
  el('pick-channel-folder')?.addEventListener('click', pickChannelFolder);
  el('link-to-folder')?.addEventListener('click', (e) =>
    submitLink({ useDefault: false }, e.currentTarget)
  );
  el('link-to-default')?.addEventListener('click', (e) =>
    submitLink({ useDefault: true }, e.currentTarget)
  );
  el('copy-invite')?.addEventListener('click', (e) => copyInvite(e.currentTarget));

  // delegated actions on the links list
  el('links-list')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const row = button.closest('.link-row');
    const config = state.links.find((c) => `${c.guildId}:${c.channelId}` === row?.dataset.key);
    if (!config) return;
    if (button.dataset.action === 'toggle') toggleLink(config, button);
    if (button.dataset.action === 'remove') removeLink(config, button);
  });
}

function syncThemeMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  meta.setAttribute('content', dark ? THEME_META_COLORS.dark : THEME_META_COLORS.light);
}

window.addEventListener('DOMContentLoaded', async () => {
  syncThemeMeta();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeMeta);
  bindEvents();

  const params = new URLSearchParams(window.location.search);
  if (params.get('error') === 'unauthorized_email') {
    const email = params.get('email') || 'that account';
    const allowed = params.get('allowed');
    const domain = allowed ? `@${allowed.split(',')[0]}` : 'an approved domain';
    const used = email.includes('@') ? email.split('@')[1] : email;
    toast(`This bot only accepts ${domain}. You signed in with ${used}.`, true);
  }
  // Clean transient OAuth params; routing is decided by server state, not the URL.
  if (params.has('step') || params.has('oauth') || params.has('error')) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  await refresh();
});
