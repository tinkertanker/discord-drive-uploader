# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord bot that uploads photos/videos from Discord channels to Google Drive folders. Deployed on Netlify with user-friendly setup flow.

## Current Implementation Status

### ✅ Completed
1. **Google OAuth Flow**: Working with token exchange
2. **Google Drive Integration**: Using Picker API for folder selection
3. **Setup Wizard**: 5-step web interface for configuration
4. **File Naming**: Smart naming with date stamps and message content
5. **API Endpoints**: All configuration endpoints implemented
6. **Tests**: Comprehensive test suite (39/41 passing)

### 🚧 Known Issues
1. **Storage**: Currently using environment variables as Netlify Blobs wasn't working
2. **Bot Runtime**: Bot initialization endpoint exists but bot doesn't run continuously
3. **Token Persistence**: Requires manual environment variable setup after initial config

## Architecture

### Netlify Functions (Actual Structure)
- `netlify/functions/google-auth-start.js` - Initiates OAuth flow
- `netlify/functions/google-auth-callback.js` - Handles OAuth callback
- `netlify/functions/api-folders.js` - Lists Google Drive folders
- `netlify/functions/api-config-folder.js` - Saves folder selection
- `netlify/functions/api-config-discord.js` - Saves Discord token
- `netlify/functions/api-setup-complete.js` - Shows env vars to set
- `netlify/functions/discord-interactions.js` - Discord webhook endpoint
- `netlify/functions/bot-init.js` - Bot initialization (not fully implemented)

### Core Services
- `src/services/google-auth.js` - Google OAuth2 client wrapper
- `src/services/google-drive.js` - Google Drive API operations
- `src/services/config-store.js` - Configuration storage interface
- `src/services/netlify-env-store.js` - Environment variable storage
- `src/services/upload-queue.js` - Upload queue with retry logic

### Handlers
- `src/handlers/discord-interactions.js` - Discord interaction verification
- `src/handlers/slash-commands.js` - Command implementations
- `src/handlers/message-handler.js` - Discord bot & message processing

### Utilities
- `src/utils/file-namer.js` - File naming logic (date + truncated message)
- `src/utils/logger.js` - Structured logging
- `src/utils/discord-verify.js` - Discord signature verification

### Web Interface
- `public/index.html` - Setup wizard with 5 steps
- `public/js/setup.js` - Client-side logic with Google Picker
- `public/css/style.css` - Dark theme styling

## Development Commands

```bash
# Install dependencies
npm install

# Local development with Netlify Dev
netlify dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Current Storage Solution

Due to Netlify Blobs issues, using environment variables:
1. Configuration stored in memory during setup
2. Success page displays `APP_DATA_*` environment variables
3. User must manually add these to Netlify dashboard
4. On restart, config loads from environment variables

Environment variables used:
- `APP_DATA_GOOGLE_TOKENS` - Google OAuth tokens
- `APP_DATA_DISCORD_BOT_TOKEN` - Discord bot token  
- `APP_DATA_DEFAULT_FOLDER` - Selected Drive folder

## Setup Flow

1. **Welcome** → User clicks "Get Started"
2. **Google Auth** → OAuth flow with redirect
3. **Folder Selection** → Google Picker API for folder choice
4. **Discord Token** → User enters bot token
5. **Success** → Shows env vars to set & bot invite link

## Environment Variables

Required for deployment:
- `GOOGLE_CLIENT_ID` - From Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
- `GOOGLE_REDIRECT_URI` - Must match Netlify URL + `/auth/google/callback`
- `DISCORD_APPLICATION_ID` - From Discord Developer Portal
- `DISCORD_PUBLIC_KEY` - For interaction verification
- `DISCORD_BOT_TOKEN` - Bot token (can be set during setup)

## Key Implementation Details

### Google OAuth
- Tokens passed through URL parameters (base64 encoded)
- Stored in sessionStorage for API calls
- State parameter for CSRF protection (currently bypassed for debugging)

### Discord Bot
- Uses Discord.js v14
- Slash commands: `/setup-folder`, `/upload-info`, `/test-upload`
- Message handler for automatic media uploads
- Updates bot avatar to last uploaded image

### File Upload Flow
1. Bot detects message with attachments
2. Filters for supported types (images/videos)
3. Downloads file to buffer
4. Generates filename with date + message
5. Uploads to configured Drive folder
6. Responds with confirmation

### API Endpoints
All use direct Netlify function URLs (`/.netlify/functions/*`):
- Auth endpoints don't require authentication
- Config endpoints accept tokens via Authorization header
- Responses include detailed error messages for debugging

## Testing

- Jest with ES modules support (`NODE_OPTIONS=--experimental-vm-modules`)
- Mocked Google APIs and Netlify Blobs
- File naming utilities fully tested
- Some timing-sensitive tests excluded

## Future Improvements

1. **Proper Storage**: Implement database or fix Netlify Blobs
2. **Bot Hosting**: Use background function or external service
3. **Multi-Guild Support**: Store config per Discord server
4. **Better Security**: Encrypt tokens, proper state validation
5. **Rate Limiting**: Implement proper queue with rate limits