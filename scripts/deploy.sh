#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-tinkertanker@dev.tk.sg}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/tinkertanker/Docker/discord-gdrive-photo-uploader}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
SKIP_ENV_UPLOAD="${SKIP_ENV_UPLOAD:-0}"

rsync_opts=(
  --archive
  --compress
  --delete
  --progress
  --exclude='.git'
  --exclude='.gitignore'
  --exclude='node_modules'
  --exclude='coverage'
  --exclude='dist'
  --exclude='build'
  --exclude='.env'
  --exclude='.env.local'
  --exclude='.env.production'
  --exclude='data'
  --exclude='logs'
  --exclude='.DS_Store'
  --exclude='*.log'
  --exclude='tmp'
  --exclude='.tmp'
)

if [[ -n "${DRY_RUN:-}" ]]; then
  rsync_opts+=(--dry-run)
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required for this script."
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required for this script."
  exit 1
fi

echo "Preparing remote deployment directory..."
ssh "$DEPLOY_HOST" "mkdir -p '${DEPLOY_DIR}'"

echo "Syncing application files to ${DEPLOY_HOST}:${DEPLOY_DIR}"
rsync "${rsync_opts[@]}" "$PROJECT_ROOT/" "$DEPLOY_HOST:${DEPLOY_DIR}/"

if [[ "$SKIP_ENV_UPLOAD" != "1" ]]; then
  if [[ -f "$PROJECT_ROOT/$ENV_FILE" ]]; then
    echo "Uploading $ENV_FILE..."
    rsync --archive "$PROJECT_ROOT/$ENV_FILE" "$DEPLOY_HOST:${DEPLOY_DIR}/.env"
  else
    echo "No $ENV_FILE found at $PROJECT_ROOT/$ENV_FILE; skipping."
    echo "Set DEPLOY_HOST/DEPLOY_DIR and add .env later on the server if required."
  fi
fi

echo "Deploying with docker compose (${COMPOSE_FILE})..."
ssh "$DEPLOY_HOST" "cd '${DEPLOY_DIR}' && docker compose -f '${COMPOSE_FILE}' up --build -d --remove-orphans"

echo "Deployment finished."
echo "Tail logs: ssh ${DEPLOY_HOST} 'cd ${DEPLOY_DIR} && docker compose logs -f discord-drive-uploader'"
echo "Check health: ssh ${DEPLOY_HOST} 'cd ${DEPLOY_DIR} && docker compose ps'"
