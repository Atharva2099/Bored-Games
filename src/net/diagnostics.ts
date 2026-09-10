import { RELAY_URLS } from './transport';

export interface DiagEvent {
  t: number;
  kind: string;
  detail?: string;
}

const MAX_ENTRIES = 200;

let t0 = Date.now();
let log: DiagEvent[] = [];

export function resetDiag(): void {
  t0 = Date.now();
  log = [];
}

export function logDiag(kind: string, detail?: string): void {
  log.push({ t: Date.now() - t0, kind, detail });
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
}

export function getDiag(): DiagEvent[] {
  return [...log];
}

export function diagText(): string {
  const ua = typeof navigator === 'undefined' ? 'n/a' : navigator.userAgent;
  const https =
    typeof window === 'undefined' ? 'n/a' : String(window.location.protocol === 'https:');
  const header = [
    `userAgent: ${ua}`,
    `https: ${https}`,
    `relays: ${RELAY_URLS.join(', ')}`,
    `build: ${typeof __BUILD_ID__ === 'undefined' ? 'n/a' : __BUILD_ID__}`,
  ].join('\n');
  const lines = log.map(
    (e) => `+${e.t}ms  ${e.kind}${e.detail !== undefined ? '  ' + e.detail : ''}`,
  );
  return [header, '', ...lines].join('\n');
}

const STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];

export function probeIce(): Promise<{
  types: string[];
  firstMs: Record<string, number>;
  complete: boolean;
  errors: string[];
  ms: number;
}> {
  const start = Date.now();
  return new Promise((resolve) => {
    const types = new Set<string>();
    const firstMs: Record<string, number> = {};
    const errors: string[] = [];
    let done = false;
    let complete = false;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN_URLS }] });

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try {
        pc.close();
      } catch {
        /* already closed */
      }
      resolve({ types: [...types], firstMs, complete, errors, ms: Date.now() - start });
    };

    const timeout = setTimeout(finish, 10000);

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        // null candidate signals gathering complete (as opposed to hitting
        // the 10s timeout below with trickle ICE still in flight)
        complete = true;
        finish();
        return;
      }
      const match = /typ (\w+)/.exec(e.candidate.candidate);
      if (match) {
        const type = match[1];
        types.add(type);
        // record only the first sighting of each candidate type
        if (!(type in firstMs)) firstMs[type] = Date.now() - start;
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pc as any).onicecandidateerror = (e: any) => {
      errors.push(`${e.errorCode ?? '?'} ${e.errorText ?? ''} ${e.url ?? ''}`.trim());
    };

    try {
      pc.createDataChannel('diag');
      pc
        .createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((err) => {
          errors.push(String(err));
          finish();
        });
    } catch (err) {
      errors.push(String(err));
      finish();
    }
  });
}

export function probeRelays(
  urls: string[],
): Promise<{ url: string; ok: boolean; ms: number; detail: string }[]> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<{ url: string; ok: boolean; ms: number; detail: string }>((resolve) => {
          const start = Date.now();
          let done = false;
          let ws: WebSocket;
          const finish = (ok: boolean, detail: string) => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            try {
              ws.close();
            } catch {
              /* already closed */
            }
            resolve({ url, ok, ms: Date.now() - start, detail });
          };
          const timeout = setTimeout(() => finish(false, 'timeout'), 8000);
          try {
            ws = new WebSocket(url);
          } catch (err) {
            clearTimeout(timeout);
            resolve({ url, ok: false, ms: Date.now() - start, detail: String(err) });
            return;
          }
          ws.onopen = () => finish(true, '');
          ws.onerror = () => finish(false, 'error');
          ws.onclose = () => finish(false, 'closed');
        }),
    ),
  );
}
