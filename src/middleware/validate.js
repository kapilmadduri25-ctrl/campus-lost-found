const ApiError = require('../utils/ApiError');
const { CATEGORIES, LOCATIONS } = require('../constants');

const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || ''));

function fail(errors) {
  throw new ApiError(400, 'Validation failed', errors);
}

/* ------------------------------- auth ---------------------------------- */
function validateRegister(req, res, next) {
  const errors = [];
  const { name, email, password } = req.body;

  if (!name || String(name).trim().length < 2) errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
  if (!isEmail(email)) errors.push({ field: 'email', message: 'A valid email is required' });
  if (!password || String(password).length < 8) errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  if (password && !/[A-Za-z]/.test(password)) errors.push({ field: 'password', message: 'Password must contain a letter' });
  if (password && !/[0-9]/.test(password)) errors.push({ field: 'password', message: 'Password must contain a number' });

  if (errors.length) return fail(errors);
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];
  if (!isEmail(email)) errors.push({ field: 'email', message: 'A valid email is required' });
  if (!password) errors.push({ field: 'password', message: 'Password is required' });
  if (errors.length) return fail(errors);
  next();
}

/* ------------------------------- items --------------------------------- */
function validateItem(req, res, next) {
  const { title, description, category, type, location, dateLostOrFound } = req.body;
  const errors = [];

  if (!title || String(title).trim().length < 3) errors.push({ field: 'title', message: 'Item name must be at least 3 characters' });
  if (!description || String(description).trim().length < 10) errors.push({ field: 'description', message: 'Description must be at least 10 characters' });
  if (!CATEGORIES.includes(category)) errors.push({ field: 'category', message: `Category must be one of: ${CATEGORIES.join(', ')}` });
  if (!['lost', 'found'].includes(type)) errors.push({ field: 'type', message: "Type must be 'lost' or 'found'" });
  if (!LOCATIONS.includes(location)) errors.push({ field: 'location', message: `Location must be one of: ${LOCATIONS.join(', ')}` });

  const date = new Date(dateLostOrFound);
  if (!dateLostOrFound || Number.isNaN(date.getTime())) {
    errors.push({ field: 'dateLostOrFound', message: 'A valid date is required' });
  } else if (date.getTime() > Date.now() + 60 * 60 * 1000) {
    errors.push({ field: 'dateLostOrFound', message: 'Date cannot be in the future' });
  }

  if (errors.length) return fail(errors);
  next();
}

/* ------------------------------- claims -------------------------------- */
function validateClaim(req, res, next) {
  const { itemId, message } = req.body;
  const errors = [];
  if (!itemId) errors.push({ field: 'itemId', message: 'itemId is required' });
  if (!message || String(message).trim().length < 10) errors.push({ field: 'message', message: 'Please give at least 10 characters explaining the claim' });
  if (errors.length) return fail(errors);
  next();
}

module.exports = { validateRegister, validateLogin, validateItem, validateClaim };
