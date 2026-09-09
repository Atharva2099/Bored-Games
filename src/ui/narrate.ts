// Browser speech narration for night phases. Uses the built-in
// SpeechSynthesis voice — no downloads, no keys, works offline.
let runId = 0;

export function cancelSpeech() {
  runId++;
  try {
    speechSynthesis.cancel();
  } catch {
    /* no speech support */
  }
}

function speakAndWait(text: string, id: number): Promise<void> {
  return new Promise((res) => {
    const done = () => res();
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.onend = done;
      u.onerror = done;
      // speak on a fresh tick: cancel() same-tick can eat the new line
      setTimeout(() => {
        if (runId !== id) return done();
        try {
          speechSynthesis.speak(u);
        } catch {
          done();
        }
      }, 150);
      // safety net for dropped end events (~8 words/sec + margin)
      const cap = 6000 + text.split(' ').length * 900;
      setTimeout(() => {
        if (runId === id) done();
      }, cap);
    } catch {
      done();
    }
  });
}

/** Breathing room after a line: the table actually deliberates. */
function deliberate(ms: number, id: number): Promise<void> {
  return new Promise((res) => {
    const step = 250;
    let waited = 0;
    const tick = () => {
      if (runId !== id || waited >= ms) return res();
      waited += step;
      setTimeout(tick, step);
    };
    setTimeout(tick, step);
  });
}

interface CeremonyStep {
  say: string;
  /** silent choosing time after the line, for open-eyes steps */
  think?: number;
}

/**
 * Fixed-order night ceremony. Every wake gets its matching sleep, roles
 * absent from this table are skipped cleanly, and each open-eyes step
 * gets real deliberation time before the close.
 */
export async function narrateNight(
  day: number,
  opts: { wolves: boolean; seer: boolean; doctor: boolean },
) {
  const id = ++runId;
  try {
    speechSynthesis.cancel();
  } catch {
    /* no speech support */
  }
  const seq: CeremonyStep[] = [
    { say: `Night ${day} falls. Everyone, close your eyes.`, think: 2500 },
  ];
  if (opts.wolves)
    seq.push(
      {
        say: 'Werewolves, open your eyes. Silently agree on one victim.',
        think: 9000,
      },
      { say: 'Werewolves, close your eyes.' },
    );
  if (opts.doctor)
    seq.push(
      {
        say: 'Doctor, open your eyes. Choose one person to save.',
        think: 9000,
      },
      { say: 'Doctor, close your eyes.' },
    );
  if (opts.seer)
    seq.push(
      {
        say: 'Seer, open your eyes. Choose one person to inspect.',
        think: 9000,
      },
      { say: 'Seer, close your eyes.' },
    );
  seq.push({ say: 'Everyone, wake up. It is dawn.' });

  for (const step of seq) {
    if (runId !== id) return;
    await speakAndWait(step.say, id);
    if (runId !== id) return;
    // beat between lines so nothing runs together
    await deliberate(1200, id);
    if (step.think && runId === id) await deliberate(step.think, id);
  }
}

/** One-line cue for phase changes on any device. */
export function speakCue(text: string) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    speechSynthesis.speak(u);
  } catch {
    /* no speech support */
  }
}
