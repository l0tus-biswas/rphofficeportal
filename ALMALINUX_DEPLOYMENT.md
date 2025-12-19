# AlmaLinux Deployment Guide

## Simple Same-Domain Deployment (Nginx + PM2)

This guide deploys both frontend and backend on the same domain using:
- **Nginx**: Serves frontend static files and proxies API requests
- **PM2**: Runs backend Node.js process
- **Single Domain**: All traffic on one domain

---

## Prerequisites

- AlmaLinux server with root access
- Domain name pointing to your server
- Node.js 18.x or higher
- MongoDB (local or remote)

---

## Quick Deployment (Automated)

### 1. Upload Project
```bash
# Via git
git clone your-repo-url /var/www/escape

# Or upload via SCP
scp -r rphoffice user@server:/var/www/escape
```

### 2. Run Deployment Script
```bash
cd /var/www/escape
sudo bash deploy.sh
```

The script will:
- Install Nginx, Node.js, PM2
- Build frontend
- Configure Nginx
- Start backend with PM2
- Set up firewall

### 3. Configure Environment
Edit `/var/www/escape/backend/.env`:
```bash
sudo nano /var/www/escape/backend/.env
```

### 4. Restart Backend
```bash
pm2 restart escape-backend
```

---

## Manual Deployment

### Step 1: Install Dependencies
```bash
# Update system
sudo dnf update -y

# Install Nginx
sudo dnf install -y nginx

# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Install PM2
sudo npm install -g pm2
```

### Step 2: Upload Project
```bash
sudo mkdir -p /var/www/escape
cd /var/www/escape
# Upload your project here
```

### Step 3: Backend Setup
```bash
cd /var/www/escape/backend

# Install dependencies
npm install --production

# Create .env file
sudo nano .env
```

Add to `.env`:
```
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/escape
JWT_SECRET=your-secret-key-change-this
JWT_REFRESH_SECRET=your-refresh-secret-change-this
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
APP_URL=https://yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com
SMTP_FROM_NAME=Escape
```

### Step 4: Frontend Build
```bash
cd /var/www/escape/frontend

# Install dependencies
npm install

# Build for production
npm run build --configuration=production

# Move built files
sudo mkdir -p /var/www/escape/frontend-dist
sudo cp -r dist/rhpoffice-frontend/* /var/www/escape/frontend-dist/
```

### Step 5: Start Backend with PM2
```bash
cd /var/www/escape/backend
pm2 start server.js --name escape-backend
pm2 save
pm2 startup
```

### Step 6: Configure Nginx
```bash
sudo nano /etc/nginx/conf.d/escape.conf
```

Add configuration (see nginx.conf file in project root)

Test and restart:
```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

### Step 7: Set Permissions
```bash
sudo chown -R nginx:nginx /var/www/escape
sudo chmod -R 755 /var/www/escape
sudo mkdir -p /var/www/escape/backend/uploads
sudo chown -R nginx:nginx /var/www/escape/backend/uploads
```

### Step 8: Configure Firewall
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### Step 9: Install SSL (Let's Encrypt)
```bash
# Install certbot
sudo dnf install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot-renew.timer
```

---

## Project Structure on Server

```
/var/www/escape/
├── backend/
│   ├── server.js
│   ├── .env
│   ├── uploads/
│   └── node_modules/
├── frontend-dist/        # Built Angular files
│   ├── index.html
│   └── assets/
└── nginx.conf
```

---

## Environment File Location

**Backend .env**: `/var/www/escape/backend/.env`

**Frontend environment**: Built into Angular app during `npm run build`
- Make sure `frontend/src/environments/environment.prod.ts` has correct API URL before building

---

## Useful Commands

### PM2 (Backend)
```bash
pm2 status                    # Check status
pm2 logs escape-backend       # View logs
pm2 restart escape-backend    # Restart
pm2 stop escape-backend       # Stop
pm2 delete escape-backend     # Remove
pm2 monit                     # Monitor
```

### Nginx (Frontend + Proxy)
```bash
sudo systemctl status nginx   # Check status
sudo systemctl restart nginx  # Restart
sudo systemctl reload nginx   # Reload config
sudo nginx -t                 # Test config
sudo tail -f /var/log/nginx/error.log  # View errors
```

### Application Logs
```bash
# Backend logs
pm2 logs escape-backend

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

---

## Updating the Application

### Update Backend
```bash
cd /var/www/escape/backend
git pull  # or upload new files
npm install --production
pm2 restart escape-backend
```

### Update Frontend
```bash
cd /var/www/escape/frontend
git pull  # or upload new files
npm install
npm run build --configuration=production
sudo cp -r dist/rhpoffice-frontend/* /var/www/escape/frontend-dist/
sudo systemctl reload nginx
```

---

## Troubleshooting

### Backend won't start
```bash
pm2 logs escape-backend
# Check .env file exists and has correct values
cat /var/www/escape/backend/.env
```

### Frontend shows 404 on refresh
```bash
# Check Nginx config has try_files directive
sudo nginx -t
sudo systemctl reload nginx
```

### API calls fail (CORS)
```bash
# Check APP_URL in backend .env matches frontend domain
# Restart backend after changing .env
pm2 restart escape-backend
```

### Permission denied for uploads
```bash
sudo chown -R nginx:nginx /var/www/escape/backend/uploads
sudo chmod -R 755 /var/www/escape/backend/uploads
```

---

## Security Checklist

- [ ] SSL certificate installed
- [ ] Strong JWT secrets in .env
- [ ] MongoDB authentication enabled
- [ ] Firewall configured (only 80, 443 open)
- [ ] .env file not readable by others (`chmod 600`)
- [ ] Regular system updates
- [ ] PM2 auto-restart enabled
- [ ] Nginx security headers configured

---

## Architecture

```
User Request
    ↓
Nginx (Port 80/443)
    ↓
├── /api/* → Proxy to Backend (localhost:5000)
└── /* → Serve Frontend Static Files
```

This setup runs everything on a single domain with Nginx handling routing.
