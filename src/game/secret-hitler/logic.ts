// Pure Secret Hitler rules engine. No network, no UI.
// Game design by Goat, Wolf, & Cabbage LLC, used here under CC BY-NC-SA 4.0
// (see LICENSE in this folder). All code below is original.
export type SHRole = 'liberal' | 'fascist' | 'hitler';
export type SHWinner = 'liberals' | 'fascists';
export type Policy = 'liberal' | 'fascist';
export type Power = 'investigate' | 'special' | 'peek' | 'execution';

export const LIB_POLICIES = 6;
export const FAS_POLICIES = 11;

/** Fascist headcount INCLUDES Hitler. 5..10 players only. */
export function shRoleCounts(total: number): {
  liberals: number;
  fascists: number;
} {
  const table: Record<number, { liberals: number; fascists: number }> = {
    5: { liberals: 3, fascists: 2 },
    6: { liberals: 4, fascists: 2 },
    7: { liberals: 4, fascists: 3 },
    8: { liberals: 5, fascists: 3 },
    9: { liberals: 5, fascists: 4 },
    10: { liberals: 6, fascists: 4 },
  };
  const out = table[total];
  if (!out) throw new Error('Secret Hitler needs 5-10 players');
  return out;
}

/** Deck: 1 Hitler, (fascists-1) fascists, rest liberals. */
export function assignSHRoles(
  playerIds: string[],
  shuffle: <T>(arr: T[]) => T[] = randomShuffle,
): Record<string, SHRole> {
  const { liberals, fascists } = shRoleCounts(playerIds.length);
  const deck: SHRole[] = ['hitler'];
  for (let i = 0; i < fascists - 1; i++) deck.push('fascist');
  for (let i = 0; i < liberals; i++) deck.push('liberal');
  const shuffled = shuffle([...deck]);
  const out: Record<string, SHRole> = {};
  playerIds.forEach((id, i) => {
    out[id] = shuffled[i];
  });
  return out;
}

export function randomShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface SHKnowledge {
  hitlerId: string;
  fascistIds: string[];
  /** In 5-6p games Hitler also knows the fascists. */
  hitlerKnowsTeam: boolean;
  /** Peer IDs this player is told are fascists (Hitler revealed to fascists). */
  knownFascistsFor: (playerId: string) => string[];
}

export function shKnowledge(
  roles: Record<string, SHRole>,
): SHKnowledge {
  const ids = Object.keys(roles);
  const hitlerId = ids.find((id) => roles[id] === 'hitler')!;
  const fascistIds = ids.filter((id) => roles[id] === 'fascist');
  const hitlerKnowsTeam = ids.length <= 6;
  return {
    hitlerId,
    fascistIds,
    hitlerKnowsTeam,
    knownFascistsFor: (playerId: string) => {
      const r = roles[playerId];
      if (r === 'fascist') return [hitlerId];
      if (r === 'hitler' && hitlerKnowsTeam) return [...fascistIds];
      return [];
    },
  };
}

/** Fresh shuffled 17-tile policy deck. */
export function buildPolicyDeck(
  shuffle: <T>(arr: T[]) => T[] = randomShuffle,
): Policy[] {
  const deck: Policy[] = [];
  for (let i = 0; i < LIB_POLICIES; i++) deck.push('liberal');
  for (let i = 0; i < FAS_POLICIES; i++) deck.push('fascist');
  return shuffle(deck);
}

export interface DrawResult {
  drawn: Policy[];
  deck: Policy[];
  discards: Policy[];
}

/**
 * Draw 3 for a legislative session. Reshuffles discards when the draw
 * pile is short — discards return to the deck, matching official rules.
 */
export function drawThree(
  deck: Policy[],
  discards: Policy[],
  shuffle: <T>(arr: T[]) => T[] = randomShuffle,
): DrawResult {
  let d = [...deck];
  let pile = [...discards];
  if (d.length < 3) {
    d = shuffle([...d, ...pile]);
    pile = [];
  }
  const drawn = d.slice(0, 3);
  return { drawn, deck: d.slice(3), discards: pile };
}

/**
 * Presidential power granted by the fascist track AFTER enactment.
 * Slot = track count (1..6). Veto unlocks separately at 5.
 */
export function powerForSlot(
  totalPlayers: number,
  fasTrack: number,
): Power | null {
  if (fasTrack < 1 || fasTrack > 6) return null;
  if (totalPlayers <= 6) {
    // 5-6p board: peek, execution, execution
    if (fasTrack === 3) return 'peek';
    if (fasTrack === 4 || fasTrack === 5) return 'execution';
    return null;
  }
  if (totalPlayers <= 8) {
    // 7-8p board: investigate, special, execution, execution
    if (fasTrack === 2) return 'investigate';
    if (fasTrack === 3) return 'special';
    if (fasTrack === 4 || fasTrack === 5) return 'execution';
    return null;
  }
  // 9-10p board: investigate x2, special, execution, execution
  if (fasTrack === 1 || fasTrack === 2) return 'investigate';
  if (fasTrack === 3) return 'special';
  if (fasTrack === 4 || fasTrack === 5) return 'execution';
  return null;
}

/** Veto power is live once 5 fascist policies are enacted. */
export function vetoUnlocked(fasTrack: number): boolean {
  return fasTrack >= 5;
}

/**
 * Election passes iff Ja votes are a strict majority of living players.
 * Missing votes (disconnects) count as Nein — fail-safe.
 */
export function resolveSHElection(
  jaVoterIds: string[],
  aliveIds: string[],
): boolean {
  const alive = new Set(aliveIds);
  let ja = 0;
  for (const v of jaVoterIds) if (alive.has(v)) ja++;
  return ja * 2 > aliveIds.length;
}

/**
 * Chancellor eligibility (term limits): the last elected President and
 * Chancellor can't run. If limits would leave nobody eligible, everyone
 * alive is eligible (official edge-case fallback).
 */
export function eligibleChancellors(
  aliveIds: string[],
  lastPresidentId: string | null,
  lastChancellorId: string | null,
): string[] {
  const limited = new Set(
    [lastPresidentId, lastChancellorId].filter(Boolean) as string[],
  );
  const open = aliveIds.filter((id) => !limited.has(id));
  return open.length > 0 ? open : [...aliveIds];
}

export interface SHWinInput {
  libTrack: number;
  fasTrack: number;
  hitlerIsChancellor: boolean;
  hitlerExecuted: boolean;
}

export function checkSHWinner(s: SHWinInput): SHWinner | null {
  if (s.libTrack >= 5 || s.hitlerExecuted) return 'liberals';
  if (s.fasTrack >= 6 || s.hitlerIsChancellor) return 'fascists';
  return null;
}

/** Hitler-chancellor assassination rule needs 3+ fascist policies. */
export function hitlerChancellorWins(fasTrack: number): boolean {
  return fasTrack >= 3;
}
