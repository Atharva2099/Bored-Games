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
      u.rate = 1.02;
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
      }, 120);
      // safety net for dropped end events
      setTimeout(() => {
        if (runId === id) done();
      }, 10000);
    } catch {
      done();
    }
  });
}

/** Full night ceremony for the host's device. Cancels if superseded. */
export async function narrateNight(
  day: number,
  opts: { seer: boolean; doctor: boolean },
) {
  const id = ++runId;
  try {
    speechSynthesis.cancel();
  } catch {
    /* no speech support */
  }
  const lines = [
    `Night ${day} falls. Everyone, close your eyes.`,
    'Werewolves, open your eyes. Silently choose your victim.',
    ...(opts.doctor
      ? ['Werewolves, close your eyes. Doctor, wake up. Choose someone to save.']
      : []),
    ...(opts.seer
      ? ['Doctor, close your eyes. Seer, wake up. Choose someone to inspect.']
      : []),
    'Everyone, close your eyes. Wake up — it is dawn.',
  ];
  for (const line of lines) {
    if (runId !== id) return;
    await speakAndWait(line, id);
  }
}

/** One-line cue for phase changes on any device. */
export function speakCue(text: string) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* no speech support */
  }
}
