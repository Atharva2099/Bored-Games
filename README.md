# Bored Games — Werewolf

Free browser party games. No server, no sign-up. Host creates a room code, everyone joins from their phone.

## Play

```sh
npm install
npm run dev
```

Host taps **Create**, shares the QR/code. Guests open the link, tap **Join**.

## Test + build

```sh
npm test
npm run build
npm run deploy   # publish dist/ to GitHub Pages
```

## How it works

Static site + peer-to-peer rooms (`@trystero-p2p/nostr`). Host holds the true game state and deals each player only their own role. Pure rules live in `src/game/werewolf/logic.ts`.

## Connections (TURN)

WebRTC needs a relay when two players' networks refuse a direct path — common
on mobile data and on routers that won't hairpin. Measured on a real device,
this app produced only `srflx` ICE candidates (no `host`, no `relay`) and
Trystero reported `could not connect to peer after exchanging SDP`. Signalling
was fine; the media path was not. Every free *anonymous* TURN service was
tested and is dead, so credentials are minted by a small Cloudflare Worker.

See [`worker/README.md`](worker/README.md) to deploy it (free tier, 1TB/month).
Then set the endpoint before building:

```sh
cp .env.example .env      # then edit VITE_TURN_ENDPOINT
npm run deploy
```

`VITE_TURN_ENDPOINT` is inlined by Vite at **build** time, so it must be set
when `npm run build` / `npm run deploy` runs — setting it afterwards does
nothing. With it unset the app still builds and runs, just without TURN:
players who need a relay won't connect. The in-app Diagnostics panel (the
`((•))` icon) shows whether TURN credentials were actually obtained.

## Security

Nothing to hack: no server, no database, no accounts, no API keys. The room code doubles as the room password, so only devices holding the QR/link can handshake. Same honesty as any call: players in a room can see each other's IPs. Don't share room codes publicly.
