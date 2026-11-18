const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const itemRoutes = require('./routes/itemRoutes');
const claimRoutes = require('./routes/claimRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { sanitize } = require('./middleware/sanitize');
const requestId = require('./middleware/requestId');
const { CATEGORIES, LOCATIONS, STATUSES } = require('./constants');

const app = express();

/* ------------------------------ middleware ------------------------------ */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const origins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins, credentials: true } : {}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestId);   // correlation id on every request + X-Request-Id header
app.use(sanitize);    // strips $ and . keys from body/query/params (NoSQL injection guard)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* --------------------------- static frontend --------------------------- */
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use('/uploads', express.static(path.join(publicDir, 'uploads'), { maxAge: '7d' }));

/* -------------------------------- API ---------------------------------- */
// One router, mounted twice: /api/v1 is the documented (versioned) base,
// /api stays as an alias so older Postman requests and bookmarks keep working.
const api = express.Router();

api.get('/health', (req, res) =>
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), requestId: req.id })
);

api.get('/meta', (req, res) => {
  res.json({
    success: true,
    categories: CATEGORIES,
    locations: LOCATIONS,
    statuses: STATUSES,
    sorts: [
      { value: 'newest', label: 'Newest first' },
      { value: 'oldest', label: 'Oldest first' },
      { value: 'date_desc', label: 'Date lost/found (newest)' },
      { value: 'date_asc', label: 'Date lost/found (oldest)' },
      { value: 'title', label: 'Name A-Z' },
    ],
    moderationEnabled: process.env.REQUIRE_MODERATION === 'true',
  });
});

api.use('/auth', authRoutes);
api.use('/items', itemRoutes);
api.use('/claims', claimRoutes);
api.use('/notifications', notificationRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/admin', adminRoutes);

app.use('/api/v1', api);
app.use('/api', api);

/* ------------------------------ error handling -------------------------- */
app.use('/api', notFound);

app.use((req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));

app.use(errorHandler);

module.exports = app;
