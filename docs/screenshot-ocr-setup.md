# Setting up automatic screenshot reading

`demo/quote-scheduler.html` can read a screenshot of an Invoice2go
estimate automatically instead of you pasting it into chat with Claude —
but it needs a small backend to do that, because the browser can't safely
hold an API key. This is what's in the repo for it, and what you need to
do to turn it on.

## What's already built

- **`api/read-quote-screenshot.js`** — a Vercel serverless function. It
  takes a screenshot (as a data URL), sends it to Claude with a prompt
  asking for the client name/phone/email, site address, and job/price
  summary, and returns that as JSON.
- **`demo/quote-scheduler.html`** — when you upload or paste a screenshot
  onto a quote card, if `OCR_ENDPOINT` (near the top of the `<script>`
  block) is set, it POSTs the screenshot to that endpoint, shows what
  came back in an editable review box, and only updates the card once you
  click "Apply to card". Nothing is ever applied silently. Click "Revert"
  on an applied card to go back to the original data. If `OCR_ENDPOINT`
  is left blank (the default), the page behaves exactly as before —
  upload the screenshot and paste it into chat with Claude yourself.

This has been tested with a mocked backend response, but **not against a
real deployment** — I don't have an Anthropic API key or a hosting
account to test with. Once you've deployed it, upload a real estimate
screenshot and check the extracted fields are actually right before
relying on it.

## What you need to do

### 1. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign
   up (or log in) with your own account.
2. Add a payment method under Billing — this is pay-as-you-go, and each
   screenshot read costs a small fraction of a cent to a few cents
   depending on the model, not a subscription.
3. Under **API Keys**, create a new key and copy it somewhere safe. You
   won't be able to see it again after this.

### 2. Deploy the backend to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up/log in — the
   easiest way is "Continue with GitHub" using the account this repo is
   under.
2. Click **Add New → Project**, and import the `Fostersfencingapp`
   repository.
3. Vercel will auto-detect the `api/` folder and deploy it as a
   serverless function. You can leave the build settings as default —
   there's no build step, it just needs to deploy.
4. Before (or after) the first deploy, go to **Project Settings →
   Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = the key you copied in step 1.
   - (Optional) `ANTHROPIC_MODEL` — only set this if you want to pin a
     specific model; it defaults to a current Claude model otherwise.
5. Deploy (or redeploy, if you added the env var after the first deploy —
   env vars only apply to deployments made after they're added).
6. Once it's live, your endpoint URL will be something like:
   `https://fostersfencingapp.vercel.app/api/read-quote-screenshot`
   (Vercel shows you the exact URL on the project's Deployments page.)

### 3. Wire it into the page

Give me that URL and I'll set `OCR_ENDPOINT` in
`demo/quote-scheduler.html` to it, commit, and push — or you can edit it
yourself: it's the `const OCR_ENDPOINT = "";` line near the top of the
`<script>` block in that file.

### 4. Test it

Upload a real Invoice2go estimate screenshot to any quote card. You
should see "Reading screenshot…", then an editable review box with what
it read. Check the details are actually correct before clicking "Apply
to card" — if anything's off, fix it in the review box first, or just
discard and update the card by hand.

## Costs and limits to know about

- Every screenshot read is a real API call and costs real (small) money.
  There's no cap built in — if you want a budget guardrail, set a usage
  limit in the Anthropic Console under Billing.
- The Vercel free tier is generous for this kind of low-traffic personal
  tool and should cost nothing.
- The API key only ever lives in Vercel's environment variables — it's
  never in this repo, never sent to the browser, and never visible to
  anyone looking at the page's source.
