import { joinRoom, selfId } from '@trystero-p2p/nostr';
import type { Room } from '@trystero-p2p/core';
import type { Role } from '../game/werewolf/logic';
import type { Player } from './presence';
import type {
  Policy,
  Power,
  SHRole,
  SHWinner,
} from '../game/secret-hitler/logic';
import { createWsRoom } from './ws-transport';

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

// TURN is now sourced from a Cloudflare Realtime Worker (worker/turn-worker.js),
// fetched client-side (see src/net/turn.ts) and passed into createRoom below.
// Trystero's ICE defaults are STUN-only, which cannot connect two peers that
// are both behind symmetric NAT (typical of phones on carrier data) — that
// was confirmed directly against a real device (only `srflx` candidates, no
// `host`/`relay`). A TURN relay with an account is required to fix it.
// Historical note: as of 2026-09 every free ANONYMOUS TURN service was
// measured dead from a browser:
//   turn:openrelay.metered.ca:80    -> 400 TURN allocate error
//   turn:openrelay.metered.ca:443   -> 701 Failed to establish connection
//   turn:global.relay.metered.ca:80 -> 400 TURN allocate error
//   turn:freeturn.tel / expressturn -> 701 host lookup failed
// None produced a `relay` ICE candidate. That's why credentials are minted
// server-side (via the Worker) with a real Cloudflare account instead of
// hardcoding a dead or leakable TURN entry here.

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
  /** lobby game selection; Secret Hitler table mounts when set */
  game?: 'werewolf' | 'secret-hitler';
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

// ---------------- Secret Hitler (CC BY-NC-SA 4.0, see
// src/game/secret-hitler/LICENSE) ----------------

export type SHPhase =
  | 'nominate'
  | 'vote'
  | 'legis-pres'
  | 'legis-chanc'
  | 'power'
  | 'ended';

export interface SHPublic {
  phase: SHPhase;
  players: Player[];
  libTrack: number;
  fasTrack: number;
  /** failed elections in a row; 3 triggers chaos auto-enact */
  tracker: number;
  drawCount: number;
  discCount: number;
  presidentId: string | null;
  chancellorId: string | null;
  lastPresidentId: string | null;
  lastChancellorId: string | null;
  pendingPower: Power | null;
  winner: SHWinner | null;
  /** client -> Ja vote */
  votes: Record<string, boolean>;
  vetoOffered: boolean;
  log: string[];
  [k: string]: unknown;
}

/** Private: your role + names of fascists you know (Hitler, or team in 5-6p). */
export interface SHRoleMsg {
  role: SHRole;
  knownNames: string[];
  [k: string]: unknown;
}

/** Private tile hands. Peek views are non-destructive copies. */
export interface SHCardsMsg {
  cards: Policy[];
  context: 'pres-draw' | 'chanc-hand' | 'peek';
  [k: string]: unknown;
}

/** Private notices (e.g. investigate results). */
export interface SHInfoMsg {
  text: string;
  [k: string]: unknown;
}

export interface SHActMsg {
  kind:
    | 'sync'
    | 'nominate'
    | 'vote'
    | 'pres-discard'
    | 'chanc-enact'
    | 'veto-propose'
    | 'veto-consent'
    | 'power-target'
    | 'power-done';
  targetId?: string | null;
  index?: number;
  ja?: boolean;
  agree?: boolean;
  client: string;
  [k: string]: unknown;
}

export interface RoomHandle {
  room: Room;
  selfId: string;
  leave: () => void;
}

// 'ws' talks to the Cloudflare Durable Object relay in room-worker/
// (star topology, no WebRTC/TURN); 'p2p' is the original Trystero mesh,
// kept as a fallback. Read at BUILD time by Vite.
export const TRANSPORT: 'ws' | 'p2p' =
  import.meta.env.VITE_TRANSPORT === 'p2p' ? 'p2p' : 'ws';

// Base URL of the room-worker Cloudflare Worker, e.g.
// https://bored-games-room.<subdomain>.workers.dev. Empty means the WS
// transport has nowhere to connect, so createRoom falls back to Trystero
// even when TRANSPORT === 'ws' (graceful degradation — see README).
export const WS_ENDPOINT: string = import.meta.env.VITE_ROOM_ENDPOINT ?? '';

export function createRoom(
  roomId: string,
  _isHost: boolean,
  onJoinError?: (e: { error: string }) => void,
  iceServers?: RTCIceServer[],
): RoomHandle {
  if (TRANSPORT === 'ws' && WS_ENDPOINT) {
    return createWsRoom(roomId, WS_ENDPOINT, onJoinError);
  }
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
      // `turnConfig` CONCATENATES onto Trystero's default STUN servers
      // rather than replacing them (see node_modules/@trystero-p2p/core/dist
      // /peer.mjs: `iceServers: defaultIceServers.concat(turnConfig ?? [])`).
      // Using `rtcConfig.iceServers` instead would REPLACE the STUN
      // defaults, which we don't want.
      ...(iceServers && iceServers.length > 0 ? { turnConfig: iceServers } : {}),
    },
    roomId,
    onJoinError ? { onJoinError } : undefined,
  );
  return { room, selfId, leave: () => void room.leave() };
}
