const rateLimited = require('./_ratelimit');

// The proxy rebuilds every request from scratch instead of forwarding the
// caller's body, so a caller can't pick a pricier model, raise max_tokens or
// turn on tools. Only the shapes services/api.js sends are accepted.
const ALLOWED_MODEL   = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOKENS      = 1024;
const MAX_MESSAGES    = 20;
const MAX_IMAGES      = 3;
const MAX_TEXT_CHARS  = 20000;
const MAX_IMAGE_CHARS = 1500000; // ~1.1 MB of image per photo, base64
const IMAGE_TYPES     = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function bad(res, message) {
  return res.status(400).json({ error: { message } });
}

// Returns a clean copy of one content block, or null if it isn't allowed.
function cleanBlock(block, counts) {
  if (block?.type === 'text' && typeof block.text === 'string') {
    counts.text += block.text.length;
    return { type: 'text', text: block.text };
  }
  if (block?.type === 'image' && block.source?.type === 'base64') {
    const { media_type, data } = block.source;
    if (!IMAGE_TYPES.has(media_type) || typeof data !== 'string' || data.length > MAX_IMAGE_CHARS) return null;
    counts.images += 1;
    return { type: 'image', source: { type: 'base64', media_type, data } };
  }
  return null;
}

function buildRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid body' };
  const { messages, system } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return { error: 'Invalid messages' };
  }
  if (system !== undefined && typeof system !== 'string') return { error: 'Invalid system' };

  const counts = { text: system ? system.length : 0, images: 0 };
  const clean = [];
  for (const m of messages) {
    if (m?.role !== 'user' && m?.role !== 'assistant') return { error: 'Invalid role' };
    let content;
    if (typeof m.content === 'string') {
      counts.text += m.content.length;
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content.map((b) => cleanBlock(b, counts));
      if (content.some((b) => b === null)) return { error: 'Unsupported content block' };
    } else {
      return { error: 'Invalid content' };
    }
    clean.push({ role: m.role, content });
  }
  if (counts.text > MAX_TEXT_CHARS) return { error: 'Request too long' };
  if (counts.images > MAX_IMAGES) return { error: 'Too many images' };

  const requested = Number.isInteger(body.max_tokens) ? body.max_tokens : MAX_TOKENS;
  const out = {
    model: ALLOWED_MODEL,
    max_tokens: Math.min(Math.max(requested, 1), MAX_TOKENS),
    messages: clean,
  };
  if (system) out.system = system;
  return { request: out };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (rateLimited(req, 'proxy', 30, 10 * 60 * 1000)) {
    return res.status(429).json({ error: { message: 'Too many requests, try again later' } });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: { message: 'AI features are not configured' } });

  const { request, error } = buildRequest(req.body);
  if (error) return bad(res, error);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(request),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: { message: 'Upstream request failed' } });
  }
};
