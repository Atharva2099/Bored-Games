import { Bot, Skull, User, X } from 'lucide-react';
import type { Player } from '../net/presence';

/**
 * Lobby avatar grid: placeholder user icons with names underneath.
 * Joined players get filled avatars (amber while reconnecting, violet for
 * host-simulated bots); empty slots up to `minNeeded` render as dashed
 * "waiting" placeholders. Host can remove bots via the × badge.
 */
export function AvatarGrid({
  players,
  minNeeded,
  onRemoveBot,
}: {
  players: Player[];
  minNeeded: number;
  onRemoveBot?: (peerId: string) => void;
}) {
  const emptySlots = Math.max(0, Math.min(minNeeded, 10) - players.length);
  return (
    <div>
      <div className="text-xs uppercase text-white/50 mb-2">
        Players ({players.length}
        {minNeeded > 0 ? ` / ${minNeeded} to start` : ''})
      </div>
      <div className="flex flex-wrap gap-3">
        {players.map((p) => {
          const offline = p.alive && p.online === false;
          const initial = (p.name.trim()[0] ?? '?').toUpperCase();
          return (
            <div key={p.peerId} className="flex flex-col items-center gap-1 w-16 relative">
              <div
                className="h-14 w-14 rounded-full border-2 flex items-center justify-center"
                style={
                  p.bot
                    ? { borderColor: '#c084fc', color: '#c084fc', background: 'rgba(192,132,252,0.10)' }
                    : offline
                      ? { borderColor: 'rgba(252,211,77,0.7)', color: '#fcd34d' }
                      : { borderColor: '#92a9e1', color: '#92a9e1', background: 'rgba(146,169,225,0.08)' }
                }
              >
                {p.bot ? (
                  <Bot size={22} />
                ) : (
                  <span className="font-display text-2xl leading-none">{initial}</span>
                )}
              </div>
              {p.bot && onRemoveBot && (
                <button
                  onClick={() => onRemoveBot(p.peerId)}
                  aria-label={`Remove ${p.name}`}
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-black border border-white/30 text-white/70 text-xs leading-none"
                >
                  <X size={12} className="mx-auto" />
                </button>
              )}
              <span
                className={`text-[11px] leading-tight w-full text-center truncate ${
                  offline ? 'text-amber-200/80' : 'text-white/80'
                }`}
              >
                {p.name}
              </span>
              {p.bot ? (
                <span className="text-[10px] text-purple-300/80 -mt-1 font-bold">BOT</span>
              ) : offline ? (
                <span className="text-[10px] text-amber-300/70 -mt-1">joining…</span>
              ) : null}
            </div>
          );
        })}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div key={`empty-${i}`} className="flex flex-col items-center gap-1 w-16">
            <div className="h-14 w-14 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
              <User size={20} className="text-white/25" />
            </div>
            <span className="text-[11px] leading-tight text-white/30">waiting…</span>
          </div>
        ))}
      </div>
    </div>
  );
}
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
            ) : p.bot ? (
              <Bot size={14} className="shrink-0 text-purple-300/80" />
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
            {p.bot && p.alive && (
              <span className="text-[11px] text-purple-300/80 font-bold">BOT</span>
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
