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
   - Add authorized redirect URI: `https://your-site.netlify.app/auth/google/callback`
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
| `DISCORD_APPLICATION_ID` | Discord Developer Portal → Your App → General Information | Discord application/client ID |
| `DISCORD_PUBLIC_KEY` | Discord Developer Portal → Your App → General Information | Discord public key for verification |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Your App → Bot → Token | Secret bot token (don't share!) |

### Deployment Steps

1. Click "Deploy to Netlify" button above
2. Fill in all the environment variables from the table above
3. Complete the deployment
4. Update Google OAuth redirect URI:
   - Get your Netlify site URL (e.g., `https://amazing-site-123.netlify.app`)
   - Go back to Google Cloud Console → Credentials
   - Edit your OAuth 2.0 Client ID
   - Update the redirect URI to: `https://your-actual-site.netlify.app/auth/google/callback`
5. Visit your deployed site and follow the setup wizard
6. Authorize Google Drive access
7. Select default upload folder
8. Add bot to your Discord server using the generated invite link

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