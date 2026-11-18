# API Reference (v1)

Base URL: `http://localhost:5000/api/v1` — the same routers are also mounted at `/api` as a
backwards-compatible alias.

Protected routes need:

```
Authorization: Bearer <jwt>
Content-Type: application/json        # unless sending multipart/form-data with an image
```

Every response includes an `X-Request-Id` header, and errors follow one shape:

```json
{ "success": false,
  "error": { "code": "FORBIDDEN", "message": "You can only edit your own listings" },
  "requestId": "b0c1…" }
```

Codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`CONFLICT` (409), `RATE_LIMITED` (429), `SERVER_ERROR` (500).

---

## Meta and health

### GET /meta
Public. `{ categories, locations, statuses, sorts, moderationEnabled }` — used to build the forms.

### GET /health
Public. `{ status: "ok", uptime, timestamp, requestId }`

---

## Authentication

### POST /auth/register
Body: `name`, `email`, `password` (min 8, letter + number), optional `department`, `phone`.
Returns `201` with `token` + `user`. `role` is ignored from the body — new accounts are always `student`.
Errors: `400` validation, `409` email already registered.

### POST /auth/login
Body: `email`, `password` → `200` with `token` + `user`, or `401` for wrong credentials.
A suspended account (`isActive:false`) gets `403`.

### GET /auth/me · PATCH /auth/me
Read or update the signed-in profile (`name`, `department`, `phone`).

### POST /auth/logout
Acknowledges the logout; JWTs are stateless, so the browser discards the token.

---

## Items

### GET /items
Public (an admin token widens the status filter). Query parameters:

| Param | Values | Default |
|---|---|---|
| `search` | free text over title, description, location | – |
| `category` | see `/meta` | all |
| `location` | see `/meta` | all |
| `type` | `lost` \| `found` | both |
| `status` | `active` \| `claim_requested` \| `resolved` (admin: any) | `active`, `claim_requested` |
| `from` / `to` | ISO dates on `dateLostOrFound` | – |
| `sort` | `newest` \| `oldest` \| `date_desc` \| `date_asc` \| `title` | `newest` |
| `page` | number | 1 |
| `limit` | 1–50 | 9 |

```json
{ "success": true, "count": 9, "total": 13, "page": 1, "pages": 2,
  "items": [ { "_id": "…", "reference": "LF-26-8F3A21", "title": "Black Dell Inspiron Laptop",
               "type": "found", "status": "active", "category": "Electronics",
               "location": "Main Library", "dateLostOrFound": "…", "imageUrl": "",
               "reporter": { "_id": "…", "name": "Arjun Rao" } } ] }
```

**Privacy:** `reporter` is populated with `name` only, and `descriptionPrivate` is never returned.

### GET /items/:id
Public. Increments `views`, returns `claimsCount`, `isOwner` and `canClaim`.
The owner and admins additionally receive `reporter.email`, `reporter.phone`, `reporter.department`
and `descriptionPrivate`. `pending`, `rejected` and `expired` items return `404` to everyone else.

### POST /items
Signed in. `multipart/form-data`:

| Field | Required | Notes |
|---|---|---|
| `title` | yes | 3–90 chars |
| `description` | yes | 10–1000 chars |
| `descriptionPrivate` | no | private proof, never returned publicly |
| `category` | yes | from `/meta` |
| `type` | yes | `lost` \| `found` |
| `location` | yes | from `/meta` |
| `dateLostOrFound` | yes | ISO date, not in the future |
| `contactInfo` | no | max 120 chars |
| `image` | no | JPG/PNG/WEBP/GIF, max 2 MB |

Returns `201` with `reference` (e.g. `LF-26-8F3A21`), `item` and `possibleMatches`.
Status is `active`, or `pending` when `REQUIRE_MODERATION=true`.

### PATCH /items/:id
Owner or admin. Editable: `title`, `description`, `descriptionPrivate`, `category`, `location`,
`dateLostOrFound`, `contactInfo`, plus an optional new `image`. `403` for non-owners.

### PATCH /items/:id/status
Body `{ "status": "…" }`. Owner may do `active`/`claim_requested → resolved` and `resolved → active`;
an admin may set any status. Every change is audited.

### DELETE /items/:id
Owner or admin. Removes the listing, its claims, notifications and image file; writes an audit entry.

### GET /items/user/mine
Signed in. My listings with `claimCount`, `pendingClaims` and `statusCounts`.

---

## Claims (private by design)

### POST /claims
Signed in. Body: `itemId`, `message` (10–800 chars), optional `proof` (max 400).
Rules: no self-claims, no duplicate claim per item (`409`), only `active`/`claim_requested` items.
The first claim moves the item to `claim_requested` and notifies the owner.

### GET /claims/mine
Claims I submitted, with the item summary.

### GET /claims/received
Claims on my listings, including the claimant's contact details and their private proof.

### PATCH /claims/:id
Item owner or admin. Body: `{ status: "approved" | "rejected" | "info_requested", decisionNote }`.
Approving sets the item to `resolved` and auto-rejects the other pending claims.

### DELETE /claims/:id
The claimant withdraws a pending claim (admins may remove any claim).

---

## Notifications

### GET /notifications
`{ count, unread, notifications[] }`. Types: `duplicate`, `claim`, `decision`, `status`.

### PATCH /notifications/:id/read · PATCH /notifications/read-all

---

## Dashboard

### GET /dashboard/summary
Signed in.

```json
{ "success": true,
  "summary": { "myListings": 3,
               "byStatus": { "pending": 0, "active": 2, "claim_requested": 1,
                             "resolved": 0, "rejected": 0, "expired": 0 },
               "claimsReceived": 1, "claimsSubmitted": 0,
               "claimsAwaitingMyDecision": 1, "unreadNotifications": 2 } }
```

---

## Admin (role `admin` only — otherwise `403`)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/stats` | Totals (incl. `pendingModeration`), by-status, by-category, by-type, last 7 days, recovery rate |
| GET | `/admin/items` | Every listing, filterable by `status` and `type` |
| GET | `/admin/reports?status=pending` | Moderation queue |
| PATCH | `/admin/reports/:id` | `{ action: "approve" \| "restore" \| "hide" \| "reject" \| "expire", reason }` — a reason is required for hide/reject/expire; audited |
| GET | `/admin/claims` | All claims with claimant and item |
| GET | `/admin/users` | All users (no password hashes) |
| PATCH | `/admin/users/:id/role` | `{ role: "student" \| "admin" }` |
| PATCH | `/admin/users/:id/status` | `{ isActive: false }` suspends, `true` reactivates |
| GET | `/admin/audit?limit=60` | Recent moderation/security trail |
| DELETE | `/admin/items/:id` | Force delete a listing |
