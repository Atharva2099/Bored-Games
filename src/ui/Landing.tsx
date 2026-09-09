import { SHFinePrint } from './About';

export type GamePick = 'werewolf' | 'sh';

/** Brand mark that always leads home. */
export function HomeLogo({ onHome, size = 30 }: { onHome: () => void; size?: number }) {
  return (
    <button onClick={onHome} aria-label="Home" className="shrink-0">
      <img
        src="./apple-touch-icon.png"
        alt="Bored Games home"
        width={size}
        height={size}
        className="rounded-lg"
      />
    </button>
  );
}

const display = {
  fontFamily: "'Anton', Impact, 'Arial Narrow', sans-serif",
};

/** AMOLED vanta-punk landing: pure black, blood red, bone white. */
export function Landing({ onPick }: { onPick: (g: GamePick) => void }) {
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* red sun disc + speed lines */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#e10600]"
        />
        <div
          aria-hidden
          className="absolute top-0 left-0 h-full w-full opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(115deg, transparent 0 14px, #e10600 14px 15px)',
          }}
        />
        <header className="relative px-5 pt-6 pb-6">
          <HomeLogo onHome={() => window.scrollTo({ top: 0 })} />
          <div className="text-xs tracking-[0.35em] text-[#e10600] font-bold mt-4">
            SOCIAL DEDUCTION DEN
          </div>
          <h1
            style={display}
            className="leading-[0.9] text-6xl mt-2 uppercase"
          >
            Bored
            <br />
            <span
              className="text-transparent"
              style={{ WebkitTextStroke: '2px #fff' }}
            >
              Games
            </span>
          </h1>
          <p className="mt-3 max-w-xs text-sm text-white/70">
            Lie to your friends. Free forever, no sign-up — one host, one
            room code, every phone joins.
          </p>
        </header>
      </div>

      {/* slashed divider */}
      <div
        aria-hidden
        className="h-3 bg-[#e10600]"
        style={{ clipPath: 'polygon(0 100%, 100% 0, 100% 100%, 0 100%)' }}
      />

      <main className="px-5 py-6 space-y-4 max-w-xl mx-auto">
        {/* WEREWOLF card */}
        <button
          onClick={() => onPick('werewolf')}
          className="w-full text-left border-2 border-white bg-[#0a0a0a] p-5 hover:bg-[#141414] active:scale-[0.99]"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%)' }}
        >
          <div className="flex items-start justify-between">
            <div
              style={display}
              className="text-4xl uppercase leading-none"
            >
              Were<span className="text-[#92a9e1]">wolf</span>
            </div>
            <span className="text-xs font-bold bg-[#92a9e1] text-black px-2 py-1 uppercase">
              Live
            </span>
          </div>
          <p className="mt-2 text-sm text-white/65">
            Night kills, seer checks, day trials. 5+ for a full hunt — fewer
            starts a demo.
          </p>
          <div
            style={display}
            className="mt-3 text-lg uppercase text-[#e10600]"
          >
            Enter the den →
          </div>
        </button>

        {/* SECRET HITLER card */}
        <button
          onClick={() => onPick('sh')}
          className="w-full text-left border-2 border-white/40 bg-[#0a0a0a] p-5 hover:bg-[#141414] active:scale-[0.99]"
          style={{ clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%, 0 18px)' }}
        >
          <div className="flex items-start justify-between">
            <div
              style={display}
              className="text-4xl uppercase leading-none"
            >
              Secret <span className="text-[#fe8254]">Hitler</span>
            </div>
            <span className="text-xs font-bold border border-[#fe8254] text-[#fe8254] px-2 py-1 uppercase">
              Soon
            </span>
          </div>
          <p className="mt-2 text-sm text-white/65">
            Elections, policies, executions. Rules engine done — the table
            is being built.
          </p>
          <div
            style={display}
            className="mt-3 text-lg uppercase text-white/50"
          >
            View intel →
          </div>
        </button>

        {/* how it plays */}
        <div className="grid grid-cols-3 gap-2 pt-2 text-center">
          {[
            ['01', 'Host creates'],
            ['02', 'Crew scans'],
            ['03', 'Somebody lies'],
          ].map(([n, t]) => (
            <div key={n} className="border border-white/25 bg-black py-3 px-1">
              <div style={display} className="text-2xl text-[#e10600]">
                {n}
              </div>
              <div className="text-xs text-white/70 mt-1">{t}</div>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-5 pb-8 text-center text-[11px] text-white/35">
        Fan project · non-commercial · SH adaptation CC BY–NC–SA 4.0 · build {__BUILD_ID__}
      </footer>
    </div>
  );
}

/** Placeholder panel for Secret Hitler until the table UI ships. */
export function SHTeaser({ onBack }: { onBack: () => void }) {
  return (
    <div
      data-game="secret-hitler"
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#3f5a62' }}
    >
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 border border-white/15 bg-black/30">
        <div className="flex items-center justify-between">
          <HomeLogo onHome={onBack} size={26} />
          <button onClick={onBack} className="text-xs text-white/60 underline">
            All games
          </button>
        </div>
        <h1
          className="text-3xl uppercase"
          style={{ fontFamily: "'Anton', Impact, sans-serif" }}
        >
          Secret <span style={{ color: '#fe8254' }}>Hitler</span>
        </h1>
        <div className="text-sm text-white/75 space-y-2">
          <p>
            5–10 players: Liberals vs Fascists + Hitler. Elections, policy
            decks, presidential powers, executions.
          </p>
          <p className="font-mono text-xs">
            5p 3L+2F · 6p 4L+2F · 7p 4L+3F · 8p 5L+3F · 9p 5L+4F · 10p 6L+4F
          </p>
          <p className="text-white/60">
            Status: rules engine tested and merged. Multiplayer table next —
            see <code>docs/secret-hitler.md</code>.
          </p>
        </div>
        <SHFinePrint />
      </div>
    </div>
  );
}
