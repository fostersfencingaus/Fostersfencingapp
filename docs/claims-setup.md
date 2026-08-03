# Live "who's doing this" checkboxes + synced screenshot reads

Both `demo/quote-scheduler.html` and `demo/enquiries.html` show two
checkboxes on every card — **Tim** and **David** — so whoever picks up a
job or enquiry can mark it, and everyone else sees that live on their own
device. Checking one doesn't remove or hide the entry, it just shows who's
on it.

`demo/quote-scheduler.html` also syncs screenshot-read details (who,
location, note) the same way — applying a screenshot read on one device
updates that job's card on every device, not just the one that read it.
Only the extracted text syncs; the screenshot image itself stays local to
whichever device uploaded it.

Both need a small shared data store, because the devices involved have no
other way to see each other's clicks — plain browser storage is stuck on
one device.

## What's set up (status: live and working)

- **A Vercel KV database** (via the Upstash for Redis marketplace
  integration — Vercel retired the old native "KV" product in favour of
  this) is connected to the project, on the Free plan.
- **`api/claims.js`** — reads/writes which entries are claimed by Tim or
  David.
- **`api/overrides.js`** — reads/writes the screenshot-read overrides for
  Approved Jobs, in the same KV database under a different key.
- Both pages poll their endpoint every 15 seconds, and immediately after
  you tick a box or apply a screenshot read, so changes show up on
  everyone's screen within about 15 seconds, not instantly but close to
  it.

This was tested end to end against the real deployment — writing a
claim/override on one simulated device and confirming it shows up on
another, including via the periodic poll (not just on page load).

## How it behaves

- Ticking **Tim** automatically unticks **David** on that same entry (and
  vice versa) — a job is claimed by one person at a time, not both.
- Unticking a box clears the claim entirely. Nothing is ever removed or
  hidden — claiming just shows who's on it.
- Applying a screenshot read on Approved Jobs updates the card everywhere;
  "Revert" clears it everywhere too.
- Updates aren't instant — each device checks for changes roughly every
  15 seconds, so there can be a short delay before you see someone else's
  change. This interval was deliberately set fairly relaxed (not, say,
  every 2 seconds) to stay comfortably inside the Free plan's 500,000
  monthly command limit even with both devices open most of the workday —
  if it's ever worth syncing faster, this is a one-line change.

## If it ever needs re-setting-up

Both endpoints need `KV_REST_API_URL` and `KV_REST_API_TOKEN` as
environment variables in the Vercel project (Settings → Environment
Variables) — these come from connecting the Upstash for Redis database to
the project (Storage tab → your database → Projects), and only take
effect on deployments made after they're added, so redeploy afterward if
you ever reconnect or recreate the database.
