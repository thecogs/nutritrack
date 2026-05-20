module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: { message: 'FatSecret credentials not set' } });
  }

  const { query, method = 'foods.search' } = req.body;

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
      throw new Error(tokenData.error_description || 'Failed to get FatSecret token');
    }
    
    // 2. Fetch Data
    const params = new URLSearchParams({
      method: method,
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
    res.status(500).json({ error: { message: err.message } });
  }
};
