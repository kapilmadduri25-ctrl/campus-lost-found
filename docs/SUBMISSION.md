# Submission pack — what to hand in

Project: **LOSTLY — Campus Lost & Found Portal** · Web Technology and Internet Programming · 20 marks · due 30 November 2026.

## The four deliverables

| # | Deliverable (from the brief) | Where it is | Status |
|---|---|---|---|
| 1 | Complete source code + GitHub repository link | https://github.com/kapilmadduri25-ctrl/campus-lost-found | **Done** |
| 2 | Deployed application link | https://lostly-3r3f.onrender.com | **Done** |
| 3 | Project report in the prescribed Sai University format | Written from `docs/DATABASE.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md` + screenshots | Pending |
| 4 | Postman API testing evidence | `postman/` collection (27 requests) + screenshots of the runner | Collection ready, screenshots pending |

## What the examiner will look for, and where it is

| Requirement | Evidence in this repo |
|---|---|
| Semantic HTML5, forms, validation, responsive CSS | `public/*.html`, `public/css/` (5 layered files, light + dark themes) |
| JavaScript ES6+, DOM, event handling, modules | `public/js/` — one ES module per page, no framework |
| Fetch API, Promises, async/await | `public/js/api.js` |
| Node.js, Express, middleware, REST APIs | `src/app.js`, `src/routes/`, `src/middleware/` |
| Database connectivity and CRUD | `src/db/` + `db/schema.sql` (Postgres via `pg`) |
| Authentication, authorisation, error handling | `src/middleware/auth.js`, `src/controllers/*`, `src/middleware/errorHandler.js` |
| Dynamic data retrieval and display | every page renders from `/api/v1/...` |
| 8+ Postman test cases | `postman/Campus_Lost_Found.postman_collection.json` (27 requests, 45+ assertions) |
| 10+ sample records | `src/seed.js` (13 listings, 4 users) |
| One custom feature | duplicate-match alerts (`src/utils/findMatches.js`) + admin charts |
| Security checks | bcrypt, JWT, ownership checks, parameterised SQL, `sanitize` middleware, rate limiting, `db/rls.sql` |

## Five-minute demo script (rehearse twice)

1. Home page — 13 seeded listings, search "laptop", filter by type.
2. DevTools at 375 px — nav collapses, grid stacks.
3. Log in as **arjun** → report a *found* "Blue steel water bottle" in *Other* → the possible-match card appears.
4. Log out, log in as **meera** → open that listing → submit a claim with private proof.
5. Back as **arjun** → Dashboard → Claims received → Approve → item becomes *Returned*.
6. Log in as **admin** → charts, moderation queue, hide a listing with a reason, show the audit log entry.
7. Postman → run the collection → show the green runner summary.

## Logins (created by `npm run seed`)

| Role | Email | Password |
|---|---|---|
| Admin | admin@saiuniversity.edu.in | Admin@12345 |
| Student | arjun@saiuniversity.edu.in | Password@123 |
| Student | meera@saiuniversity.edu.in | Password@123 |

## Commands

```bash
npm install
npm run db:setup     # create tables in Supabase
npm run seed         # 13 listings, 4 users, 1 claim
npm start            # http://localhost:5000
npm run test:smoke   # 18 assertions, no database needed
npm run test:db      # 41 assertions against in-memory Postgres
npm run test:api     # 42 assertions, full HTTP surface
```

## Before you submit

- [x] Render URL added to this file and to `README.md`
- [ ] Report exported to PDF, matching the prescribed format
- [ ] Postman screenshots saved under `docs/screenshots/`
- [ ] AI-use disclosure written in `README.md` and the report
- [x] Repository is public and the latest commit is pushed
