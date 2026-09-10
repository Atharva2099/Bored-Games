# One Night — build notes

Canonical ruleset: **One Night Ultimate Werewolf** (Ted Alspach / Bezier
Games), verified against the official rulebook (Get Started Guide +
Ravensburger edition): fixed call order, players+3 setup, win conditions
including Tanner/Minion/Hunter edges. This is an unofficial fan
implementation with original code and wording (game mechanics themselves
are not copyrightable). No affiliation with Bezier Games.

## Scope decisions

- **Included:** full base deck minus Doppelganger — Werewolf ×2, Minion,
  Mason ×2, Seer, Robber, Troublemaker, Drunk, Insomniac, Villager ×3,
  Hunter, Tanner. One night, one vote, ties kill nobody, hunter shoots
  back, full-card reveal at dawn.
- **Doppelganger excluded:** its view-and-immediately-act night action
  breaks the simultaneous-pick model (it needs a second input step after
  seeing). Revisit with a two-step night UI if wanted.
- **Witch excluded:** it is a Miller's Hollow role, not an ONUW role —
  there is no official one-night Witch to adapt. Needs an explicit
  house-rule design before adding.
- **Classic multi-night engine** (`src/game/werewolf/`) is superseded but
  still in the tree: shared lobby/transport effect code references its
  types. Delete it once the lobby no longer imports those types.

## Setup pools (3–10 players, always players+3 cards)

- **3–5: verified official basic setup.** 3p = WW×2, Seer, Robber,
  Troublemaker, Villager. 4p adds a Villager, 5p adds two.
- **6–10: house-recommended progression** (official 6+ table unverified):
  6p adds Tanner + Drunk; 7p adds Hunter; 8p adds Minion; 9p adds both
  Masons (dropping a Villager); 10p adds Insomniac. Masons only at 9+,
  per the official note that they run too strong below 7.

## Win rules (engine: `checkONUWinner`)

- Tanner dies + wolf dies → tanner AND village team win.
- Tanner dies alone → ONLY the tanner wins.
- Wolf dies (no tanner) → village team wins, dead or alive.
- No deaths: wolves exist → wolf pack (wolves + minion) wins, else
  village wins.
- Deaths but no wolves exist → minion wins iff in play and alive;
  otherwise nobody (documented edge).
- Hunter-shot deaths count exactly like vote deaths.
