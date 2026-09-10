import { X } from 'lucide-react';

/** Concise how-to-play overlay for One Night. Original wording. */
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
          <h3 className="font-bold text-white">One night, one vote</h3>
          <p>
            Everyone gets a secret card, 3 cards sit in the center. Roles act
            once, in order, overnight. By day you talk, then vote one player
            to eliminate. Ties kill nobody. Then every card flips and winners
            are decided by what the cards say <em>now</em> — not what anyone
            started with.
          </p>
        </section>

        <section className="space-y-1 text-sm text-white/75">
          <h3 className="font-bold text-white">Night order</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Werewolves see each other (lone wolf peeks at the center).</li>
            <li>Minion learns the wolves. Masons find each other.</li>
            <li>Seer peeks at one player or two center cards.</li>
            <li>Robber swaps with a player and looks. Troublemaker swaps two others, blind.</li>
            <li>Drunk swaps with the center, blind. Insomniac checks her own final card.</li>
            <li>Hunter, Tanner, Villagers sleep.</li>
          </ul>
        </section>

        <section className="space-y-1 text-sm text-white/75">
          <h3 className="font-bold text-white">Who wins</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>A werewolf dies → village team wins (even if others die too).</li>
            <li>No wolf dies, wolves exist → wolf pack (wolves + minion) wins.</li>
            <li>Tanner dies → tanner wins; village too if a wolf also died.</li>
            <li>Hunter dies → whoever the hunter points at dies as well.</li>
          </ul>
        </section>

        <section className="space-y-1 text-sm text-white/75">
          <h3 className="font-bold text-white">Table size</h3>
          <p>
            3–10 players, always 3 center cards. 3–5 use the official basic
            setup; larger tables add Tanner, Drunk, Hunter, Minion, Masons
            and Insomniac.
          </p>
        </section>

        <button onClick={onClose} className="btn-accent">
          Got it
        </button>
      </div>
    </div>
  );
}
