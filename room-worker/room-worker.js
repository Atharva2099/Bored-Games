// Cloudflare Worker + Durable Object: a WebSocket relay that replaces the
// Bored Games WebRTC mesh. One Durable Object instance per room code (via
// `env.ROOMS.idFromName(CODE)`, which deterministically maps a code to the
// same object everywhere on Cloudflare's network); every player holds ONE
// outbound WSS connection to that object, and the object fans messages out
// to everyone else in the room. This turns a 45-connection full mesh (for
// 10 players) into a 9-connection star, and removes NAT traversal / TURN
// entirely for this relay path.
//
// Wire protocol (see README.md for the full write-up):
//   S->C  {t:'welcome', self:<peerId>, peers:[<peerId>,...]}
//   S->C  {t:'join',  peer:<peerId>}
//   S->C  {t:'leave', peer:<peerId>}
//   C->S  {t:'msg', ns:<string>, data:<any>, target?:<peerId|peerId[]>}
//   S->C  {t:'msg', ns:<string>, data:<any>, from:<peerId>}

// Only these origins may open a room WebSocket. Any other Origin (or a
// missing one) gets a hard 403, not just a missing CORS header, because
// WebSocket upgrades aren't gated by CORS the way plain fetches are -- a
// browser will still let a cross-origin page attempt the handshake. This
// hard block is what actually stops disallowed browser origins; it does
// NOT stop a non-browser client (curl, a bot, a native WebSocket client)
// from sending any Origin header it likes, since Origin is just a header
// the client chooses to send. Treat this as a speed bump, not authentication.
const ALLOWED_ORIGINS = new Set([
  'https://atharva2099.github.io',
  'http://localhost:5173',
]);

// Room codes map 1:1 to Durable Objects via idFromName, so an unbounded
// range of "codes" would mean an unbounded number of objects. Keep codes to
// a small, predictable shape: uppercase letters, digits, and hyphens, 3-24
// characters.
const ROOM_CODE_RE = /^[A-Z0-9-]{3,24}$/;

const PEER_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function randomPeerId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < bytes.length; i++) {
    id += PEER_ID_ALPHABET[bytes[i] % PEER_ID_ALPHABET.length];
  }
  return id;
}

const MAX_SOCKETS_PER_ROOM = 12;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    const match = /^\/room\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      return new Response('Not found', { status: 404 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 400 });
    }

    // Hard-block any request whose Origin is absent or not allow-listed.
    // See the comment above ALLOWED_ORIGINS for why this is enforced here
    // rather than left to browser-side CORS.
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return new Response('Forbidden origin', { status: 403 });
    }

    const code = match[1];
    if (!ROOM_CODE_RE.test(code)) {
      return new Response('Invalid room code', { status: 400 });
    }

    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);
    return stub.fetch(request);
  },
};

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    // Answer WebSocket-level 'ping' frames with 'pong' automatically,
    // without waking the (possibly hibernated) object.
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }

  async fetch(request) {
    const existing = this.state.getWebSockets();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    if (existing.length >= MAX_SOCKETS_PER_ROOM) {
      // Room is at capacity (10-player game + margin for reconnect
      // overlap). Accept the upgrade so we have a WebSocket to close
      // cleanly, then immediately close it with the reserved-range code
      // 1013 ("Try Again Later") so the client knows to back off/retry
      // rather than treating this as a protocol error.
      server.accept();
      server.close(1013, 'room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    // This registers `server` with the Hibernation API. The Durable Object
    // can be evicted from memory between messages and Cloudflare will wake
    // it back up on the next event for this socket; billed *duration* only
    // accrues while the object is actually running a handler, not for the
    // lifetime of the connection. Without this, a room worker would stay
    // resident (and billed) for the whole game session, which would burn
    // through the 13,000 GB-s/day free duration budget very quickly with
    // several concurrent rooms.
    this.state.acceptWebSocket(server);

    const peerId = randomPeerId();
    server.serializeAttachment({ peerId });

    const others = existing.map((ws) => ws.deserializeAttachment().peerId);

    this.safeSend(server, {
      t: 'welcome',
      self: peerId,
      peers: others,
    });

    for (const ws of existing) {
      this.safeSend(ws, { t: 'join', peer: peerId });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernation discards all instance fields between wake-ups, so peer
  // identity and the current roster are never kept on `this` -- they are
  // always recovered from `this.state.getWebSockets()` and each socket's
  // `deserializeAttachment()`.
  async webSocketMessage(ws, message) {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      // Malformed frame; ignore it rather than let a bad client kill the
      // object for the whole room.
      return;
    }

    if (!parsed || parsed.t !== 'msg') {
      // Unknown/unhandled message types are ignored silently.
      return;
    }

    const attachment = ws.deserializeAttachment();
    const fromPeer = attachment && attachment.peerId;
    if (!fromPeer) return;

    const outgoing = {
      t: 'msg',
      ns: parsed.ns,
      data: parsed.data,
      from: fromPeer, // Always stamped from the sender's own socket, never
      // trusted from the client payload.
    };

    const sockets = this.state.getWebSockets();
    const { target } = parsed;

    if (typeof target === 'string') {
      for (const other of sockets) {
        const otherId = other.deserializeAttachment()?.peerId;
        if (otherId === target) this.safeSend(other, outgoing);
      }
    } else if (Array.isArray(target)) {
      const targetSet = new Set(target);
      for (const other of sockets) {
        const otherId = other.deserializeAttachment()?.peerId;
        if (targetSet.has(otherId)) this.safeSend(other, outgoing);
      }
    } else {
      for (const other of sockets) {
        if (other === ws) continue;
        this.safeSend(other, outgoing);
      }
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    this.broadcastLeave(ws);
  }

  async webSocketError(ws, err) {
    this.broadcastLeave(ws);
  }

  broadcastLeave(ws) {
    const attachment = ws.deserializeAttachment();
    const peerId = attachment && attachment.peerId;
    if (!peerId) return;

    for (const other of this.state.getWebSockets()) {
      if (other === ws) continue;
      this.safeSend(other, { t: 'leave', peer: peerId });
    }
  }

  // A dead/closing peer socket must never take down the fan-out loop for
  // everyone else in the room, so every send is individually guarded.
  safeSend(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      // Ignore; the socket is presumably closing/closed and will generate
      // its own webSocketClose/webSocketError event.
    }
  }
}
