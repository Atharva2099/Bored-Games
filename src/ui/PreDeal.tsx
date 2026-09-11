import { AvatarGrid } from './Roster';
import { InvitePanel, type InviteGame } from './Invite';

/**
 * Shared pre-deal waiting room for both games (lobbies are similar —
 * only the final tables differ). Shows the LIVE roster (not a mount-time
 * snapshot) so late joiners are visible, and lets the host seat the table
 * exactly when the room looks right instead of the mount moment deciding.
 */
export function PreDeal({
  game,
  title,
  roomCode,
  roster,
  min,
  max,
  isHost,
  onSeat,
  onExit,
  onAddBot,
  onRemoveBot,
}: {
  game: InviteGame;
  title: string;
  roomCode: string;
  roster: import('../net/presence').Player[];
  min: number;
  max: number;
  isHost: boolean;
  onSeat: () => void;
  onExit: () => void;
  onAddBot: () => void;
  onRemoveBot: (peerId: string) => void;
}) {
  const n = roster.length;
  const ready = n >= min && n <= max;
  const theme = game === 'sh' ? 'secret-hitler' : game === 'judgement' ? 'judgement' : 'one-night';
  return (
    <div
      data-game={theme}
      className="space-y-3"
    >
      <InvitePanel roomCode={roomCode} game={game} />
      <div className="panel cut space-y-3">
        <div className="font-display text-3xl uppercase">{title}</div>
        <AvatarGrid players={roster} minNeeded={min} onRemoveBot={isHost ? onRemoveBot : undefined} />
        {isHost ? (
          <>
            <button
              onClick={onSeat}
              disabled={!ready}
              className="btn-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ready
                ? `Seat the table (${n})`
                : n > max
                  ? `Too many (${n}/${max})`
                  : `Need ${min - n} more`}
            </button>
            <button
              onClick={onAddBot}
              disabled={n >= max}
              className="w-full rounded border border-dashed border-purple-300/40 px-3 py-2 text-sm text-purple-200/90 disabled:opacity-40"
            >
              + Add bot (for testing)
            </button>
            <button
              onClick={onExit}
              className="w-full text-xs text-white/50 underline"
            >
              Back to lobby
            </button>
          </>
        ) : (
          <p className="text-sm text-white/60">
            Waiting for the host to seat the table…
          </p>
        )}
      </div>
    </div>
  );
}
