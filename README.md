# LOSTLY — Campus Lost & Found Portal

A full-stack campus lost-property platform for **Sai University**, branded **LOSTLY** — report a lost or found item,
search and filter listings, submit a private claim, and track recovery through to a verified return.
Express REST API on **Supabase Postgres**, with a hand-built ES6 frontend.

Built for the *Web Technology and Internet Programming* individual project (B.Tech CSE, 2026–2027),
and aligned with the Campus Lost & Found Portal blueprint (privacy, moderation and audit trail included).

> *Lost it? Let's get it back.*
>
> **Live demo:** https://lostly-3r3f.onrender.com
> **Repository:** https://github.com/kapilmadduri25-ctrl/campus-lost-found
> **Version:** 4.0 · API base `/api/v1` (the old `/api` paths still work)

---

## 1. What it does

| Capability | Where |
|---|---|
| Home page with hero, Report Lost / Report Found actions, search, filters, recent listings | `public/index.html`, `public/js/home.js` |
| Register / login / logout, JWT auth, protected routes | `src/controllers/authController.js`, `src/middleware/auth.js` |
| Lost & found report form: title, category, description, **private proof**, location, date, photo, accuracy confirmation | `public/report.html`, `src/controllers/itemController.js` |
| Keyword search + category / location / type / status / date-range filters, 5 sort modes, pagination | `GET /api/v1/items` |
| Item detail with safe public fields, private fields for owner/admin only | `public/item.html`, `src/controllers/itemController.js` |
| Claim workflow: private message + proof → accept / decline / ask for more info → claimant replies → item resolved | `src/controllers/claimController.js` |
| Student dashboard: 4 tabs + summary counts | `public/dashboard.html`, `GET /api/v1/dashboard/summary` |
| Admin: statistics and charts, **moderation queue**, hide/reject **with a reason**, user suspension, **audit log** | `public/admin.html`, `src/controllers/adminController.js` |
| Duplicate / possible-match alerts + notification centre | `src/utils/findMatches.js` |
| 13 sample records, 4 users, 1 claim, audit entries | `src/seed.js` |
| 30 Postman requests / 55+ assertions | `postman/` |

### Item lifecycle

| Status | Meaning | Visible in public search |
|---|---|---|
| `pending` | Submitted, waiting for moderation (only when `REQUIRE_MODERATION=true`) | No |
| `active` | Live and open for recovery | Yes |
| `claim_requested` | At least one claim exists | Yes, marked as claimed |
| `resolved` | Item returned to its owner | No (reachable by direct link) |
| `rejected` | Hidden or rejected by an admin, with a recorded reason | No |
| `expired` | Archived after the retention window | No |

Students may move their own listing between `active` ⇄ `resolved`. Every other transition is admin-only,
and every transition writes an entry to the audit log.

---

## 2. Technology stack

- **Frontend:** semantic HTML5, CSS3 (a five-layer design system with light/dark theming, no framework), JavaScript ES2022 modules, Fetch API with `async`/`await`, DOM rendering with escaping.
- **Backend:** Node.js + Express 4, layered routes → controllers → data access, middleware for auth, validation, uploads, sanitising, request IDs and centralised errors.
- **Database:** Supabase (PostgreSQL 15) through `pg` — five tables, foreign keys with cascade deletes, unique constraints, indexes, and parameterised SQL only.
- **Auth:** JWT bearer tokens, `bcryptjs` hashing, roles (`student`, `admin`), account suspension.
- **Uploads:** `multer`, JPG/PNG/WEBP/GIF only, 2 MB cap, server-generated filenames.
- **Security:** `helmet`, CORS allow-list, rate limiting, JSON key sanitiser, ownership checks, explicit private-column projections, output escaping.
- **Testing:** Postman collection + three database-free automated suites (smoke, db, api).
- **Deployment:** Supabase + Render (see `docs/DEPLOYMENT.md`).

---

## 3. Folder structure

```
lostly/
├── server.js                    # load .env → connect DB → listen
├── package.json  package-lock.json
├── .env.example                 # template (copy to .env)
├── .gitignore  README.md  START_HERE.txt
├── .vscode/                     # F5 launch configs, extensions, settings
├── db/
│   ├── schema.sql               # tables, constraints, indexes (run once)
│   └── rls.sql                  # optional row level security for Supabase
├── src/
│   ├── app.js                   # middleware, /api/v1 router, static files, errors
│   ├── config/db.js             # pg Pool, query(), withTransaction()
│   ├── db/                      # data access: users, items, claims, notifications, auditLogs
│   ├── constants.js             # categories, locations, statuses
│   ├── controllers/             # auth, item, claim, admin, notification, dashboard
│   ├── routes/                  # auth, items, claims, notifications, dashboard, admin
│   ├── middleware/              # auth, optionalAuth, validate, upload, sanitize,
│   │                            #   requestId, errorHandler
│   ├── utils/                   # ApiError, asyncHandler, token, findMatches, audit
│   └── seed.js
├── public/
│   ├── index.html  login.html  register.html  report.html
│   ├── forgot-password.html  reset-password.html  profile.html
│   ├── help.html  privacy.html
│   ├── item.html  dashboard.html  admin.html  404.html
│   ├── css/                     # layered design system (cream, ink, forest, gold)
│   │   ├── tokens.css           #   colour, type, space, depth (light + dark)
│   │   ├── base.css             #   reset, typography, utilities, a11y
│   │   ├── components.css       #   buttons, forms, cards, badges, tables
│   │   ├── layout.css           #   header, hero, sections, grids, footer
│   │   └── pages.css            #   page-specific rules
│   ├── js/                      # api, ui, common, home, auth-page, report, item,
│   │                            #   dashboard, admin, page
│   └── uploads/
├── postman/                     # collection (30 requests) + environment
├── docs/                        # API, TESTING, DEPLOYMENT, BLUEPRINT_RECONCILIATION
└── scripts/smoke-test.js
```

---

## 4. Run it in VS Code

1. **Unzip** the project, e.g. to `Documents\campus-lost-found`.
2. VS Code → **File → Open Folder…** → pick the folder containing `package.json`.
3. Terminal (**Ctrl + `**) → `npm install`
4. `copy .env.example .env` (PowerShell) or `cp .env.example .env`
5. Edit `.env`: set `DATABASE_URL` (your Supabase connection string) and a long random `JWT_SECRET`.
6. `npm run db:setup` → creates the tables and indexes in your Supabase database.
7. `npm run seed` → 13 listings, 4 users, 1 claim, audit entries.
8. Press **F5** (config already in `.vscode/launch.json`) or run `npm run dev`, then open <http://localhost:5000>.

| Action | How |
|---|---|
| Start with auto-restart | **F5** → *Run server (nodemon)* |
| Create the tables | `npm run db:setup` (safe to run again) |
| Seed / reseed | **F5** → *Seed database*, or `npm run seed -- --reset` |
| Archive stale listings | `npm run expire` (or a Render cron job — see `docs/DEPLOYMENT.md`) |
| Printed startup links | `PUBLIC_URL` in `.env` (Render supplies `RENDER_EXTERNAL_URL` automatically) |
| Password-reset email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `APP_URL` (Brevo works out of the box — see `docs/DEPLOYMENT.md`) |
| Schema | applied automatically on every boot (`migrate()` in `src/config/db.js`), or `npm run db:setup` by hand |
| Quick check without a database | **F5** → *Smoke test (no database)* |
| Browse the database | Supabase dashboard → Table editor (or the SQL editor) |
| Switch theme | Moon/sun button in the header — the choice is remembered |

### Demo logins (created by `npm run seed`)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@saiuniversity.edu.in` | `Admin@12345` |
| Student | `arjun@saiuniversity.edu.in` | `Password@123` |
| Student | `meera@saiuniversity.edu.in` | `Password@123` |

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 5000) |
| `DATABASE_URL` | Supabase Postgres connection string (Session pooler) |
| `JWT_SECRET` | Token signing key — long random string |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `CLIENT_ORIGIN` | Comma-separated allowed browser origins |
| `REQUIRE_MODERATION` | `true` → new reports start as `pending` and need admin approval |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeded admin account |

---

## 5. API overview

Base URL: `/api/v1` (`/api` still works as an alias). Full details in [`docs/API.md`](docs/API.md).

| Method | Endpoint | Access |
|---|---|---|
| POST | `/auth/register` · `/auth/login` | public |
| GET/PATCH | `/auth/me` · POST `/auth/logout` | signed in |
| GET | `/items` · `/items/:id` · `/meta` · `/health` | public |
| POST | `/items` (multipart, optional image) | signed in |
| PATCH | `/items/:id` · `/items/:id/status` | owner or admin |
| DELETE | `/items/:id` · GET `/items/user/mine` | owner or admin |
| POST | `/claims` · GET `/claims/mine` · `/claims/received` | signed in |
| PATCH | `/claims/:id` (approve / reject / ask for info) | item owner or admin |
| DELETE | `/claims/:id` | claimant or admin |
| GET | `/notifications` · PATCH `/notifications/:id/read` · `/notifications/read-all` | signed in |
| GET | `/dashboard/summary` | signed in |
| GET | `/admin/stats` · `/admin/items` · `/admin/reports` · `/admin/claims` · `/admin/users` · `/admin/audit` | admin |
| PATCH | `/admin/reports/:id` · `/admin/users/:id/role` · `/admin/users/:id/status` | admin |
| DELETE | `/admin/items/:id` | admin |

Every response carries `X-Request-Id`; every error uses one shape:

```json
{ "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Validation failed",
             "details": [{ "field": "email", "message": "A valid email is required" }] },
  "requestId": "3f1c…" }
```

---

## 6. Testing

**Postman** — import both files from `postman/`, set `baseUrl`, run **Auth → Login (student)** first
(it saves `{{token}}`), then run the whole collection. For the admin requests, paste an admin token.

**No database needed:**

| Command | What it proves |
|---|---|
| `npm run test:smoke` | 18 assertions: routing, validation, auth guards, 404 page |
| `npm run test:db` | 41 assertions: the real `schema.sql` plus every query, run against an in-memory Postgres (pg-mem) |
| `npm run test:api` | 42 assertions: the whole Express API booted on top of that in-memory database — login, create, search, claim, ask for details, reply, approve, moderate, suspend, audit |

`docs/TESTING.md` lists every test case with its expected result, including the privacy checks.

---

## 7. Deploy

1. Supabase project (free) → copy the **Session pooler** connection string.
2. Push to GitHub (`.env` is ignored).
3. Render → New Web Service → build `npm install`, start `npm start`, add `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `REQUIRE_MODERATION`.
4. Run `npm run db:setup` and `npm run seed` once from the Render shell.

Step-by-step with screenshots-to-take: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 8. Security and privacy

- Passwords hashed with bcrypt (10 rounds); the `password` column is never included in a `SELECT` outside the login query.
- **Public APIs never expose private data.** Search results populate only the reporter's name; email, phone and department appear only to the owner/admin. `descriptionPrivate` is only selected for the owner or an admin, and claim `proof` is visible only to the claimant and the item owner.
- Ownership checked in the controller for every mutation; admin routes gated by `protect` + `adminOnly`.
- `sanitize` middleware strips `$`-prefixed and dotted keys from JSON bodies as defence in depth (the SQL layer is parameterised, so this is belt-and-braces).
- `helmet` headers, rate-limited auth endpoints, MIME + size limited uploads, escaped output (`escapeHtml`).
- Every moderation decision, status change, deletion and account action is written to `audit_logs` with actor, reason and IP.
- All SQL is parameterised (`$1`, `$2`, …) — no string concatenation, so SQL injection is structurally impossible.
- Optional `db/rls.sql` enables row level security with no policies, so the public anon key can read nothing.
- Suspended accounts cannot log in or use an existing token.

---

## 9. What came from where

The university brief and the project blueprint ask for slightly different things. Both are satisfied:
the brief's stack requirement (HTML5/CSS3/ES6+, no React) wins for the frontend, while the blueprint's
functional requirements — privacy separation, lifecycle, moderation with reasons, audit trail, private
claims — are all implemented. The full mapping is in
[`docs/BLUEPRINT_RECONCILIATION.md`](docs/BLUEPRINT_RECONCILIATION.md).

---

## 10. Interface

The UI is a small design system rather than a downloaded theme:

- **Layered CSS** — `tokens → base → components → layout → pages`. Colours, spacing, radii, shadows and type live only in `tokens.css`.
- **Light and dark themes** — one `data-theme="dark"` attribute flips the whole palette; the choice is saved in `localStorage` and applied before first paint, so there is no flash.
- **Modern CSS** — custom properties, CSS Grid, `clamp()` fluid type, `aspect-ratio` thumbnails, `backdrop-filter` header, mask-image search icon, `:focus-visible` rings, shimmer skeletons, `prefers-reduced-motion` and print styles.
- **Components** — buttons (5 variants), pills, chips, badges (9 lifecycle states), forms with hints and error states, cards, alerts, tables with sticky headers, tabs, pagination, stat cards, CSS bar charts, toasts, empty and error states with retry.
- **Accessible** — skip link, semantic landmarks, labelled controls, `aria-pressed` chips, `aria-selected` tabs, `aria-live` results, keyboard-visible focus.

Design previews (mock data, not submission screenshots) are in `docs/design-preview/`.

## 11. Screenshots

Capture the nine files listed in [`docs/screenshots/README.md`](docs/screenshots/README.md) — that
folder is the single source of truth for names, so the report's figure captions and the files always match.

---

## 12. AI-use disclosure

In line with the project brief, I disclose the following. An AI assistant was used to help scaffold the
Express route and controller structure, to draft the layered CSS design system, and to draft parts of this
README and the report. Every file was reviewed, executed and modified by me: the application was run locally
against Supabase, the three test suites were executed, and the API was exercised through Postman. I can
explain the request lifecycle, the database schema, the claim transaction and the security middleware during
the viva.

---

## 13. License

MIT — free to use for coursework.
