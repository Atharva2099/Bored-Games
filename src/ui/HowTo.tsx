import { X } from 'lucide-react';

/** Concise how-to-play overlay. Original wording. */
export function HowToOverlay({ onClose, game = 'onuw' }: { onClose: () => void; game?: 'onuw' | 'sh' | 'judgement' }) {
  if (game === 'judgement') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-auto">
        <div className="panel cut max-w-md w-full my-8 space-y-4" data-game="judgement">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-3xl">How to play Judgement</h2>
            <button onClick={onClose} aria-label="Close" className="text-white/60">
              <X size={20} />
            </button>
          </div>

          <section className="space-y-1 text-sm text-white/75">
            <h3 className="font-bold text-white">Bid exactly, or score nothing</h3>
            <p>
              3–8 players, one 52-card deck. Ten rounds deal 10 → 1 cards.
              Before each round you bid how many tricks you will win. Win
              exactly your bid to score 10 + bid. Win more or fewer and you
              score 0 for the round.
            </p>
          </section>

          <section className="space-y-1 text-sm text-white/75">
            <h3 className="font-bold text-white">Bidding</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Bid 0 up to the hand size, one at a time in turn.</li>
              <li>First bidder rotates every round.</li>
              <li>Last bidder cannot pick the number that makes bids sum to tricks — someone must fail.</li>
            </ul>
          </section>

          <section className="space-y-1 text-sm text-white/75">
            <h3 className="font-bold text-white">Tricks</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Leader plays any card; you must follow the led suit if you can.</li>
              <li>Highest trump wins, else highest card of the led suit. Off-suit cards never win.</li>
              <li>Trick winner leads the next trick.</li>
            </ul>
          </section>

          <section className="space-y-1 text-sm text-white/75">
            <h3 className="font-bold text-white">Trump schedule</h3>
            <p>10c No Trump · 9c Spades · 8c Hearts · 7c Clubs · 6c Diamonds · 5c No Trump · 4c Spades · 3c Hearts · 2c Clubs · 1c Diamonds.</p>
          </section>

          <button onClick={onClose} className="btn-accent">
            Got it
          </button>
        </div>
      </div>
    );
  }
  if (game === 'sh') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-auto">
        <div className="panel cut max-w-md w-full my-8 space-y-4" data-game="secret-hitler">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-3xl">How to play</h2>
            <button onClick={onClose} aria-label="Close" className="text-white/60">
              <X size={20} />
            </button>
          </div>

          <section className="space-y-1 text-sm text-white/75">
            <h3 className="font-bold" style={{ color: '#7aa5ff' }}>Liberals vs Fascists</h3>
            <p>
              Liberals (majority, secret) pass 5 blue policies or kill Hitler.
              Fascists (hidden minority) pass 6 red policies — or elect Hitler
              Chancellor after 3 red policies. Hitler doesn&apos;t know the
              fascists in 7–10 player games.
            </p>
          </section>

          <section className="space-y-1 text-sm text-white/75">
            <h3 className="font-bold" style={{ color: '#7aa5ff' }}>Each round</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>President nominates a Chancellor (not self, not the last elected pair).</li>
              <li>Everyone votes JA! or NEIN! — strict majority passes.</li>
              <li>President draws 3 policies, discards 1; Chancellor enacts 1 of 2.</li>
              <li>3 failed elections in a row → top policy auto-enacts, tracker resets.</li>
            </ul>
          </section>

          <section className="space-y-1 text-sm text-white/75">
            <h3 className="font-bold" style={{ color: '#ff6b7a' }}>Fascist powers & veto</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Red policies unlock presidential powers (shown on each track slot): investigate loyalty, call a special election, peek at policies, execute a player.</li>
              <li>Executing Hitler wins it for the liberals on the spot.</li>
              <li>After 5 red policies, President + Chancellor may jointly veto a hand (counts as a failed election).</li>
            </ul>
          </section>

          <button onClick={onClose} className="btn-accent">
            Got it
          </button>
        </div>
      </div>
    );
  }
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
