# RHP Office Portal - Deployment Guide

## Production Deployment

### Option 1: Single Server Deployment (Using index.js)

This runs both frontend and backend on a single server.

1. **Install dependencies:**
   ```bash
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```

2. **Build the frontend:**
   ```bash
   npm run build
   ```

3. **Set up environment variables:**
   - Copy `backend/.env.example` to `backend/.env`
   - Configure all required variables (MongoDB, Stripe, DocuSign, etc.)

4. **Start the production server:**
   ```bash
   npm start
   ```
   
   This will:
   - Start the backend server on port 5000
   - Serve the frontend on port 3000
   - Frontend will be available at http://localhost:3000
   - Backend API at http://localhost:5000

### Option 2: Separate Server Deployment

Run frontend and backend on separate servers/processes.

**Backend:**
```bash
cd backend
npm install
npm start
```

**Frontend (Development):**
```bash
cd frontend
npm install
npm start
```

**Frontend (Production Build):**
```bash
cd frontend
npm run build
# Serve dist/rhpoffice-frontend/browser with any static file server
```

### Option 3: Deploy to Netlify (Frontend) + Separate Backend

1. **Deploy Frontend to Netlify:**
   - Push code to GitHub
   - Connect repository to Netlify
   - Configuration is in `netlify.toml`
   - Update API URL in `netlify.toml` redirects

2. **Deploy Backend to VPS/Cloud:**
   - Use PM2 or similar process manager
   - Set up reverse proxy with Nginx
   - Configure domain and SSL

### Environment Variables

**Backend (.env):**
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://...
JWT_SECRET=your-secret
STRIPE_SECRET_KEY=sk_live_...
DOCUSIGN_INTEGRATION_KEY=...
# ... etc
```

**Frontend (environment.prod.ts):**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.rhpoffice.com/api'
};
```

### Production Checklist

- [ ] Build frontend: `npm run build`
- [ ] Test built files locally
- [ ] Configure environment variables
- [ ] Set up MongoDB with proper indices
- [ ] Configure Stripe webhooks
- [ ] Configure DocuSign webhooks
- [ ] Set up SSL certificates
- [ ] Configure CORS for production domain
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy
- [ ] Test payment flow end-to-end
- [ ] Test DocuSign signing flow

### Using PM2 (Recommended for Production)

Install PM2:
```bash
npm install -g pm2
```

Start with PM2:
```bash
pm2 start index.js --name "rhp-office-portal"
pm2 save
pm2 startup
```

Monitor:
```bash
pm2 status
pm2 logs rhp-office-portal
pm2 monit
```

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name rhpoffice.com www.rhpoffice.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name rhpoffice.com www.rhpoffice.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO WebSocket proxy (required for real-time broadcasts/notifications)
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

### Troubleshooting

**Frontend not loading:**
- Check build output path matches index.js: `frontend/dist/rhpoffice-frontend/browser`
- Verify files exist in dist folder
- Check browser console for errors

**API requests failing:**
- Verify backend is running on correct port
- Check CORS configuration in backend
- Verify API URL in frontend environment files

**Backend crashes:**
- Check MongoDB connection
- Verify all environment variables are set
- Check logs: `pm2 logs` or `journalctl`

**DocuSign/Stripe webhooks not working:**
- Verify webhook URLs are publicly accessible
- Check webhook secrets match
- Review webhook logs in respective dashboards

**Real-time broadcasts/notifications not working:**
- Verify `/socket.io/` nginx proxy location is configured (required for WebSocket)
- Check that `proxy_read_timeout` is set high (86400) to keep connections alive
- Confirm backend logs show "Socket authenticated" when agents log in
- In Plesk: add the `/socket.io/` location block under Additional nginx directives

### Scaling

For high traffic:
- Use load balancer (Nginx, HAProxy)
- Run multiple backend instances with PM2 cluster mode
- Use MongoDB replica set
- Implement Redis for session management
- Use CDN for static assets
- Enable caching at Nginx level
