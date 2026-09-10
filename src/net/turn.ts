import { logDiag } from './diagnostics';

// URL of the Cloudflare Worker that mints short-lived TURN credentials
// (see worker/turn-worker.js). Empty string means TURN is disabled — the
// game still works, it just won't relay traffic for peers that can't reach
// each other directly (e.g. both behind symmetric/carrier NAT).
// Read at BUILD time by Vite; must be set before `npm run build`/`deploy`.
export const TURN_ENDPOINT: string = import.meta.env.VITE_TURN_ENDPOINT ?? '';

// Cloudflare mints credentials with a 1h TTL (see worker/turn-worker.js).
// Treat anything older than 45 minutes as stale so we never hand Trystero
// dead credentials — a page left open past that just refetches on next join.
const STALE_AFTER_MS = 45 * 60 * 1000;

let cached: RTCIceServer[] = [];
let cachedAt: number | null = null;

/** True when the cache is empty or older than the staleness window. */
export function isTurnCacheStale(): boolean {
  return cachedAt === null || Date.now() - cachedAt > STALE_AFTER_MS;
}

/** Age of the cached TURN servers in ms, or null if nothing is cached. */
export function turnCacheAgeMs(): number | null {
  return cachedAt === null ? null : Date.now() - cachedAt;
}

/**
 * Returns the last successfully fetched TURN servers, or `[]` if none have
 * been fetched yet or the cache has gone stale (see `isTurnCacheStale`).
 */
export function getCachedTurn(): RTCIceServer[] {
  return isTurnCacheStale() ? [] : cached;
}

/**
 * Fetches TURN credentials from the configured Worker endpoint. Never
 * throws — on any failure (no endpoint configured, network error, timeout,
 * unexpected shape) it resolves to an empty array so the game can always
 * proceed without TURN.
 */
export async function fetchTurnServers(timeoutMs = 4000): Promise<RTCIceServer[]> {
  if (!TURN_ENDPOINT) {
    logDiag('turn-fetch', 'not configured');
    return [];
  }

  try {
    const signal =
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(timeoutMs)
        : (() => {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), timeoutMs);
            return ctrl.signal;
          })();

    const res = await fetch(TURN_ENDPOINT, { signal });
    if (!res.ok) {
      logDiag('turn-fetch', `failed: HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { iceServers?: unknown };
    const servers = Array.isArray(data?.iceServers)
      ? (data.iceServers as RTCIceServer[])
      : [];
    if (servers.length === 0) {
      logDiag('turn-fetch', 'failed: no iceServers in response');
      return [];
    }
    cached = servers;
    cachedAt = Date.now();
    logDiag('turn-fetch', `ok ${servers.length} server(s)`);
    return servers;
  } catch (err) {
    logDiag('turn-fetch', `failed: ${String(err)}`);
    return [];
  }
}

/**
 * Fires off a TURN credential fetch and caches the result, ignoring
 * errors. Call this early (e.g. on mount) so credentials are already warm
 * by the time the user taps Create/Join.
 */
export function primeTurn(): void {
  void fetchTurnServers();
}
