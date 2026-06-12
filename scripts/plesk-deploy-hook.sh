#!/bin/bash
# Plesk Git auto-deploy hook
# Place this at: /var/www/vhosts/yourdomain.com/deploy-hook.sh
# Plesk Git settings → "Run after repository update"

set -e

APP_DIR="/var/www/vhosts/yourdomain.com/httpdocs"
LOG_FILE="$APP_DIR/logs/deploy.log"
LOCK_FILE="/tmp/rhp-deploy.lock"

# Prevent concurrent deploys
if [ -f "$LOCK_FILE" ]; then
    echo "$(date): Deploy already in progress, skipping." >> "$LOG_FILE"
    exit 0
fi
trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

echo "=========================================" >> "$LOG_FILE"
echo "$(date): Starting deployment..." >> "$LOG_FILE"

cd "$APP_DIR"

# Install dependencies
echo "$(date): Installing dependencies..." >> "$LOG_FILE"
npm install --production >> "$LOG_FILE" 2>&1
cd backend && npm install >> "$LOG_FILE" 2>&1

# Run unit tests — abort deploy if tests fail
echo "$(date): Running unit tests..." >> "$LOG_FILE"
if npm test -- --forceExit --detectOpenHandles >> "$LOG_FILE" 2>&1; then
    echo "$(date): ✅ All tests passed!" >> "$LOG_FILE"
else
    echo "$(date): ❌ TESTS FAILED — Aborting deployment!" >> "$LOG_FILE"
    echo "$(date): Check logs for details." >> "$LOG_FILE"
    exit 1
fi
cd ..

# Build frontend
cd frontend && npm install >> "$LOG_FILE" 2>&1
echo "$(date): Building frontend..." >> "$LOG_FILE"
npm run build -- --configuration=production >> "$LOG_FILE" 2>&1
cd ..

# Restart app via PM2
echo "$(date): Restarting application..." >> "$LOG_FILE"
pm2 restart rhp-office-portal >> "$LOG_FILE" 2>&1 || pm2 start ecosystem.config.json >> "$LOG_FILE" 2>&1
pm2 save >> "$LOG_FILE" 2>&1

echo "$(date): ✅ Deployment complete!" >> "$LOG_FILE"
echo "=========================================" >> "$LOG_FILE"
