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
 * One Night ceremony in official call order. Every wake gets its matching
 * sleep, roles absent from this table are skipped cleanly, and each
 * open-eyes step gets real deliberation time before the close.
 */
export async function narrateONUNight(roles: string[]) {
  const id = ++runId;
  try {
    speechSynthesis.cancel();
  } catch {
    /* no speech support */
  }
  const has = (r: string) => roles.includes(r);
  const seq: CeremonyStep[] = [
    { say: 'Night falls on the village. Everyone, close your eyes.', think: 2500 },
  ];
  if (has('werewolf'))
    seq.push(
      {
        say: 'Werewolves, open your eyes and look for the other werewolf.',
        think: 8000,
      },
      { say: 'Werewolves, close your eyes.' },
    );
  if (has('minion'))
    seq.push(
      { say: 'Minion, open your eyes. Werewolves, stick out your thumb.', think: 7000 },
      { say: 'Werewolves, put your thumbs away. Minion, close your eyes.' },
    );
  if (has('mason'))
    seq.push(
      { say: 'Masons, open your eyes and look for the other mason.', think: 7000 },
      { say: 'Masons, close your eyes.' },
    );
  if (has('seer'))
    seq.push(
      {
        say: 'Seer, open your eyes. You may look at one player\u2019s card, or two cards from the center.',
        think: 10000,
      },
      { say: 'Seer, close your eyes.' },
    );
  if (has('robber'))
    seq.push(
      {
        say: 'Robber, open your eyes. You may take another player\u2019s card and look at it.',
        think: 10000,
      },
      { say: 'Robber, close your eyes.' },
    );
  if (has('troublemaker'))
    seq.push(
      {
        say: 'Troublemaker, open your eyes. You may switch the cards of two other players, without looking.',
        think: 10000,
      },
      { say: 'Troublemaker, close your eyes.' },
    );
  if (has('drunk'))
    seq.push(
      {
        say: 'Drunk, open your eyes and exchange your card with a card from the center, without looking.',
        think: 8000,
      },
      { say: 'Drunk, close your eyes.' },
    );
  if (has('insomniac'))
    seq.push(
      { say: 'Insomniac, open your eyes and look at your card.', think: 6000 },
      { say: 'Insomniac, close your eyes.' },
    );
  seq.push({ say: 'Everyone, wake up. It is dawn. Find the werewolves.' });

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
