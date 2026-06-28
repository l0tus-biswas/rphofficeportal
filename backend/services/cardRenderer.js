/**
 * cardRenderer.js
 * ---------------------------------------------------------------------------
 * Renders personalized, print-ready business-card files (one PNG per side)
 * for Printful product 724 "Set of Business Cards".
 *
 * Print spec (from Printful printfiles endpoint, catalog product 724):
 *   - print file: 1200 x 750 px @ 300 DPI (landscape) / 750 x 1200 (portrait)
 *   - placements: front + back (double-sided supported)
 *
 * A "template" describes the static design + where the agent's photo and text
 * fields land, in print-file pixel coordinates. The agent's headshot is read
 * from local disk and inlined (data URI) so it never has to be public; only
 * the rendered output goes to the public /uploads/business-card-prints folder.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// Puppeteer 23+ is ESM-only. Loading it via require() throws ERR_REQUIRE_ESM on
// Node < 22 (prod runs Node 18), so import it lazily with dynamic import(),
// which works in CommonJS on every Node version. Cached after first load.
let _puppeteer = null;
async function getPuppeteer() {
  if (!_puppeteer) {
    const mod = await import('puppeteer');
    _puppeteer = mod.default || mod;
  }
  return _puppeteer;
}

const PRINTS_DIR = path.join(__dirname, '..', 'uploads', 'business-card-prints');
if (!fs.existsSync(PRINTS_DIR)) fs.mkdirSync(PRINTS_DIR, { recursive: true });

// Chrome needs a writable profile + temp dir. On restricted hosting (e.g. Plesk)
// the default /tmp isn't writable by the app user (Chrome fails with
// "ftruncate() failed: Permission denied"), and a pre-existing dir may be owned
// by root (EACCES on mkdir). So pick — and verify — a writable base dir at
// runtime, trying the known-writable render output dir first, then HOME, /tmp.
let _chromeBase = null;
function chromeBaseDir() {
  if (_chromeBase) return _chromeBase;
  const candidates = [
    path.join(PRINTS_DIR, '.chrome'),           // proven writable (renders land here)
    path.join(os.homedir() || '', '.rhp-chrome'),
    path.join(os.tmpdir(), 'rhp-chrome')
  ];
  for (const base of candidates) {
    try {
      fs.mkdirSync(base, { recursive: true });
      fs.accessSync(base, fs.constants.W_OK);
      _chromeBase = base;
      return base;
    } catch (_) { /* try next */ }
  }
  // Last resort: a unique tmp dir.
  _chromeBase = path.join(os.tmpdir(), 'rhp-chrome-' + process.pid);
  fs.mkdirSync(_chromeBase, { recursive: true });
  return _chromeBase;
}

// A profile dir is unique per worker process (pm2 may run several), so multiple
// workers don't fight over one profile ("browser is already running"). Stale
// singleton locks from a crashed launch are cleared before reuse.
function chromeProfileDir() {
  const dir = path.join(chromeBaseDir(), 'p-' + process.pid);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.rmSync(path.join(dir, lock), { force: true }); } catch (_) {}
  }
  return dir;
}

// Reuse one Chromium across renders.
let _browser = null;
function browserAlive(b) {
  if (!b) return false;
  if (typeof b.connected === 'boolean') return b.connected;       // puppeteer >= 22
  if (typeof b.isConnected === 'function') return b.isConnected(); // older puppeteer
  return true;
}

async function getBrowser() {
  if (browserAlive(_browser)) return _browser;
  const puppeteer = await getPuppeteer();
  // Extra flags beyond no-sandbox are needed on restricted/shared hosting
  // (e.g. Plesk), where Chrome otherwise crashes on launch with
  // "Connection closed." --single-process + --no-zygote avoid the process
  // forking that those environments block.
  const profileDir = chromeProfileDir();
  _browser = await puppeteer.launch({
    headless: 'new',
    // Use a writable, per-process profile dir + temp so Chrome can launch as the
    // restricted app user (avoids "ftruncate() failed: Permission denied") and
    // multiple workers don't collide on one profile.
    userDataDir: profileDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      '--no-first-run',
      '--disable-extensions',
      '--disable-crash-reporter',
      '--crash-dumps-dir=' + profileDir,
      '--user-data-dir=' + profileDir
    ],
    // Force Chrome's temp files into the writable dir too (default /tmp is
    // blocked for the Plesk user).
    env: { ...process.env, TMPDIR: profileDir, TMP: profileDir, TEMP: profileDir }
  });
  return _browser;
}
async function closeBrowser() {
  if (_browser) { try { await _browser.close(); } catch (_) {} _browser = null; }
}

// Map a "/uploads/..." web path (or absolute disk path) to a base64 data URI.
function fileToDataUri(webOrDiskPath) {
  if (!webOrDiskPath) return '';
  let abs = webOrDiskPath;
  const idx = String(webOrDiskPath).indexOf('/uploads/');
  if (idx !== -1) abs = path.join(__dirname, '..', webOrDiskPath.slice(idx + 1)); // -> backend/uploads/...
  if (!fs.existsSync(abs)) return '';
  const ext = path.extname(abs).toLowerCase().replace('.', '');
  const mime = ext === 'svg' ? 'image/svg+xml'
    : ext === 'ttf' ? 'font/ttf'
    : ext === 'otf' ? 'font/otf'
    : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
    : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildHtml(printFile, side, fieldValues, photoWebPath) {
  const { widthPx, heightPx } = printFile;

  const fontFaces = (side.fonts || []).map(f => `
    @font-face {
      font-family: '${f.family}';
      font-weight: ${f.weight || 400};
      font-style: ${f.style || 'normal'};
      src: url('${fileToDataUri(f.file)}');
    }`).join('\n');

  const bgUri = fileToDataUri(side.backgroundImage);
  // Background can be positioned/resized. Default = full bleed (cover the whole
  // print area), which matches templates that don't define a bgRect.
  const bgRect = side.bgRect || { x: 0, y: 0, w: widthPx, h: heightPx };
  const bgFit = side.bgFit || 'fill';
  const bgHtml = bgUri
    ? `<img src="${bgUri}" style="position:absolute;left:${bgRect.x}px;top:${bgRect.y}px;
        width:${bgRect.w}px;height:${bgRect.h}px;object-fit:${bgFit};display:block;"/>`
    : '';

  let photoHtml = '';
  if (side.photo && photoWebPath) {
    const p = side.photo;
    const photoUri = fileToDataUri(photoWebPath);
    if (photoUri) {
      const radius = p.shape === 'circle' ? '50%' : `${p.borderRadius || 0}px`;
      photoHtml = `<div style="position:absolute;left:${p.x}px;top:${p.y}px;
        width:${p.w}px;height:${p.h}px;border-radius:${radius};overflow:hidden;">
        <img src="${photoUri}" style="width:100%;height:100%;object-fit:${p.fit || 'cover'};display:block;"/>
      </div>`;
    }
  }

  const fieldsHtml = (side.fields || []).map(f => {
    const val = fieldValues?.[f.key];
    if (val === undefined || val === null || val === '') return '';
    const transform = f.transform ? `text-transform:${f.transform};` : '';
    const ls = f.letterSpacing ? `letter-spacing:${f.letterSpacing}px;` : '';
    return `<div style="position:absolute;left:${f.x}px;top:${f.y}px;
      width:${f.w ? f.w + 'px' : 'auto'};text-align:${f.align || 'left'};
      font-family:'${f.family}', Arial, sans-serif;font-weight:${f.weight || 400};
      font-style:${f.style || 'normal'};font-size:${f.size}px;color:${f.color || '#000'};
      line-height:${f.lineHeight || 1.15};${transform}${ls}white-space:pre-wrap;">${esc(val)}</div>`;
  }).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fontFaces}
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${widthPx}px; height:${heightPx}px; }
    #card { position:relative; width:${widthPx}px; height:${heightPx}px; overflow:hidden;
            background-color:#ffffff; }
  </style></head><body>
    <div id="card">${bgHtml}${photoHtml}${fieldsHtml}</div>
  </body></html>`;
}

/**
 * Render a single side to a PNG at exact print-file pixel dimensions.
 * @returns {Promise<{ filename: string, diskPath: string }>}
 */
async function renderSide(printFile, side, fieldValues, photoWebPath, filenameHint) {
  if (!printFile?.widthPx || !printFile?.heightPx) {
    throw new Error('printFile must define widthPx and heightPx');
  }
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: printFile.widthPx, height: printFile.heightPx, deviceScaleFactor: 1
    });
    await page.setContent(buildHtml(printFile, side, fieldValues, photoWebPath),
      { waitUntil: 'networkidle0' });
    try { await page.evaluateHandle('document.fonts.ready'); } catch (_) {}
    const el = await page.$('#card');
    const buffer = await el.screenshot({ type: 'png' });

    const safe = String(filenameHint).replace(/[^a-z0-9_-]/gi, '');
    const filename = `${safe}-${side.placement}.png`;
    const diskPath = path.join(PRINTS_DIR, filename);
    fs.writeFileSync(diskPath, buffer);
    return { filename, diskPath };
  } finally {
    await page.close();
  }
}

/**
 * Render every side of a template.
 * @returns {Promise<Array<{ placement: string, filename: string }>>}
 */
async function renderCard(template, fieldValues, photoWebPath, filenameHint = 'card') {
  if (!template?.printFile) throw new Error('Template missing printFile');
  const sides = template.sides && template.sides.length
    ? template.sides
    : [{ placement: 'default', fields: template.fields, photo: template.photo,
         fonts: template.fonts, backgroundImage: template.backgroundImage }];

  const out = [];
  for (const side of sides) {
    const { filename } = await renderSide(
      template.printFile, side, fieldValues || {}, photoWebPath || '', filenameHint);
    out.push({ placement: side.placement || 'default', filename });
  }
  return out;
}

module.exports = { renderCard, renderSide, getBrowser, closeBrowser, PRINTS_DIR };
