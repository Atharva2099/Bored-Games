// Cloudflare Worker: mints short-lived TURN credentials for the Bored Games
// WebRTC client, so the Cloudflare Realtime API token never ships in the
// public Vite bundle. The client only ever talks to this Worker's `GET /`;
// this Worker is the only thing that ever sees TURN_API_TOKEN.
//
// Required secrets (set with `wrangler secret put`, never in this file or
// wrangler.toml):
//   TURN_KEY_ID     - Cloudflare Realtime TURN key ID
//   TURN_API_TOKEN  - Cloudflare Realtime TURN API token (bearer token)

// Only these origins are allowed to call this Worker. Any other Origin gets
// no CORS header at all, so the browser blocks the response client-side.
const ALLOWED_ORIGINS = new Set([
  'https://atharva2099.github.io',
  'http://localhost:5173',
]);

function corsHeaders(origin) {
  const headers = {};
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  headers['Access-Control-Max-Age'] = '86400';
  return headers;
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

// The Cloudflare Realtime TURN credential-generation endpoint has changed
// response shape between API revisions, and this was NOT verified against a
// live account while writing this Worker. Handle both plausible shapes and
// normalise to a single array so the client never has to guess:
//   (a) { "iceServers": { "urls": [...], "username": "...", "credential": "..." } }
//   (b) { "iceServers": [ {...}, {...} ] }
function normaliseIceServers(upstreamBody) {
  const ice = upstreamBody && upstreamBody.iceServers;
  if (Array.isArray(ice)) return ice;
  if (ice && typeof ice === 'object') return [ice];
  return [];
}

// Best-effort per-IP throttle using the Cache API (no KV binding, no cost).
// A legitimate player mints credentials once per game; this only stops a
// script hammering the endpoint to burn the monthly quota. It is per-colo,
// not global, so treat it as a dampener rather than a hard guarantee.
const RATE_LIMIT_PER_MINUTE = 12;

async function overRateLimit(request) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return false;
  const minute = Math.floor(Date.now() / 60000);
  const key = new Request(`https://ratelimit.invalid/${encodeURIComponent(ip)}/${minute}`);
  const cache = caches.default;
  try {
    const hit = await cache.match(key);
    const count = hit ? Number(await hit.text()) || 0 : 0;
    if (count >= RATE_LIMIT_PER_MINUTE) return true;
    await cache.put(
      key,
      new Response(String(count + 1), {
        headers: { 'Cache-Control': 'max-age=60' },
      }),
    );
    return false;
  } catch {
    // Never let the throttle itself break credential minting.
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // CORS preflight for GET /
    if (request.method === 'OPTIONS' && url.pathname === '/') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only GET / is served; everything else 404s.
    if (request.method !== 'GET' || url.pathname !== '/') {
      return new Response('Not found', { status: 404 });
    }

    // HARD-BLOCK on Origin, not just CORS-header omission.
    // CORS is enforced by the BROWSER, not by us: omitting
    // Access-Control-Allow-Origin stops another *web page* from reading the
    // response, but a plain `curl` sends no Origin, ignores CORS completely,
    // and would happily walk off with working credentials. The Worker URL is
    // inlined into the public JS bundle, so it is not a secret. Refusing
    // requests whose Origin is absent or not allow-listed is what actually
    // turns casual scraping away.
    //
    // Be clear-eyed about the limit: an Origin header is trivially spoofed
    // (`curl -H 'Origin: https://atharva2099.github.io'`). This is a speed
    // bump, not authentication. The real backstops are the short credential
    // TTL below, the rate limit, and Cloudflare's own 1TB/month cap.
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (await overRateLimit(request)) {
      return jsonResponse({ error: 'rate limited' }, 429, origin);
    }

    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
      console.error('turn-worker: missing TURN_KEY_ID or TURN_API_TOKEN secret');
      return jsonResponse(
        { error: 'server misconfigured: missing TURN credentials' },
        500,
        origin,
      );
    }

    let upstreamRes;
    try {
      upstreamRes = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.TURN_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          // 1 hour, not 24. A credential scraped from the bundle expires
          // fast, and a game session never needs longer than this.
          body: JSON.stringify({ ttl: 3600 }),
        },
      );
    } catch (err) {
      console.error('turn-worker: fetch to Cloudflare TURN API failed', err);
      return jsonResponse(
        { error: 'failed to reach Cloudflare TURN API', detail: String(err) },
        502,
        origin,
      );
    }

    const bodyText = await upstreamRes.text();

    if (!upstreamRes.ok) {
      console.error(
        `turn-worker: Cloudflare TURN API returned ${upstreamRes.status}: ${bodyText}`,
      );
      return jsonResponse(
        {
          error: 'upstream TURN credential request failed',
          upstreamStatus: upstreamRes.status,
          upstreamBody: bodyText,
        },
        502,
        origin,
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch (err) {
      console.error('turn-worker: could not parse upstream JSON', bodyText);
      return jsonResponse(
        { error: 'upstream returned non-JSON body', upstreamBody: bodyText },
        502,
        origin,
      );
    }

    const iceServers = normaliseIceServers(parsed);
    return jsonResponse({ iceServers }, 200, origin);
  },
};
