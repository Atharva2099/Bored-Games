import { useState } from 'react';
import { Check, Copy, RefreshCw, X } from 'lucide-react';
import { diagText, getDiag, probeIce, probeRelays } from '../net/diagnostics';
import { RELAY_URLS } from '../net/transport';
import { getCachedTurn, isTurnCacheStale, turnCacheAgeMs } from '../net/turn';

type RelayResult = { url: string; ok: boolean; ms: number; detail: string };
type IceResult = {
  types: string[];
  firstMs: Record<string, number>;
  complete: boolean;
  errors: string[];
  ms: number;
};

/** Diagnostics overlay: reveals exactly where a P2P connection attempt
 * stalls (relay reachability, ICE candidate types, and a live event log)
 * so real-device failures can be diagnosed without guessing. */
export function DiagnosticsOverlay({ onClose }: { onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [relayResults, setRelayResults] = useState<RelayResult[] | null>(null);
  const [iceResult, setIceResult] = useState<IceResult | null>(null);
  const [copyText, setCopyText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const events = getDiag();
  const turnServers = getCachedTurn();
  const turnAgeMs = turnCacheAgeMs();

  const runChecks = async () => {
    setRunning(true);
    setRelayResults(null);
    setIceResult(null);
    try {
      const [relays, ice] = await Promise.all([probeRelays(RELAY_URLS), probeIce()]);
      setRelayResults(relays);
      setIceResult(ice);
    } finally {
      setRunning(false);
    }
  };

  const copy = async () => {
    const text = diagText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyText(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // iOS Safari (and others) can refuse clipboard writes outside a
      // direct user-gesture chain — fall back to a selectable textarea.
      setCopyText(text);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-auto">
      <div className="panel cut max-w-md w-full my-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Diagnostics</h2>
          <button onClick={onClose} aria-label="Close" className="text-white/60">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void runChecks()}
            disabled={running}
            className="btn-accent flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
            Run checks
          </button>
          <button
            onClick={() => void copy()}
            className={`rounded border px-3 py-2 text-sm flex items-center gap-1 ${
              copied ? 'border-emerald-400/60 text-emerald-300' : 'border-white/20'
            }`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {copyText !== null && (
          <div className="space-y-1">
            <p className="text-xs text-amber-200/90">
              Clipboard blocked — copy manually below.
            </p>
            <textarea
              readOnly
              value={copyText}
              ref={(el) => el?.select()}
              className="w-full h-24 text-xs font-mono bg-black/40 border border-white/10 rounded p-2"
            />
          </div>
        )}

        {relayResults && (
          <section className="space-y-1">
            <h3 className="text-xs uppercase text-white/50">Relays</h3>
            <ul className="text-xs font-mono space-y-1">
              {relayResults.map((r) => (
                <li key={r.url} className="flex items-center gap-2">
                  {r.ok ? (
                    <Check size={12} className="text-green-400 shrink-0" />
                  ) : (
                    <X size={12} className="text-red-400 shrink-0" />
                  )}
                  <span className="truncate">{r.url}</span>
                  <span className="text-white/50 ml-auto shrink-0">
                    {r.ok ? `${r.ms}ms` : r.detail}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {iceResult && (
          <section className="space-y-1">
            <h3 className="text-xs uppercase text-white/50">ICE</h3>
            <p className="text-xs">
              {iceResult.types.length
                ? iceResult.types
                    .map((type) => `${type} @ ${iceResult.firstMs[type]}ms`)
                    .join(' · ')
                : 'none'}
            </p>
            <p className="text-xs text-white/50">
              gathering {iceResult.complete ? 'completed' : 'did NOT complete'} (
              {iceResult.ms}ms) — trickle ICE does not wait for this
            </p>
            {!iceResult.types.includes('host') && (
              <p className="text-xs text-amber-300/90">
                no host candidates — two devices on the same wifi cannot
                connect directly and must hairpin through the router
              </p>
            )}
            {turnServers.length > 0 ? (
              <p className="text-xs text-emerald-300/90">
                TURN: {turnServers.length} server(s)
                {turnAgeMs !== null
                  ? ` (fetched ${Math.round(turnAgeMs / 60000)}m ago)`
                  : ''}
              </p>
            ) : isTurnCacheStale() && turnAgeMs !== null ? (
              <p className="text-xs text-amber-300/90">
                TURN: cache stale — will refetch on join
              </p>
            ) : (
              <p className="text-xs text-amber-300/90">
                TURN: none — set VITE_TURN_ENDPOINT
              </p>
            )}
            {!iceResult.types.includes('relay') && (
              <p className="text-xs text-amber-300/90">
                no TURN relay — players on mobile data may not connect
              </p>
            )}
            {iceResult.errors.length > 0 && (
              <ul className="text-xs text-red-300/90 space-y-0.5">
                {iceResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="space-y-1">
          <h3 className="text-xs uppercase text-white/50">Event log</h3>
          <div className="text-xs font-mono bg-black/40 border border-white/10 rounded p-2 max-h-48 overflow-auto space-y-0.5">
            {events.length === 0 && <div className="text-white/40">no events yet</div>}
            {events.map((e, i) => (
              <div key={i}>
                +{e.t}ms {e.kind} {e.detail ?? ''}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
