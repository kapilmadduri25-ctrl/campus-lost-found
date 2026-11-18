# LOSTLY · Deployment guide (Supabase + Render)

Two free accounts: **Supabase** for the database, **Render** for the Node app.
Total time: about 15 minutes.

---

## Step 1 — Create the Supabase project

1. Sign in at <https://supabase.com> → **New project**.
2. Name: `campus-lost-found`. Region: **Mumbai / Singapore** (closest to campus).
3. Set a **database password** and save it somewhere safe — you need it in step 2.
   Avoid `@ : / ?` in the password, or URL-encode them later.
4. Wait 1–2 minutes for the project to finish provisioning.

## Step 2 — Copy the connection string

Supabase → **Project Settings → Database → Connection string**.

Choose **Session pooler** (not "Direct connection"). The direct connection is IPv6-only, and
Render's free tier cannot reach it; the pooler is IPv4 and works everywhere.

It looks like this:

```
postgresql://postgres.abcdefghijkl:YOUR-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Replace `YOUR-PASSWORD` with the password from step 1. Keep this whole string — it is
`DATABASE_URL` for both your laptop and Render.

> Never commit this string. `.env` is already git-ignored, and on Render it lives in the
> dashboard, not in the repository.

## Step 3 — Create the tables

Either paste `db/schema.sql` into the Supabase **SQL editor** and press Run, or run it from your
machine:

```bash
npm run db:setup
```

Then load the demo data:

```bash
npm run seed
```

Check it worked: Supabase → **Table editor** → you should see `users`, `items`, `claims`,
`notifications`, `audit_logs`, with 4 users and 13 items.

Optional hardening: run `db/rls.sql` in the SQL editor. It enables Row Level Security with no
policies, so the public anon key can read nothing while the Express connection keeps working.

## Step 4 — Push to GitHub

```bash
git init
git add .
git commit -m "feat: Campus Lost and Found Portal - Express + Supabase Postgres"
git branch -M main
git remote add origin https://github.com/<your-username>/campus-lost-found.git
git push -u origin main
```

## Step 5 — Deploy on Render

1. <https://render.com> → **New → Web Service** → connect the repository.
2. Settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
   - Health check path: `/api/v1/health`
3. **Environment → Add Environment Variable**:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Session pooler string from step 2 |
   | `JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
   | `NODE_ENV` | `production` |
   | `REQUIRE_MODERATION` | `false` (or `true` to review every report) |
   | `ADMIN_EMAIL` | `admin@saiuniversity.edu.in` |
   | `ADMIN_PASSWORD` | a password you choose |

4. **Deploy**. The first build takes 2–4 minutes.
5. Open **Shell** on the Render service and run `npm run db:setup` then `npm run seed` once.
   (Skip `db:setup` if you already ran it in step 3.)
6. Visit `https://<your-app>.onrender.com`.

> Free Render instances sleep after 15 minutes of inactivity; the first request after that takes
> about 30 seconds. Open the URL once before your demo so it is awake.

## Step 6 — Post-deploy checks

- [ ] `GET /api/v1/health` returns `{"status":"ok"}`
- [ ] Home page shows the 13 seeded items
- [ ] Register a new account and log in
- [ ] Create a listing with a photo → the image loads from `/uploads/...`
- [ ] Claim flow works end to end
- [ ] Admin dashboard charts, moderation queue and audit log render
- [ ] Update `baseUrl` in the Postman environment to the deployed URL and re-run the collection

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ECONNREFUSED` / `ETIMEDOUT` on startup | direct connection (IPv6) instead of the pooler | copy the **Session pooler** string |
| `password authentication failed` | password mismatch or special characters | reset the database password in Supabase and paste it exactly |
| `relation "items" does not exist` | schema never applied | `npm run db:setup` |
| `SSL required` | SSL flag | already handled — `src/config/db.js` enables SSL for Supabase hosts |
| App builds but 500s on every API call | `DATABASE_URL` missing on Render | add it in Environment, then redeploy |

## Screenshots for the report

Capture at 1440 px (and one at 375 px): home, register, report form with possible matches, item
detail, dashboard, admin dashboard, Postman runner summary, Supabase table editor, Render dashboard.
