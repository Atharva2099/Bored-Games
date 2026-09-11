import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Shared decision popup. Dims the board behind it so one modal reuses the
 * whole screen instead of every decision needing permanent hitboxes.
 * Card is deep ink with cream text in every game (drama + contrast).
 */
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`my-8 w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-2xl bg-[#221812] p-5 text-[#f6f4e7] shadow-[0_24px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/15`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-display text-2xl uppercase leading-none">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Cream player card for picking people inside a modal. */
export function PickCard({
  name,
  sub,
  selected,
  disabled,
  onPick,
}: {
  name: string;
  sub?: string;
  selected?: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className={`flex flex-col items-center gap-1 rounded-xl bg-[#f6f4e7] p-3 text-[#2b2118] transition-all active:scale-95 ${
        selected
          ? 'ring-4 ring-[#f26838]'
          : 'ring-1 ring-black/10 hover:ring-2 hover:ring-black/25'
      } ${disabled ? 'cursor-not-allowed opacity-40 saturate-50' : 'cursor-pointer'}`}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#2b2118]/10 text-xl font-black">
        {(name.trim()[0] ?? '?').toUpperCase()}
      </span>
      <span className="max-w-full truncate text-sm font-bold">{name}</span>
      {sub != null && <span className="text-[11px] text-[#2b2118]/60">{sub}</span>}
    </button>
  );
}

/** Stamp-style JA! / NEIN! ballot card. */
export function BallotStamp({
  ja,
  selected,
  onPick,
}: {
  ja: boolean;
  selected?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`rounded-xl bg-[#f6f4e7] p-2 transition-all active:scale-95 ${
        selected ? 'ring-4 ring-[#f26838]' : 'ring-1 ring-black/10 hover:ring-2 hover:ring-black/25'
      }`}
      aria-label={ja ? 'Ja (yes)' : 'Nein (no)'}
    >
      <span
        className={`font-display block rounded-lg border-4 px-4 py-3 text-center text-4xl ${
          ja ? 'border-[#2b2118] text-[#2b2118]' : 'border-[#2b2118] bg-[#2b2118] text-[#f6f4e7]'
        }`}
      >
        {ja ? 'JA!' : 'NEIN'}
      </span>
    </button>
  );
}

/** The one orange confirm button every modal ends with. */
export function ModalConfirm({
  onConfirm,
  disabled,
  children,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onConfirm}
      className="font-display mt-4 w-full rounded-xl bg-[#f26838] py-3 text-2xl uppercase tracking-wide text-[#f6f4e7] transition-all enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
