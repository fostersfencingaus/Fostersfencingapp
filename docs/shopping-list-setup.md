# Shared shopping list — Supabase setup

`demo/shopping-list.html` is a shared, no-login shopping list: anyone with
the page open can add items, tick them off, and see everyone else's changes
live. It's built the same way as the rest of `demo/` — a single
self-contained HTML file, no build step — but it needs a small Supabase
project behind it for storage and live sync, which has to be created by
hand (this can't be provisioned on your behalf).

## Why Supabase here (and not the existing Vercel KV setup)

The rest of this app's shared state (`demo/enquiries.html` and
`demo/quote-scheduler.html`'s claim checkboxes) uses Vercel KV via small
`/api/*.js` functions, polling every 15 seconds. That works well for a
couple of checkboxes, but this page needs actual live push updates across
everyone viewing it and ticked-item timestamps for the 48-hour
auto-removal, which is what Supabase's Postgres + Realtime is for — so it
gets its own backend rather than being bolted onto the KV pattern.

## One-time setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
   (free tier is plenty for this). Note the project's region/name — doesn't
   matter which, just pick one.

2. **Run this SQL** (Supabase dashboard → SQL Editor → New query):

   ```sql
   create extension if not exists pgcrypto;

   create table public.shopping_list_items (
     id uuid primary key default gen_random_uuid(),
     name text not null,
     added_by text not null,
     purchased boolean not null default false,
     purchased_at timestamptz,
     created_at timestamptz not null default now()
   );

   alter table public.shopping_list_items enable row level security;

   -- No login on this page, so every policy is wide open — anyone with the
   -- page URL can read, add, tick off, or delete items. That's intentional
   -- given the "no login" requirement, not an oversight; don't tighten
   -- these without also changing how the page authenticates.
   create policy "Public can read shopping list items"
     on public.shopping_list_items for select
     using (true);

   create policy "Public can add shopping list items"
     on public.shopping_list_items for insert
     with check (true);

   create policy "Public can update shopping list items"
     on public.shopping_list_items for update
     using (true)
     with check (true);

   create policy "Public can delete shopping list items"
     on public.shopping_list_items for delete
     using (true);

   -- Required for the live "no refresh needed" sync — without this,
   -- Realtime never fires for changes to this table.
   alter publication supabase_realtime add table public.shopping_list_items;
   ```

   (If `alter publication supabase_realtime add table ...` errors because
   the publication already includes it, or doesn't exist under that name,
   use the dashboard instead: Database → Replication → toggle the table on
   under the `supabase_realtime` publication.)

3. **Get the project URL and anon key**: Settings → API. You want the
   **Project URL** and the **`anon` `public`** key — not `service_role`.
   The anon key is meant to be public; it's what every Supabase client
   library ships with in browser code, and it's the table's RLS policies
   above (not key secrecy) that control access. Never put the
   `service_role` key in this file or anywhere else in the repo.

4. **Paste both into `demo/shopping-list.html`** — near the top of the
   `<script>` block:

   ```js
   const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```

   Until these are filled in, the page still loads and displays fine, but
   shows a "Not connected to Supabase yet" notice and disables adding
   items — it fails closed rather than throwing errors.

5. **Deploy.** The page has a pretty URL (`/shopping-list.html`, via
   `vercel.json`) and its own installable identity — `manifest-shopping-list.json`
   names it "Fosters Fencing Shopping List" ("FF Shopping List" as an
   installed app), separately from the main "Fosters Fencing" app the other
   pages install as. It's linked from the Home page
   (`demo/index.html`)'s app card grid. It isn't in `sw.js`'s offline
   precache list, so it won't work offline the way the other pages do —
   add it there too if that matters for this page.

## How it behaves

- **Adding**: the top bar adds an item immediately (Enter or the Add
  button), newest first.
- **Whose name**: the first time a device opens this page, it asks for a
  name once and saves it in that browser's `localStorage` — not tied to any
  account, just remembered per device. Every item shows who added it.
- **Ticking off**: tapping an item toggles purchased — strikethrough +
  faded on the first tap, back to normal on the second. This is optimistic
  (updates instantly) with a Postgres write behind it; if that write fails,
  the tap reverts rather than silently drifting out of sync with the
  database.
- **48-hour auto-removal**: marking an item purchased stamps
  `purchased_at`. Once 48 hours have passed continuously, the item stops
  being shown to everyone — this check runs client-side (recomputed on
  every render and on a 60-second timer), so it doesn't depend on a Supabase
  cron job or Edge Function existing. Un-ticking clears `purchased_at`
  entirely, so a later re-tick starts a fresh 48-hour countdown rather than
  resuming an old one.
- **Live sync**: uses Supabase Realtime (Postgres change notifications over
  a websocket) — any insert/update/delete on the table triggers every open
  tab to refetch the full list, so changes show up for everyone without a
  refresh. This is a real push, not the 15-second polling the claims/
  overrides endpoints use elsewhere in the app.
- **Row cleanup**: whichever tab happens to be open runs a 60-second sweep
  that also issues a delete for anything past 48 hours, so rows don't pile
  up forever in the table. This is best-effort, not required for
  correctness — an item stops being *shown* purely based on elapsed time,
  independent of whether any tab is open to actually delete it.
