# Reconciling the two project documents

Two documents describe this project. They overlap but do not fully agree, so this page records
what was adopted from each, what was deliberately rejected, and where every requirement now lives.

| Document | What it is | Authority |
|---|---|---|
| **Sai University brief** (`Web_Tech_Project_Sai_Univeristy_1.pdf`) | The assessment: 20 marks, 7 functional requirements, HTML5/CSS3/JS ES6+ frontend, Node/Express, MongoDB, 8+ Postman cases, 10 sample records, report + viva | **Highest** — this is what is marked |
| **Campus Lost & Found Portal blueprint** (`…Complete_Project_Blueprint.pdf`) | A product/engineering specification with privacy, moderation, audit and acceptance criteria (AC-01…AC-15) | Second — used to raise quality where it does not conflict |

## 1. Conflicts and how they were resolved

| Topic | Brief says | Blueprint says | Decision |
|---|---|---|---|
| Frontend | HTML5, CSS3, JavaScript ES6+ | React + Vite, Tailwind, react-hook-form, zod | **Vanilla ES modules.** The brief names the stack and the blueprint itself allows this path ("complete the API contract with the current vanilla frontend, then migrate in a separate phase; do not mix two frontend architectures"). Vanilla also keeps the code explainable in a viva. |
| API prefix | Not specified | Versioned `/api/v1` | **Adopted.** Routers are mounted at `/api/v1` and `/api` (alias), so both the brief's testing and the blueprint's contract work. |
| Image storage | "optional image" | Cloudinary / S3, never in the database | **Local disk for the demo**, documented as the known limitation with the Cloudinary upgrade path. Image bytes are never stored in Postgres in either case. |
| Categories / locations | Fixed lists are fine | Managed `categories` and `campusLocations` collections | **Constants in `src/constants.js`**, exposed through `GET /meta`, so validation and the forms share one source of truth. Admin CRUD of categories is listed as future work. |
| Soft delete | Not required | Soft-delete / archive | **Archive via status** (`rejected`, `expired`) plus an audited hard delete. No user-visible data loss without a trace. |

## 2. Blueprint acceptance criteria → status

| ID | Criterion | Status | Where |
|---|---|---|---|
| AC-01 | Home offers Report Lost and Report Found | Done | `public/index.html` hero buttons → `report.html?type=lost\|found` |
| AC-02 | Report form works independently of the item list | Done | `public/js/report.js` never calls `/items` |
| AC-03 | Valid report persists with owner and status | Done | `POST /items`, `src/constants.js` |
| AC-04 | Invalid input rejected client- and server-side | Done | `clientValidate()` in `report.js` + `src/middleware/validate.js` |
| AC-05 | Public APIs never expose private proof/contact | Done | explicit column projection on `descriptionPrivate`, `reporter` populated with `name` only, claim proof scoped to claimant/owner |
| AC-06 | Search, filters, sorting, pagination work together | Done | `GET /items` |
| AC-07 | Users edit/close only their own report | Done | ownership checks in `itemController.js` |
| AC-08 | Second user can submit a private claim | Done | `POST /claims` + claim form on `item.html` |
| AC-09 | Owner/admin resolve with an auditable status change | Done | `PATCH /items/:id/status` → `audit_logs` |
| AC-10 | Admin approves/hides/rejects with a reason | Done | `PATCH /admin/reports/:id` (reason required, audited) |
| AC-11 | Loading, empty, error, retry and success states | Done | `ui.js` → `spinner()`, `emptyState()`, `errorState()` + `bindRetry()` |
| AC-12 | Mobile layout, keyboard, labels, focus | Done | mobile-first CSS, `aria-*`, visible focus rings |
| AC-13 | No secrets committed or shipped to the browser | Done | `.env` git-ignored; only `DATABASE_URL`/`JWT_SECRET` on the server |
| AC-14 | Tests and smoke checks pass | Done | 27 Postman requests + `npm run test:smoke` (18 assertions) |
| AC-15 | Notifications and smart matching after MVP | Done early | `findMatches.js`, notification centre |

## 3. Blueprint features adopted beyond the brief

- **Six-state lifecycle** (`pending`, `active`, `claim_requested`, `resolved`, `rejected`, `expired`) replacing the earlier four-state model.
- **Optional moderation gate** (`REQUIRE_MODERATION=true`) with an admin queue.
- **Human-readable reference** on every report (`LF-26-8F3A21`), shown after submission and on the item page.
- **Private proof fields** on both items (`descriptionPrivate`) and claims (`proof`).
- **Audit log** collection + admin viewer with actor, action, reason, before→after and IP.
- **Account suspension** (`PATCH /admin/users/:id/status`), enforced at login and in the auth middleware.
- **`GET /dashboard/summary`** so the dashboard header is one request.
- **Request IDs** on every response and in every error body.
- **Structured error object** (`error.code` + `error.message` + `error.details`) while keeping the older flat `message` for compatibility.
- **Date-range filters** (`from`/`to`) on search.
- **"Ask for more info"** as a third claim decision, alongside approve and reject.

## 4. Deliberately out of scope (and why)

| Blueprint item | Reason |
|---|---|
| React + Vite migration | Conflicts with the brief's stack; documented as a later phase |
| Cloudinary / S3 uploads | Needs an external account and credentials; local disk is fine for a 20-mark demo, upgrade path documented |
| Email notifications, password reset, email verification | Not in the brief; needs a transactional email provider |
| Managed category/location collections with admin CRUD | Constants + `/meta` cover the requirement without a second admin surface |
| Atlas Search / fuzzy matching / image similarity | "Later" priority in the blueprint |
| PWA / offline drafts, multilingual UI, QR labels | "Later" priority |
| OpenAPI/Swagger file | `docs/API.md` + the Postman collection serve as the contract |

## 5. Where the report can cite this

Chapter 5 (implementation) can use section 3 as the list of design decisions; chapter 8 (testing) can
use section 2 as an acceptance-criteria table with a "Pass" column beside each row.
