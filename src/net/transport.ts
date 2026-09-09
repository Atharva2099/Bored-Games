import { joinRoom, selfId } from '@trystero-p2p/nostr';
import type { Room, TurnServerConfig } from '@trystero-p2p/core';
import type { Role } from '../game/werewolf/logic';
import type { Player } from './presence';

export type { Player } from './presence';

export const APP_ID = 'bored-games-werewolf-v1';

// Trystero picks its 5 relays by hashing appId, so every user of this app
// would otherwise get the same 5 (mostly hobby) relays forever. Pin the
// high-uptime public ones instead.
export const RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nostr.wine',
];

// Trystero's ICE defaults are STUN-only, which cannot connect two peers
// that are both behind symmetric NAT (i.e. most phones on carrier data).
// OpenRelay is free, needs no account, and publishes these credentials
// deliberately. Port 443/TCP is the variant that survives restrictive wifi.
const TURN_SERVERS: TurnServerConfig[] = [
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

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

export function createRoom(roomId: string, _isHost: boolean): RoomHandle {
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
      turnConfig: TURN_SERVERS,
      relayConfig: { urls: RELAY_URLS },
    },
    roomId,
  );
  return { room, selfId, leave: () => void room.leave() };
}
