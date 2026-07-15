# RHP Office Portal - Deployment Guide

## How production deployment works

There is a single deployment path: push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) runs the backend unit tests and builds the Angular frontend, then SSHes into the production server, pulls the code, reinstalls dependencies, and restarts the app under **PM2**.

`backend/server.js` is the one process that runs in production — it serves the built Angular app (`frontend/dist/rhpoffice-frontend`) as static files **and** the `/api/*` routes, all on a single port (`5000` by default, see `ecosystem.config.json`). PM2 manages that one Node process directly; there is no separate frontend server/process and no `index.js`.

**Plesk's own Node.js/Passenger manager is intentionally disabled for this domain.** PM2 owns the app instead. Apache is configured as a plain reverse proxy in front of it (via Plesk's "Additional Apache directives" for HTTPS — see below), and nginx proxies to Apache as usual. This avoids the Passenger/PM2 port conflict that caused a prior outage — don't re-enable Plesk's Node.js panel for this domain while PM2 is running the app, they will fight over port 5000.

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
   No manual server intervention needed for a normal deploy — pushing to `main` restarts the live app automatically.

### First-time / from-scratch server setup

1. Install Node 20 (or whatever LTS is available), and `pm2` globally: `npm install -g pm2`.
2. Clone the repo to `$APP_DIR` (must match the `APP_DIR` GitHub secret), such that `httpdocs/` inside Plesk's vhost is (or contains) this repo's `backend/`+`frontend/`.
3. Copy `backend/.env.example` to `backend/.env` and fill in real production values (`MONGODB_URI`, `JWT_SECRET`, Stripe/DocuSign/SMTP/QuickBooks keys, etc.). This file is git-ignored and lives only on the server.
4. `npm install --production && cd backend && npm install && cd ../frontend && npm install && npx ng build --configuration=production && cd ..`
5. `pm2 start ecosystem.config.json && pm2 save && pm2 startup` (the last command prints a `systemctl enable ...` line — run it so PM2 survives reboots).
6. In Plesk, make sure the domain's Node.js panel is **disabled** (Passenger must not also try to manage this app). Under **Websites & Domains → domain → Apache & nginx Settings**, set **Additional Apache directives (HTTPS)** to:
   ```apache
   ProxyPreserveHost On
   ProxyPass / http://127.0.0.1:5000/ upgrade=websocket
   ProxyPassReverse / http://127.0.0.1:5000/
   ```
   (Adjust `5000` if `PORT` in `ecosystem.config.json`/`.env` differs.) Apply — Plesk regenerates the vhost and includes this automatically.
7. Seed the initial users: `cd backend && npm run seed` (see `backend/scripts/seedProdUsers.js`).

### Seeding production users

`backend/scripts/seedProdUsers.js` creates a baseline admin account and a baseline agent account if they don't already exist (idempotent — safe to re-run). See that file for the exact credentials it creates.

Run it once against the target database:
```bash
cd backend
npm run seed
```
Change both passwords after first login — the ones in the script are known defaults, not secrets, and must not be left in place on a real production database.

### Environment variables

Backend uses exactly one env file: `backend/.env` (real secrets, never committed). `backend/.env.example` is the tracked template listing every variable the app needs (`MONGODB_URI`, `JWT_SECRET`, `STRIPE_*`, `DOCUSIGN_*`, `SMTP_*`, `NEUZMAIL_*`, `QUICKBOOKS_*`, etc.).

Frontend config lives in `frontend/src/environments/environment.prod.ts` (used automatically by `ng build --configuration=production`).

### Production checklist

- [ ] `backend/.env` filled in with real production values
- [ ] MongoDB reachable from the server, indices in place
- [ ] Stripe webhook configured and pointing at the production URL
- [ ] DocuSign webhook configured and pointing at the production URL
- [ ] SSL configured on the domain (Plesk/Let's Encrypt)
- [ ] Plesk Node.js panel **disabled** for this domain (PM2 owns the app, not Passenger)
- [ ] Apache "Additional directives (HTTPS)" has the `ProxyPass` block above
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

If you ever see the app fighting for port 5000 (EADDRINUSE, or requests hanging), check for a *second* PM2 daemon or a stray manual `node server.js`:
```bash
ps aux | grep -i 'server.js\|pm2' | grep -v grep
lsof -i :5000
```
There should be exactly one PM2 daemon (as whichever user you set up `pm2 startup` under) and exactly one `node .../backend/server.js` process, parented to that PM2 daemon.

### Troubleshooting

**Frontend not loading:**
- Confirm `frontend/dist/rhpoffice-frontend` exists and was built with `--configuration=production`
- Check browser console for errors

**API requests failing / site returns 403:**
- A 403 with Apache's default error page usually means the `ProxyPass` directive in "Additional Apache directives (HTTPS)" isn't active — check `grep ProxyPass /var/www/vhosts/system/<domain>/conf/httpd.conf` on the server; it should show the proxy line included from `vhost_ssl.conf`. If missing, re-apply it via the Plesk UI field (don't hand-edit `vhost_ssl.conf` directly — Plesk won't pick it up unless it's saved through the panel).
- Verify `pm2 status` shows `rhp-office-portal` online
- Check CORS/`APP_URL` configuration in `backend/.env`

**Backend crashes / restarts repeatedly:**
- Check MongoDB connection (`MONGODB_URI`)
- Verify all required environment variables are set (`backend/server.js` exits at boot if `JWT_SECRET` is missing/short)
- Check logs: `pm2 logs rhp-office-portal` or `backend/logs/`

**DocuSign/Stripe webhooks not working:**
- Verify webhook URLs are publicly accessible
- Check webhook secrets match
- Review webhook logs in respective dashboards

**Real-time broadcasts/notifications not working:**
- The Apache `ProxyPass` directive includes `upgrade=websocket`, which handles the Socket.IO WebSocket upgrade automatically — no separate `/socket.io/` rule is needed
- Confirm backend logs show "Socket authenticated" when agents log in

### Scaling

For high traffic:
- Run multiple backend instances with PM2 cluster mode
- Use a MongoDB replica set
- Implement Redis for session management
- Use a CDN for static assets
- Enable caching at the nginx level (Plesk → Apache & nginx Settings)
