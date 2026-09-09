// Pure Werewolf game logic. No network, no UI, no Date.now, no Math.random
// inside resolve functions — assignRoles takes a shuffle seed fn for tests.
export type Role = 'werewolf' | 'seer' | 'doctor' | 'villager';
export type Team = 'villagers' | 'werewolves';

export interface NightInput {
  /** playerId wolves chose to kill (already agreed by wolves) */
  wolfTarget: string | null;
  /** playerId doctor chose to save */
  doctorSave: string | null;
  /** playerId seer chose to check */
  seerCheck: string | null;
}

export interface NightResult {
  diedId: string | null;
  /** role of checked player, null if no check */
  seerResult: Role | null;
}

/** Role counts for a player total. Wolves scale, seer/doctor fixed if >=7.
 * 1-4 players use the demo table so solo/duo testing can start. */
export function roleCounts(total: number): Record<Role, number> {
  const demo: Record<number, Record<Role, number>> = {
    1: { werewolf: 0, seer: 0, doctor: 0, villager: 1 },
    2: { werewolf: 1, seer: 0, doctor: 0, villager: 1 },
    3: { werewolf: 1, seer: 1, doctor: 0, villager: 1 },
    4: { werewolf: 1, seer: 1, doctor: 1, villager: 1 },
  };
  if (total < 5) {
    const out = demo[total];
    if (!out) throw new Error('Need at least 1 player');
    return out;
  }
  const wolves = total >= 11 ? 3 : total >= 7 ? 2 : 1;
  const seer = total >= 6 ? 1 : 0;
  const doctor = total >= 7 ? 1 : 0;
  const villagers = total - wolves - seer - doctor;
  return { werewolf: wolves, seer, doctor, villager: villagers };
}

/** Build + shuffle a role deck. shuffle defaults to Math.random shuffle. */
export function assignRoles(
  playerIds: string[],
  shuffle: <T>(arr: T[]) => T[] = randomShuffle,
): Record<string, Role> {
  const counts = roleCounts(playerIds.length);
  const deck: Role[] = [];
  (Object.keys(counts) as Role[]).forEach((role) => {
    for (let i = 0; i < counts[role]; i++) deck.push(role);
  });
  const shuffled = shuffle([...deck]);
  if (shuffled.length !== playerIds.length)
    throw new Error('Deck size mismatch');
  const out: Record<string, Role> = {};
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

/** Night resolution: doctor save cancels wolf kill on same target. */
export function resolveNight(
  input: NightInput,
  roles: Record<string, Role>,
): NightResult {
  const diedId =
    input.wolfTarget &&
    input.wolfTarget !== input.doctorSave
      ? input.wolfTarget
      : null;
  const seerResult =
    input.seerCheck != null ? (roles[input.seerCheck] ?? null) : null;
  return { diedId, seerResult };
}

/**
 * Day vote resolution.
 * votes: voterId -> targetId. Only votes from alive players count,
 * and only votes for alive players count. Dead/skipped votes ignored.
 * Tie (top 2 equal) or no valid votes => null (no exile).
 */
export function resolveVote(
  votes: Record<string, string>,
  aliveIds: string[],
): string | null {
  const alive = new Set(aliveIds);
  const tally = new Map<string, number>();
  for (const [voter, target] of Object.entries(votes)) {
    if (!alive.has(voter)) continue;
    if (!alive.has(target)) continue;
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

/** Win check. Returns winning team or null if game continues. */
export function checkWinner(
  roles: Record<string, Role>,
  aliveIds: string[],
): Team | null {
  const alive = new Set(aliveIds);
  let wolves = 0;
  let others = 0;
  for (const [id, role] of Object.entries(roles)) {
    if (!alive.has(id)) continue;
    if (role === 'werewolf') wolves++;
    else others++;
  }
  if (wolves === 0) return 'villagers';
  if (wolves >= others) return 'werewolves';
  return null;
}

/** Room codes: readable, no 0/O/1/I. e.g. WOLF-4821KQ (6 chars ≈ 1B combos) */
export function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return `WOLF-${s}`;
}
