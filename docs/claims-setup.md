# Setting up live "who's doing this" checkboxes

Both `demo/quote-scheduler.html` and `demo/enquiries.html` now show two
checkboxes on every card — **Tim** and **David** — so whoever picks up a
job or enquiry can mark it, and everyone else sees that live on their own
device. Checking one doesn't remove or hide the entry, it just shows who's
on it.

This needs a small shared data store, because the two devices involved
have no other way to see each other's clicks — the browser's own storage
(what the screenshot-override feature uses) is stuck on one device.

## What's already built

- **`api/claims.js`** — a Vercel serverless function that reads/writes a
  small claims record (which entries are claimed by Tim or David) to
  Vercel KV.
- **Both pages** — poll that endpoint every few seconds and whenever you
  tick a box, so the checkboxes update on everyone's screen within a few
  seconds, not instantly but close to it.

This hasn't been tested against a real Vercel KV database — I don't have
your Vercel account to set one up and try it. Once it's connected, tick a
box and check it shows up (after a few seconds) on another device before
relying on it day to day.

## What you need to do

### 1. Add a Vercel KV database

1. Open your `fostersfencingapp` project on [vercel.com](https://vercel.com).
2. Go to the **Storage** tab.
3. Click **Create Database**, choose **KV** (this is Vercel's
   Redis-backed key-value store), give it a name, and create it.
4. On the "Connect to a project" step (or afterwards from the database's
   own page → **Projects** tab), connect it to the `fostersfencingapp`
   project. This automatically adds the `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` environment variables for you — no manual copying
   needed, unlike the `ANTHROPIC_API_KEY` step.
5. Redeploy (Deployments tab → ⋯ on the latest deployment → Redeploy) so
   the new environment variables actually apply.

### 2. Test it

Open the site on two devices (or two browser windows), tick "Tim" on one
enquiry or job on one of them, and check it appears ticked on the other
within a few seconds. If it doesn't, open that same enquiry/job's card
and check the browser console for a fetch error — the most likely cause
is the KV database not being connected yet, or needing a redeploy after
connecting it.

## How it behaves

- Ticking **Tim** automatically unticks **David** on that same entry (and
  vice versa) — a job is claimed by one person at a time, not both.
- Unticking a box clears the claim entirely.
- Nothing is ever removed or hidden — claiming just shows who's on it.
- Updates aren't instant; each device checks for changes roughly every 6
  seconds, so there can be a short delay before you see someone else's
  tick.
