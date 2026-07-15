# RHP Office Portal - Deployment Guide

## How production deployment works

There is a single deployment path: push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) runs the backend unit tests and builds the Angular frontend, then SSHes into the production server, pulls the code, and triggers a restart.

`backend/server.js` is the one process that runs in production — it serves the built Angular app (`frontend/dist/rhpoffice-frontend`) as static files **and** the `/api/*` routes, all on a single port. There is no separate frontend server/process and no `index.js`.

The server is a Plesk VPS, and the Node process is managed by **Plesk's built-in Node.js manager (Phusion Passenger)** — not PM2. Passenger auto-restarts the app whenever the file `backend/tmp/restart.txt` is touched (Passenger's standard restart trigger), or when you click "Restart App" in the Plesk panel.

### Plesk Node.js panel configuration

- **Application Root**: `httpdocs/backend`
- **Application Startup File**: `server.js`
- **Document Root**: must be the same as, or nested inside, Application Root — set it to `httpdocs/backend` too (Plesk errors if Document Root is an *ancestor* of Application Root, which is the default and wrong).
- **Node.js version**: pin to a Node 20 LTS release if available — matches what CI tests/builds against. (Bleeding-edge Node majors are more likely to trip up native deps like `sharp`/`puppeteer`.)
- **Custom environment variables**: optional — `backend/server.js` loads `backend/.env` directly via `dotenv`, so the real env file is the source of truth; Plesk's UI vars aren't required.

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
   # Ensure Puppeteer's Chrome is installed in the same cache the running app uses
   export PUPPETEER_CACHE_DIR="$HOME/.cache/puppeteer"
   cd backend && npx puppeteer browsers install chrome && cd ..
   # Tell Passenger to reload the app on the next request
   mkdir -p backend/tmp && touch backend/tmp/restart.txt
   ```

### First-time server setup

1. In Plesk, enable Node.js for the domain and configure it as above (Application Root `httpdocs/backend`, Document Root `httpdocs/backend`, startup file `server.js`).
2. Clone the repo so that `$APP_DIR` (matching the `APP_DIR` GitHub secret) is the parent of `httpdocs` — i.e. `backend/` inside the repo must line up with Plesk's `httpdocs/backend`.
3. Copy `backend/.env.example` to `backend/.env` and fill in real production values (`MONGODB_URI`, `JWT_SECRET`, Stripe/DocuSign/SMTP/QuickBooks keys, etc.). This file is git-ignored and lives only on the server.
4. `npm install --production && cd backend && npm install && cd ../frontend && npm install && npx ng build --configuration=production && cd ..`
5. Click "Restart App" in the Plesk Node.js panel (or `touch backend/tmp/restart.txt`).
6. Seed the initial users: `cd backend && npm run seed` (see `backend/scripts/seedProdUsers.js`).

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
- [ ] SSL configured on the domain (Plesk handles this automatically once Let's Encrypt/cert is issued)
- [ ] Plesk Node.js panel: Application Root/Document Root both `httpdocs/backend`, startup file `server.js`, Node 20 LTS selected
- [ ] GitHub secrets set: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `SERVER_PORT`, `APP_DIR`
- [ ] `npm run seed` run once against the production database
- [ ] Payment flow and DocuSign signing flow tested end-to-end

### Restarting / checking status

Plesk manages the process — there's no `pm2 status` equivalent to run yourself. Use:
- Plesk panel → Node.js → **Restart App** (or `touch backend/tmp/restart.txt` over SSH)
- Plesk panel → Node.js → **Dashboard** for basic status
- Logs: `backend/logs/` (Winston app/error logs) and Plesk's own Node.js log viewer in the panel

### Troubleshooting

**Frontend not loading:**
- Confirm `frontend/dist/rhpoffice-frontend` exists and was built with `--configuration=production`
- Check browser console for errors

**API requests failing:**
- Confirm the app is actually running: Plesk Node.js panel → Dashboard, or hit `/health`
- Check CORS/`APP_URL` configuration in `backend/.env`

**Backend crashes / won't start:**
- Check MongoDB connection (`MONGODB_URI`)
- Verify all required environment variables are set (`backend/server.js` exits at boot if `JWT_SECRET` is missing/short)
- Check `backend/logs/` and the Plesk Node.js log viewer
- Re-check Document Root vs Application Root in the Plesk panel if the app won't start at all

**DocuSign/Stripe webhooks not working:**
- Verify webhook URLs are publicly accessible
- Check webhook secrets match
- Review webhook logs in respective dashboards

**Real-time broadcasts/notifications not working:**
- Passenger/Plesk proxies WebSocket upgrades automatically for the domain; if Socket.IO still fails, check Plesk's Apache/nginx settings for the domain haven't disabled WebSocket support
- Confirm backend logs show "Socket authenticated" when agents log in

### Scaling

For high traffic:
- Increase Passenger's max pool size / instance count for the app in the Plesk Node.js panel
- Use a MongoDB replica set
- Implement Redis for session management
- Use a CDN for static assets
- Enable caching at the nginx level (Plesk → Apache & nginx Settings)
