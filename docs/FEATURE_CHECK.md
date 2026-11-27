# Feature verification record

Generated for the final submission. Every row was executed, not assumed.

**Automated coverage: 280 assertions**

| Suite | Command | Assertions | What it proves |
|---|---|---|---|
| Smoke | `npm run test:smoke` | 18 | Files, config and module wiring load |
| Database | `npm run test:db` | 41 | Queries, constraints, transactions, cascade rules |
| API | `npm run test:api` | 78 | Every HTTP route, auth rules, validation, uploads |
| Browser (E2E) | `npm run test:e2e` | 75 | The real site in headless Chromium, as a user |
| Postman | `npm run test:postman` | 68 | The shipped collection, executed with Newman exactly as the Postman runner does |

The browser suite fails on any JavaScript exception, any console error and any failed
request, so a page that renders but is silently broken still fails.

---

## Authentication

| Feature | How it was checked | Result |
|---|---|---|
| Register a new account | Browser: fill form → lands on dashboard, signed in | Pass |
| Log in (student and admin) | Browser: demo fill + submit → dashboard / admin | Pass |
| Log out | Browser: session token cleared, returned to a public page | Pass |
| Show/hide password | Browser: field type toggles `password` ⇄ `text` on login, register, profile | Pass |
| Forgot password | Browser: request → single-use link appears | Pass |
| Reset password | Browser: follow link → new password → sign in with it | Pass |
| Change password while signed in | Browser: profile page form, wrong current password rejected | Pass |
| Update profile details | Browser: name/department/phone saved and re-rendered | Pass |
| Duplicate email rejected | API: `409` | Pass |
| Weak password rejected | API: under 8 characters → `400` | Pass |
| Reset token single-use | API: second use of the same token → `400` | Pass |
| No account enumeration | API: unknown address returns the same message, no token | Pass |
| Suspended account blocked | API: existing token rejected after suspension | Pass |

## Listings

| Feature | How it was checked | Result |
|---|---|---|
| Report a lost item | Browser: form → item created | Pass |
| Report a found item | Browser: form → item created | Pass |
| Photo upload | API: valid PNG accepted and served from `/uploads/` | Pass |
| Wrong file type rejected | API: `.txt` with an image MIME → `400` | Pass |
| Oversized file rejected | API: over the size limit → `400` | Pass |
| Field validation | Browser: empty submit shows field-level errors | Pass |
| Edit own listing | Browser: dashboard → edit → saved | Pass |
| Delete own listing | API: owner delete, non-owner forbidden | Pass |
| Mark returned | API + browser: status change, outstanding claims rejected in one transaction | Pass |
| Private details hidden | API: never present in a public response | Pass |
| Hidden listing not public | API: `404` for anyone but an admin | Pass |
| View counter | API: increments on detail view | Pass |
| Search | Browser: one result, correct card | Pass |
| Filters (type, category, location, status, date range) | Browser + API: each narrows the set | Pass |
| Sort and pagination | API: `page`, `limit`, `sort` honoured, bounds clamped | Pass |

## Claims

| Feature | How it was checked | Result |
|---|---|---|
| Submit a claim | Browser: non-owner sees the form and submits | Pass |
| Minimum message length | API: short message → `400` | Pass |
| Cannot claim your own listing | API: `400` | Pass |
| Cannot claim twice | API: `409` | Pass |
| Owner sees the claim | Browser: received tab shows the claimant | Pass |
| Approve | Browser: row updates to approved | Pass |
| Approving rejects rivals | API: other pending claims become rejected | Pass |
| Reject with a reason | API: decision recorded | Pass |
| Ask for more information | API: status becomes `info_requested`, claimant can reply | Pass |
| Withdraw a claim | API: claimant withdraws | Pass |

## Dashboard and notifications

| Feature | How it was checked | Result |
|---|---|---|
| Stat cards | Browser: counts render | Pass |
| All four tabs open | Browser: listings, claims, received, notifications | Pass |
| Notifications listed | Browser: unread styling, click marks read | Pass |
| Mark all as read | Browser: button works, no exception | Pass |
| Unread dot in the header | Browser: appears when unread exist | Pass |

## Administration

| Feature | How it was checked | Result |
|---|---|---|
| Admin-only access | API: student token → `403`; browser: redirect | Pass |
| Statistics and charts | Browser: stat cards, category chart | Pass |
| Moderation queue | Browser: pending listings listed with actions | Pass |
| Approve / hide / reject with a mandatory reason | API + browser: reason required, audit entry written | Pass |
| All listings table with flag counts | Browser: rows render, `⚑` badge for flagged items | Pass |
| CSV export | Browser: button present, download generated | Pass |
| Users: role change | API: student ⇄ admin | Pass |
| Users: suspend / restore | API + browser | Pass |
| Audit log | Browser: entries visible; API: written for every moderation action | Pass |
| Refresh | Browser: re-fetches without error | Pass |

## Abuse reporting

| Feature | How it was checked | Result |
|---|---|---|
| Flag someone else's listing | Browser: prompt → confirmation | Pass |
| Cannot flag your own | API: `400` | Pass |
| One flag per user per listing | API: `409` on repeat | Pass |
| Flag count on the admin row | API: `flagCount` present | Pass |

## Public pages and platform

| Feature | How it was checked | Result |
|---|---|---|
| Home, help, privacy, 404, forgot/reset | Browser: each renders | Pass |
| Health check | API: `GET /api/v1/health` → `200` | Pass |
| Meta endpoint | API: categories, locations, `emailEnabled` | Pass |
| Dark mode | Browser: toggles, and the choice survives a reload | Pass |
| Mobile layout at 375px | Browser: no horizontal overflow, menu opens | Pass |
| Rate limiting on writes | API: `429` past the threshold | Pass |
| Graceful shutdown | Server log: `SIGINT received, closing connections` | Pass |
| Schema migration on boot | Server log: `[db] schema up to date (23 statements checked)` | Pass |

---

## Bugs this verification found and fixed

These were live in the deployed build before this pass:

1. `common.js` called `api()` without importing it — `mountHeader()` threw on every page, so
   the dashboard, report form, item page and profile never ran their own code.
2. `auth-page.js` called `wirePasswordToggles()` without importing it — login and
   registration never attached their submit handler.
3. Five pages loaded `auth-page.js` instead of their own module — the reset and profile
   forms had no handlers.
4. `profile.js` imported `setSession`; the export is `saveSession` — the page was dead.
5. `item.js` rendered "Report this listing" with no click handler — a dead button.
6. The report form could be submitted before `/meta` filled the category and location
   lists, producing "please choose a campus location" for a location the user had chosen.
7. The theme toggle saved to `lostly_theme` while every page restored from `clf_theme`, so
   the dark-mode choice was lost on the next page.
8. Marking a listing returned **crashed with a 500** when it had no claims: the notification
   was written against the reporter of an unjoined row, so `user_id` was null. Found only
   when the Postman collection ran it on a listing nobody had claimed.

## Still to confirm by hand (cannot be automated from here)

| Item | Why | How |
|---|---|---|
| Reset email actually arrives | Needs the live SMTP credentials | Live site → forgot password → check inbox/spam |
| Uploaded photos survive a redeploy | Render's disk is ephemeral on the free tier | Documented as a limitation in the report |
| Postman screenshots | The run is verified by Newman; the screenshots are the evidence | Import both files, open Runner, Run, capture the summary |
