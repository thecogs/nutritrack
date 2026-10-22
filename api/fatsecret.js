const rateLimited = require('./_ratelimit');

// Only food search is exposed. The caller used to be able to choose any
// FatSecret API method; now `method` is fixed and the query is length-capped.
const MAX_QUERY_CHARS = 100;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (rateLimited(req, 'fatsecret', 60, 10 * 60 * 1000)) {
    return res.status(429).json({ error: { message: 'Too many requests, try again later' } });
  }

  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(503).json({ error: { message: 'FatSecret search is not configured' } });
  }

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query || query.length > MAX_QUERY_CHARS) {
    return res.status(400).json({ error: { message: 'Invalid query' } });
  }

  try {
    // 1. Get OAuth Token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials&scope=basic'
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error('Failed to get FatSecret token');
    }

    // 2. Fetch Data
    const params = new URLSearchParams({
      method: 'foods.search',
      search_expression: query,
      format: 'json',
      max_results: '5'
    });

    const dataResponse = await fetch(`https://platform.fatsecret.com/rest/server.api?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    const data = await dataResponse.json();
    res.status(dataResponse.status).json(data);
  } catch (err) {
    res.status(502).json({ error: { message: 'FatSecret request failed' } });
  }
};
