# Shared shopping list setup (Supabase)

One new page, separate from the other demo pages:

- **`demo/shopping-list.html`** — a shared shopping list. Anyone with the
  page open can add an item, and tap any item to tick it off (strikethrough
  + faded) or tap again to un-tick it. Ticked items auto-remove after 48
  continuous hours; un-ticking before then resets the countdown. Changes
  show up live for everyone else viewing the page — no refresh needed.

There's no login — the first time the page is opened on a device it asks
"What's your name?" once and remembers it in that browser's `localStorage`,
just to label who added each item. It talks directly to a
[Supabase](https://supabase.com) project (free tier is plenty) using its
client library, the same pattern as the worker clock-in feature, but
without any Auth — every visitor shares the same read/write access.

## 1. Create (or reuse) a Supabase project

If you already created a Supabase project for the clock-in feature, you can
reuse it — this feature's table (`shopping_items`) is independent of
`profiles` / `time_entries`. Otherwise sign up / log in at
[supabase.com](https://supabase.com) and create a new project.

Open **SQL Editor** → **New query**, paste in the contents of
`supabase/schema.sql` from this repo, and run it. This creates the
`shopping_items` table, its RLS policies (open to everyone, since there's
no login for this feature), and adds the table to Supabase's realtime
publication so changes stream to every connected page. It's safe to re-run
later if you ever need to.

If the `alter publication supabase_realtime add table ...` line at the
bottom of the script doesn't take effect for any reason, you can do the
same thing from the dashboard instead: **Table Editor → shopping_items →**
the toggle in the **Realtime** column (or **Database → Replication**).

## 2. Get your API keys

**Settings → API** in the Supabase dashboard gives you:

- **Project URL** (`https://xxxxx.supabase.co`)
- **anon public** key

Both are meant to be public. Because this feature has no login, the anon
key alone is enough for anyone to read and write the list — that's the
intended trade-off for a no-login shared list. Don't use the
**service_role** key here; it bypasses RLS entirely and should never ship
in a browser page.

## 3. Wire up the page

Open `demo/shopping-list.html` and find the `CONFIG` block near the top of
the `<script type="module">` tag:

```js
const CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY"
};
```

Replace both values with your real ones from step 2.

## 4. Deploy and test

Push/deploy as usual (same Vercel project as the rest of the app —
`vercel.json` already routes `/shopping-list.html` and
`/manifest-shopping-list.json` to the files under `demo/`).

- Open `/shopping-list.html` on your phone, add it to the home screen
  (Share → Add to Home Screen on iPhone, ⋮ → Install app on Android) the
  same way as the other pages — it installs as its own "FF Shopping List"
  icon.
- The first time you open it on a device, it'll ask for your name once —
  after that it's remembered for that browser.
- Open the page on a second device (or a second browser tab) at the same
  time and confirm adding/ticking on one shows up on the other within a
  second or two, with no refresh.

## How the pieces fit together

- **Adding items:** the input at the top inserts a row into
  `shopping_items` tagged with the name saved in `localStorage`. New items
  sort to the top because the list is always ordered by `created_at`
  descending.
- **Ticking off:** tapping an item sets `purchased_at` to the current time
  (or clears it back to `null` on a second tap). The UI updates optimistically,
  then confirms against the database.
- **48-hour auto-removal:** the page runs a "sweep" on load and every 5
  minutes that deletes any row where `purchased_at` is more than 48 hours
  in the past. Deleting a row broadcasts a realtime `DELETE` to every open
  page, so it disappears everywhere at once. As a backstop, the page also
  hides any item locally the instant its own 48-hour mark passes (once a
  minute it re-checks), so it never lingers on screen even if the next
  sweep hasn't run yet. Un-ticking an item clears `purchased_at` back to
  `null`, which resets the 48-hour clock entirely — it only starts counting
  again the next time it's ticked.
- **Live sync:** the page subscribes to Postgres changes on
  `shopping_items` via Supabase Realtime (`postgres_changes` on insert /
  update / delete) and applies each change straight to the on-screen list.
- **No login, open RLS:** Row Level Security is turned on for
  consistency with the rest of the schema, but every policy is `using
  (true)` — i.e. fully open — since there's no authenticated identity to
  check. Anyone who has the page URL and the (public) anon key can read and
  write the list; that's the accepted trade-off for a lightweight,
  no-login shared list. If that's ever too open, the fix is to add a real
  login step (like the clock-in feature's PIN login) and tighten the
  policies to match.

## Changing the 48-hour window

Edit the `PURCHASED_TTL_MS` constant near the top of the `<script>` block
in `demo/shopping-list.html` (it's in milliseconds — 48 hours is
`48 * 60 * 60 * 1000`). The sweep and the on-screen countdown both read
from that one constant.
