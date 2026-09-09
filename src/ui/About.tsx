export function AboutFull() {
  return (
    <div className="text-xs text-white/50 space-y-2 border-t border-white/10 pt-3">
      <div className="font-semibold text-white/70">Credits & licenses</div>
      <p>
        🐺 <span className="text-white/70">Werewolf</span> is a folk party game
        (1986, D. Davidoff). Rules can't be copyrighted; our code, wording
        and art are original. No affiliation with any published edition.
      </p>
      <p>
        🗳️ <span className="text-white/70">Secret Hitler</span> was created by
        Goat, Wolf, &amp; Cabbage LLC (Boxleiter, Maranges, Temkin; art by
        M. Schubert) —{' '}
        <a
          className="underline"
          href="https://www.secrethitler.com"
          target="_blank"
          rel="noreferrer"
        >
          secrethitler.com
        </a>
        . Used here under{' '}
        <a
          className="underline"
          href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY–NC–SA 4.0
        </a>
        : non-commercial fan adaptation, visuals re-drawn, same license
        applies (see <code>src/game/secret-hitler/LICENSE</code>). Web-only —
        never submitted to app stores, per the creators' terms.
      </p>
      <p>
        Our code is MIT (see <code>LICENSE</code>). This project makes no
        money — for friends only.
      </p>
    </div>
  );
}

export function AboutLine() {
  return (
    <div className="text-[11px] text-white/40 text-center">
      Fan project, non-commercial · SH adaptation CC BY–NC–SA 4.0 (Goat, Wolf,
      &amp; Cabbage)
    </div>
  );
}
