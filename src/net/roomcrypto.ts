// Payload encryption for the WebSocket relay transport (see ws-transport.ts).
//
// The relay (a Cloudflare Durable Object) fans messages out to every socket
// in a room and could otherwise read every byte of game state, including
// secret roles. Trystero's WebRTC path is already opaque to any third party
// (peers exchange the room code as password and negotiate a direct/TURN
// data channel); this module gives the WS path the same property by
// encrypting every payload with a key derived from the room code alone, so
// the relay only ever sees ciphertext.
//
// Key derivation: PBKDF2-SHA256(roomCode, fixed app salt, 100_000 rounds) ->
// AES-GCM-256. No dependency: WebCrypto (`crypto.subtle`) is available in
// both browsers and Node >= 20 (used by the vitest `node` environment).

const APP_SALT = 'bored-games-v1';
const PBKDF2_ITERATIONS = 100_000;

// Memoise the derived key per room code so we don't re-run PBKDF2 (100k
// rounds) on every single outgoing/incoming message.
const keyCache = new Map<string, Promise<CryptoKey>>();

async function deriveKey(roomCode: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(roomCode),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(APP_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Derive (and memoise) the AES-GCM key for a room code. */
export function getRoomKey(roomCode: string): Promise<CryptoKey> {
  let cached = keyCache.get(roomCode);
  if (!cached) {
    cached = deriveKey(roomCode);
    keyCache.set(roomCode, cached);
  }
  return cached;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const IV_BYTES = 12;

/** JSON-encode `obj`, encrypt with a fresh random IV, return base64(iv||ct). */
export async function seal(key: CryptoKey, obj: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(combined);
}

/**
 * Inverse of `seal`. Returns `null` on ANY failure (wrong key, truncated /
 * corrupt base64, tampered ciphertext, non-JSON plaintext) so a single bad
 * frame can never throw and take down the socket's message handler.
 */
export async function open<T>(key: CryptoKey, payload: string): Promise<T | null> {
  try {
    const combined = fromBase64(payload);
    if (combined.length <= IV_BYTES) return null;
    const iv = combined.slice(0, IV_BYTES);
    const ciphertext = combined.slice(IV_BYTES);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}
