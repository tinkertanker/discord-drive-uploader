let currentStep = 1;
let selectedFolderId = null;
let selectedFolderName = null;

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
    loadFolders();
  } else if (step === 5) {
    generateInviteLink();
    loadSetupComplete();
  }
}

function showError(message) {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = message;
  errorEl.classList.add('show');
  setTimeout(() => errorEl.classList.remove('show'), 5000);
}

async function startGoogleAuth() {
  try {
    window.location.href = '/auth/google/start';
  } catch {
    showError('Failed to start Google authentication');
  }
}

async function loadFolders() {
  const folderList = document.getElementById('folder-list');
  folderList.innerHTML = '<div class="loading">Loading folders...</div>';

  try {
    const response = await fetch('/api/folders');
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Unable to fetch folders');
    }

    const data = await response.json();
    const folders = data.folders || data;
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
    folderList.innerHTML = '<div class="loading">Unable to load folders. Connect Google Drive first.</div>';
    console.error(error);
  }
}

function selectFolder(folderId, folderName, element) {
  document.querySelectorAll('.folder-item').forEach((el) => el.classList.remove('selected'));
  element.classList.add('selected');
  selectedFolderId = folderId;
  selectedFolderName = folderName;

  if (!document.getElementById('continue-folder')) {
    const btn = document.createElement('button');
    btn.id = 'continue-folder';
    btn.className = 'btn btn-primary';
    btn.textContent = 'Continue';
    btn.addEventListener('click', saveFolderAndContinue);
    document.querySelector('[data-step="3"]').appendChild(btn);
  }
}

async function saveFolderAndContinue() {
  if (!selectedFolderId) {
    showError('Please select a folder');
    return;
  }

  try {
    const response = await fetch('/api/config-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        folderId: selectedFolderId,
        folderName: selectedFolderName
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to save folder configuration');
    }

    nextStep();
  } catch (error) {
    showError(`Failed to save folder: ${error.message}`);
  }
}

async function saveDiscordToken() {
  const token = document.getElementById('discord-token').value.trim();
  if (!token) {
    showError('Please enter your Discord bot token');
    return;
  }

  try {
    const response = await fetch('/api/config-discord', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to save Discord token');
    }

    nextStep();
  } catch (error) {
    showError(error.message);
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
    const response = await fetch('/api/setup-complete');
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    document.getElementById('setup-status').textContent = data.message;
  } catch (error) {
    console.error('Failed to load setup status:', error);
  }
}

window.addEventListener('DOMContentLoaded', () => {
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