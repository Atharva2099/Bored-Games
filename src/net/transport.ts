import { joinRoom, selfId } from '@trystero-p2p/nostr';
import type { Room } from '@trystero-p2p/core';
import type { Role } from '../game/werewolf/logic';
import type { Player } from './presence';

export type { Player } from './presence';

export const APP_ID = 'bored-games-werewolf-v1';

// Trystero picks its 5 relays by hashing appId, so every user of this app
// would otherwise get the same 5 (mostly hobby) relays forever.
// Every relay below was verified to round-trip an EPHEMERAL event (kind
// 20000-29999, which is what Trystero signals over) — a relay that stores
// notes fine can still silently drop ephemerals, so "popular" is not enough.
// nostr.wine was removed: it is a PAID relay and rejects every write with
// "restricted: sign up at https://nostr.wine".
export const RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://relay.mostr.pub',
  'wss://nostr.data.haus',
];

// NO TURN SERVER IS CONFIGURED, and that is deliberate.
// Trystero's ICE defaults are STUN-only, which cannot connect two peers that
// are both behind symmetric NAT (typical of phones on carrier data). The fix
// for that is a TURN relay — but as of 2026-09 every free ANONYMOUS TURN
// service is dead. Measured directly from a browser:
//   turn:openrelay.metered.ca:80    -> 400 TURN allocate error
//   turn:openrelay.metered.ca:443   -> 701 Failed to establish connection
//   turn:global.relay.metered.ca:80 -> 400 TURN allocate error
//   turn:freeturn.tel / expressturn -> 701 host lookup failed
// None produced a `relay` ICE candidate. Shipping dead TURN entries is worse
// than none: ICE spends time on allocations that can never succeed.
// To support carrier-NAT players a TURN server with an ACCOUNT is required
// (Cloudflare's free tier is the best option). Add it here when available.

export interface JoinMsg {
  name: string;
  /** stable per-browser id so refreshes rejoin as the same player */
  client: string;
  [k: string]: unknown;
}

export interface PublicState {
  phase: 'lobby' | 'role' | 'night' | 'day' | 'vote' | 'ended';
  players: Player[];
  dayCount: number;
  log: string[];
  votes?: Record<string, string>;
  /** clients that tapped "ready" during the role phase */
  ready?: string[];
  /** night picks landed so far (host checklist; no targets revealed) */
  night?: { wolf: boolean; save: boolean; see: boolean };
  winner?: 'villagers' | 'werewolves' | null;
  lastDead?: string | null;
  lastExiled?: string | null;
  [k: string]: unknown;
}

export interface RoleMsg {
  role: Role;
  [k: string]: unknown;
}

export interface SeerMsg {
  text: string;
  [k: string]: unknown;
}

export interface ActionMsg {
  kind: 'night' | 'vote' | 'ready';
  nightKind?: 'wolf' | 'save' | 'see';
  targetId: string | null;
  fromName: string;
  /** stable per-browser id; votes are tallied per client, not per peer.
   * Optional at call sites — sendGuestAction fills it in. */
  client?: string;
  [k: string]: unknown;
}

export interface RoomHandle {
  room: Room;
  selfId: string;
  leave: () => void;
}

export function createRoom(
  roomId: string,
  _isHost: boolean,
  onJoinError?: (e: { error: string }) => void,
): RoomHandle {
  // The room code IS the password: only devices holding the QR/link can
  // even complete a handshake. No server, no accounts, no keys to steal.
  // NOTE: do not set `passive: !isHost` here. It gives the star topology we
  // want, but a passive peer never announces and does not even subscribe to
  // its own signalling topic until it hears a NON-passive announce
  // (core/dist/topic-strategy.mjs:68). The nostr strategy re-announces only
  // every 60s (nostr/dist/index.mjs:14), so a guest joining mid-window sat
  // dormant for up to a minute before it could connect. Full mesh is worse
  // at 10 players but joins in seconds. Revisit if the interval ever becomes
  // configurable, or when moving off nostr.
  const room = joinRoom(
    {
      appId: APP_ID,
      password: `bg1:${roomId}`,
      relayConfig: { urls: RELAY_URLS },
    },
    roomId,
    onJoinError ? { onJoinError } : undefined,
  );
  return { room, selfId, leave: () => void room.leave() };
}
