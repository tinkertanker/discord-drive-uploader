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

1. **Google Cloud Project**
   - Enable Google Drive API
   - Create OAuth2 credentials
   - Add redirect URI: `https://your-site.netlify.app/auth/google/callback`

2. **Discord Application**
   - Create a new application at [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a bot and save the token
   - Note the Application ID and Public Key

### Deployment Steps

1. Click "Deploy to Netlify" button above
2. Set environment variables in Netlify:
   ```
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   DISCORD_APPLICATION_ID=your_discord_app_id
   DISCORD_PUBLIC_KEY=your_discord_public_key
   DISCORD_BOT_TOKEN=your_discord_bot_token
   ```
3. Visit your deployed site and follow the setup wizard
4. Authorize Google Drive access
5. Select default upload folder
6. Add bot to your Discord server

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

## Support

For issues and feature requests, please use the [GitHub issues page](https://github.com/tinkertanker/discord-drive-uploader/issues).