// Vercel Cron target (see vercel.json "crons") — pings the Shopping List's
// Supabase project daily so free-tier Supabase's pause-after-inactivity
// doesn't kick in during a quiet week. Read-only, no side effects beyond
// counting as API activity.
//
// Uses the same public project URL + publishable key already committed in
// demo/shopping-list.html's CONFIG block — see docs/shopping-list-setup.md
// if the shopping list ever moves to a different Supabase project.
const SUPABASE_URL = "https://nqduurkqizasozbflfgv.supabase.co";
const SUPABASE_KEY = "sb_publishable_7QuDreu7JSZTXzj073KTcQ_4pMufzMu";

module.exports = async function handler(req, res) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/shopping_items?select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    res.status(200).json({ ok: response.ok, status: response.status });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || "Ping failed" });
  }
};
