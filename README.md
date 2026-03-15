# Discord Drive Uploader

Uploads photos and videos from Discord channels to Google Drive folders.

## Setup

### 1. Google Cloud

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the Google Drive API.
3. Create an OAuth client for a web application.
4. Add authorised redirect URIs for:
   - `http://localhost:3000/auth/google/callback`
   - `https://your-domain.example/auth/google/callback`
5. Create an API key for Google Picker.
6. Save:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_API_KEY`

### 2. Discord

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Save:
   - `DISCORD_APPLICATION_ID`
   - `DISCORD_PUBLIC_KEY`
3. Create a bot and copy its token.
4. Enable Message Content Intent.

### 3. Environment

Copy `.env.example` to `.env` and set:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_API_KEY`
- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`
- `SETUP_API_TOKEN` if the setup UI will be reachable from the internet
- `ALLOWED_EMAIL_DOMAINS` if you want to restrict which Google accounts can finish setup
- `CONFIG_STORE_PATH` if you do not want to use `/data/bot-config.json`

### 4. Run

```bash
cp .env.example .env
docker compose up --build -d
```

Open `http://localhost:3000`, then:

1. Connect Google Drive.
2. Enter the Discord bot token in the setup UI.
3. Pick a default folder.
4. Link Discord servers and channels to Drive folders.

## Discord Permissions

When inviting the bot, grant:

- View Channels
- Send Messages
- Read Message History
- Attach Files
- Use Slash Commands

## Troubleshooting

- OAuth redirect errors: make sure `GOOGLE_REDIRECT_URI` exactly matches the URI configured in Google Cloud.
- Setup access errors: if `SETUP_API_TOKEN` is set, include it when saving config through the UI.
- Missing uploads: confirm the bot can see the channel and that the mapped Drive folder still exists.

## Development

```bash
npm install
npm run lint
npm test
npm run dev
```

## License

MIT. See `LICENSE`.
