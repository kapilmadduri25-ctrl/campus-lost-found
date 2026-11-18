/**
 * Removes keys that start with "$" or contain "." from body/query/params.
 * This blocks the classic NoSQL injection attack ({ "email": { "$gt": "" } }).
 */
function clean(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else {
      clean(obj[key]);
    }
  }
  return obj;
}

function sanitize(req, res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
}

module.exports = { sanitize, clean };
