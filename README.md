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
- In-place default folder changes from the linked folders page
- Responsive setup UI with automatic light/dark theme support
- Markdown upload confirmations with folder links
- File-backed configuration storage
- Docker-first local and self-hosted setup

## Prerequisites

### Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Open `APIs & Services` -> `Library`.
4. Enable the `Google Drive API`.
5. Open `APIs & Services` -> `OAuth consent screen`.
6. Configure the consent screen if Google Cloud asks you to do so first.
   - For internal-only use, configure it for your organisation.
   - For external use, add the appropriate test users during development.
7. Open `APIs & Services` -> `Credentials`.
8. Create an `OAuth client ID`.
   - Application type: `Web application`
   - Add authorised redirect URIs:
     - `http://localhost:3000/auth/google/callback`
     - `https://your-domain.example/auth/google/callback`
9. From that OAuth client, copy:
   - `Client ID` -> `GOOGLE_CLIENT_ID`
   - `Client secret` -> `GOOGLE_CLIENT_SECRET`
10. Still in `Credentials`, create an `API key` for Google Picker.
    - This becomes `GOOGLE_API_KEY`
    - Restrict it to your site origins if you are hosting the app publicly
11. Set `GOOGLE_REDIRECT_URI` to the exact callback URL you want this app to use.
    - Local example: `http://localhost:3000/auth/google/callback`
    - Hosted example: `https://your-domain.example/auth/google/callback`

### Discord

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click `New Application` and give it a name.
3. In `General Information`, copy:
   - `Application ID` -> `DISCORD_APPLICATION_ID`
   - `Public Key` -> `DISCORD_PUBLIC_KEY`
4. Open the `Bot` tab and create a bot user if one does not already exist.
5. In the `Bot` tab:
   - Use `Reset Token` or `View Token` to get the bot token
   - Paste that token into the setup UI later when prompted
6. Under `Privileged Gateway Intents`, enable:
   - `Message Content Intent`
7. Under `Bot Permissions` in the invite flow, make sure the bot can be granted:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Attach Files`
   - `Use Slash Commands`
8. In `OAuth2` -> `URL Generator`, create an invite URL with:
   - Scopes:
     - `bot`
     - `applications.commands`
   - Bot permissions:
     - `View Channels`
     - `Send Messages`
     - `Read Message History`
     - `Attach Files`
     - `Use Slash Commands`
9. Open the generated URL and invite the bot to the Discord server you want to sync.

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

Not set in `.env`:

- `DISCORD_BOT_TOKEN`
  This project currently stores the bot token through the setup UI rather than loading it from `.env`.

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

## Running the App

### Docker

Start the app with Docker Compose:

```bash
docker compose up --build -d
```

### Non-Docker

You can also run the app directly with Node.js.

Requirements:

- Node.js 20+
- npm

Commands:

```bash
npm install
cp .env.example .env
# fill in .env
npm run dev
```

For a non-watch production-style run:

```bash
npm start
```

Then open the app in your browser, usually at:

- `http://localhost:3000` for local development
- your configured public domain for a hosted deployment

## Setup Flow

Complete the browser setup in this order:

1. Connect Google Drive
2. Pick a default Google Drive folder
   - You can either choose a folder directly
   - Or choose a parent folder and create a `default-for-discord` folder inside it
3. Enter the Discord bot token
4. Link Discord servers and channels to Drive folders
   - You can also review and change the default fallback folder again from this page later

If `SETUP_API_TOKEN` is configured, enter it when prompted before saving configuration.

If `ALLOWED_EMAIL_DOMAINS` is configured, only Google accounts from those domains can complete setup.

The setup wizard will also ask for the Discord bot token. That value comes from the `Bot` tab in the Discord Developer Portal, not from the `.env` file.

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

Uploads are stored in a dated subfolder inside the mapped Google Drive folder:

```text
YYYY-mm-dd/
```

Files inside that subfolder are named using this pattern:

```text
display name - hh-mm-ss - comment.ext
```

Rules:

- If there is no message text, the filename becomes:
  `display name - hh-mm-ss.ext`
- The display name uses the server display name first, then falls back to Discord global name, then username
- Message text is truncated to the first 100 characters
- The dated folder is created automatically if it does not already exist
- If a same-day folder already exists with extra text after the date, that folder is reused instead of creating a new plain-date folder
- The dated folder and time stamp use the app server's local timezone
- If the base filename already exists, a suffix is added:
  `_1`, `_2`, `_3`, and so on

Example:

```text
2026-03-15/Alice Example - 12-54-11 - Whiteboard photo.png
2026-03-15/Alice Example - 12-54-11 - Whiteboard photo_1.png
```

## Upload Confirmation Message

Successful uploads respond in Discord with a folder link and filename preview.

Single file:

```md
Uploaded to [\_From Discord/2026-03-15](https://drive.google.com/drive/folders/your-folder-id).

File name:

- Alice Example - 12-54-11.png
```

Multiple files:

```md
Uploaded to [\_From Discord/2026-03-15](https://drive.google.com/drive/folders/your-folder-id).

File names starting from:

- Alice Example - 12-42-02.jpg
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
- The value in `.env`, the Google OAuth client settings, and the URL you actually open in the browser all need to agree

### Bot cannot see messages

- Confirm `Message Content Intent` is enabled in the Discord Developer Portal
- Confirm the bot has been invited with the required permissions
- Confirm the bot token in setup is valid
- Confirm the invite URL included both `bot` and `applications.commands` scopes

### Google setup succeeds but folders do not load

- Confirm the Google Drive API is enabled
- Confirm the browser API key for Google Picker is configured as `GOOGLE_API_KEY`
- Confirm the API key is allowed for the origin you are using
- Confirm the signed-in Google account is allowed if `ALLOWED_EMAIL_DOMAINS` is set

### Files are not uploading

- Check `/upload-info` for the channel configuration
- Confirm the mapped Google Drive folder still exists
- Confirm the bot can read the target Discord channel

## Licence

MIT. See `LICENSE`.
