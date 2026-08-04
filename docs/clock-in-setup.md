# Worker clock-in setup (Supabase)

Two new pages, separate from Approved Jobs / New Enquiries:

- **`demo/clock-in.html`** — each worker picks their name, enters their
  PIN, and taps **Clock In** / **Clock Out**. Their GPS location is
  recorded with each tap, and hours worked are calculated automatically
  the moment they clock out. They only ever see their own shift history.
- **`demo/admin-hours.html`** — the owner's view: every worker's shifts,
  locations, and hours, with per-worker totals and a "currently clocked
  in" count. Read-only by design (see "Editing or correcting a shift"
  below).

Both talk directly to a [Supabase](https://supabase.com) project (free
tier is plenty for 3 workers) using its client library — there's no
Vercel serverless function involved this time, unlike the KV-backed
claims feature. Supabase's Row Level Security (RLS) is what stops one
worker from reading another worker's shifts; it's enforced by the
database itself, not just hidden in the UI.

Unlike the other demo pages, these two need to be loaded over HTTPS (i.e.
the deployed site), not opened directly as a local file — both the
Supabase login and GPS access require it.

## 1. Create the Supabase project

1. Sign up / log in at [supabase.com](https://supabase.com) and create a
   new project (any region close to you is fine).
2. Once it's provisioned, open **SQL Editor** → **New query**, paste in
   the contents of `supabase/schema.sql` from this repo, and run it. This
   creates the `profiles` and `time_entries` tables, the "one open shift
   per worker" constraint, and all the RLS policies. It's safe to re-run
   later if you ever need to.

## 2. Create a login for each worker + the owner

There's no public sign-up screen on purpose — only logins you create by
hand in the Supabase dashboard can sign in.

For each of your 3 workers, plus one for yourself as the admin:

1. **Authentication → Users → Add user → Create new user.**
2. **Email:** doesn't need to be a real inbox — something like
   `tim@fostersfencing.local` is fine, it's just used as a login ID.
3. **Password:** this *is* the PIN they'll type on the clock-in page.
   Supabase requires at least 6 characters by default, so a 6-digit PIN
   works out of the box (e.g. `194823`). If you want a shorter 4-digit
   PIN instead, lower the minimum first under **Authentication →
   Providers → Email → Minimum password length**.
4. Tick **Auto Confirm User** so they can sign in immediately.
5. After creating the user, copy their **User UID** (shown in the users
   list) — you need it for the next step.
6. Still in the SQL Editor, add a matching profile row for each person:

   ```sql
   insert into public.profiles (id, name, is_admin) values
     ('paste-worker-1-uuid-here', 'Tim', false),
     ('paste-worker-2-uuid-here', 'David', false),
     ('paste-worker-3-uuid-here', 'Worker 3', false),
     ('paste-owner-uuid-here',    'Owner', true);
   ```

   `is_admin = true` is what lets the owner's login see everyone's hours
   on the admin page — leave every worker's row `false`.

**Hardening tip:** while you're in Authentication → Providers → Email,
consider turning **off** "Allow new users to sign up" — since neither
page exposes a sign-up form, this just closes off the (unused) public
sign-up API as well.

## 3. Get your API keys

**Settings → API** in the Supabase dashboard gives you:

- **Project URL** (`https://xxxxx.supabase.co`)
- **anon public** key

Both are meant to be public — RLS is what keeps data private, not
secrecy of this key. Don't use the **service_role** key anywhere in these
pages; it bypasses RLS entirely.

## 4. Wire up the two pages

Open `demo/clock-in.html` and find the `CONFIG` block near the bottom
(inside the `<script type="module">` tag):

```js
const CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY",
  workers: [
    { name: "Worker 1", email: "worker1@fostersfencing.local" },
    { name: "Worker 2", email: "worker2@fostersfencing.local" },
    { name: "Worker 3", email: "worker3@fostersfencing.local" }
  ]
};
```

Replace `supabaseUrl` / `supabaseAnonKey` with your real values, and
update each worker's `name` + `email` to match the logins you created in
step 2 (the `name` shown here is just a button label — what actually
identifies them is the email/PIN pair signing in as that Supabase user).

Then open `demo/admin-hours.html` and fill in the same `supabaseUrl` /
`supabaseAnonKey`, plus `adminEmail` (the login you created for yourself):

```js
const CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY",
  adminEmail: "owner@fostersfencing.local"
};
```

## 5. Deploy and test

Push/deploy as usual (same Vercel project as the rest of the app —
`vercel.json` already routes `/clock-in.html` and `/admin-hours.html` to
the files under `demo/`).

- Open `/clock-in.html` on a worker's phone, add it to the home screen
  (Share → Add to Home Screen on iPhone, ⋮ → Install app on Android) the
  same way as the other pages — it installs as its own "FF Clock In" icon
  and opens straight to the clock-in screen.
- Open `/admin-hours.html` yourself and sign in with the owner PIN to
  confirm you can see all 3 workers' shifts once they've clocked in at
  least once.
- The first Clock In/Out on a device will prompt for location permission
  — accept it. If it's ever denied or unavailable, the app still lets the
  clock in/out go through, just without a location for that entry (shown
  as a note at the time, and as "—" on the admin page).

## How the pieces fit together

- **Auth:** each worker's PIN *is* their Supabase Auth password —
  `clock-in.html` calls `supabase.auth.signInWithPassword()` with their
  email + entered PIN. This gets them a real signed session (JWT), which
  is what `auth.uid()` resolves to inside the database's RLS policies.
  There's no separate custom PIN system to maintain.
- **RLS:** `time_entries` policies only allow a `select`/`insert`/`update`
  where `worker_id = auth.uid()`, or where `public.is_admin()` is true.
  A worker's session literally cannot query another worker's rows —
  Postgres won't return them, regardless of what the page's JavaScript
  does. Try it: open your browser's dev tools on `clock-in.html` while
  signed in as one worker and query another `worker_id` — you'll get an
  empty result, not an error, because Postgres just filters those rows
  out.
- **Hours worked:** `time_entries.hours_worked` is a Postgres *generated
  column* — `round(extract(epoch from (clock_out_at - clock_in_at)) /
  3600, 2)`. It computes itself the instant `clock_out_at` is set; there's
  no application code computing or storing it.
- **One open shift at a time:** a partial unique index on `time_entries`
  (`worker_id` where `clock_out_at is null`) stops a worker from clocking
  in twice without clocking out first — including from two tabs/devices
  at once, which the UI also checks for but the database is the real
  backstop.
- **Editing or correcting a shift:** intentionally not possible from
  either page (only clocking out an *open* shift is allowed, and a
  trigger blocks changing `clock_in_at`/location/`worker_id` after the
  fact) — this keeps the timesheet trustworthy for payroll. If you ever
  need to fix a mistaken entry, do it in the Supabase dashboard's Table
  Editor (**Table Editor → time_entries**), which uses your project's
  admin access and isn't subject to these RLS policies.

## Adding, removing, or re-PINing a worker later

- **New worker:** create their Auth user + `profiles` row as in step 2,
  then add them to the `workers` array in `clock-in.html`.
- **Remove a worker:** delete their row from **Authentication → Users**
  (their `profiles` row and `time_entries` history cascade-delete with
  them) and remove their entry from the `workers` array. If you want to
  keep their historical hours instead, just remove them from the
  `workers` array and leave their Auth user + data alone — they simply
  won't see a button to sign in anymore.
- **Change a PIN:** **Authentication → Users** → select the user → reset
  their password to the new PIN.
