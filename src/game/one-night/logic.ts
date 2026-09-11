// One Night Ultimate Werewolf rules engine. Pure logic, no network, no UI.
//
// Game design: Ted Alspach / Bezier Games. This is an unofficial fan
// implementation with original code and wording (game mechanics themselves
// are not copyrightable). No affiliation with Bezier Games.
// Canonical refs: Bezier rulebook (setup, call order, win conditions).
//
// Deliberate scope: base-deck roles only. Doppelganger is excluded (its
// view-and-immediately-act night action breaks the simultaneous-pick model)
// and Witch is a Miller's Hollow role, not an ONUW role. Both documented in
// docs/one-night.md.
export type ONURole =
  | 'werewolf'
  | 'minion'
  | 'mason'
  | 'seer'
  | 'robber'
  | 'troublemaker'
  | 'drunk'
  | 'insomniac'
  | 'villager'
  | 'hunter'
  | 'tanner';

/** Card slots: one per player peerId plus three center slots. */
export const CENTER = ['c0', 'c1', 'c2'] as const;

export type Cards = Record<string, ONURole>;

export function isWolfPack(role: ONURole): boolean {
  return role === 'werewolf' || role === 'minion';
}

/**
 * Recommended pool: ALWAYS players+3 cards (3 go to the center).
 * 3-5p pools are the verified official basic setup (WWx2, Seer, Robber,
 * Troublemaker + Villagers). 6-10p pools are house-recommended progressions
 * (official 6+ table unverified) — adjustable later via a pool picker.
 */
export function recommendedPool(totalPlayers: number): ONURole[] {
  if (totalPlayers < 3 || totalPlayers > 10)
    throw new Error('One Night needs 3-10 players');
  const pool: ONURole[] = [
    'werewolf',
    'werewolf',
    'seer',
    'robber',
    'troublemaker',
    'villager',
  ];
  const extra: Record<number, ONURole[]> = {
    4: ['villager'],
    5: ['villager', 'villager'],
    6: ['villager', 'tanner', 'drunk'],
    7: ['werewolf', 'tanner', 'drunk', 'hunter'],
    8: ['werewolf', 'tanner', 'drunk', 'hunter', 'minion'],
    9: ['werewolf', 'drunk', 'hunter', 'minion', 'mason', 'mason'],
    10: ['werewolf', 'drunk', 'hunter', 'minion', 'mason', 'mason', 'insomniac'],
  };
  pool.push(...(extra[totalPlayers] ?? []));
  return pool;
}

/** Shuffle the pool, deal one card per player (in order), rest to center. */
export function deal(
  pool: ONURole[],
  playerIds: string[],
  shuffle: <T>(arr: T[]) => T[] = randomShuffle,
): Cards {
  if (pool.length !== playerIds.length + 3)
    throw new Error(
      `Pool must be players+3 cards (got ${pool.length} for ${playerIds.length} players)`,
    );
  const deck = shuffle([...pool]);
  const cards: Cards = {};
  playerIds.forEach((id, i) => {
    cards[id] = deck[i];
  });
  CENTER.forEach((c, i) => {
    cards[c] = deck[playerIds.length + i];
  });
  return cards;
}

export function randomShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** PeerIds currently holding werewolf cards. */
export function wolfPack(cards: Cards, playerIds: string[]): string[] {
  return playerIds.filter((id) => cards[id] === 'werewolf');
}

/** PeerIds currently holding mason cards. */
export function masons(cards: Cards, playerIds: string[]): string[] {
  return playerIds.filter((id) => cards[id] === 'mason');
}

export interface NightInputs {
  /** lone wolf only: which center slot to peek */
  loneWolfCenter: number | null;
  /** seer: player target OR center pair (exclusive; player wins ties) */
  seerPlayer: string | null;
  seerCenter: [number, number] | null;
  robberTarget: string | null;
  troublePair: [string, string] | null;
  drunkCenter: number | null;
}

export const emptyInputs = (): NightInputs => ({
  loneWolfCenter: null,
  seerPlayer: null,
  seerCenter: null,
  robberTarget: null,
  troublePair: null,
  drunkCenter: null,
});

export interface NightResult {
  final: Cards;
  /** private views, keyed by viewing player */
  seen: Record<string, ONURole[]>;
}

const centerRole = (cards: Cards, i: number): ONURole => cards[CENTER[i]];

/**
 * Resolve the night in official call order:
 * Werewolves (info) -> Minion (info) -> Masons (info) -> Seer (view) ->
 * Robber (swap+view) -> Troublemaker (swap blind) -> Drunk (swap blind) ->
 * Insomniac (view final). Invalid inputs are ignored, never throw.
 */
export function resolveNight(
  initial: Cards,
  playerIds: string[],
  inputs: NightInputs,
): NightResult {
  const cards: Cards = { ...initial };
  const seen: Record<string, ONURole[]> = {};

  const playersHolding = (role: ONURole): string[] =>
    playerIds.filter((id) => cards[id] === role);

  // Seer views pre-swap cards.
  const seers = playersHolding('seer');
  if (seers.length > 0) {
    const by = seers[0];
    if (inputs.seerPlayer && playerIds.includes(inputs.seerPlayer)) {
      seen[by] = [cards[inputs.seerPlayer]];
    } else if (inputs.seerCenter) {
      const [a, b] = inputs.seerCenter;
      if (
        Number.isInteger(a) &&
        Number.isInteger(b) &&
        a !== b &&
        a >= 0 &&
        a < 3 &&
        b >= 0 &&
        b < 3
      ) {
        seen[by] = [centerRole(cards, a), centerRole(cards, b)];
      }
    }
  }

  // Lone wolf peeks one center card.
  const wolves = playersHolding('werewolf');
  if (
    wolves.length === 1 &&
    Number.isInteger(inputs.loneWolfCenter) &&
    (inputs.loneWolfCenter as number) >= 0 &&
    (inputs.loneWolfCenter as number) < 3
  ) {
    seen[wolves[0]] = [centerRole(cards, inputs.loneWolfCenter as number)];
  }

  // Robber swaps with another player, then views the new card.
  const robbers = playersHolding('robber');
  if (
    robbers.length > 0 &&
    inputs.robberTarget &&
    inputs.robberTarget !== robbers[0] &&
    playerIds.includes(inputs.robberTarget)
  ) {
    const by = robbers[0];
    const t = inputs.robberTarget;
    const tmp = cards[by];
    cards[by] = cards[t];
    cards[t] = tmp;
    seen[by] = [cards[by]];
  }

  // Troublemaker swaps two OTHER players, blind.
  const troublemakers = playersHolding('troublemaker');
  if (troublemakers.length > 0 && inputs.troublePair) {
    const [a, b] = inputs.troublePair;
    const by = troublemakers[0];
    if (
      a !== b &&
      a !== by &&
      b !== by &&
      playerIds.includes(a) &&
      playerIds.includes(b)
    ) {
      const tmp = cards[a];
      cards[a] = cards[b];
      cards[b] = tmp;
    }
  }

  // Drunk swaps own card with a center card, blind.
  const drunks = playersHolding('drunk');
  if (
    drunks.length > 0 &&
    Number.isInteger(inputs.drunkCenter) &&
    (inputs.drunkCenter as number) >= 0 &&
    (inputs.drunkCenter as number) < 3
  ) {
    const by = drunks[0];
    const slot = CENTER[inputs.drunkCenter as number];
    const tmp = cards[by];
    cards[by] = cards[slot];
    cards[slot] = tmp;
  }

  // Insomniac views her own FINAL card.
  const insomniacs = playersHolding('insomniac');
  if (insomniacs.length > 0) {
    // NOTE: evaluated on post-swap holdings — a robbed insomniac is no
    // longer the insomniac. Only the final holder views.
    seen[insomniacs[0]] = [cards[insomniacs[0]]];
  }

  return { final: cards, seen };
}

/**
 * Day vote: most votes dies, ties (or no valid votes) kill nobody.
 * Only votes from living players for living players count.
 */
export function resolveVote(
  votes: Record<string, string>,
  aliveIds: string[],
): string | null {
  const alive = new Set(aliveIds);
  const tally = new Map<string, number>();
  for (const [voter, target] of Object.entries(votes)) {
    if (!alive.has(voter) || !alive.has(target)) continue;
    tally.set(target, (tally.get(target) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  let top: string | null = null;
  let topN = 0;
  let tied = false;
  for (const [target, n] of tally) {
    if (n > topN) {
      top = target;
      topN = n;
      tied = false;
    } else if (n === topN) {
      tied = true;
    }
  }
  return tied ? null : top;
}

/** Hunter's death takes the pointed-at player down too. */
export function applyHunterShot(
  died: string[],
  final: Cards,
  hunterTarget: string | null,
): string[] {
  const out = [...died];
  const hunterDied = died.some((id) => final[id] === 'hunter');
  if (hunterDied && hunterTarget && !out.includes(hunterTarget)) {
    out.push(hunterTarget);
  }
  return out;
}

export interface ONUOutcome {
  winnerIds: string[];
  reasons: string[];
}

/**
 * Final deaths (vote + hunter shot, if any) decide everything:
 * - Tanner died + wolf died -> tanner AND village team win.
 * - Tanner died alone -> ONLY the tanner wins.
 * - Wolf died (no tanner) -> village team wins (dead or alive).
 * - No deaths: wolves exist -> wolf pack wins; else village wins.
 * - Deaths but no wolves exist -> minion wins iff minion is in play
 *   and alive; otherwise nobody (documented edge).
 */
export function checkONUWinner(
  final: Cards,
  playerIds: string[],
  died: string[],
): ONUOutcome {
  const diedSet = new Set(died);
  const diedRoles = died.map((id) => final[id]);
  const tannerDied = diedRoles.includes('tanner');
  const wolfDied = diedRoles.includes('werewolf');
  const wolvesExist = playerIds.some((id) => final[id] === 'werewolf');
  const villageTeam = playerIds.filter(
    (id) => !isWolfPack(final[id]) && final[id] !== 'tanner',
  );
  const pack = playerIds.filter((id) => isWolfPack(final[id]));
  const tanners = playerIds.filter((id) => final[id] === 'tanner');
  void diedSet;

  if (tannerDied && wolfDied) {
    return {
      winnerIds: [...tanners, ...villageTeam],
      reasons: ['Tanner died — tanner wins.', 'A werewolf died — village team wins too.'],
    };
  }
  if (tannerDied) {
    return {
      winnerIds: [...tanners],
      reasons: ['Tanner died and no werewolf did — only the tanner wins.'],
    };
  }
  if (wolfDied) {
    return {
      winnerIds: [...villageTeam],
      reasons: ['A werewolf died — village team wins.'],
    };
  }
  if (wolvesExist) {
    return {
      winnerIds: [...pack],
      reasons: ['No werewolf died — wolf pack wins.'],
    };
  }
  if (died.length === 0) {
    return {
      winnerIds: [...villageTeam],
      reasons: ['No werewolves in play and nobody died — village wins.'],
    };
  }
  const minionAlive = playerIds.find(
    (id) => final[id] === 'minion' && !died.includes(id),
  );
  if (minionAlive) {
    return {
      winnerIds: [minionAlive],
      reasons: ['No werewolves in play — minion wins if a villager died.'],
    };
  }
  return {
    winnerIds: [],
    reasons: ['No werewolves in play and no minion to claim it — nobody wins.'],
  };
}

/** Room codes: readable, no 0/O/1/I. */
export function makeRoomCode(prefix = 'NIGHT'): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}
