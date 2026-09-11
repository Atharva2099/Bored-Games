import type { Card } from '../game/judgement/logic';
import { SUIT_SYMBOL } from '../game/judgement/logic';

function isRed(c: Card): boolean {
  return c.suit === 'H' || c.suit === 'D';
}

interface CardFaceProps {
  card: Card;
  small?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  playable?: boolean;
  onClick?: () => void;
}

/**
 * Casino-grade CSS card faces. No external image assets (keeps the repo
 * open-source clean — no copyrighted face art to license). Layered
 * gradients, engraved inner frame, and serif pips give a real-deck feel.
 */
export function CardFace({
  card,
  small,
  dimmed,
  selected,
  playable,
  onClick,
}: CardFaceProps) {
  const red = isRed(card);
  const w = small ? 'w-11 h-16' : 'w-16 h-24 sm:w-[72px] sm:h-[104px]';
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-label={`${card.rank} of ${card.suit}`}
      className={[
        'relative shrink-0 select-none text-left',
        w,
        'rounded-[9px] p-[3px]',
        'bg-gradient-to-br from-neutral-500 via-neutral-200 to-neutral-500',
        'shadow-[0_6px_16px_rgba(0,0,0,0.55)]',
        dimmed ? 'opacity-40 saturate-50' : '',
        selected ? '-translate-y-2 ring-2 ring-emerald-300' : '',
        playable ? 'cursor-pointer hover:-translate-y-1.5 transition-transform' : onClick ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-full w-full flex-col justify-between rounded-[6px] px-1 py-0.5',
          'bg-[radial-gradient(120%_100%_at_50%_0%,#ffffff_0%,#f4f1e8_55%,#e3ddcd_100%)]',
          red ? 'text-[#b3122e]' : 'text-[#17202a]',
        ].join(' ')}
      >
        <span className="flex flex-col items-start leading-none">
          <span
            className={small ? 'text-[11px] font-extrabold' : 'text-sm font-extrabold'}
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {card.rank}
          </span>
          <span className={small ? 'text-[11px]' : 'text-sm'}>{SUIT_SYMBOL[card.suit]}</span>
        </span>
        <span
          className={[
            'self-center leading-none drop-shadow-[0_1px_0_rgba(0,0,0,0.15)]',
            small ? 'text-lg' : 'text-[26px]',
          ].join(' ')}
        >
          {SUIT_SYMBOL[card.suit]}
        </span>
        <span className="flex rotate-180 flex-col items-start leading-none">
          <span
            className={small ? 'text-[11px] font-extrabold' : 'text-sm font-extrabold'}
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {card.rank}
          </span>
          <span className={small ? 'text-[11px]' : 'text-sm'}>{SUIT_SYMBOL[card.suit]}</span>
        </span>
      </span>
    </button>
  );
}

export function CardBack({ small, label }: { small?: boolean; label?: string }) {
  const w = small ? 'w-11 h-16' : 'w-16 h-24 sm:w-[72px] sm:h-[104px]';
  return (
    <span
      className={[
        'relative inline-flex shrink-0 items-center justify-center',
        w,
        'rounded-[9px] bg-gradient-to-br from-indigo-950 via-[#1d2a5e] to-indigo-950',
        'p-[4px] shadow-[0_6px_16px_rgba(0,0,0,0.55)] ring-1 ring-white/25',
      ].join(' ')}
      aria-label={label ?? 'Face-down card'}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-[6px] border border-amber-200/70"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(251,191,36,0.28) 0 2px, transparent 2px 7px), repeating-linear-gradient(-45deg, rgba(147,197,253,0.25) 0 2px, transparent 2px 7px)',
        }}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-300 text-[13px] font-black text-indigo-950 shadow">
          J
        </span>
      </span>
    </span>
  );
}
