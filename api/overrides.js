// Vercel serverless function backed by Vercel KV (Upstash Redis REST API).
// Stores the client details read off a quote's screenshot (who/location/
// note) per quote id, so applying a screenshot read on one device updates
// the card the same way on every device — same store as api/claims.js,
// just a different key namespace. See docs/claims-setup.md (same KV
// database covers both).
//
// Note: this only syncs the extracted text, not the screenshot image
// itself — images stay local to whichever device uploaded them, to avoid
// pushing large payloads through a small key-value store.

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

function parseOverrides(raw) {
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
    try {
      const overrides = parseOverrides(await kvGet("overrides:quotes"));
      res.status(200).json({ overrides });
    } catch (err) {
      res.status(502).json({ error: err.message || "Couldn't read overrides." });
    }
    return;
  }

  if (req.method === "POST") {
    const { key, override } = req.body || {};
    if (typeof key !== "string" || !key) {
      res.status(400).json({ error: "Expected { key: string, override: {who, location, note} | null }" });
      return;
    }
    if (override !== null && (typeof override !== "object" || Array.isArray(override))) {
      res.status(400).json({ error: "override must be an object or null" });
      return;
    }
    try {
      const overrides = parseOverrides(await kvGet("overrides:quotes"));
      if (override === null) delete overrides[key];
      else {
        overrides[key] = {
          who: typeof override.who === "string" ? override.who : "",
          location: typeof override.location === "string" ? override.location : "",
          note: typeof override.note === "string" ? override.note : ""
        };
      }
      await kvSet("overrides:quotes", JSON.stringify(overrides));
      res.status(200).json({ overrides });
    } catch (err) {
      res.status(502).json({ error: err.message || "Couldn't save override." });
    }
    return;
  }

  res.status(405).json({ error: "Use GET or POST" });
};
