import { Moon, Vote } from 'lucide-react';

/** Fine print, game-specific. Render at the bottom of game homescreens only. */
export function WerewolfFinePrint() {
  return (
    <p className="text-[11px] leading-relaxed text-white/35 flex gap-1.5">
      <Moon size={12} className="shrink-0 mt-0.5" />
      <span>
        Werewolf is a folk party game (1986, D. Davidoff). Our code, wording
        and art are original — no affiliation with any published edition.
        Fan project, non-commercial, code MIT.
      </span>
    </p>
  );
}

export function SHFinePrint() {
  return (
    <p className="text-[11px] leading-relaxed text-white/35 flex gap-1.5">
      <Vote size={12} className="shrink-0 mt-0.5" />
      <span>
        Secret Hitler by Goat, Wolf, &amp; Cabbage LLC (
        <a
          className="underline"
          href="https://www.secrethitler.com"
          target="_blank"
          rel="noreferrer"
        >
          secrethitler.com
        </a>
        ), used under{' '}
        <a
          className="underline"
          href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY–NC–SA 4.0
        </a>
        : non-commercial fan adaptation, web-only, same license applies.
      </span>
    </p>
  );
}

/** In-room footer line, matched to the game being played. */
export function RoomFinePrint({ game }: { game: 'werewolf' }) {
  if (game === 'werewolf') {
    return (
      <div className="text-[11px] text-white/35 text-center">
        Fan project, non-commercial · original code MIT · build {__BUILD_ID__}
      </div>
    );
  }
  return null;
}
