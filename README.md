# Discord Drive Uploader

A Discord bot that automatically uploads photos and videos from Discord channels to Google Drive folders.

## Features

- 📸 Automatic photo and video uploads from Discord to Google Drive
- 📁 Per-channel folder configuration
- 🧩 Map channels per server to folders
- 🎨 Bot avatar updates to last uploaded image
- 💬 Smart file naming with message content
- 🚀 Docker-first deployment
- 🔐 Secure OAuth2 authentication

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
   - Add redirect URI: `http://localhost:3000/auth/google/callback` for local testing, and
     your production URL for deployment, e.g. `https://your-domain.com/auth/google/callback`
   - Save the credentials
5. Create a browser API key for the Google Drive picker:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API key"
   - Restrict it to the Google Picker API if you want tighter access control
6. **Copy these values:**
   - `GOOGLE_CLIENT_ID`: The Client ID from your OAuth2 credentials
   - `GOOGLE_CLIENT_SECRET`: The Client Secret from your OAuth2 credentials
   - `GOOGLE_API_KEY`: The browser API key used by the Google Drive picker
   - `ALLOWED_EMAIL_DOMAINS` (optional): e.g. `tinkertanker.com` to restrict setup Google account domains

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
9. Optional for public deployments:
   - `SETUP_API_TOKEN`: Shared setup secret for protecting setup endpoints

### Environment Variables Summary

| Variable | Where to Find | Description |
|----------|--------------|-------------|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs | Your Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs | Your Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Your public domain + `/auth/google/callback` | Must match Google's authorized redirect URIs |
| `GOOGLE_API_KEY` | Google Cloud Console → APIs & Services → Credentials → API keys | Browser API key for the Google Drive picker |
| `ALLOWED_EMAIL_DOMAINS` | Local app config | Comma-separated list of allowed Google account domains, defaults to `tinkertanker.com` |
| `SETUP_API_TOKEN` | Admin-created secret | Optional for local deployments; recommended for public deployments to protect setup endpoints |
| `DISCORD_APPLICATION_ID` | Discord Developer Portal → Your App → General Information | Discord application/client ID |
| `DISCORD_PUBLIC_KEY` | Discord Developer Portal → Your App → General Information | Discord public key for verification |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Your App → Bot → Token | Secret bot token (don't share!) |

### Deployment Steps

1. Build and run with Docker (or use docker-compose if you have one).
2. Set these environment variables in the container:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (for production domain)
   - `GOOGLE_API_KEY` (required for the Google Drive picker UI)
   - `ALLOWED_EMAIL_DOMAINS` (optional, for example `tinkertanker.com`)
   - `SETUP_API_TOKEN` (recommended for public deployments)
   - `DISCORD_APPLICATION_ID`
   - `DISCORD_PUBLIC_KEY`
   - `CONFIG_STORE_PATH` (optional, default `/data/bot-config.json`)
3. Visit the app root and complete the setup wizard.
4. Set the bot token and default folder to persist settings.
   - If `SETUP_API_TOKEN` is set, enter it when prompted before saving config.
5. Use **Link Servers and Channels** to map each Discord channel to a Drive folder and toggle sync.

### Mac mini on `discord-drive-uploader.tk.sg`

1. Point `discord-drive-uploader.tk.sg` to your Mac mini.
2. Set `GOOGLE_REDIRECT_URI` to:
   - `https://discord-drive-uploader.tk.sg/auth/google/callback`
3. Keep `docker-compose.yml` exposing the service, attach it to the `devtksg` external network, and route `discord-drive-uploader.tk.sg` to port `3000` via your reverse proxy (nginx, Traefik, Caddy, etc.).
4. Update any OAuth client/domain settings to match the same domain.
5. Set `PRODUCTION_HOST=discord-drive-uploader.tk.sg` in `.env`.

#### Docker quick start

```bash
export PRODUCTION_HOST='discord-drive-uploader.tk.sg'
cp .env.example .env
# fill in the values in .env
docker compose up --build -d
```

Visit `http://localhost:3000`.

### Deploy to `tinkertanker@dev.tk.sg`

Use the built-in deploy script:

```bash
# From this repo
DEPLOY_HOST='tinkertanker@dev.tk.sg' \
DEPLOY_DIR='/home/tinkertanker-server/Docker/discord-gdrive-photo-uploader' \
npm run deploy
```

What it does:

- Ensures the remote directory exists.
- Runs `git fetch`, checks out/pulls `DEPLOY_BRANCH` (default `main`) on the remote.
- Uploads local `.env` to the remote host before starting the container (set `UPLOAD_ENV=0` to skip).
- Runs `docker compose up --build -d --remove-orphans` on the remote host.

The deploy script expects the remote folder to already contain the codebase.
On first deploy, if it's not a git repo, set `DEPLOY_REPO` to let it bootstrap by cloning.

```bash
DEPLOY_REPO='git@github.com:your-org/discord-gdrive-photo-uploader.git' \
DEPLOY_BRANCH='main' \
DEPLOY_DIR='/home/tinkertanker-server/Docker/discord-gdrive-photo-uploader' \
npm run deploy
```

Useful check after deploy:

```bash
ssh tinkertanker@dev.tk.sg 'cd /home/tinkertanker-server/Docker/discord-gdrive-photo-uploader && docker compose ps'
```

## Bot Commands

- `/setup-folder` - Configure upload folder for current channel
- `/upload-info` - Show current upload configuration
- `/test-upload` - Test the upload functionality

The web setup flow also supports mapping multiple Discord channels to folders directly.

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

# Run locally
npm run dev

# Run tests
npm test
```

## Architecture

- **Node HTTP server**: Serves setup UI and handles OAuth and Discord setup endpoints
- **Discord.js**: Discord bot interactions
- **Google APIs**: Drive integration
- **File-backed storage**: JSON config persisted to `CONFIG_STORE_PATH`

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
   - Make sure your redirect URI in Google Cloud Console exactly matches your public domain
   - Format should be: `https://your-site-name.tld/auth/google/callback`
   - Common mistake: using a stale localhost callback URL

2. **Bot doesn't respond to commands**
   - Ensure the bot has proper permissions in your Discord server
   - Check that Message Content Intent is enabled in Discord Developer Portal
   - Verify the bot token is correct in environment variables

3. **"Not authenticated with Google" error**
   - Complete the Google OAuth flow in the setup wizard
   - Check that Google Drive API is enabled in your Google Cloud project

4. **Files not uploading**
   - Use `/upload-info` to check if the channel is configured
   - Ensure the bot has access to the Discord channel
   - Check that the Google Drive folder still exists

### Required Discord Bot Permissions

When inviting the bot, ensure it has these permissions:
- View Channels
- Send Messages
- Read Message History
- Attach Files
- Use Slash Commands

### Docker Notes

- The bot process starts on container start and tries to connect to Discord automatically once token is configured.
- Interactions endpoint is available at `POST /discord/interactions` if you expose it through your public reverse proxy.

## Support

For issues and feature requests, please use the [GitHub issues page](https://github.com/tinkertanker/discord-drive-uploader/issues).