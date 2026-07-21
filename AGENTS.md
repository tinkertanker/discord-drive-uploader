# AGENTS

- This project now runs as a self-hosted Docker Node.js app; user-facing instructions live in `README.md`.
- Before deployment or setup changes, read `README.md`, `.env.example`, `docker-compose.yml`, and the relevant source. The included Compose file assumes an external `devtksg` network and an nginx-proxy-style reverse proxy; the README also documents a portable direct-Docker path.
- Keep public setup/configuration endpoints (`/api/*`) secured for publicly exposed deployments.
- Preserve the admin Google allowlist, same-origin mutation checks, HTTPS-aware cookies, and persistent `/data` storage. Never print, hard-code, or commit credentials from `.env` or `data/bot-config.json`.
- Preserve existing architecture unless a change is scoped and tested.
- Run `npm run lint` and `npm test` after behavior changes, then keep changes atomic and narrowly scoped.
