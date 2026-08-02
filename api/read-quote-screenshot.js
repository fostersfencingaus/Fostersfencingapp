// Vercel serverless function. Takes a screenshot of an Invoice2go estimate
// (as a data URL) and asks Claude to read the client name, phone, email,
// site address, and job/price summary off it, returning that as JSON for
// the quote-scheduler page to offer as an editable auto-fill.
//
// Requires an ANTHROPIC_API_KEY environment variable, set in the Vercel
// project's settings — never in this file or in the browser. See
// docs/screenshot-ocr-setup.md for how to get a key and deploy this.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

const EXTRACTION_PROMPT = `This is a screenshot of an Invoice2go estimate/quote for a fencing job. Read it and extract:

- who: the client's name, and phone and/or email if visible (format: "Name — phone — email", omitting any part that isn't visible)
- location: the job site address, as precisely as shown
- note: a one or two sentence summary of the job (what's being supplied/installed/removed) and the total price if shown

Respond with ONLY a JSON object with exactly these three keys (who, location, note), no other text. If a field genuinely isn't visible in the image, use an empty string for it.`;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server isn't configured with an ANTHROPIC_API_KEY yet." });
    return;
  }

  const { image } = req.body || {};
  const match = typeof image === "string" && image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "Expected { image: \"data:image/...;base64,...\" }" });
    return;
  }
  const [, mediaType, base64Data] = match;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
              { type: "text", text: EXTRACTION_PROMPT }
            ]
          }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      res.status(502).json({ error: "Anthropic API error: " + errText.slice(0, 500) });
      return;
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map(block => block.text || "").join("").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(502).json({ error: "Couldn't parse a response from the model." });
      return;
    }

    const extracted = JSON.parse(jsonMatch[0]);
    res.status(200).json({
      who: typeof extracted.who === "string" ? extracted.who : "",
      location: typeof extracted.location === "string" ? extracted.location : "",
      note: typeof extracted.note === "string" ? extracted.note : ""
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error reading the screenshot." });
  }
};
