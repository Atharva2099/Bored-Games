import { joinRoom, selfId } from '@trystero-p2p/nostr';
import type { Room } from '@trystero-p2p/core';
import type { Role } from '../game/werewolf/logic';

export const APP_ID = 'bored-games-werewolf-v1';

export interface JoinMsg {
  name: string;
  /** stable per-browser id so refreshes rejoin as the same player */
  client: string;
  [k: string]: unknown;
}

export interface PublicState {
  phase: 'lobby' | 'role' | 'night' | 'day' | 'vote' | 'ended';
  players: { peerId: string; name: string; alive: boolean }[];
  dayCount: number;
  log: string[];
  votes?: Record<string, string>;
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
  kind: 'night' | 'vote';
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

export function createRoom(roomId: string): RoomHandle {
  // The room code IS the password: only devices holding the QR/link can
  // even complete a handshake. No server, no accounts, no keys to steal.
  const room = joinRoom({ appId: APP_ID, password: `bg1:${roomId}` }, roomId);
  return { room, selfId, leave: () => void room.leave() };
}
