// Best-effort per-IP rate limit. Files starting with "_" in api/ are not
// deployed as functions. The counts live in memory, so each warm instance
// keeps its own and they reset on cold start: this slows abuse down, it does
// not stop it. Vercel Deployment Protection and an Anthropic spend limit are
// the real controls.

const hits = new Map();

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
}

// Returns true when the caller is over `limit` requests in the last `windowMs`.
module.exports = function rateLimited(req, bucket, limit, windowMs) {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) {
    hits.set(key, { start: now, count: 1 });
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
};
