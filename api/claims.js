// Vercel serverless function backed by Vercel KV (Upstash Redis REST API).
// Stores which team member — Tim or David — has claimed each enquiry/quote,
// so the checkbox state is shared live across everyone's devices instead of
// being stuck in one browser's local storage.
//
// Requires KV_REST_API_URL and KV_REST_API_TOKEN environment variables,
// set automatically when you connect a Vercel KV database to this project
// (Vercel dashboard → Storage tab). See docs/claims-setup.md.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  if (!res.ok) throw new Error(`KV GET failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.result;
}

async function kvSet(key, value) {
  const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: value
  });
  if (!res.ok) throw new Error(`KV SET failed: ${res.status} ${await res.text()}`);
}

function parseClaims(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({ error: "Server isn't configured with Vercel KV yet." });
    return;
  }

  if (req.method === "GET") {
    const list = (req.query && req.query.list) || "";
    if (list !== "enquiries" && list !== "quotes") {
      res.status(400).json({ error: "Expected ?list=enquiries or ?list=quotes" });
      return;
    }
    try {
      const claims = parseClaims(await kvGet(`claims:${list}`));
      res.status(200).json({ claims });
    } catch (err) {
      res.status(502).json({ error: err.message || "Couldn't read claims." });
    }
    return;
  }

  if (req.method === "POST") {
    const { list, key, claimedBy } = req.body || {};
    if ((list !== "enquiries" && list !== "quotes") || typeof key !== "string" || !key) {
      res.status(400).json({ error: "Expected { list: 'enquiries'|'quotes', key: string, claimedBy }" });
      return;
    }
    // A "::deleted" key stores the ISO timestamp the swipe-delete happened
    // at (not a fixed keyword like "booked"/"done") so the client can compute
    // the 24h auto-purge countdown and restore it exactly via "Undo".
    const isDeletedKey = list === "quotes" && key.endsWith("::deleted");
    if (isDeletedKey) {
      if (claimedBy !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(claimedBy)) {
        res.status(400).json({ error: "claimedBy must be an ISO 8601 UTC timestamp, or null" });
        return;
      }
    } else {
      const validClaims = list === "quotes" ? ["booked", "done"] : ["tim", "david"];
      if (claimedBy !== null && !validClaims.includes(claimedBy)) {
        res.status(400).json({ error: `claimedBy must be ${validClaims.map(v => `"${v}"`).join(" or ")}, or null` });
        return;
      }
    }
    try {
      const claims = parseClaims(await kvGet(`claims:${list}`));
      if (claimedBy === null) delete claims[key];
      else claims[key] = claimedBy;
      await kvSet(`claims:${list}`, JSON.stringify(claims));
      res.status(200).json({ claims });
    } catch (err) {
      res.status(502).json({ error: err.message || "Couldn't save claim." });
    }
    return;
  }

  res.status(405).json({ error: "Use GET or POST" });
};
