#!/bin/bash

# Quick deployment script using index.js
# Run this after making changes to redeploy

# ---------- Node.js PATH initialization ----------
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
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

echo "Deploying RHP Office Portal..."

# Pull latest changes (if using git)
if [ -d ".git" ]; then
    echo "Pulling latest changes..."
    git pull
fi

# Install dependencies
echo "Installing dependencies..."
npm install --production

# Backend dependencies
cd backend
npm install
cd ..

# Frontend dependencies and build
echo "Building frontend..."
cd frontend
npm install
npm run build -- --configuration=production
cd ..

# Restart PM2 process
echo "Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart rhp-office-portal || pm2 start ecosystem.config.json
    pm2 save
else
    echo "PM2 not found. Install with: npm install -g pm2"
    echo "Starting with npm start instead..."
    npm start
fi

echo "Deployment complete!"
echo "Check status: pm2 status"
echo "View logs: pm2 logs rhp-office-portal"
