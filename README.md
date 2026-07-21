# Discord Drive Uploader

Self-hosted Discord bot and setup UI that uploads photos and videos from Discord channels to mapped Google Drive folders.

You supply and control the Google Cloud and Discord credentials, deployment, and persisted configuration. This repository does not provide a hosted service.

## How It Works

- Watches configured Discord channels for supported image and video attachments
- Uploads files to a default Drive folder or a per-channel folder
- Organises uploads into daily folders and avoids filename collisions
- Provides a browser UI for Google authorisation, bot setup, and folder mapping
- Restricts administration to a Google email allowlist

## Prerequisites

- A Google Cloud project
- A Discord application and bot
- Docker, or Node.js 20+ and npm

### Google Cloud

In the [Google Cloud Console](https://console.cloud.google.com/):

1. Enable the **Google Drive API**.
2. Configure the OAuth consent screen. For an external app, add test users while developing and publish it when ready; refresh tokens for apps left in testing may expire after seven days.
3. Create a **Web application** OAuth client with this callback:
   - Local: `http://localhost:3000/auth/google/callback`
   - Hosted: `https://your-domain.example/auth/google/callback`
4. Copy the client ID and secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Create an API key for Google Picker, restrict it to your public origin, and set `GOOGLE_API_KEY`.
6. Set `GOOGLE_REDIRECT_URI` to the exact callback registered above.

### Discord

In the [Discord Developer Portal](https://discord.com/developers/applications/):

1. Create an application and bot.
2. Copy the application ID and public key to `DISCORD_APPLICATION_ID` and `DISCORD_PUBLIC_KEY`.
3. Enable **Message Content Intent** on the Bot page.
4. Generate an OAuth2 invite with the `bot` and `applications.commands` scopes.
5. Grant **View Channels**, **Send Messages**, **Read Message History**, **Attach Files**, and **Use Slash Commands**.
6. Invite the bot to the server. You will enter its token later in the setup UI.

## Configuration

```bash
cp .env.example .env
```

Fill in these required values:

| Variable                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`       | Google OAuth client ID                                        |
| `GOOGLE_CLIENT_SECRET`   | Google OAuth client secret                                    |
| `GOOGLE_REDIRECT_URI`    | Exact `/auth/google/callback` URL                             |
| `GOOGLE_API_KEY`         | Browser API key used by Google Picker                         |
| `ADMIN_EMAILS`           | Comma-separated Google accounts allowed to administer the app |
| `ADMIN_SESSION_SECRET`   | Random secret of at least 32 characters for session cookies   |
| `DISCORD_APPLICATION_ID` | Discord application ID                                        |
| `DISCORD_PUBLIC_KEY`     | Discord application public key                                |

Optional values:

| Variable                | Default                 | Purpose                                                                                   |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `ALLOWED_EMAIL_DOMAINS` | Example domain          | Limits which Google accounts may connect Drive; set to `,` to rely only on `ADMIN_EMAILS` |
| `CONFIG_STORE_PATH`     | `/data/bot-config.json` | Persistent configuration file                                                             |
| `PORT`                  | `3000`                  | Application port                                                                          |
| `PRODUCTION_HOST`       | Compose preset value    | Hostname used by the reverse proxy                                                        |

The Discord bot token is entered in the setup UI, not stored in `.env`.

## Run It

### Portable Docker

This publishes port 3000 and persists configuration in `./data`:

```bash
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

Open `http://localhost:3000`. Use `docker logs -f discord-drive-uploader` to inspect startup errors.

### Docker Compose With nginx-proxy

The included Compose file expects an existing [`nginx-proxy`](https://github.com/nginx-proxy/nginx-proxy)-style reverse proxy and external `devtksg` network. It does not publish port 3000 to the host.

```bash
docker network create devtksg # once, if it does not exist
docker compose up --build -d
```

Set `PRODUCTION_HOST` and an HTTPS `GOOGLE_REDIRECT_URI` in `.env`. The proxy must share the `devtksg` network, route the hostname to port 3000, terminate HTTPS, and send `X-Forwarded-Proto: https`.

If you do not run a compatible proxy, use the portable Docker command and put your preferred HTTPS proxy or tunnel in front of it.

### Node.js

```bash
npm install
npm run dev
```

Use `npm start` for a non-watch run.

## Complete Setup

Open the app and sign in with an account listed in `ADMIN_EMAILS`, then:

1. Connect Google Drive.
2. Choose a default folder, or create `default-for-discord` inside a parent folder.
3. Enter the Discord bot token.
4. Map Discord servers and channels to Drive folders.

Admin sign-in and Drive authorisation are separate flows. If `ALLOWED_EMAIL_DOMAINS` is set, it also limits which Google accounts can connect the shared Drive account.

Verify the full upload path by posting a small image with optional message text in a mapped channel. The bot should reply with a Drive link and the file should appear in today's folder. `/upload-info` shows the current destination.

## Upload Behaviour

Supported MIME types:

- Images: JPEG, PNG, GIF, WebP
- Videos: MP4, WebM, MOV, AVI

Uploads use this structure:

```text
YYYY-mm-dd/display name - hh-mm-ss - comment.ext
```

The comment is omitted when the Discord message has no text and truncated to 100 characters when present. Existing filenames receive `_1`, `_2`, and so on. Folder dates and timestamps use the app server's local timezone.

Bot commands:

- `/setup-folder` — set the current channel's upload folder
- `/upload-info` — show the current upload configuration
- `/test-upload` — test Drive access

## Security And Persistence

- Use HTTPS for any publicly reachable deployment.
- Keep `ADMIN_EMAILS` narrow; every listed account can change Drive and Discord configuration.
- Never expose or commit `.env`, `data/`, or `data/bot-config.json`.
- Restrict the Google API key by origin and API.
- Rotate any bot token, client secret, session secret, or saved configuration that is exposed.
- Back up the mounted `data` directory securely. It contains Google OAuth tokens, the bot token, and folder mappings.

All mutable state is stored at `CONFIG_STORE_PATH`. Containers can be rebuilt safely as long as the same host directory remains mounted at `/data`.

## Development

```bash
npm run lint
npm test
```

Key modules:

- `src/index.js` — HTTP server, OAuth, authentication, setup APIs, and UI routing
- `src/handlers/message-handler.js` — Discord client, commands, and attachment handling
- `src/services/google-drive.js` — Drive folders and uploads
- `src/services/config-store.js` and `src/services/file-store.js` — persistent configuration
- `public/` — setup UI

## Troubleshooting

### Google reports a redirect mismatch

Ensure `GOOGLE_REDIRECT_URI`, the authorised Google OAuth redirect, and the URL used to open the app have the same origin and exact `/auth/google/callback` path.

### The bot cannot see messages

Confirm Message Content Intent is enabled, the bot has the listed permissions, the invite included both required scopes, and the saved token is valid.

### Drive folders do not load

Confirm the Drive API is enabled, `GOOGLE_API_KEY` permits the current origin, and the connected account passes `ALLOWED_EMAIL_DOMAINS` when configured.

### Files do not upload

Check `/upload-info`, confirm the mapped Drive folder still exists, and verify that the bot can read the Discord channel.

## Licence

MIT. See `LICENSE`.
