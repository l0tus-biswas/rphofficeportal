/**
 * cardRenderer.js
 * ---------------------------------------------------------------------------
 * Renders personalized, print-ready business-card files (one PNG per side)
 * using `sharp` (libvips) — NO headless browser.
 *
 * We previously used Puppeteer/Chromium, but the production host (Plesk) blocks
 * Chrome at the kernel level for the app user (ftruncate/inotify/dbus denied),
 * so Chrome can't launch there. sharp composites the background + photo + text
 * directly with no browser, no temp files, and no special permissions.
 *
 * A "template" describes the static design + where the agent's photo and text
 * fields land, in print-file pixel coordinates.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PRINTS_DIR = path.join(__dirname, '..', 'uploads', 'business-card-prints');
if (!fs.existsSync(PRINTS_DIR)) fs.mkdirSync(PRINTS_DIR, { recursive: true });

// Resolve a "/uploads/..." web path (or absolute disk path) to an absolute disk
// path that exists, or null.
function resolveDisk(webOrDiskPath) {
  if (!webOrDiskPath) return null;
  let abs = webOrDiskPath;
  const idx = String(webOrDiskPath).indexOf('/uploads/');
  if (idx !== -1) abs = path.join(__dirname, '..', webOrDiskPath.slice(idx + 1));
  return fs.existsSync(abs) ? abs : null;
}

function escXml(s = '') {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function clampBox(b, W, H) {
  const w = Math.max(1, Math.min(Math.round(b.w || W), W));
  const h = Math.max(1, Math.min(Math.round(b.h || H), H));
  const x = Math.max(0, Math.min(Math.round(b.x || 0), W - w));
  const y = Math.max(0, Math.min(Math.round(b.y || 0), H - h));
  return { x, y, w, h };
}

// Standard print bleed: 1/8" (0.125") of artwork beyond the trim line so the
// cutter never exposes white edge, plus another 1/8" safe margin INSIDE the
// trim line where text/logos must stay so normal cutting tolerance can't clip
// them. This matches Printful's own template guides (striped bleed border +
// dashed "Safe Print Area"). Falls back to these inches-based defaults unless
// the template explicitly overrides bleedPx/safePx (e.g. for a Printful
// product with different published margins).
const DEFAULT_BLEED_IN = 0.125;
const DEFAULT_SAFE_IN = 0.125;

/**
 * Compute the trim line and safe-print-area rectangles for a printFile, in
 * print-file pixels. `trim` is where the card is actually cut; `safe` is the
 * inner box all text/logos must stay within to survive normal cutting
 * tolerance. See DEFAULT_BLEED_IN/DEFAULT_SAFE_IN above.
 */
function bleedGeometry(printFile) {
  const W = printFile?.widthPx || 0;
  const H = printFile?.heightPx || 0;
  const dpi = printFile?.dpi || 300;
  const bleedPx = Number.isFinite(printFile?.bleedPx) ? printFile.bleedPx : Math.round(DEFAULT_BLEED_IN * dpi);
  const safePx = Number.isFinite(printFile?.safePx) ? printFile.safePx : Math.round(DEFAULT_SAFE_IN * dpi);
  const trim = { x: bleedPx, y: bleedPx, w: Math.max(0, W - 2 * bleedPx), h: Math.max(0, H - 2 * bleedPx) };
  const safeInset = bleedPx + safePx;
  const safe = { x: safeInset, y: safeInset, w: Math.max(0, W - 2 * safeInset), h: Math.max(0, H - 2 * safeInset) };
  return { bleedPx, safePx, trim, safe };
}

function isOutsideSafe(box, safe) {
  return box.x < safe.x || box.y < safe.y ||
    (box.x + box.w) > (safe.x + safe.w) || (box.y + box.h) > (safe.y + safe.h);
}

/**
 * Scan a template's fields/photo frames against its safe print area and
 * return human-readable warnings for anything that will likely get clipped
 * by the cutter (the exact defect that clipped the RHP card's heading and
 * email — text was placed with no bleed/safe-area margin at all).
 */
function computeSafeWarnings(template) {
  const warnings = [];
  if (!template?.printFile) return warnings;
  const { safe } = bleedGeometry(template.printFile);
  const tplName = template.name || template.id || 'Template';
  for (const side of (template.sides || [])) {
    const sideLabel = side.label || side.placement || 'side';
    if (side.photo) {
      const p = side.photo;
      const box = { x: p.x || 0, y: p.y || 0, w: p.w || 0, h: p.h || 0 };
      if (isOutsideSafe(box, safe)) {
        warnings.push(`${tplName} — "${sideLabel}": photo frame extends outside the safe print area and may be cut off.`);
      }
    }
    for (const f of (side.fields || [])) {
      const box = { x: f.x || 0, y: f.y || 0, w: f.w || 100, h: (f.size || 24) * (f.lineHeight || 1.15) };
      if (isOutsideSafe(box, safe)) {
        warnings.push(`${tplName} — "${sideLabel}": field "${f.label || f.key}" extends outside the safe print area and may be cut off.`);
      }
    }
  }
  return warnings;
}

/** Build the SVG text overlay for one side (one <text> per filled field). */
function buildTextSvg(W, H, side, fieldValues) {
  const els = (side.fields || []).map(f => {
    let val = fieldValues?.[f.key];
    if (val === undefined || val === null || String(val) === '') return '';
    if (f.transform === 'uppercase') val = String(val).toUpperCase();
    else if (f.transform === 'lowercase') val = String(val).toLowerCase();
    const size = f.size || 24;
    const align = f.align || 'left';
    const anchor = align === 'center' ? 'middle' : (align === 'right' ? 'end' : 'start');
    const boxW = f.w || (W - (f.x || 0));
    let x = f.x || 0;
    if (anchor === 'middle') x = (f.x || 0) + boxW / 2;
    else if (anchor === 'end') x = (f.x || 0) + boxW;
    // SVG <text> y is the baseline; HTML divs are top-anchored. Offset by the
    // approximate ascent so positions match the designer preview.
    const y = (f.y || 0) + size * 0.88;
    const ls = f.letterSpacing ? ` letter-spacing="${f.letterSpacing}"` : '';
    const style = f.style === 'italic' ? ' font-style="italic"' : '';
    return `<text x="${x}" y="${y}" font-family="${escXml(f.family || 'Arial')}, Arial, Helvetica, sans-serif" ` +
      `font-size="${size}" font-weight="${f.weight || 400}" fill="${f.color || '#000000'}" ` +
      `text-anchor="${anchor}"${ls}${style}>${escXml(val)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${els}</svg>`;
}

/**
 * Render a single side to a PNG at exact print-file pixel dimensions.
 * @returns {Promise<{ filename: string, diskPath: string }>}
 */
async function renderSide(printFile, side, fieldValues, photoWebPath, filenameHint) {
  if (!printFile?.widthPx || !printFile?.heightPx) {
    throw new Error('printFile must define widthPx and heightPx');
  }
  const W = printFile.widthPx, H = printFile.heightPx;
  const composites = [];

  // 1. Background image (positionable/resizable; defaults to full bleed)
  const bgPath = resolveDisk(side.backgroundImage);
  if (bgPath) {
    const r = clampBox(side.bgRect || { x: 0, y: 0, w: W, h: H }, W, H);
    const fit = side.bgFit === 'contain' ? 'contain' : (side.bgFit === 'cover' ? 'cover' : 'fill');
    const bgBuf = await sharp(bgPath)
      .resize(r.w, r.h, { fit, background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toBuffer();
    composites.push({ input: bgBuf, left: r.x, top: r.y });
  }

  // 2. Photo (optional), with circle / rounded-rect mask
  if (side.photo && photoWebPath) {
    const pp = resolveDisk(photoWebPath);
    if (pp) {
      const p = clampBox(side.photo, W, H);
      let img = sharp(pp).resize(p.w, p.h, { fit: side.photo.fit === 'contain' ? 'contain' : 'cover' });
      const shape = side.photo.shape;
      if (shape === 'circle') {
        const mask = Buffer.from(`<svg width="${p.w}" height="${p.h}"><rect width="${p.w}" height="${p.h}" rx="${Math.min(p.w, p.h) / 2}" ry="${Math.min(p.w, p.h) / 2}" fill="#fff"/></svg>`);
        img = img.composite([{ input: mask, blend: 'dest-in' }]);
      } else if (side.photo.borderRadius) {
        const rad = Math.round(side.photo.borderRadius);
        const mask = Buffer.from(`<svg width="${p.w}" height="${p.h}"><rect width="${p.w}" height="${p.h}" rx="${rad}" ry="${rad}" fill="#fff"/></svg>`);
        img = img.composite([{ input: mask, blend: 'dest-in' }]);
      }
      composites.push({ input: await img.png().toBuffer(), left: p.x, top: p.y });
    }
  }

  // 3. Text fields (single SVG overlay)
  const svg = buildTextSvg(W, H, side, fieldValues);
  composites.push({ input: Buffer.from(svg), left: 0, top: 0 });

  const buffer = await sharp({
    create: { width: W, height: H, channels: 4, background: '#ffffff' }
  }).composite(composites).png().toBuffer();

  const safe = String(filenameHint).replace(/[^a-z0-9_-]/gi, '');
  const filename = `${safe}-${side.placement}.png`;
  const diskPath = path.join(PRINTS_DIR, filename);
  fs.writeFileSync(diskPath, buffer);
  return { filename, diskPath };
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
         backgroundImage: template.backgroundImage }];

  const out = [];
  for (const side of sides) {
    const { filename } = await renderSide(
      template.printFile, side, fieldValues || {}, photoWebPath || '', filenameHint);
    out.push({ placement: side.placement || 'default', filename });
  }
  return out;
}

// Kept for backward compatibility (callers may invoke on shutdown). No browser
// is used anymore, so this is a no-op.
async function closeBrowser() {}

module.exports = { renderCard, renderSide, closeBrowser, PRINTS_DIR, bleedGeometry, computeSafeWarnings };
