export type GamePick = 'werewolf' | 'sh' | 'judgement';

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
        {/* ONE NIGHT card */}
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
              One <span className="text-[#92a9e1]">Night</span>
            </div>
            <span className="text-xs font-bold bg-[#92a9e1] text-black px-2 py-1 uppercase">
              Live
            </span>
          </div>
          <p className="mt-2 text-sm text-white/65">
            One night, one vote. Robbers steal, troublemakers swap, tanners
            want to die. 3–10 players, 10 minutes of lies.
          </p>
          <div
            style={display}
            className="mt-3 text-lg uppercase text-[#e10600]"
          >
            Enter the village →
          </div>
        </button>

        {/* SECRET HITLER card */}
        <button
          onClick={() => onPick('sh')}
          className="w-full text-left border-2 border-white bg-[#0a0a0a] p-5 hover:bg-[#141414] active:scale-[0.99]"
          style={{ clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%, 0 18px)' }}
        >
          <div className="flex items-start justify-between">
            <div
              style={display}
              className="text-4xl uppercase leading-none"
            >
              Secret <span className="text-[#fe8254]">Hitler</span>
            </div>
            <span className="text-xs font-bold bg-[#fe8254] text-black px-2 py-1 uppercase">
              Live
            </span>
          </div>
          <p className="mt-2 text-sm text-white/65">
            Elections, secret policies, executions. Liberals vs fascists,
            5–10 players.
          </p>
          <div
            style={display}
            className="mt-3 text-lg uppercase text-[#e10600]"
          >
            Take power →
          </div>
        </button>

        {/* JUDGEMENT card */}
        <button
          onClick={() => onPick('judgement')}
          className="w-full text-left border-2 border-white bg-[#0a0a0a] p-5 hover:bg-[#141414] active:scale-[0.99]"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 18px 100%, 0 calc(100% - 18px))' }}
        >
          <div className="flex items-start justify-between">
            <div
              style={display}
              className="text-4xl uppercase leading-none"
            >
              Judge<span className="text-[#34d399]">ment</span>
            </div>
            <span className="text-xs font-bold bg-[#34d399] text-black px-2 py-1 uppercase">
              Live
            </span>
          </div>
          <p className="mt-2 text-sm text-white/65">
            Bid your tricks exactly or score zero. 10 rounds, 10 → 1 cards,
            rotating trumps. 3–8 players.
          </p>
          <div
            style={display}
            className="mt-3 text-lg uppercase text-[#e10600]"
          >
            Call your tricks →
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
