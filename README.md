# Discord Drive Uploader

A Discord bot that automatically uploads photos and videos from Discord channels to Google Drive folders. Deploy with one click to Netlify!

## Features

- 📸 Automatic photo and video uploads from Discord to Google Drive
- 📁 Per-channel folder configuration
- 🎨 Bot avatar updates to last uploaded image
- 💬 Smart file naming with message content
- 🚀 One-click Netlify deployment
- 🔐 Secure OAuth2 authentication

## Quick Deploy

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/tinkertanker/discord-drive-uploader#GOOGLE_CLIENT_ID=&GOOGLE_CLIENT_SECRET=&DISCORD_APPLICATION_ID=&DISCORD_PUBLIC_KEY=)

## Setup Instructions

### Option A: Quick Deploy (Recommended)

Use this if you want to deploy quickly and update the Google redirect URI afterward.

### Option B: Pre-configured Deploy

If you want to set up the correct redirect URI from the start:
1. Fork this repository first
2. Deploy from your fork to Netlify (without clicking the deploy button)
3. Note your Netlify URL
4. Set up Google OAuth with the correct redirect URI
5. Then configure environment variables in Netlify

### Prerequisites

#### 1. Google Cloud Project Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click on it and press "Enable"
4. Create OAuth2 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - For now, add a temporary redirect URI: `https://localhost:8888/auth/google/callback`
   - You'll update this after deployment
   - Save the credentials
5. **Copy these values:**
   - `GOOGLE_CLIENT_ID`: The Client ID from your OAuth2 credentials
   - `GOOGLE_CLIENT_SECRET`: The Client Secret from your OAuth2 credentials

#### 2. Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "General Information" tab
4. **Copy these values:**
   - `DISCORD_APPLICATION_ID`: The Application ID
   - `DISCORD_PUBLIC_KEY`: The Public Key
5. Go to the "Bot" section in the left sidebar
6. Click "Reset Token" (or "View Token" if available)
7. **Copy this value:**
   - `DISCORD_BOT_TOKEN`: The bot token (keep this secret!)
8. Under "Privileged Gateway Intents", enable:
   - Message Content Intent (required to read message content)

### Environment Variables Summary

| Variable | Where to Find | Description |
|----------|--------------|-------------|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs | Your Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs | Your Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Your Netlify URL + `/auth/google/callback` | Must match Google's authorized redirect URIs |
| `DISCORD_APPLICATION_ID` | Discord Developer Portal → Your App → General Information | Discord application/client ID |
| `DISCORD_PUBLIC_KEY` | Discord Developer Portal → Your App → General Information | Discord public key for verification |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Your App → Bot → Token | Secret bot token (don't share!) |

### Deployment Steps

1. Click "Deploy to Netlify" button above
2. Fill in the environment variables:
   - Use temporary values for `GOOGLE_REDIRECT_URI` during initial deployment
   - Example: `https://temp.netlify.app/auth/google/callback`
3. Complete the deployment
4. **After deployment, get your actual Netlify URL** (e.g., `https://amazing-site-123.netlify.app`)
5. **Update environment variables in Netlify**:
   - Go to Site configuration → Environment variables
   - Update `GOOGLE_REDIRECT_URI` to: `https://your-actual-site.netlify.app/auth/google/callback`
   - Redeploy for changes to take effect
6. **Update Google OAuth redirect URI**:
   - Go back to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
   - Click on your OAuth 2.0 Client ID to edit it
   - Remove the temporary `localhost:8888` redirect URI
   - Add your actual Netlify URL: `https://your-actual-site.netlify.app/auth/google/callback`
   - Save the changes
7. Visit your deployed site and follow the setup wizard
8. Authorize Google Drive access
9. Select default upload folder
10. Add bot to your Discord server using the generated invite link

> **Note**: The Google OAuth flow won't work until both the Netlify environment variable and Google's authorized redirect URI are updated with your actual Netlify URL!

## Bot Commands

- `/setup-folder` - Configure upload folder for current channel
- `/upload-info` - Show current upload configuration
- `/test-upload` - Test the upload functionality

## How It Works

1. Users post images/videos in Discord channels
2. Bot detects media attachments
3. Files are uploaded to configured Google Drive folder
4. Bot responds with upload confirmation
5. Bot avatar updates to latest uploaded image

## File Naming Convention

Files are named using the pattern:
```
YYYY-MM-DD-HH-mm-ss-{message_content}
```

Example: `2025-05-23-14-30-45-check_out_this_photo.jpg`

## Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Run locally with Netlify Dev
npm run dev

# Run tests
npm test
```

## Architecture

- **Netlify Functions**: Serverless backend
- **Discord.js**: Discord bot interactions
- **Google APIs**: Drive integration
- **Netlify Blobs**: Configuration storage

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI" error during Google OAuth**
   - Make sure your redirect URI in Google Cloud Console exactly matches your Netlify URL
   - Format should be: `https://your-site-name.netlify.app/auth/google/callback`
   - Common mistake: Using the temporary localhost URL instead of your actual Netlify URL
   - The redirect URI must be updated after deployment!

2. **Bot doesn't respond to commands**
   - Ensure the bot has proper permissions in your Discord server
   - Check that Message Content Intent is enabled in Discord Developer Portal
   - Verify the bot token is correct in Netlify environment variables

3. **"Not authenticated with Google" error**
   - Complete the Google OAuth flow in the setup wizard
   - Check that Google Drive API is enabled in your Google Cloud project

4. **Files not uploading**
   - Use `/upload-info` to check if the channel is configured
   - Ensure the bot has access to the Discord channel
   - Check that the Google Drive folder still exists

### Required Discord Bot Permissions

When inviting the bot, ensure it has these permissions:
- Read Messages
- Send Messages
- Read Message History
- Attach Files
- Use Slash Commands

## Support

For issues and feature requests, please use the [GitHub issues page](https://github.com/tinkertanker/discord-drive-uploader/issues).