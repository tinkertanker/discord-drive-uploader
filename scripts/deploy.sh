#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-tinkertanker@dev.tk.sg}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/tinkertanker-server/Docker/discord-gdrive-photo-uploader}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_REPO="${DEPLOY_REPO:-$(git config --get remote.origin.url || true)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
UPLOAD_ENV="${UPLOAD_ENV:-1}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required for this script."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required for this script."
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required for this script."
  exit 1
fi

if [[ -z "$DEPLOY_REPO" ]]; then
  echo "DEPLOY_REPO is not set and ${DEPLOY_DIR} is not a git repository."
  echo "Set DEPLOY_REPO to bootstrap the folder on first deploy."
  exit 1
fi

echo "Preparing remote deployment directory and syncing from git..."
ssh "$DEPLOY_HOST" "mkdir -p '${DEPLOY_DIR}'"
ssh "$DEPLOY_HOST" "set -euo pipefail
  if [ ! -d '${DEPLOY_DIR}/.git' ]; then
    if [ -z '${DEPLOY_REPO}' ]; then
      echo 'Remote deployment directory is not a git repository and DEPLOY_REPO is not set.'
      exit 1
    fi
    rm -rf '${DEPLOY_DIR:?}'
    mkdir -p '${DEPLOY_DIR}'
    git clone -b '${DEPLOY_BRANCH}' '${DEPLOY_REPO}' '${DEPLOY_DIR}'
  fi

  cd '${DEPLOY_DIR}'
  git fetch origin
  git checkout '${DEPLOY_BRANCH}'
  git pull --ff-only origin '${DEPLOY_BRANCH}'
"

if [[ "$UPLOAD_ENV" == "1" ]]; then
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    echo "Uploading local .env..."
    rsync --archive "$PROJECT_ROOT/.env" "$DEPLOY_HOST:${DEPLOY_DIR}/.env"
  else
    echo "ERROR: local .env file not found at $PROJECT_ROOT/.env"
    exit 1
  fi
else
  ssh "$DEPLOY_HOST" "if [ ! -f '${DEPLOY_DIR}/.env' ]; then
    echo 'ERROR: compose requires .env on remote and UPLOAD_ENV=0 was set for this run.'
    exit 1
  fi"
fi

echo "Deploying with docker compose (${COMPOSE_FILE})..."
ssh "$DEPLOY_HOST" "cd '${DEPLOY_DIR}' && docker compose -f '${COMPOSE_FILE}' up --build -d --remove-orphans"

echo "Deployment finished."
echo "Tail logs: ssh ${DEPLOY_HOST} 'cd ${DEPLOY_DIR} && docker compose logs -f discord-drive-uploader'"
echo "Check health: ssh ${DEPLOY_HOST} 'cd ${DEPLOY_DIR} && docker compose ps'"
