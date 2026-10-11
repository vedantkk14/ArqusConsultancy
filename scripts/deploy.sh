#!/usr/bin/env bash
# Deploy the latest committed code on the server. Run as root: bash /opt/arqus/scripts/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/arqus}"
VENV="$APP_DIR/.venv/bin"

echo "==> Pulling latest code"
git -C "$APP_DIR" pull --ff-only

echo "==> Backend dependencies"
"$VENV/pip" install -q -r "$APP_DIR/backend/requirements.txt" gunicorn

echo "==> Database migrations"
cd "$APP_DIR/backend"
"$VENV/python" manage.py migrate --noinput
"$VENV/python" manage.py collectstatic --noinput

echo "==> Frontend build"
cd "$APP_DIR/frontend"
npm ci
npx ng build --configuration production

echo "==> Restarting services"
systemctl restart arqus-web arqus-mailer

echo "==> Health check"
sleep 3
curl -fsS http://127.0.0.1:8000/api/v1/health && echo " OK"
systemctl is-active arqus-web arqus-mailer
