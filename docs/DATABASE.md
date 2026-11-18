# LOSTLY · Database design (PostgreSQL / Supabase)

Five tables, foreign keys with cascade deletes, unique constraints and indexes chosen for the
queries the API actually runs. The full DDL is in [`db/schema.sql`](../db/schema.sql).

## Relationships

```
users 1 ──── N items          items.reporter     → users.id
users 1 ──── N claims         claims.claimant    → users.id
items 1 ──── N claims         claims.item        → items.id   (cascade delete)
users 1 ──── N notifications  notifications.user_id → users.id
items 1 ──── N notifications  notifications.item   → items.id  (cascade delete)
users 1 ──── N audit_logs     audit_logs.actor    → users.id  (set null on delete)
```

Deleting a listing removes its claims and notifications automatically (`on delete cascade`), which is
why `DELETE /items/:id` needs no cleanup code.

## Tables

### users
| Column | Type | Constraint |
|---|---|---|
| id | uuid | primary key (generated in the app) |
| name | text | not null |
| email | text | not null, unique index on `lower(email)` |
| password | text | not null — bcrypt hash, never returned by the API |
| role | text | `student` \| `admin`, default `student` |
| department, phone | text | nullable |
| is_active | boolean | default true — false means suspended |
| created_at, updated_at | timestamptz | default now() |

### items
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| reference | text | unique, `LF-YY-XXXXXX`, shown to the student |
| title | text | 3–90 chars, enforced in validation |
| description | text | public description |
| description_private | text | **private proof — never in a public response** |
| category, location | text | controlled lists in `src/constants.js` |
| type | text | `lost` \| `found` |
| date_lost_or_found | timestamptz | not in the future (validated) |
| image_url, contact_info | text | optional |
| status | text | `pending` \| `active` \| `claim_requested` \| `resolved` \| `rejected` \| `expired` |
| moderation_reason, moderated_by, moderated_at | | filled by an admin decision |
| resolved_at | timestamptz | set when the item is returned |
| reporter | uuid | → users.id |
| views | integer | incremented on each detail view |

### claims
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| item | uuid | → items.id, cascade |
| claimant | uuid | → users.id, cascade |
| message | text | 10–800 chars |
| proof | text | private, visible to the claimant and the item owner only |
| status | text | `pending` \| `info_requested` \| `approved` \| `rejected` |
| decision_note, reviewed_by, reviewed_at | | the owner's decision |
| — | — | **unique (item, claimant)** stops duplicate claims |

### notifications
`id, user_id, type (duplicate|claim|decision|status), message, item, claim, read, created_at`

### audit_logs
`id, actor, actor_name, action, entity_type, entity_id, reason, metadata (jsonb), ip, created_at` —
append-only; written on create, update, status change, moderation, deletion, role change and suspension.

## Indexes and why

| Index | Query it serves |
|---|---|
| `users_email_lower_uidx` | login and duplicate-email check |
| `items_status_idx` | public listing (only active/claim_requested) |
| `items_filter_idx (category, type, status)` | the filter panel |
| `items_created_idx` | newest-first home page |
| `items_reporter_idx` | "my listings" |
| `items_date_idx` | date-range filter and `date_desc` sort |
| `claims_item_claimant_uidx` | duplicate-claim prevention |
| `claims_item_idx`, `claims_status_idx` | claims-on-my-listings, pending counts |
| `notifications_user_idx (user_id, read)` | notification list + unread badge |
| `audit_created_idx` | audit log viewer |

## How the queries are written

- Every value is a bind parameter (`$1`, `$2`, …). No string concatenation anywhere, so SQL injection
  is structurally impossible.
- The list endpoint runs two queries in parallel: one `count(*)` for pagination and one page of rows
  joined to `users` for the reporter's name.
- Public responses never select `description_private`, and `proof` is only returned to the claimant
  and the item owner.
- Claim approval runs inside a transaction (`begin … commit`) so the claim, the item status and the
  rival claims all move together.
- The 7-day activity chart is bucketed in JavaScript from a single narrow query, which keeps the SQL
  free of date-function quirks and always returns seven points.

## Running it

```bash
npm run db:setup          # applies db/schema.sql (idempotent)
npm run seed              # 4 users, 13 items, 1 claim, 2 audit entries
npm run seed -- --reset   # wipe everything first
npm run test:db           # 41 assertions against an in-memory Postgres
```
