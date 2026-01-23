import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const clientId = process.env.VITE_WCL_CLIENT_ID;
  const clientSecret = process.env.VITE_WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return response.status(500).json({ error: 'Server configuration error: Missing API credentials' });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const apiRes = await fetch('https://www.warcraftlogs.com/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!apiRes.ok) {
        throw new Error(`Failed to fetch token: ${apiRes.status}`);
    }

    const data = await apiRes.json();
    response.status(200).json(data);
  } catch (error) {
    console.error("Token fetch error:", error);
    response.status(500).json({ error: 'Failed to fetch access token' });
  }
}
