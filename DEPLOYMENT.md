# RHP Office Portal - Deployment Guide

## How production deployment works

There is a single deployment path: push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) runs the backend unit tests and builds the Angular frontend, then SSHes into the production server and restarts the app under PM2 using `ecosystem.config.json`.

`backend/server.js` is the one process that runs in production — it serves the built Angular app (`frontend/dist/rhpoffice-frontend/browser`) as static files **and** the `/api/*` routes, all on a single port. There is no separate frontend server/process and no `index.js` — PM2 runs `backend/server.js` directly.

### What the pipeline does on every push to `main`

1. **Test** — `cd backend && npm ci && npx jest --selectProjects unit ...`
2. **Build** — `cd frontend && npm ci && npx ng build --configuration=production`
3. **Deploy** (only if test+build pass) — SSH into the server (`SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY`/`SERVER_PORT`/`APP_DIR` GitHub secrets):
   ```bash
   cd $APP_DIR
   git pull origin main
   npm install --production
   cd backend && npm install && cd ..
   cd frontend && npm install && npx ng build --configuration=production && cd ..
   pm2 restart rhp-office-portal --update-env || pm2 start ecosystem.config.json
   pm2 save
   ```

### First-time server setup

1. Install Node 20, `pm2` globally, and MongoDB access from the server.
2. Clone the repo to `$APP_DIR` (must match the `APP_DIR` GitHub secret).
3. Copy `backend/.env.example` to `backend/.env` and fill in real production values (`MONGODB_URI`, `JWT_SECRET`, Stripe/DocuSign/SMTP/QuickBooks keys, etc.). This file is git-ignored and lives only on the server.
4. `npm install --production && cd backend && npm install && cd ../frontend && npm install && npx ng build --configuration=production && cd ..`
5. `pm2 start ecosystem.config.json && pm2 save && pm2 startup`
6. In Plesk (or your reverse proxy), point the domain's nginx vhost at the port PM2 runs on (see `PORT` in `backend/.env` / `ecosystem.config.json`) — see the nginx example below.
7. Seed the initial users: `cd backend && npm run seed` (see `backend/scripts/seedProdUsers.js`).

### Seeding production users

`backend/scripts/seedProdUsers.js` creates the two baseline accounts if they don't already exist (idempotent — safe to re-run):

- Admin: `admin@rhpoffice.com` / `admin123`
- Agent: `contracting@rhpoffice.com` / `123456`

Run it once against the target database:
```bash
cd backend
npm run seed
```
Change both passwords after first login.

### Environment variables

Backend uses exactly one env file: `backend/.env` (real secrets, never committed). `backend/.env.example` is the tracked template listing every variable the app needs (`MONGODB_URI`, `JWT_SECRET`, `STRIPE_*`, `DOCUSIGN_*`, `SMTP_*`, `NEUZMAIL_*`, `QUICKBOOKS_*`, etc.).

Frontend config lives in `frontend/src/environments/environment.prod.ts` (used automatically by `ng build --configuration=production`).

### Production checklist

- [ ] `backend/.env` filled in with real production values
- [ ] MongoDB reachable from the server, indices in place
- [ ] Stripe webhook configured and pointing at the production URL
- [ ] DocuSign webhook configured and pointing at the production URL
- [ ] SSL configured on the Plesk/nginx vhost
- [ ] `pm2 start ecosystem.config.json && pm2 save && pm2 startup` done once on the server
- [ ] GitHub secrets set: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `SERVER_PORT`, `APP_DIR`
- [ ] `npm run seed` run once against the production database
- [ ] Payment flow and DocuSign signing flow tested end-to-end

### PM2

```bash
pm2 status
pm2 logs rhp-office-portal
pm2 monit
pm2 restart rhp-office-portal
```

### Nginx configuration example (Plesk "Additional nginx directives")

The Node process serves both the frontend and `/api`, so nginx only needs to proxy everything to that one port (replace `5000` with your `PORT`):

```nginx
server {
    listen 443 ssl http2;
    server_name rhpoffice.com www.rhpoffice.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
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
- Confirm `frontend/dist/rhpoffice-frontend/browser` exists and was built with `--configuration=production`
- Check browser console for errors

**API requests failing:**
- Verify `pm2 status` shows `rhp-office-portal` online
- Check CORS/`APP_URL` configuration in `backend/.env`

**Backend crashes:**
- Check MongoDB connection (`MONGODB_URI`)
- Verify all required environment variables are set (`backend/server.js` exits at boot if `JWT_SECRET` is missing/short)
- Check logs: `pm2 logs rhp-office-portal` or `backend/logs/`

**DocuSign/Stripe webhooks not working:**
- Verify webhook URLs are publicly accessible
- Check webhook secrets match
- Review webhook logs in respective dashboards

**Real-time broadcasts/notifications not working:**
- Verify the `/socket.io/` nginx location block is configured (required for WebSocket)
- Confirm `proxy_read_timeout`/`proxy_send_timeout` are set high (86400) to keep connections alive
- Confirm backend logs show "Socket authenticated" when agents log in

### Scaling

For high traffic:
- Run multiple backend instances with PM2 cluster mode
- Use a MongoDB replica set
- Implement Redis for session management
- Use a CDN for static assets
- Enable caching at the nginx level
