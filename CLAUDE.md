# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord bot that uploads photos/videos from Discord channels to Google Drive folders. Deployed on Netlify with user-friendly setup flow.

## Key Features

1. **Netlify Deployment**: Web-based setup interface for OAuth and configuration
2. **Google Drive Integration**: Upload images/videos to user-selected folders
3. **Discord Commands**: Configure upload destination per channel
4. **Profile Picture Updates**: Bot sets its avatar to the last uploaded photo
5. **Upload Feedback**: Responds with "Uploaded" or "Uploaded X images"
6. **Smart File Naming**: `YYYY-MM-DD-truncated_comment.ext` format

## Architecture

### Netlify Functions Structure
- `netlify/functions/auth.js` - Google OAuth flow
- `netlify/functions/discord-interactions.js` - Discord webhook endpoint
- `netlify/functions/upload.js` - Handle media uploads to Drive

### Core Modules
- `src/discord/bot.js` - Discord bot logic and command handling
- `src/google/drive.js` - Google Drive API wrapper
- `src/config/store.js` - Persistent configuration storage
- `src/utils/naming.js` - File naming logic (date + comment truncation)

### Web Interface
- `public/index.html` - Setup wizard
- `public/setup.js` - OAuth and configuration flow

## Development Commands

```bash
# Install dependencies
npm install

# Local development with Netlify Dev
netlify dev

# Deploy to Netlify
netlify deploy --prod

# Run tests
npm test
```

## Configuration Flow

1. User visits Netlify site
2. Authorizes Google Drive access via OAuth
3. Selects default upload folder
4. Adds Discord bot token
5. Bot joins server and is ready

## Discord Commands

- `/setup-folder` - Configure upload folder for current channel
- `/upload-info` - Show current upload configuration
- Media uploads trigger automatically when images/videos are posted

## Environment Variables

Required for Netlify deployment:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`

## Implementation Notes

- Use Discord.js v14 for slash commands
- Google Drive API v3 for uploads
- Store per-channel configurations in Netlify Blobs or similar
- Truncate filenames at ~50 characters for readability
- Support common formats: jpg, png, gif, mp4, webm, mov