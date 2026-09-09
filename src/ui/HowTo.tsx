import { X } from 'lucide-react';

/** Concise how-to-play overlay for Werewolf. Original wording. */
export function HowToOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-auto">
      <div className="panel cut max-w-md w-full my-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl">How to play</h2>
          <button onClick={onClose} aria-label="Close" className="text-white/60">
            <X size={20} />
          </button>
        </div>

        <section className="space-y-1 text-sm text-white/75">
          <h3 className="font-bold text-white">The goal</h3>
          <p>
            Villagers win by eliminating all Werewolves. Werewolves win when
            they equal the remaining villagers. Nobody knows anyone's role —
            lie, deduce, survive.
          </p>
        </section>

        <section className="space-y-1 text-sm text-white/75">
          <h3 className="font-bold text-white">Night (secret picks)</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Werewolves agree on one victim.</li>
            <li>Seer inspects one player, learns their true role.</li>
            <li>Doctor saves one player — matching the victim stops the kill.</li>
            <li>Villagers sleep. The host resolves when all picks land.</li>
          </ul>
        </section>

        <section className="space-y-1 text-sm text-white/75">
          <h3 className="font-bold text-white">Day (talk + vote)</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Dawn reveals who died. Discuss, accuse, defend.</li>
            <li>Everyone votes one suspect. Ties exile nobody.</li>
            <li>Dead players watch silently — no hints.</li>
          </ul>
        </section>

        <section className="space-y-1 text-sm text-white/75">
          <h3 className="font-bold text-white">Table size</h3>
          <p>
            5+ for a full hunt (Seer at 6+, Doctor at 7+, third wolf at 11+).
            Fewer starts a demo with trimmed roles.
          </p>
        </section>

        <button onClick={onClose} className="btn-accent">
          Got it
        </button>
      </div>
    </div>
  );
}
