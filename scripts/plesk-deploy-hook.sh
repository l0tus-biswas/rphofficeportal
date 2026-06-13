#!/bin/bash
# Plesk Git auto-deploy hook
# Paste this into Plesk → Git → "Additional deployment actions"
# OR place at: /var/www/vhosts/<domain>/deploy-hook.sh

# ---------- Node.js PATH initialization ----------
# Bypass nodenv/nvm shell profile errors in non-interactive Plesk shells.
# Try common Node.js install locations in priority order.
for NODE_DIR in \
    "$HOME/.nvm/versions/node"/*/bin \
    /opt/plesk/node/*/bin \
    /usr/local/bin \
    /usr/bin; do
    if [ -x "$NODE_DIR/node" ] 2>/dev/null; then
        export PATH="$NODE_DIR:$PATH"
        break
    fi
done

# Source nvm if available (handles nvm-managed installs)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

# Verify node is reachable
if ! command -v node >/dev/null 2>&1; then
    echo "FATAL: node not found in PATH after initialization."
    echo "PATH=$PATH"
    exit 1
fi

set -e

# ---------- Configuration ----------
# Auto-detect APP_DIR: use PLESK_DIR env if set, otherwise script's directory
APP_DIR="${PLESK_DIR:-$(cd "$(dirname "$0")" && pwd)}"
LOG_FILE="$APP_DIR/logs/deploy.log"
LOCK_FILE="/tmp/rhp-deploy.lock"
mkdir -p "$APP_DIR/logs"

# Prevent concurrent deploys
if [ -f "$LOCK_FILE" ]; then
    echo "$(date): Deploy already in progress, skipping." >> "$LOG_FILE"
    exit 0
fi
trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

echo "=========================================" >> "$LOG_FILE"
echo "$(date): Starting deployment..." >> "$LOG_FILE"
echo "$(date): Node $(node -v) | npm $(npm -v)" >> "$LOG_FILE"

cd "$APP_DIR"

# ---------- Install dependencies ----------
echo "$(date): Installing root dependencies..." >> "$LOG_FILE"
npm install --production >> "$LOG_FILE" 2>&1

echo "$(date): Installing backend dependencies..." >> "$LOG_FILE"
cd backend && npm install >> "$LOG_FILE" 2>&1

# ---------- Run unit tests — abort deploy on failure ----------
echo "$(date): Running unit tests..." >> "$LOG_FILE"
if npm test -- --forceExit --detectOpenHandles >> "$LOG_FILE" 2>&1; then
    echo "$(date): All tests passed!" >> "$LOG_FILE"
else
    echo "$(date): TESTS FAILED — Aborting deployment!" >> "$LOG_FILE"
    echo "$(date): Check logs for details." >> "$LOG_FILE"
    exit 1
fi
cd ..

# ---------- Build frontend ----------
echo "$(date): Installing frontend dependencies..." >> "$LOG_FILE"
cd frontend && npm install >> "$LOG_FILE" 2>&1
echo "$(date): Building frontend..." >> "$LOG_FILE"
npm run build -- --configuration=production >> "$LOG_FILE" 2>&1
cd ..

# ---------- Restart application ----------
echo "$(date): Restarting application..." >> "$LOG_FILE"
if command -v pm2 >/dev/null 2>&1; then
    pm2 restart rhp-office-portal >> "$LOG_FILE" 2>&1 || pm2 start ecosystem.config.json >> "$LOG_FILE" 2>&1
    pm2 save >> "$LOG_FILE" 2>&1
else
    echo "$(date): WARNING — pm2 not found. Trying npx..." >> "$LOG_FILE"
    npx pm2 restart rhp-office-portal >> "$LOG_FILE" 2>&1 || npx pm2 start ecosystem.config.json >> "$LOG_FILE" 2>&1
    npx pm2 save >> "$LOG_FILE" 2>&1
fi

echo "$(date): Deployment complete!" >> "$LOG_FILE"
echo "=========================================" >> "$LOG_FILE"
