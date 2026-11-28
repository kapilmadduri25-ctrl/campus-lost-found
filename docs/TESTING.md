# Testing evidence (Postman)

Collection: `postman/LOSTLY.postman_collection.json` — **30 requests, 68 assertions**.
The brief asks for at least eight test cases. Rows numbered `A17x` are covered by the automated suite (`npm run test:api`) rather than by a Postman request.

## Photo upload

The collection creates a listing without a photo: Postman cannot resolve a file path shipped in
the repository, and a request that silently sends nothing is worse than one that says so. The
multipart path — valid image, wrong MIME, oversized file — is covered by `npm run test:api`.

## How to run

1. Start the server (`npm run dev`) and seed the database (`npm run seed`).
2. Import the collection + environment into Postman, set `baseUrl` (default `http://localhost:5000`).
3. Run **1. Auth → Login (student)** — the test script saves `{{token}}`.
4. Open the Collection Runner → **Run** → screenshot the summary (all green) for the report.
5. For the admin requests, log in with `admin@saiuniversity.edu.in / Admin@12345`, copy that token into the `token` variable, and run the admin folder again.

## Test cases

| # | Test case | Request | Input | Expected | Type |
|---|---|---|---|---|---|
| 1 | Register a new user | `POST /api/v1/auth/register` | valid name/email/password | `201` + JWT, role `student` | Successful request |
| 2 | Login with correct credentials | `POST /api/v1/auth/login` | seeded student | `200` + JWT | Successful request |
| 3 | Login with wrong password | `POST /api/v1/auth/login` | wrong password | `401`, `error.code = UNAUTHENTICATED`, no token | Invalid input |
| 4 | Read profile with token | `GET /api/v1/auth/me` | Bearer token | `200` + own email | Authorised access |
| 5 | List items with pagination | `GET /api/v1/items?limit=5` | – | `200`, `items[]`, `total`, `pages` | Item retrieval |
| 6 | **No private data in public search** | `GET /api/v1/items?limit=5` | – | no `descriptionPrivate`, no reporter email in the payload | Privacy (AC-05) |
| 7 | Search + filter + sort | `GET /api/v1/items?search=laptop&category=Electronics&type=found&sort=date_desc` | query params | `200`, every row matches; only `active`/`claim_requested` | Dynamic retrieval |
| 8 | Get one item by id | `GET /api/v1/items/{{itemId}}` | valid id | `200` + `reference` | Item retrieval |
| 9 | Create an item | `POST /api/v1/items` (form-data) | valid fields + private details + token | `201`, `reference` matches `LF-YY-XXXXXX`, `possibleMatches[]` | Successful request |
| 10 | Private details not echoed | same as 9 | `descriptionPrivate` sent | `item.descriptionPrivate` is `undefined` in the response | Privacy |
| 11 | Create with invalid input | `POST /api/v1/items` | bad category/type/date | `400` + `error.details[]` | Invalid input |
| 12 | Create without a token | `POST /api/v1/items` | no header | `401` | Unauthorised access |
| 13 | Update someone else's item | `PATCH /api/v1/items/{{itemId}}` | other user's token | `403` | Authorisation |
| 14 | Owner updates own item | `PATCH /api/v1/items/{{newItemId}}` | valid body | `200`, field changed | Item update |
| 15 | Owner resolves own item | `PATCH /api/v1/items/{{newItemId}}/status` | `{"status":"resolved"}` | `200`, status `resolved` | Status transition |
| 16 | Owner tries an admin-only transition | `PATCH …/status` | `{"status":"expired"}` | `403` | Authorisation |
| 17 | Submit a claim with proof | `POST /api/v1/claims` | itemId + message ≥ 10 | `201` (or `409` if already claimed) | Claim submission |
| A17a | Owner asks for more information | `PATCH /api/v1/claims/:id` | `{"status":"info_requested"}` | `200`, claim status `info_requested` | Claim review |
| A17b | Claimant replies with details | `PATCH /api/v1/claims/:id/reply` | message ≥ 10 | `200`, claim back to `pending` | Claim workflow |
| A17c | Non-claimant tries to reply | same, owner token | — | `403` | Authorisation |
| A18a | Forgot password for an unknown address | `POST /api/v1/auth/forgot-password` | `nobody@example.com` | `200`, no token (no account enumeration) | Account recovery |
| A18b | Reset with a valid token | `POST /api/v1/auth/reset-password` | token + new password | `200`, new password works, token cannot be reused | Account recovery |
| A17d | Date-range + status filter | `GET /api/v1/items?from=…&to=…&status=active` | query params | `200`, all rows `active` | Filtering |
| 18 | Claim with a too-short message | `POST /api/v1/claims` | `message: "mine"` | `400` | Invalid input |
| 19 | Claims on my listings | `GET /api/v1/claims/received` | owner token | `200` + claims array | Claim review |
| 20 | Dashboard summary | `GET /api/v1/dashboard/summary` | any token | `200` + counts object | Dashboard |
| 21 | Admin statistics | `GET /api/v1/admin/stats` | admin token | `200` + totals incl. `pendingModeration` | Admin access |
| 22 | Admin route with student token | `GET /api/v1/admin/stats` | student token | `403` | Unauthorised access |
| 23 | Moderation queue | `GET /api/v1/admin/reports?status=pending` | admin token | `200` + items array | Moderation |
| 24 | Approve a report | `PATCH /api/v1/admin/reports/{{newItemId}}` | `{"action":"approve"}` | `200`, status becomes `active` | Moderation (AC-10) |
| 25 | Hide without a reason | `PATCH /api/v1/admin/reports/{{newItemId}}` | `{"action":"hide","reason":""}` | `400` — a reason is required | Validation |
| 26 | Audit trail | `GET /api/v1/admin/audit` | admin token | `200` + logs incl. `item.moderated` | Auditability (AC-09) |
| 27 | Users list leaks no hashes | `GET /api/v1/admin/users` | admin token | `200`, payload contains no `$2a$` | Privacy |

## Automated suites (no database required)

| Command | Assertions | What it proves |
|---|---|---|
| `npm run test:smoke` | 18 | routing, validation, auth guards, 404 page |
| `npm run test:db` | 41 | the real `db/schema.sql` plus every SQL query, against an in-memory Postgres (pg-mem) |
| `npm run test:api` | 78 | the whole Express API on that in-memory database: login, create, search, claim, approve, moderate, suspend, audit |

`npm run test:api` is the fastest way to show a working API without any cloud account: it boots the
real app and exercises 77 request/response cases, including the 400/401/403 paths.

## Non-Postman checks

`npm run test:smoke` boots the Express app (no database needed) and asserts 18 things: `/api/v1/health`
`200` with a `requestId`, the `/api` alias, `/api/v1/meta` `200`, the home page `200`, a branded `404`,
an unknown API route `404`, invalid registration `400`, and `401` for item creation, my-items,
dashboard summary, admin stats, moderation queue, audit log and notifications without a token.

## Manual browser checks

| Check | How |
|---|---|
| Responsive layout | DevTools at 375 / 768 / 1440 px — nav collapses, grid 1→2→3 columns, tables scroll |
| Client + server validation | Submit the report form empty (inline errors), then send a bad date via Postman (`400`) |
| Protected route | Log out, open `/dashboard.html` → redirected to login with `?next=` |
| Private fields | Open an item as a guest (no email/private proof), then as its owner (both visible) |
| Lifecycle | Report → claim (status becomes `claim_requested`) → approve (status becomes `resolved`) |
| Moderation | Set `REQUIRE_MODERATION=true`, restart, submit a report → it appears in the admin queue as `pending` and is invisible to guests until approved |
| Audit | Approve/hide a listing, then reload the admin page → the decision appears in the audit log with actor and reason |
| Suspension | Suspend a student in the admin panel, then try to log in as them → `403` |
| 404 | Visit `/nope` → branded 404 page |
