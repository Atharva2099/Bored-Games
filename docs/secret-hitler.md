# Secret Hitler — build instructions (do this when we make it)

Status: rules engine DONE (`src/game/secret-hitler/logic.ts`, 14/14 tests
passing). UI + P2P wiring NOT done. The Werewolf room/QR/transport system
is the template to reuse.

## Palette (Burnt Peach + Deep Steel Blue)

- Accent: Burnt Peach `#FE8254`
- Background: Deep Steel Blue `#3F5A62`
- Hooks already exist in `src/index.css`: wrap SH screens in
  `data-game="secret-hitler"` and use `className="btn-accent"` for primary
  buttons. No new theme code needed — just use the attributes.

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
