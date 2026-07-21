# Discord Drive Uploader

Self-hosted Discord bot and setup UI for uploading photos and videos from Discord channels into Google Drive folders.

This repository is intended to be cloned or forked and run under your own Google Cloud and Discord accounts. It does not provide a hosted service: you own the credentials, deployment, and persisted configuration.

## Setup At A Glance

1. Create Google Cloud OAuth credentials and a Picker API key.
2. Create a Discord application and bot, then invite it to your server.
3. Copy `.env.example` to `.env` and add your credentials.
4. Start the container and open the setup UI.
5. Sign in as an allowed administrator, connect Drive, enter the bot token, and map channels.

The detailed instructions below are also suitable context for a coding agent helping you deploy or adapt this project. See [Working With A Coding Agent](#working-with-a-coding-agent) for a concise handoff.

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
- Google sign-in with an explicit admin email allowlist
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
   - Google refresh tokens for an external app left in `Testing` can expire after seven days. Publish the app when you are ready for a long-running deployment, subject to Google's consent and verification requirements.
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
- `ADMIN_EMAILS`
  Comma-separated Google account email addresses allowed to open the admin UI.
- `ADMIN_SESSION_SECRET`
  Random secret of at least 32 characters used to sign admin session cookies.
- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`

Optional:

- `ALLOWED_EMAIL_DOMAINS`
  Comma-separated list of Google account domains allowed to connect the shared Drive account. Replace the example domain with your own. Set it to `,` to rely only on `ADMIN_EMAILS` without an additional domain restriction.
- `CONFIG_STORE_PATH`
  Overrides where configuration is stored. Defaults to `/data/bot-config.json`.
- `PORT`
  HTTP port inside the process. Defaults to `3000`; the Docker examples assume that value.
- `PRODUCTION_HOST`
  Public hostname consumed by the included reverse-proxy Compose preset. It is not used by the Node.js process.

Not set in `.env`:

- `DISCORD_BOT_TOKEN`
  This project currently stores the bot token through the setup UI rather than loading it from `.env`.

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

## Running the App

### Docker On One Machine

This is the most portable Docker setup. It publishes the app directly on port 3000 and stores credentials and mappings in `./data`:

```bash
cp .env.example .env
# Edit .env before continuing.
mkdir -p data
docker build -t discord-drive-uploader .
docker run -d \
  --name discord-drive-uploader \
  --restart unless-stopped \
  --env-file .env \
  -p 3000:3000 \
  -v "$PWD/data:/data" \
  discord-drive-uploader
```

Then open `http://localhost:3000`. View startup errors with:

```bash
docker logs -f discord-drive-uploader
```

To stop and remove the container without deleting its saved configuration:

```bash
docker rm -f discord-drive-uploader
```

### Docker Compose Behind A Reverse Proxy

The included `docker-compose.yml` is a deployment preset for an existing [`nginx-proxy`](https://github.com/nginx-proxy/nginx-proxy)-style setup. Unlike the portable command above, it:

- exposes port 3000 only to Docker, not directly to the host;
- expects an external Docker network named `devtksg`; and
- uses `PRODUCTION_HOST` for the proxy hostname.

Create the network once if your reverse proxy does not already create it:

```bash
docker network create devtksg
```

Set the public host in `.env`, then start the app:

```dotenv
PRODUCTION_HOST=photos.example.com
```

```bash
docker compose up --build -d
```

Your reverse proxy must terminate HTTPS, join the same Docker network, route the hostname to port 3000, and send `X-Forwarded-Proto: https`. Set `GOOGLE_REDIRECT_URI` to `https://photos.example.com/auth/google/callback` and register that exact URI in Google Cloud.

If you do not already run a compatible reverse proxy, use the portable Docker command and put your preferred HTTPS proxy or tunnel in front of port 3000 instead of copying this Compose topology.

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
# generate ADMIN_SESSION_SECRET with: openssl rand -hex 32
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

Sign in with an email address listed in `ADMIN_EMAILS`, then complete the browser setup in this order:

1. Connect Google Drive
2. Pick a default Google Drive folder
   - You can either choose a folder directly
   - Or choose a parent folder and create a `default-for-discord` folder inside it
3. Enter the Discord bot token
4. Invite the bot to the Discord server you want to sync
5. Link Discord servers and channels to Drive folders
   - Only servers the bot has already joined will appear in the picker
   - You can also review and change the default fallback folder again from this page later

Admin sign-in and Drive authorisation are separate. Signing in proves who may manage the app; connecting Google Drive grants the bot access to its shared upload folders. Both flows use the same `/auth/google/callback` redirect URI.

If `ALLOWED_EMAIL_DOMAINS` is configured, only Google accounts from those domains can connect the shared Drive account.

The setup wizard will also ask for the Discord bot token. That value comes from the `Bot` tab in the Discord Developer Portal, not from the `.env` file.

### Verify The Installation

After setup:

1. The linked folders page should list the configured server and channel.
2. `/upload-info` in that Discord channel should show its destination.
3. Post a small supported image with optional message text.
4. Confirm that the bot replies with a Drive link and the file appears in today's dated subfolder.

Do not use `/test-upload` as the only check: a real attachment also verifies Discord's message-content intent, attachment download, Drive upload, and confirmation reply.

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

## Operating A Self-Hosted Instance

### Security

- Use HTTPS for any deployment reachable beyond your own machine. The app sets secure admin cookies when the request or `X-Forwarded-Proto` indicates HTTPS.
- Keep `ADMIN_EMAILS` narrow. Every listed Google account can view and change the bot's Drive and Discord configuration.
- Keep `.env` and `data/bot-config.json` private. The data file contains Google OAuth tokens, the Discord bot token, folder mappings, and server configuration.
- Never commit `.env` or `data/`. Both are ignored by this repository, but verify before pushing a fork.
- Restrict the Google API key by website origin and API in Google Cloud. The OAuth client secret and Discord bot token must never be sent to the browser or exposed by the reverse proxy.
- If a bot token, client secret, session secret, or saved configuration is exposed, rotate the affected credential rather than only deleting the leaked file.

### Backups And Upgrades

All mutable application state is in the file selected by `CONFIG_STORE_PATH`, `/data/bot-config.json` by default. Back up the mounted `data` directory with permissions that protect its secrets.

To upgrade a direct Docker installation:

```bash
git pull --ff-only
docker build -t discord-drive-uploader .
docker rm -f discord-drive-uploader
# Run the same docker run command from the initial setup.
```

Removing or rebuilding the container is safe as long as the same host `data` directory is mounted back at `/data`. Deleting that directory requires reconnecting Google, re-entering the Discord bot token, and rebuilding channel mappings.

## Working With A Coding Agent

You can point an agent at this repository and ask it to follow `AGENTS.md` and this README. Include your intended deployment style (direct Docker, the included Compose proxy setup, or another platform) and public callback URL; do not paste live credentials into the prompt.

A useful handoff prompt is:

> Help me deploy or adapt this repository. Read `AGENTS.md`, `README.md`, `.env.example`, `docker-compose.yml`, and the relevant source before changing anything. My deployment is `<direct Docker / reverse proxy / other>`, my public origin is `<URL>`, and I want `<outcome>`. Preserve admin authentication and persistent `/data` storage. Do not print or commit credentials. Run `npm run lint` and `npm test` after behavior changes.

For implementation work, the main ownership boundaries are:

- `src/index.js`: HTTP server, Google OAuth, admin authentication, setup APIs, and static UI routing
- `src/handlers/message-handler.js`: Discord client, slash-command registration, attachment handling, and upload replies
- `src/services/google-drive.js`: Drive folder and upload operations
- `src/services/config-store.js` and `src/services/file-store.js`: persisted tokens, bot token, defaults, and channel mappings
- `public/`: setup and administration UI
- `tests/`: Jest unit and integration coverage

The application deliberately has no database or build pipeline. Prefer the existing Node.js, file-backed, Docker-first architecture unless your requested change genuinely needs a different boundary.

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
