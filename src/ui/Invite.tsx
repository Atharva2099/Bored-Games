import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Share2 } from 'lucide-react';

export type InviteGame = 'sh' | 'one-night';

export function joinUrl(roomCode: string, game?: InviteGame) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?room=${encodeURIComponent(roomCode)}${game ? `&game=${game}` : ''}`;
}

/**
 * Infer the game from a room code prefix (SH-/NIGHT-) when no explicit
 * game param is present — e.g. hand-typed codes.
 */
export function gameFromCode(roomCode: string): InviteGame {
  return roomCode.trim().toUpperCase().startsWith('SH-') ? 'sh' : 'one-night';
}

/**
 * Invite bar for use INSIDE a running game (the lobby QR disappears once
 * the game starts, so late joiners need a way in). Collapsed to one slim
 * row to save phone space; expands to QR + tappable code + copy button.
 */
export function InvitePanel({ roomCode, game }: { roomCode: string; game: InviteGame }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = joinUrl(roomCode, game);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user can long-press the code text instead */
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full panel cut flex items-center gap-2 py-2 text-sm text-white/70"
      >
        <Share2 size={14} />
        <span className="font-mono font-bold text-white">{roomCode}</span>
        <span className="ml-auto text-xs underline">Invite</span>
      </button>
    );
  }

  return (
    <div className="panel cut space-y-2">
      <div className="flex gap-3 items-center">
        <div className="bg-white p-2 rounded shrink-0">
          <QRCodeSVG value={url} size={120} />
        </div>
        <div className="text-sm min-w-0">
          <div className="font-semibold text-white">Scan to join</div>
          <div className="font-mono font-bold text-base select-all">{roomCode}</div>
          <div className="text-white/50 text-xs break-all select-all">{url}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={copy}
          className="rounded border border-white/20 px-2 py-1.5 text-sm flex items-center justify-center gap-1"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded border border-white/20 px-2 py-1.5 text-sm text-white/70"
        >
          Hide
        </button>
      </div>
    </div>
  );
}
