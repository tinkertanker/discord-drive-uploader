let currentStep = 1;
let selectedFolderId = null;
let selectedFolderName = null;

function nextStep() {
    showStep(currentStep + 1);
}

function showStep(step) {
    document.querySelectorAll('.step').forEach(el => {
        el.classList.remove('active');
    });
    
    const stepElement = document.querySelector(`[data-step="${step}"]`);
    if (stepElement) {
        stepElement.classList.add('active');
        currentStep = step;
        
        // Handle step-specific actions
        if (step === 3) {
            loadFolders();
        } else if (step === 5) {
            generateInviteLink();
        }
    }
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => {
        errorEl.classList.remove('show');
    }, 5000);
}

async function startGoogleAuth() {
    try {
        window.location.href = '/auth/google/start';
    } catch (error) {
        showError('Failed to start Google authentication');
    }
}

async function loadFolders() {
    const folderList = document.getElementById('folder-list');
    
    // Store auth data from URL if available
    const params = new URLSearchParams(window.location.search);
    const authData = params.get('auth');
    if (authData) {
        sessionStorage.setItem('auth_data', authData);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Get tokens
    const storedAuth = sessionStorage.getItem('auth_data');
    if (!storedAuth) {
        folderList.innerHTML = '<div class="loading">Not authenticated. Please start over.</div>';
        return;
    }
    
    let tokens;
    try {
        tokens = JSON.parse(atob(storedAuth));
    } catch (e) {
        console.error('Failed to parse auth data:', e);
        folderList.innerHTML = '<div class="loading">Invalid authentication data.</div>';
        return;
    }
    
    folderList.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <button class="btn btn-primary" onclick="openFolderPicker()">
                📁 Choose Google Drive Folder
            </button>
            <div id="selected-folder" style="margin-top: 1rem;"></div>
        </div>
    `;
    
    // Initialize Google API
    window.googleTokens = tokens;
    gapi.load('picker', () => {
        console.log('Google Picker API loaded');
    });
}

function selectFolder(folderId, folderName, element) {
    // Remove previous selection
    document.querySelectorAll('.folder-item').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Mark as selected
    element.classList.add('selected');
    selectedFolderId = folderId;
    selectedFolderName = folderName;
    
    // Add continue button if not exists
    if (!document.getElementById('continue-folder')) {
        const btn = document.createElement('button');
        btn.id = 'continue-folder';
        btn.className = 'btn btn-primary';
        btn.textContent = 'Continue';
        btn.onclick = () => saveFolderAndContinue();
        document.querySelector('[data-step="3"]').appendChild(btn);
    }
}

async function createNewFolder() {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;
    
    try {
        const response = await fetch('/.netlify/functions/api-folders-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName })
        });
        
        if (!response.ok) throw new Error('Failed to create folder');
        
        const folder = await response.json();
        showError(`Folder "${folderName}" created successfully!`);
        loadFolders(); // Reload folder list
    } catch (error) {
        showError('Failed to create folder');
    }
}

async function saveFolderAndContinue() {
    if (!selectedFolderId) {
        showError('Please select a folder');
        return;
    }
    
    try {
        const authData = sessionStorage.getItem('auth_data');
        const headers = { 'Content-Type': 'application/json' };
        if (authData) {
            headers['Authorization'] = `Bearer ${authData}`;
        }
        
        const response = await fetch('/.netlify/functions/api-config-folder', {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
                folderId: selectedFolderId,
                folderName: selectedFolderName 
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || errorData.error || 'Failed to save folder configuration');
        }
        
        const result = await response.json();
        console.log('Folder save result:', result);
        
        nextStep();
    } catch (error) {
        console.error('Save folder error:', error);
        showError('Failed to save folder configuration: ' + error.message);
    }
}

async function saveDiscordToken() {
    const token = document.getElementById('discord-token').value.trim();
    if (!token) {
        showError('Please enter your Discord bot token');
        return;
    }
    
    try {
        const response = await fetch('/.netlify/functions/api-config-discord', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        
        if (!response.ok) throw new Error('Failed to save Discord token');
        
        nextStep();
    } catch (error) {
        showError('Failed to save Discord configuration');
    }
}

function generateInviteLink() {
    const appId = getMeta('discord-app-id');
    if (!appId) {
        showError('Discord Application ID not configured');
        return;
    }
    
    // Bot permissions: Read Messages, Send Messages, Manage Messages, Attach Files, Read Message History
    const permissions = '3072';
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${appId}&permissions=${permissions}&scope=bot%20applications.commands`;
    
    const inviteInput = document.getElementById('bot-invite');
    inviteInput.value = inviteUrl;
}

function copyInviteLink() {
    const inviteInput = document.getElementById('bot-invite');
    inviteInput.select();
    document.execCommand('copy');
    
    // Show feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
        btn.textContent = originalText;
    }, 2000);
}

function getMeta(name) {
    const element = document.querySelector(`meta[name="${name}"]`);
    return element ? element.content : null;
}

function openFolderPicker() {
    if (!window.googleTokens) {
        showError('Not authenticated with Google');
        return;
    }

    const picker = new google.picker.PickerBuilder()
        .setOAuthToken(window.googleTokens.access_token)
        .addView(new google.picker.DocsView()
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes('application/vnd.google-apps.folder'))
        .addView(new google.picker.DocsView()
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setEnableDrives(true)
            .setMimeTypes('application/vnd.google-apps.folder'))
        .setCallback(pickerCallback)
        .setTitle('Select a folder for Discord uploads')
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .build();
    
    picker.setVisible(true);
}

function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
        const folder = data.docs[0];
        selectedFolderId = folder.id;
        selectedFolderName = folder.name;
        
        // Show selected folder
        document.getElementById('selected-folder').innerHTML = `
            <div style="padding: 1rem; background: var(--background); border-radius: 6px;">
                <p>Selected folder: <strong>${folder.name}</strong></p>
                <button class="btn btn-primary" onclick="saveFolderAndContinue()">Continue</button>
            </div>
        `;
    }
}

// Check URL parameters for OAuth callback
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    
    if (params.get('step') === '3' || params.get('step') === 'folder-selection' || hash === '#step-3') {
        showStep(3);
    } else if (params.get('oauth') === 'success') {
        // OAuth was successful, show folder selection
        showStep(3);
    } else if (params.get('auth')) {
        // We have auth data, show folder selection
        showStep(3);
    }
});