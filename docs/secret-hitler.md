# Secret Hitler — shipped

Status: DONE — engine (`src/game/secret-hitler/logic.ts`), table UI
(`src/ui/SecretHitler.tsx`), transport namespaces (`sh*`), themed,
tested. Plays over the same WS-relay connection as One Night.

## Palette (liberal sapphire vs fascist crimson, gold chrome)

- Background: dark ink `#0b0e1a`
- Liberal: sapphire `#2f6fed` / soft `#7aa5ff`
- Fascist: crimson `#d92038` / soft `#ff6b7a`
- Chrome: burnt peach `#FE8254` (buttons, tracker, power glyphs) on deep
  steel blue `#3F5A62` surfaces — the original palette. Liberal sapphire
  and fascist crimson are reserved for game pieces only (policy cards,
  tracks, roles, ballots).
- Hooks in `src/index.css` under `data-game="secret-hitler"`: `.sh-card`,
  `.sh-card-lib`, `.sh-card-fas`, `.sh-gold`. Display type Anton via
  `.font-display`.

## License rules (must follow — verified against secrethitler.com)

Game design by Goat, Wolf, & Cabbage LLC, used under CC BY–NC–SA 4.0.

1. Attribution: credit the creators + link secrethitler.com + note changes
   (the About screen in `src/ui/About.tsx` already does this).
2. Non-commercial: no monetization anywhere. Free GitHub Pages only.
3. Share-alike: everything under `src/game/secret-hitler/` stays CC
   BY–NC–SA 4.0 (see `LICENSE` in that folder). Don't move that code into
   MIT-licensed files.
4. Web-only: NEVER submit anything using their game to any app store.
5. All visuals original (CSS/emoji) — no official card art or text reproduced.

## UI build plan (reuse Werewolf patterns from `src/App.tsx`)

- New Trystero channels: `shpub` (host broadcasts full public state),
  `shrole` (private role + known fascists), `shcards` (private tiles:
  president draw of 3 / chancellor hand of 2 / peek view),
  `shinfo` (private notices like investigate results),
  `shact` (guest → host: nominate, vote, discard, enact, veto, power targets).
- Host holds truth in refs: `roles`, `deck`, `discards`, tiles in transit,
  `votes`, `investigated` set, president order index, special-election return.
- Phases: `nominate` → `vote` → `legis-pres` → `legis-chanc` → `power` →
  back to `nominate`, plus `ended`. Pure transitions live in `logic.ts`:
  `resolveSHElection`, `powerForSlot`, `eligibleChancellors`,
  `checkSHWinner`, `drawThree`, `vetoUnlocked`.
- Edge rules to implement (all in engine already except the flow glue):
  3rd failed election auto-enacts top deck tile with NO power but wins count;
  veto unlocks at 5 fascist policies and counts as a failed election;
  term limits = last elected pair, lifted on chaos or when nobody eligible;
  Hitler-chancellor win only at 3+ fascist policies; executed roles stay
  hidden unless Hitler (liberals win instantly).
- Mid-game rejoin: out of scope. Watchers without a role see a notice.

## Roster table (engine: `shRoleCounts`)

5p: 3L+2F · 6p: 4L+2F · 7p: 4L+3F · 8p: 5L+3F · 9p: 5L+4F · 10p: 6L+4F
(F includes Hitler. Hitler knows the team only in 5–6p games.)
