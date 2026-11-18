-- ============================================================================
--  Campus Lost and Found Portal — PostgreSQL schema (Supabase compatible)
--  Run this in the Supabase SQL editor, or with:  npm run db:setup
--
--  Design notes
--   * ids are uuid, generated in the application (crypto.randomUUID) so the
--     schema needs no extensions and works on any Postgres 13+.
--   * emails are stored as text with a unique index on lower(email) — no citext
--     extension needed.
--   * timestamps are timestamptz; the API serialises them as ISO strings.
--   * every table is owned by the Express service; the browser never touches
--     Postgres directly (see db/rls.sql).
-- ============================================================================

-- ------------------------------------------------------------------ users
create table if not exists users (
  id           uuid primary key,
  name         text not null,
  email        text not null,
  password     text not null,                -- bcrypt hash, never returned
  role         text not null default 'student' check (role in ('student', 'admin')),
  department   text,
  phone        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists users_email_lower_uidx on users (lower(email));

-- ------------------------------------------------------------------ items
create table if not exists items (
  id                  uuid primary key,
  reference           text unique,
  title               text not null,
  description         text not null,
  description_private text not null default '',   -- private proof, never public
  category            text not null,
  type                text not null check (type in ('lost', 'found')),
  location            text not null,
  date_lost_or_found  timestamptz not null,
  image_url           text not null default '',
  contact_info        text not null default '',
  status              text not null default 'active'
                        check (status in ('pending','active','claim_requested','resolved','rejected','expired')),
  moderation_reason   text not null default '',
  moderated_by        uuid references users (id) on delete set null,
  moderated_at        timestamptz,
  resolved_at         timestamptz,
  reporter            uuid not null references users (id) on delete cascade,
  views               integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists items_status_idx    on items (status);
create index if not exists items_filter_idx    on items (category, type, status);
create index if not exists items_created_idx   on items (created_at desc);
create index if not exists items_reporter_idx  on items (reporter);
create index if not exists items_date_idx      on items (date_lost_or_found desc);

-- ----------------------------------------------------------------- claims
create table if not exists claims (
  id             uuid primary key,
  item           uuid not null references items (id) on delete cascade,
  claimant       uuid not null references users (id) on delete cascade,
  message        text not null,
  proof          text not null default '',       -- private, owner/admin only
  status         text not null default 'pending'
                   check (status in ('pending','info_requested','approved','rejected')),
  decision_note  text not null default '',
  reviewed_by    uuid references users (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint claims_item_claimant_uidx unique (item, claimant)
);
create index if not exists claims_item_idx     on claims (item);
create index if not exists claims_claimant_idx on claims (claimant);
create index if not exists claims_status_idx   on claims (status);

-- ---------------------------------------------------------- notifications
create table if not exists notifications (
  id         uuid primary key,
  user_id    uuid not null references users (id) on delete cascade,
  type       text not null default 'status'
               check (type in ('duplicate','claim','decision','status')),
  message    text not null,
  item       uuid references items (id) on delete cascade,
  claim      uuid references claims (id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, read);

-- ------------------------------------------------------------- audit logs
create table if not exists audit_logs (
  id          uuid primary key,
  actor       uuid references users (id) on delete set null,
  actor_name  text not null default 'system',
  action      text not null,
  entity_type text not null check (entity_type in ('item','claim','user','system')),
  entity_id   uuid,
  reason      text not null default '',
  metadata    jsonb not null default '{}'::jsonb,
  ip          text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists audit_created_idx on audit_logs (created_at desc);
create index if not exists audit_action_idx  on audit_logs (action);
