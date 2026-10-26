const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
});

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
});

const toGoogle = async (params, env, origin) => {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...params,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET
    })
  });
  return json(await res.json(), res.status, origin);
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (!origin || !allowed.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST' || (pathname !== '/token' && pathname !== '/refresh')) {
      return json({ error: 'not_found' }, 404, origin);
    }
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return json({ error: 'invalid_json' }, 400, origin);
    }
    if (pathname === '/token') {
      return toGoogle({
        grant_type: 'authorization_code',
        code: body.code,
        code_verifier: body.code_verifier,
        redirect_uri: body.redirect_uri
      }, env, origin);
    }
    return toGoogle({
      grant_type: 'refresh_token',
      refresh_token: body.refresh_token
    }, env, origin);
  }
};
