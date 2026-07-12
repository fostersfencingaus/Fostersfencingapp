# Fosters Fencing App

Tools for turning inbox activity — Invoice2go approvals and quote enquiries — into a usable job list.

## Demo pages

Both are static, single-file HTML — no build step, open directly in a browser. They link to each other via a tab bar, so keep them in the same folder.

- **`demo/quote-scheduler.html`** — Approved Jobs. Lists quotes that are ready to book (approved via Invoice2go, or a client email saying they want to go ahead with a specific quote number), lets you pick a date/time per job, and opens a pre-filled Google Calendar event to confirm.
- **`demo/enquiries.html`** — New Enquiries. Lists prospective clients asking for a quote/estimate, grouped by suburb, pulled from cloudmail contact-form forwards and other direct quote-request emails.

Both use hardcoded data pulled by hand from a one-off Gmail search — one real entry per page, rest is either clearly-labeled example data (scheduler) or genuine archived history from 2013–2014 (enquiries). See `docs/email-parsing-rules.md` for the detection rules and what's needed to make either page read the inbox live.

## Branding

Colors and the logo mark are pulled from the actual Fosters Fencing quote letterhead: navy, gold, red on white/near-black. Logo is embedded inline (base64) in each page so they stay self-contained; the source image also lives at `demo/assets/fosters-fencing-logo.jpg`.
