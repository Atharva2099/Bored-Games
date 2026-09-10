# bored-games-room

A Cloudflare Worker + Durable Object that relays WebSocket messages between
players in a room, so the game no longer needs WebRTC/TURN. Every player
opens ONE `wss://` connection to this Worker; the Durable Object for that
room code fans messages out to everyone else. For a 10-player game this
turns a ~45-connection WebRTC mesh into a 9-connection star, and removes NAT
traversal entirely for this relay path.

This is a **separate** Worker from `worker/` (the TURN credential minter).
It does not touch `worker/`, `src/`, or the root Vite app.

## Deploy

```sh
cd room-worker
npx wrangler deploy
```

Wrangler will print the deployed URL, something like:

```
https://bored-games-room.<your-subdomain>.workers.dev
```

That's it — no secrets, no environment variables, no extra bindings beyond
what's already in `wrangler.toml`. `npx wrangler deploy` reads
`wrangler.toml` and `room-worker.js` from the current directory and applies
the Durable Object migration (`new_sqlite_classes`, see below) on first
deploy.

## Smoke-testing the WebSocket

From a machine with `websocat` (`brew install websocat`) or similar:

```sh
# Must send an allow-listed Origin header, or you'll get a 403.
websocat -H "Origin: http://localhost:5173" \
  "wss://bored-games-room.<your-subdomain>.workers.dev/room/TESTROOM"
```

You should immediately receive:

```json
{"t":"welcome","self":"<random-peer-id>","peers":[]}
```

Open a second connection to the same room code in another terminal and the
first connection should receive:

```json
{"t":"join","peer":"<second-peer-id>"}
```

Send a broadcast message from either connection:

```json
{"t":"msg","ns":"chat","data":"hello"}
```

The other connection(s) should receive it back with `from` stamped to the
sender's peer id — the server never trusts a client-supplied `from`.

Sanity checks worth trying by hand:
- Connecting with no `Origin` header, or an origin not in the allowlist
  (`https://atharva2099.github.io` / `http://localhost:5173`), should get a
  `403`.
- `GET /room/ab` (2 chars) or `GET /room/bad_code!` should get a `400`
  (room codes must be `[A-Z0-9-]{3,24}`).
- Closing a connection should make every other peer in that room receive
  `{"t":"leave","peer":"<that-peer-id>"}`.

If something doesn't behave as expected once deployed, run:

```sh
npx wrangler tail
```

from `room-worker/` while reproducing the issue — this streams live logs
and uncaught exceptions from the running Worker/Durable Object.

## Why it's built this way

**One Durable Object per room, via `idFromName`.** `env.ROOMS.idFromName(CODE)`
is a deterministic function of the room code string: the same code always
resolves to the same Durable Object ID everywhere on Cloudflare's network,
for every player in that room, from any Cloudflare colo. That's what makes
a plain room *code* (no separate lookup/registration step) work as the
sharding key — there's no coordination needed beyond players typing in the
same code.

**Why the WebSocket Hibernation API is required.** Without hibernation, a
Durable Object stays resident in memory (and billed) for as long as any
WebSocket to it is open — i.e. for the whole length of a game session. With
hibernation (`state.acceptWebSocket(server)` instead of `server.accept()`,
plus reading identity via `serializeAttachment`/`deserializeAttachment`
instead of instance fields), Cloudflare can evict the object between
messages and only bills *duration* while a handler (`webSocketMessage`,
`webSocketClose`, etc.) is actually executing. A long-running but mostly
idle game (players thinking, talking, taking turns) would otherwise burn
through the free plan's duration budget in minutes instead of using almost
none of it.

**Why `new_sqlite_classes`, not `new_classes`, in the migration.**
Durable Objects have two storage backends: the original key-value backend
and the newer SQLite-backed one. Only the SQLite-backed backend is
available on the Workers **FREE** plan; the key-value backend requires
Workers Paid. Declaring the class with `new_classes` in `wrangler.toml`
would provision it on the key-value backend, which fails (or forces an
upgrade) on a free account. `new_sqlite_classes` is what keeps this
deployable on free tier.

**Free tier limits to be aware of:**
- 100,000 requests/day (each WebSocket upgrade request counts once).
- Incoming WebSocket messages are billed at a 20:1 ratio against the
  request quota (i.e. 20 incoming messages ≈ 1 request for billing
  purposes) — outgoing/relayed messages from the Durable Object don't count
  against this, only messages *received* from clients do.
- 13,000 GB-second/day Durable Object duration budget, which is why
  Hibernation (above) matters — it's what keeps typical game-session usage
  far under this.

## Not yet verified

This Worker was **not verified against a live Cloudflare deployment** at
authoring time — it was written and syntax-checked (`node --check
room-worker.js`) locally, but never actually `wrangler deploy`'d or
connected to. In particular, double-check after a real deploy:
- The exact shape/behavior of `webSocketClose`/`webSocketError` args across
  Wrangler/runtime versions.
- That `WebSocketRequestResponsePair` (used for ping/pong auto-response) is
  available under the `compatibility_date` pinned in `wrangler.toml` — bump
  the date and redeploy if `wrangler dev`/`deploy` complains it's undefined.
- Actual behavior under the 12-socket room cap (closing with code `1013`,
  reason `room full`) from a real browser `WebSocket` client, since some
  runtimes only clean-close from the client side.

Use `npx wrangler tail` (see above) to catch anything that doesn't match
this document once it's actually deployed.
