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
    folderList.innerHTML = '<div class="loading">Loading folders...</div>';
    
    try {
        const response = await fetch('/api/folders');
        if (!response.ok) throw new Error('Failed to load folders');
        
        const folders = await response.json();
        
        folderList.innerHTML = '';
        folders.forEach(folder => {
            const folderEl = document.createElement('div');
            folderEl.className = 'folder-item';
            folderEl.innerHTML = `📁 ${folder.name}`;
            folderEl.onclick = () => selectFolder(folder.id, folder.name, folderEl);
            folderList.appendChild(folderEl);
        });
        
        if (folders.length === 0) {
            folderList.innerHTML = '<div class="loading">No folders found. Create one below.</div>';
        }
    } catch (error) {
        folderList.innerHTML = '<div class="loading">Error loading folders. Please try again.</div>';
        showError('Failed to load Google Drive folders');
    }
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
        const response = await fetch('/api/folders/create', {
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
        const response = await fetch('/api/config/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                folderId: selectedFolderId,
                folderName: selectedFolderName 
            })
        });
        
        if (!response.ok) throw new Error('Failed to save folder configuration');
        
        nextStep();
    } catch (error) {
        showError('Failed to save folder configuration');
    }
}

async function saveDiscordToken() {
    const token = document.getElementById('discord-token').value.trim();
    if (!token) {
        showError('Please enter your Discord bot token');
        return;
    }
    
    try {
        const response = await fetch('/api/config/discord', {
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

// Check URL parameters for OAuth callback
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    
    if (params.get('step') === 'folder-selection' || hash === '#step-3') {
        showStep(3);
    } else if (params.get('oauth') === 'success') {
        // OAuth was successful, show folder selection
        showStep(3);
    }
});