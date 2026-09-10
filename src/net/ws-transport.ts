import type {
  DataPayload,
  MessageAction,
  MessageActionConfig,
  MessageContext,
  Room,
} from '@trystero-p2p/core';
import { logDiag } from './diagnostics';
import { getRoomKey, open, seal } from './roomcrypto';
import type { RoomHandle } from './transport';

// Client shim for the WebSocket relay (room-worker/room-worker.js). Matches
// the exact wire protocol implemented there:
//   S->C  {t:'welcome', self:<peerId>, peers:[<peerId>,...]}
//   S->C  {t:'join',  peer:<peerId>}
//   S->C  {t:'leave', peer:<peerId>}
//   C->S  {t:'msg', ns:<string>, data:<any>, target?:<peerId|peerId[]>}
//   S->C  {t:'msg', ns:<string>, data:<any>, from:<peerId>}
//
// `data` on the wire is always the base64 output of roomcrypto.seal() --
// the relay only ever sees ciphertext.

type ServerMsg =
  | { t: 'welcome'; self: string; peers: string[] }
  | { t: 'join'; peer: string }
  | { t: 'leave'; peer: string }
  | { t: 'msg'; ns: string; data: string; from: string };

interface QueuedSend {
  ns: string;
  data: unknown;
  target?: string | string[];
}

interface ActionState {
  onMessage: ((data: unknown, ctx: MessageContext) => void | Promise<void>) | null;
}

const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 10_000;
const PING_INTERVAL_MS = 30_000;

function toWsUrl(endpoint: string, roomId: string): string {
  const wsBase = endpoint.replace(/^http/i, 'ws').replace(/\/+$/, '');
  return `${wsBase}/room/${encodeURIComponent(roomId)}`;
}

/** Cheap local id used only until the server's `welcome` assigns a real
 * peer id. See the long comment on `handleWelcome` below for why this
 * matters and isn't just cosmetic. */
function randomLocalId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createWsRoom(
  roomId: string,
  wsEndpoint: string,
  onError?: (e: { error: string }) => void,
): RoomHandle {
  let selfId = randomLocalId();
  let socket: WebSocket | null = null;
  let closed = false;
  let socketReady = false;
  let roomKey: CryptoKey | null = null;
  let backoffMs = BACKOFF_START_MS;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const outgoing: QueuedSend[] = [];
  const peers = new Set<string>();
  // `Room.getPeers()` is typed as `Record<string, RTCPeerConnection>` in
  // Trystero. Under this transport there is no RTCPeerConnection, so the
  // values are inert placeholders; App.tsx's diagnostics timer is guarded
  // (see App.tsx) to only touch WebRTC-specific fields when they exist.
  const peerPlaceholders: Record<string, unknown> = {};
  const actions = new Map<string, ActionState>();

  let onPeerJoin: ((peerId: string) => void) | null = null;
  let onPeerLeave: ((peerId: string) => void) | null = null;

  function getAction(ns: string): ActionState {
    let a = actions.get(ns);
    if (!a) {
      a = { onMessage: null };
      actions.set(ns, a);
    }
    return a;
  }

  async function flushOutgoing(): Promise<void> {
    if (!socketReady || !roomKey || !socket) return;
    const ws = socket;
    while (outgoing.length > 0) {
      const item = outgoing[0];
      let sealed: string;
      try {
        sealed = await seal(roomKey, item.data);
      } catch {
        // Should not happen (seal never throws by design), but never let a
        // bad payload wedge the queue forever.
        outgoing.shift();
        continue;
      }
      // Re-check readiness: awaiting seal() may race with a socket drop.
      if (!socketReady || socket !== ws) return;
      try {
        ws.send(
          JSON.stringify({
            t: 'msg',
            ns: item.ns,
            data: sealed,
            ...(item.target !== undefined ? { target: item.target } : {}),
          }),
        );
        outgoing.shift();
      } catch {
        // Send failed; leave it queued, `onclose`/reconnect will retry.
        return;
      }
    }
  }

  function enqueueSend(ns: string, data: unknown, target?: string | string[]): void {
    outgoing.push({ ns, data, target });
    void flushOutgoing();
  }

  function teardownSocket(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    socketReady = false;
  }

  function scheduleReconnect(): void {
    if (closed) return;
    reconnectAttempt++;
    const jitter = Math.random() * backoffMs * 0.3;
    const delay = Math.min(backoffMs, BACKOFF_MAX_MS) + jitter;
    logDiag('ws-reconnect', String(reconnectAttempt));
    reconnectTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      connect();
    }, delay);
  }

  // A `welcome` arrives on the very first connect AND after every
  // reconnect, and always carries a fresh, server-assigned peer id (a
  // dropped socket never keeps its old id). Two things fall out of that:
  //
  // 1. Peers: diff the previous roster against the new `peers` list (leave
  //    events for anyone missing, join events for the current set) so a
  //    stale peer never lingers and the app always ends up with the
  //    server's authoritative roster.
  //
  // 2. Self: `selfId` starts as a locally-generated placeholder (see
  //    `randomLocalId`) because nothing can know the real id before the
  //    handshake completes, yet App.tsx's mount effect reads `handle.selfId`
  //    synchronously (before this event fires) to seed the host's own
  //    roster entry and its `clientToPeer`/`peerToClient` maps. Once the
  //    real id is known we fire `onPeerJoin(selfId)` as a LOOPBACK, exactly
  //    as if we were a peer newly joining — the app's existing
  //    `room.onPeerJoin` handler responds by sending a `join` action
  //    targeted at that id, the relay delivers targeted sends back to their
  //    own socket, and the receiving `handleJoin`/`rejoin`/`rekeyPeer` code
  //    (already written to let a *guest* reconnect under a new peer id)
  //    migrates the stale placeholder id to the real one with no changes
  //    needed on the App.tsx side. The same loopback fires again on every
  //    later reconnect for the same reason.
  function handleWelcome(msg: { self: string; peers: string[] }): void {
    const newPeerSet = new Set(msg.peers);
    for (const oldPeer of peers) {
      if (!newPeerSet.has(oldPeer)) {
        peers.delete(oldPeer);
        delete peerPlaceholders[oldPeer];
        onPeerLeave?.(oldPeer);
      }
    }
    for (const p of msg.peers) {
      if (!peers.has(p)) {
        peers.add(p);
        peerPlaceholders[p] = {};
      }
    }
    selfId = msg.self;
    logDiag('ws-peers', String(peers.size));
    onPeerJoin?.(selfId);
    for (const p of msg.peers) onPeerJoin?.(p);
  }

  function handleServerMessage(raw: string): void {
    let parsed: ServerMsg;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    switch (parsed.t) {
      case 'welcome':
        handleWelcome(parsed);
        return;
      case 'join':
        if (!peers.has(parsed.peer)) {
          peers.add(parsed.peer);
          peerPlaceholders[parsed.peer] = {};
          logDiag('ws-peers', String(peers.size));
          onPeerJoin?.(parsed.peer);
        }
        return;
      case 'leave':
        if (peers.has(parsed.peer)) {
          peers.delete(parsed.peer);
          delete peerPlaceholders[parsed.peer];
          logDiag('ws-peers', String(peers.size));
          onPeerLeave?.(parsed.peer);
        }
        return;
      case 'msg': {
        const action = actions.get(parsed.ns);
        if (!action?.onMessage || !roomKey) return;
        const key = roomKey;
        void open(key, parsed.data).then((decoded) => {
          if (decoded === null) {
            logDiag('decrypt-fail', parsed.ns);
            return;
          }
          action.onMessage?.(decoded, { peerId: parsed.from });
        });
        return;
      }
      default:
        return;
    }
  }

  function connect(): void {
    if (closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(toWsUrl(wsEndpoint, roomId));
    } catch (err) {
      onError?.({ error: String(err) });
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      logDiag('ws-open');
      socketReady = true;
      backoffMs = BACKOFF_START_MS;
      reconnectAttempt = 0;
      void flushOutgoing();
      pingTimer = setInterval(() => {
        try {
          ws.send('ping');
        } catch {
          /* onclose will handle reconnection */
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') handleServerMessage(evt.data);
    };

    ws.onclose = (evt) => {
      logDiag('ws-close', String(evt.code));
      teardownSocket();
      if (socket === ws) socket = null;
      if (closed) return;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // `onclose` always follows and drives reconnection; nothing to do.
    };
  }

  void getRoomKey(roomId).then((key) => {
    roomKey = key;
    void flushOutgoing();
  });

  connect();

  function leave(): void {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    teardownSocket();
    try {
      socket?.close();
    } catch {
      /* already closed */
    }
    socket = null;
  }

  function makeAction<T extends DataPayload = DataPayload>(
    ns: string,
    config?: MessageActionConfig<T>,
  ): MessageAction<T> {
    const action = getAction(ns);
    if (config?.onMessage) {
      action.onMessage = config.onMessage as ActionState['onMessage'];
    }
    return {
      send: (data, options) => {
        enqueueSend(ns, data, options?.target ?? undefined);
        return Promise.resolve();
      },
      get onMessage() {
        return action.onMessage as MessageAction<T>['onMessage'];
      },
      set onMessage(fn) {
        action.onMessage = fn as ActionState['onMessage'];
      },
      onReceiveProgress: null,
    };
  }

  const room: Room = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeAction: makeAction as any,
    ping: () => Promise.resolve(0),
    leave: () => {
      leave();
      return Promise.resolve();
    },
    isPassive: () => false,
    getPeers: () => peerPlaceholders as Record<string, RTCPeerConnection>,
    addStream: () => [],
    removeStream: () => {},
    addTrack: () => [],
    removeTrack: () => {},
    replaceTrack: () => [],
    get onPeerJoin() {
      return onPeerJoin;
    },
    set onPeerJoin(fn) {
      onPeerJoin = fn;
    },
    get onPeerLeave() {
      return onPeerLeave;
    },
    set onPeerLeave(fn) {
      onPeerLeave = fn;
    },
    onPeerStream: null,
    onPeerTrack: null,
  };

  return {
    room,
    get selfId() {
      return selfId;
    },
    leave,
  } as unknown as RoomHandle;
}
