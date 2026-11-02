// Drop-in replacement for require('multer') that fixes uploaded file names.
//
// multer 1.x reads the multipart filename as Latin-1, but browsers send UTF-8, so any non-ASCII
// character ("Guía", curly quotes, emoji) arrives garbled or lost. Decode it back once, before
// any route's own fileFilter or storage.filename() sees it.
const multer = require('multer');

function decodeFilename(name) {
  if (typeof name !== 'string' || !/[\u0080-ÿ]/.test(name)) return name;
  // Characters above U+00FF mean the name is already real Unicode; leave it alone.
  if (/[^\u0000-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  // Only accept the result if it round-trips, i.e. the bytes really were valid UTF-8.
  return Buffer.from(decoded, 'utf8').toString('latin1') === name ? decoded : name;
}

function utf8Multer(options = {}) {
  const routeFilter = options.fileFilter;
  return multer({
    ...options,
    fileFilter(req, file, cb) {
      file.originalname = decodeFilename(file.originalname);
      if (routeFilter) return routeFilter(req, file, cb);
      cb(null, true);
    }
  });
}

// diskStorage, memoryStorage, MulterError ... keep working as before.
Object.assign(utf8Multer, multer);
utf8Multer.decodeFilename = decodeFilename;

module.exports = utf8Multer;
