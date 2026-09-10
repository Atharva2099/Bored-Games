// Pure presence helpers. No React, no network, no timers.
// NETWORK presence (`online`) and GAME aliveness (`alive`) are separate axes:
// a peer dropping its socket (phone lock, brief signal loss) must never be
// mistaken for a wolf kill or a vote exile. Functions here only ever touch
// `online` — nothing in this file may write `alive`.

export interface Player {
  peerId: string;
  name: string;
  /** GAME state: killed by wolves or exiled. The network layer must never write this. */
  alive: boolean;
  /** NETWORK state: peer connection currently up. Never affects game rules. */
  online: boolean;
  /** Host-simulated dummy for testing. Has no socket; the host auto-plays it. */
  bot?: boolean;
}

/** Back-compat: state already in flight from an older client may be missing
 * `online` entirely. Treat an absent flag as "was online" rather than
 * guessing dead/alive. */
export function normalize(
  players: { peerId: string; name: string; alive: boolean; online?: boolean }[],
): Player[] {
  return players.map((p) => ({ ...p, online: p.online ?? true }));
}

/** Flip only `online` for the matching peer. Never touches `alive`. */
export function setPresence(
  players: Player[],
  peerId: string,
  online: boolean,
): Player[] {
  if (!players.some((p) => p.peerId === peerId)) return players;
  return players.map((p) => (p.peerId === peerId ? { ...p, online } : p));
}

/** Re-seat a reconnecting client: new peerId, back online, refreshed name —
 * but the game-state `alive` value is carried across untouched. */
export function rejoin(
  players: Player[],
  prevPeerId: string,
  newPeerId: string,
  name: string,
): Player[] {
  if (!players.some((p) => p.peerId === prevPeerId)) return players;
  return players.map((p) =>
    p.peerId === prevPeerId
      ? { ...p, peerId: newPeerId, name, online: true }
      : p,
  );
}

/** Append a brand-new player. Spectators (mid-game joiners) start dead;
 * everyone starts online. Duplicate peerId is a no-op. */
export function addPlayer(
  players: Player[],
  peerId: string,
  name: string,
  spectator: boolean,
): Player[] {
  if (players.some((p) => p.peerId === peerId)) return players;
  return [...players, { peerId, name, alive: !spectator, online: true }];
}

/** Players the host UI should explain missing input for: still alive in the
 * game but the network connection has dropped. */
export function disconnectedAlive(players: Player[]): Player[] {
  return players.filter((p) => p.alive && !p.online);
}
