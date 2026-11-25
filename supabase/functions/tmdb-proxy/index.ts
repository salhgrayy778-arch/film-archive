// Supabase Edge Function: lets visitors in Iran (where api.themoviedb.org is blocked) read TMDB through Supabase.
// The TMDB key lives only in the function secret TMDB_KEY; it is never sent to the browser.
// Deploy with "Verify JWT" turned OFF (the site uses a publishable key, not a JWT).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
// Only the read-only TMDB paths the site really uses.
const ALLOWED = [
  /^\/search\/movie$/,
  /^\/movie\/\d{1,9}$/,
  /^\/movie\/\d{1,9}\/(similar|credits|recommendations)$/,
];
const PARAMS = new Set(['query', 'language', 'page', 'append_to_response', 'year', 'include_adult']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: CORS });
  const key = Deno.env.get('TMDB_KEY');
  if (!key) return new Response(JSON.stringify({ error: 'TMDB_KEY secret is not set' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const src = new URL(req.url);
  const path = src.searchParams.get('path') || '';
  if (!ALLOWED.some((r) => r.test(path))) return new Response(JSON.stringify({ error: 'path not allowed' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const dst = new URL('https://api.themoviedb.org/3' + path);
  for (const [k, v] of src.searchParams) {
    if (PARAMS.has(k) && v.length < 200) dst.searchParams.set(k, v);
  }
  if (key.length > 40) { /* read-access token */ } else dst.searchParams.set('api_key', key);

  try {
    const r = await fetch(dst, { headers: key.length > 40 ? { Authorization: 'Bearer ' + key } : {} });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'upstream failed' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
