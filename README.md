# Discord Drive Uploader

Self-hosted Discord bot and setup UI for uploading photos and videos from Discord channels into Google Drive folders.

## What It Does

- Connects Google Drive to a Discord bot
- Watches configured Discord channels for supported attachments
- Uploads those files into mapped Google Drive folders
- Supports a default fallback folder and per-channel folder mapping
- Provides a browser-based setup flow for Google auth, bot token entry, folder selection, and channel mapping

## Features

- Automatic image and video uploads from Discord to Google Drive
- Google Picker-based Drive folder selection
- Per-server and per-channel folder mapping
- Optional default `default-for-discord` folder creation during setup
- Markdown upload confirmations with folder links
- File-backed configuration storage
- Docker-first local and self-hosted setup

## Prerequisites

### Google Cloud

1. Create a Google Cloud project.
2. Enable the Google Drive API.
3. Create a web OAuth client.
4. Add authorised redirect URIs:
   - `http://localhost:3000/auth/google/callback`
   - `https://your-domain.example/auth/google/callback`
5. Create a browser API key for Google Picker.
6. Save these values:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_API_KEY`

### Discord

1. Create a Discord application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a bot for that application.
3. Save these values:
   - `DISCORD_APPLICATION_ID`
   - `DISCORD_PUBLIC_KEY`
   - `DISCORD_BOT_TOKEN`
4. Enable `Message Content Intent` for the bot.

## Environment Variables

Required:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_API_KEY`
- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`

Optional:

- `SETUP_API_TOKEN`
  Protects setup/configuration endpoints when the app is reachable from the internet.
- `ALLOWED_EMAIL_DOMAINS`
  Comma-separated list of Google account domains allowed to complete setup.
- `CONFIG_STORE_PATH`
  Overrides where configuration is stored. Defaults to `/data/bot-config.json`.

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

## Running the App

Start the app with Docker Compose:

```bash
docker compose up --build -d
```

Then open the app in your browser, usually at:

- `http://localhost:3000` for local development
- your configured public domain for a hosted deployment

## Setup Flow

Complete the browser setup in this order:

1. Connect Google Drive
2. Enter the Discord bot token
3. Pick a default Google Drive folder
   - You can either choose a folder directly
   - Or choose a parent folder and create a `default-for-discord` folder inside it
4. Link Discord servers and channels to Drive folders

If `SETUP_API_TOKEN` is configured, enter it when prompted before saving configuration.

If `ALLOWED_EMAIL_DOMAINS` is configured, only Google accounts from those domains can complete setup.

## Discord Bot Permissions

When inviting the bot, grant these permissions:

- View Channels
- Send Messages
- Read Message History
- Attach Files
- Use Slash Commands

## Supported Upload Types

Images:

- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/gif`
- `image/webp`

Videos:

- `video/mp4`
- `video/webm`
- `video/mov`
- `video/avi`

## Bot Commands

- `/setup-folder` Configure the upload folder for the current channel
- `/upload-info` Show the current upload configuration
- `/test-upload` Test the upload flow

The web setup flow also supports mapping multiple channels directly.

## File Naming

Files are named using this pattern:

```text
yyyy-mm-dd-hh-mm - display name - comment.ext
```

Rules:

- If there is no message text, the filename becomes:
  `yyyy-mm-dd-hh-mm - display name.ext`
- The display name uses the server display name first, then falls back to Discord global name, then username
- Message text is truncated to the first 100 characters
- If the base filename already exists, a suffix is added:
  `_1`, `_2`, `_3`, and so on

Example:

```text
2026-03-15-12-54 - Alice Example - Whiteboard photo.png
2026-03-15-12-54 - Alice Example - Whiteboard photo_1.png
```

## Upload Confirmation Message

Successful uploads respond in Discord with a folder link and filename preview.

Single file:

```md
Uploaded to [_From Discord](https://drive.google.com/drive/folders/your-folder-id).

File name:
- 2026-03-15-12-54 - Alice Example.png
```

Multiple files:

```md
Uploaded to [_From Discord](https://drive.google.com/drive/folders/your-folder-id).

File names starting from:
- 2026-03-15-12-42 - Alice Example.jpg
```

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Checks:

```bash
npm run lint
npm test
```

## Architecture

- Node.js HTTP server for setup UI, OAuth callbacks, and setup APIs
- Discord.js client for Discord bot behaviour
- Google Drive API integration for folder browsing and file uploads
- File-backed configuration persisted to `CONFIG_STORE_PATH`

## Troubleshooting

### Google OAuth redirect mismatch

- Make sure `GOOGLE_REDIRECT_URI` exactly matches an authorised redirect URI in Google Cloud
- The callback path must be `/auth/google/callback`

### Bot cannot see messages

- Confirm `Message Content Intent` is enabled in the Discord Developer Portal
- Confirm the bot has been invited with the required permissions
- Confirm the bot token in setup is valid

### Google setup succeeds but folders do not load

- Confirm the Google Drive API is enabled
- Confirm the browser API key for Google Picker is configured as `GOOGLE_API_KEY`
- Confirm the signed-in Google account is allowed if `ALLOWED_EMAIL_DOMAINS` is set

### Files are not uploading

- Check `/upload-info` for the channel configuration
- Confirm the mapped Google Drive folder still exists
- Confirm the bot can read the target Discord channel

## Licence

MIT. See `LICENSE`.
