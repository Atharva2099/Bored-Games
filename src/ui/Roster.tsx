import { Skull, User } from 'lucide-react';
import type { Player } from '../net/presence';

/**
 * Full roster: every joined player with alive + connection status.
 * `extra` renders a right-aligned tag per player (e.g. president flags).
 */
export function RosterList({
  players,
  extra,
}: {
  players: Player[];
  extra?: (p: Player) => string;
}) {
  if (players.length === 0)
    return <p className="text-sm text-white/40">Nobody here yet…</p>;
  return (
    <ul className="text-sm space-y-1">
      {players.map((p) => {
        const offline = p.alive && p.online === false;
        return (
          <li key={p.peerId} className="flex items-center gap-2">
            {!p.alive ? (
              <Skull size={14} className="text-white/40 shrink-0" />
            ) : (
              <User
                size={14}
                className={`shrink-0 ${offline ? 'text-amber-300/70' : ''}`}
              />
            )}
            <span
              className={
                !p.alive
                  ? 'line-through text-white/40'
                  : offline
                    ? 'text-amber-200/80'
                    : ''
              }
            >
              {p.name}
            </span>
            {offline && (
              <span className="text-[11px] text-amber-300/70">
                reconnecting…
              </span>
            )}
            {!p.alive && (
              <span className="text-[11px] text-white/35">out</span>
            )}
            {extra?.(p) ? (
              <span className="text-[11px] text-white/50 ml-auto">
                {extra(p)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
