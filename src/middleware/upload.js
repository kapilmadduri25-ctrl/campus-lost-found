const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

/**
 * The extension is derived from the *verified* MIME type, never from the client's
 * filename. A file called "evil.html" declared as image/png is therefore stored as
 * item-<ts>.png and can never be served as text/html on our own origin.
 */
const EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = EXTENSION[file.mimetype];
    if (!ext) return cb(new ApiError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'));
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `item-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    if (!EXTENSION[file.mimetype]) {
      return cb(new ApiError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'));
    }
    cb(null, true);
  },
});

/**
 * Mounted right after upload.single(). If the request ends in a 4xx (validation
 * failed, wrong owner, ...) the file that multer already wrote is deleted, so
 * rejected submissions cannot fill the disk with unreferenced images.
 */
function cleanupOnFailure(req, res, next) {
  if (!req.file) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) fs.promises.unlink(req.file.path).catch(() => {});
  });
  next();
}

module.exports = upload;
module.exports.EXTENSION = EXTENSION;
module.exports.cleanupOnFailure = cleanupOnFailure;
