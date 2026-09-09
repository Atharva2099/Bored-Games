# bored-games-turn — Cloudflare Worker

Mints short-lived Cloudflare Realtime TURN credentials so the Bored Games
client can relay WebRTC traffic when a direct peer-to-peer path is
impossible (e.g. two phones both behind symmetric/carrier NAT). The
Cloudflare API token lives only in this Worker's secrets — it never ships in
the client bundle.

## 1. Create a TURN key in the Cloudflare dashboard

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Go to **Realtime** (sometimes listed as **Calls**) → **TURN**.
3. Create a new TURN key. Cloudflare will show you:
   - a **Key ID** (this is `TURN_KEY_ID`)
   - an **API token** (this is `TURN_API_TOKEN`) — copy it now, it is
     typically only shown once.

## 2. Install Wrangler and log in

```sh
npm install -g wrangler   # or use `npx wrangler ...` for every command below
wrangler login
```

## 3. Set the secrets

Run these from the `worker/` directory (where `wrangler.toml` lives):

```sh
cd worker
wrangler secret put TURN_KEY_ID
# paste the Key ID from step 1, press enter

wrangler secret put TURN_API_TOKEN
# paste the API token from step 1, press enter
```

## 4. Deploy

```sh
wrangler deploy
```

This prints the Worker's URL, something like:
`https://bored-games-turn.<your-subdomain>.workers.dev`

## 5. Test it

```sh
curl https://bored-games-turn.<your-subdomain>.workers.dev/
```

You should get back JSON with an `iceServers` array, e.g.:

```json
{ "iceServers": [ { "urls": [...], "username": "...", "credential": "..." } ] }
```

If instead you get a 502 with an `upstreamStatus` / `upstreamBody` field,
that is the raw Cloudflare API response — use it to diagnose what went
wrong (bad key ID, expired token, etc).

## 6. Point the client at it

Set `VITE_TURN_ENDPOINT` to this Worker's URL in the main app's `.env` (see
`.env.example` at the repo root) **before** running `npm run build` /
`npm run deploy` — Vite inlines this value at build time, it is not read at
runtime.

## Notes

- The free tier of Cloudflare Realtime TURN includes 1 TB/month of relayed
  traffic. TURN only carries traffic when a direct P2P connection could not
  be established; most games will still connect peer-to-peer and use
  little or none of this quota.
- **The exact Cloudflare API response shape (single `iceServers` object vs.
  array of objects) was NOT verified against a live Cloudflare account
  while writing this Worker** — the two response revisions documented by
  Cloudflare over time differ, and this Worker normalises defensively for
  both rather than assuming one. If credential generation ever fails, the
  Worker's error response includes the raw upstream status and body so it
  can be diagnosed without guessing.
