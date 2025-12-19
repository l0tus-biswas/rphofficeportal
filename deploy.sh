#!/bin/bash

# Escape Recruiting Platform - AlmaLinux Deployment Script
# Simple deployment for same-domain setup with Nginx + PM2

echo "========================================="
echo "Escape Recruiting Platform Deployment"
echo "========================================="
echo ""

# Configuration
DOMAIN="yourdomain.com"
APP_DIR="/var/www/escape"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

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
dnf update -y
dnf install -y nginx
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
dnf install -y nodejs
npm install -g pm2

echo -e "${GREEN}Step 2: Creating application directory...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR

echo -e "${YELLOW}Upload your project to $APP_DIR${NC}"
echo "You can use: scp, git clone, or FTP"
read -p "Press Enter after uploading your project files..."

echo -e "${GREEN}Step 3: Installing backend dependencies...${NC}"
cd $BACKEND_DIR
npm install --production

echo -e "${GREEN}Step 4: Installing frontend dependencies and building...${NC}"
cd $APP_DIR/frontend
npm install
npm run build --configuration=production

echo -e "${GREEN}Step 5: Moving built frontend files...${NC}"
rm -rf $FRONTEND_DIR/dist
mkdir -p $FRONTEND_DIR
cp -r dist/rhpoffice-frontend/* $FRONTEND_DIR/

echo -e "${GREEN}Step 6: Setting up environment variables...${NC}"
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

echo -e "${GREEN}Step 7: Setting up PM2 for backend...${NC}"
cd $BACKEND_DIR
pm2 start server.js --name escape-backend
pm2 save
pm2 startup

echo -e "${GREEN}Step 8: Configuring Nginx...${NC}"
cat > /etc/nginx/conf.d/escape.conf << EOL
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root $FRONTEND_DIR;
    index index.html;

    # API proxy
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:5000;
    }

    # Angular routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static files
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
EOL

echo -e "${GREEN}Step 9: Setting permissions...${NC}"
chown -R nginx:nginx $APP_DIR
chmod -R 755 $APP_DIR
mkdir -p $BACKEND_DIR/uploads
chown -R nginx:nginx $BACKEND_DIR/uploads

echo -e "${GREEN}Step 10: Configuring firewall...${NC}"
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload

echo -e "${GREEN}Step 11: Starting Nginx...${NC}"
systemctl enable nginx
systemctl restart nginx

echo -e "${GREEN}Step 12: Installing SSL (optional)...${NC}"
echo "For SSL certificate with Let's Encrypt:"
echo "1. Install certbot: dnf install -y certbot python3-certbot-nginx"
echo "2. Run: certbot --nginx -d $DOMAIN -d www.$DOMAIN"

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Backend running on: http://localhost:5000"
echo -e "Frontend accessible at: http://$DOMAIN"
echo -e "API endpoint: http://$DOMAIN/api"
echo ""
echo -e "Useful commands:"
echo -e "  pm2 status              - Check backend status"
echo -e "  pm2 logs escape-backend - View backend logs"
echo -e "  pm2 restart escape-backend - Restart backend"
echo -e "  systemctl status nginx  - Check Nginx status"
echo -e "  systemctl restart nginx - Restart Nginx"
echo ""
echo -e "${YELLOW}Don't forget to:${NC}"
echo -e "1. Edit $BACKEND_DIR/.env with real values"
echo -e "2. Update MongoDB connection"
echo -e "3. Configure SMTP settings"
echo -e "4. Install SSL certificate"
echo ""
