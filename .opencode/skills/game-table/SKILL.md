---
name: game-table
description: Use when adding a new multiplayer party game to Bored Games, or restyling one. Covers the reusable lobby, decision popups, seamless theming, and host-authoritative transport patterns every table follows.
---

# Game table skill

Every game in this repo (One Night, Secret Hitler, Judgement) is built from the same five pieces. Reuse them; do not reinvent them.

## 1. Lobby / team matching (`src/ui/PreDeal.tsx`)

The shared pre-deal lobby. QR invite, live roster, bot management, host-gated seat button with min/max validation.

```tsx
<PreDeal
  game="judgement" // 'sh' | 'one-night' | 'judgement' — drives InvitePanel + theme
  title="Judgement"
  roomCode={roomCode}
  roster={liveRoster.current} // LIVE prop, never a mount snapshot
  min={3} max={8}
  isHost={isHost}
  onSeat={() => dealTable(liveRoster.current)}
  onExit={onExit}
  onAddBot={onAddBot}
  onRemoveBot={onRemoveBot}
/>
```

Rules:
- Game components render `PreDeal` while their internal state is null. The host seats via `dealTable(live)`; guests wait.
- `liveRoster` is a ref mirroring the `initialRoster` prop on every render, read at seat time so late joiners get in.
- Validate seatability in `dealTable` (player count AND physical limits, e.g. cards fit the deck). Return boolean; the seat handler alerts on false.
- Bots are roster entries with `bot: true` and `bot-` peerIds, auto-played by the host. Never add/remove mid-game (roster is fixed at seat time).

## 2. Decision popups (`src/ui/Modal.tsx`)

Decisions and reveals are popups over a dimmed board — never permanent hitbox grids. Exports: `Modal`, `PickCard`, `BallotStamp`, `ModalConfirm`.

- Pattern is always **select-then-confirm**: pick inside the modal, one orange CONFIRM commits. Never act on first tap.
- Host-only controls that must stay visible (e.g. close-vote) stay small and inline outside the modal.
- Private info (roles, policy hands) only ever renders from the player's own targeted messages, never from public state.
- Modal styling is fixed (ink card, cream text, Cinzel title) — per-game flavor comes from the trigger buttons, not the popup.
- Center-stage boards (`src/ui/ShBoard.tsx` pattern): full-width illustrated bands in palette gradients with live slots (enacted fills with art, empties show dotted placeholders + power glyphs), piles/distribution strip on top. Boards are original art direction — never lift publisher board images.

## 3. Seamless aesthetic (no boxes)

Sections flow as one page. Panels are transparent; structure comes from hairline rules, one per game scope in `src/index.css`:

```css
[data-game='<game>'] .panel { background: transparent; border: none; box-shadow: none; ... }
[data-game='<game>'] .panel::before { /* 1px gradient hairline */ }
[data-game='<game>'] .cut { clip-path: none; }
```

Only actual game pieces (cards, track tiles, chips, avatars) keep frames. Control chips get minimal tinted borders, never boxy outlines.

## 4. Per-game theming (`src/index.css`, `index.html`)

Everything themeable lives in CSS vars scoped by `data-game`, which App sets on the room root:

- `--bg`, `--panel`, `--accent`, `--accent-ink` drive page, panels, `.btn-accent`.
- `--avatar-ring`, `--avatar-bg`, `--avatar-bot`, `--avatar-bot-bg` drive `Roster.tsx` (which reads them with hardcoded fallbacks — new games get sensible defaults free).
- `.font-display` is scoped per game (Anton / Cinzel / Fraunces). Body font: keep the system stack unless the game has a real voice (Outfit for Judgement). Load new families in `index.html`.
- Flipping hardcoded light-text for a light theme: add scoped utility overrides (`[data-game='x'] .text-white\/60 { ... }`), never edit shared components' classes. Enumerate actual classes with `rg -o "(text|bg|border)-(white|black)(/[0-9]+)?"`.
- Derived art (e.g. policy PNGs) is recolored with Pillow hue-remap scripts; record every change in the folder's LICENSE note (CC BY-NC-SA requires stating changes).

## 5. Host-authoritative transport (no self-echo)

- The relay delivers to OTHER peers only. The host MUST apply its own actions directly (`doAct(msg, selfId)`); guests send over the wire. Copy One Night's `act()` helper verbatim.
- Private state (hands, roles) goes out via targeted `send(payload, peerId)`; public state broadcasts. Guests cache private hands in localStorage for refresh survival.
- Host refresh recovery (`restoreSaved`): rekey the host peer AND remap every peer-keyed pointer (turn/leader/president/chancellor IDs). Any pointer naming a peer absent from the roster resolves to the host seat — saves can be generations stale.
- Exit-to-lobby: App bumps `resetToken`; each game clears internal state + saves on change (games ignore `pub.phase` by design).
- Bots act through validated `doAct` directly with random legal moves — never through UI handlers.

## 6. Verification before ship

`npx tsc --noEmit`, `npm test`, `npm run build`, then a live browser pass (Helium via the Chrome-path shim if no Chrome installed): create room → bots → seat → play one full round/phase → screenshot. Browser misses are real bugs — this skill's patterns (self-echo, pointer remap, exit reset) were all found that way.
