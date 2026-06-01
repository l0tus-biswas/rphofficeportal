#!/bin/bash

# RHP Office Portal - Production Deployment Script
# Deploys both frontend and backend using index.js
# Supports PM2 process management

echo "========================================="
echo "RHP Office Portal - Production Deployment"
echo "========================================="
echo ""

# Get current directory as project root
PROJECT_ROOT="$(pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Prompt for domain
read -p "Enter your domain name (e.g., rhpoffice.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN="rhpoffice.com"
fi

echo ""
echo "Project root: $PROJECT_ROOT"
echo "Domain: $DOMAIN"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

echo -e "${GREEN}Step 1: Installing dependencies...${NC}"
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    dnf install -y nodejs
else
    echo "Node.js already installed: $(node -v)"
fi

echo "Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
else
    echo "PM2 already installed"
fi

echo -e "${GREEN}Step 2: Verifying project structure...${NC}"
if [ ! -d "$BACKEND_DIR" ]; then
    echo -e "${RED}Error: Backend directory not found at $BACKEND_DIR${NC}"
    echo "Please ensure your project files are uploaded to $PROJECT_ROOT"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}Error: Frontend directory not found at $FRONTEND_DIR${NC}"
    echo "Please ensure your project files are uploaded to $PROJECT_ROOT"
    exit 1
fi

echo -e "${GREEN}Step 3: Installing backend dependencies...${NC}"
cd $BACKEND_DIR
npm install --omit=dev

echo -e "${GREEN}Step 4: Installing frontend dependencies and building...${NC}"
cd $FRONTEND_DIR
npm install
npm run build --configuration=production

echo -e "${GREEN}Step 5: Preparing frontend for serving...${NC}"
DIST_DIR="$FRONTEND_DIR/dist/rhpoffice-frontend"
if [ ! -d "$DIST_DIR" ]; then
    echo -e "${RED}Error: Build failed. Directory $DIST_DIR not found${NC}"
    exit 1
fi

echo -e "${GREEN}Step 6: Setting up environment variables...${NC}"
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "Creating .env file in backend directory"
    cat > $BACKEND_DIR/.env << EOL
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/escape
JWT_SECRET=your-secret-change-this
JWT_REFRESH_SECRET=your-refresh-secret-change-this
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
APP_URL=https://$DOMAIN
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@$DOMAIN
SMTP_FROM_NAME=Escape
EOL
    echo -e "${YELLOW}Edit $BACKEND_DIR/.env with your actual values${NC}"
    read -p "Press Enter after editing .env file..."
else
    echo ".env file already exists, skipping creation"
fi

echo -e "${GREEN}Step 7: Setting up PM2 for backend...${NC}"
cd $BACKEND_DIR
# Stop existing process if running
pm2 delete escape-backend 2>/dev/null || true
pm2 start server.js --name escape-backend
pm2 save
pm2 startup

echo -e "${GREEN}Step 8: Configuring for Plesk...${NC}"
echo "Detected Plesk environment"
echo ""
echo -e "${YELLOW}=== Manual Plesk Configuration Required ===${NC}"
echo ""
echo "1. Go to: Domains > $DOMAIN > Apache & Nginx Settings"
echo ""
echo "2. Set Document Root to:"
echo "   $DIST_DIR"
echo ""
echo "3. Add these 'Additional nginx directives':"
echo ""
cat << 'EOL'
location /api {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /socket.io/ {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}

location /health {
    proxy_pass http://localhost:5000;
}
EOL
echo ""
echo "4. Click 'OK' to save"
echo ""

echo -e "${GREEN}Step 9: Setting permissions...${NC}"
mkdir -p $BACKEND_DIR/uploads
chmod -R 755 $PROJECT_ROOT
chmod -R 777 $BACKEND_DIR/uploads

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Project root: $PROJECT_ROOT"
echo -e "Backend running on: http://localhost:5000"
echo -e "Frontend built to: $DIST_DIR"
echo -e "Domain: http://$DOMAIN"
echo -e "API endpoint: http://$DOMAIN/api"
echo ""
echo -e "Useful commands:"
echo -e "  pm2 status              - Check backend status"
echo -e "  pm2 logs escape-backend - View backend logs"
echo -e "  pm2 restart escape-backend - Restart backend"
echo -e "  pm2 stop escape-backend - Stop backend"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Edit $BACKEND_DIR/.env with real MongoDB and SMTP values"
echo -e "2. Restart backend: pm2 restart escape-backend"
echo -e "3. Configure Plesk domain settings (see instructions above)"
echo -e "4. Install SSL certificate for $DOMAIN in Plesk"
echo -e "5. Test: http://$DOMAIN/health"
echo ""

