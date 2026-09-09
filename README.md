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

## Security

Nothing to hack: no server, no database, no accounts, no API keys. The room code doubles as the room password, so only devices holding the QR/link can handshake. Same honesty as any call: players in a room can see each other's IPs. Don't share room codes publicly.
