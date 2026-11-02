const fs = require('fs').promises;

// Extension is derived from the (already filtered) MIME type, never from the client's file name,
// so a public /uploads folder can never serve an attacker-chosen ".html" / ".svgz" file.
const IMAGE_EXT = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/svg+xml': '.svg'
};

const UNSAFE_SVG = /<\s*script|<\s*foreignObject|<\s*iframe|<\s*embed|<\s*object|\son[a-z]+\s*=|javascript\s*:|<!ENTITY/i;

async function readHead(filePath, bytes) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// Returns an error message when the stored file's content does not match its claimed kind.
async function contentProblem(file, kind) {
  if (!file.size) return 'The uploaded file is empty';
  const head = await readHead(file.path, 16);
  if (kind === 'pdf') {
    return head.subarray(0, 5).toString('latin1') === '%PDF-' ? null : 'File content is not a valid PDF';
  }
  const isPng = head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isJpg = head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isGif = head.subarray(0, 4).toString('latin1') === 'GIF8';
  const isWebp = head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
  if (isPng || isJpg || isGif || isWebp) return null;
  if (kind === 'image-svg') {
    const text = (await fs.readFile(file.path, 'utf8'));
    if (/<svg[\s>]/i.test(text)) return UNSAFE_SVG.test(text) ? 'SVG files must not contain scripts' : null;
  }
  return 'File content is not a valid image';
}

async function removeFile(file) {
  if (file && file.path) { try { await fs.unlink(file.path); } catch (e) { /* ignore */ } }
}

// Delete whatever multer wrote for this request (used when the request is rejected afterwards).
async function removeUploaded(req) {
  const list = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [];
  if (req.file) list.push(req.file);
  await Promise.all(list.map(removeFile));
}

// Wrap a multer middleware: upload errors become 400s, and the stored content is verified.
// Rejected uploads are deleted from disk.
function guardUpload(middleware, kind) {
  return (req, res, next) => {
    middleware(req, res, async (err) => {
      if (err) {
        await removeUploaded(req);
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large'
          : err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Unexpected file field'
            : err.message || 'File upload failed';
        return res.status(400).json({ success: false, message });
      }
      try {
        const list = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [];
        if (req.file) list.push(req.file);
        for (const file of list) {
          const problem = await contentProblem(file, kind);
          if (problem) {
            await removeUploaded(req);
            return res.status(400).json({ success: false, message: problem });
          }
        }
        next();
      } catch (e) {
        await removeUploaded(req);
        next(e);
      }
    });
  };
}

module.exports = { IMAGE_EXT, guardUpload, removeUploaded, removeFile };
