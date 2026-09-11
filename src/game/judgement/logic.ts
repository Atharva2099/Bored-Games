// Pure Judgement (Oh Hell! variant) rules engine. No network, no UI.
//
// Original code for this project, released under the same terms as the
// repository (see LICENSE at repo root). The game mechanics themselves
// follow the rules supplied for this table; all code and wording are original.
export type Suit = 'S' | 'H' | 'C' | 'D';
export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUITS: Suit[] = ['S', 'H', 'C', 'D'];
export const RANKS: Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

export const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  C: '♣',
  D: '♦',
};

export const SUIT_NAME: Record<Suit, string> = {
  S: 'Spades',
  H: 'Hearts',
  C: 'Clubs',
  D: 'Diamonds',
};

export function cardId(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export function parseCard(id: string): Card {
  const suit = id.slice(-1) as Suit;
  const rank = id.slice(0, -1) as Rank;
  if (!SUITS.includes(suit) || !(rank in RANK_VALUE))
    throw new Error(`Bad card id: ${id}`);
  return { suit, rank };
}

/** Full 52-card deck, sorted. Shuffle before dealing. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  return deck;
}

export function randomShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ten rounds, decreasing hand size 10 -> 1. */
export const HAND_SIZES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

/** Trump per round index. null = No Trump. */
export const TRUMP_SCHEDULE: (Suit | null)[] = [
  null, // 10 cards
  'S', // 9
  'H', // 8
  'C', // 7
  'D', // 6
  null, // 5
  'S', // 4
  'H', // 3
  'C', // 2
  'D', // 1
];

export function trumpForRound(roundIndex: number): Suit | null {
  if (roundIndex < 0 || roundIndex >= TRUMP_SCHEDULE.length)
    throw new Error('Round index out of range (0-9)');
  return TRUMP_SCHEDULE[roundIndex];
}

export function handSizeForRound(roundIndex: number): number {
  if (roundIndex < 0 || roundIndex >= HAND_SIZES.length)
    throw new Error('Round index out of range (0-9)');
  return HAND_SIZES[roundIndex];
}

export function maxPlayersForRound(roundIndex: number): number {
  return Math.floor(52 / handSizeForRound(roundIndex));
}

/**
 * Deal handSize cards to each player from a shuffled deck.
 * Returns hands keyed by player id, in seat order.
 */
export function dealHands(
  playerIds: string[],
  handSize: number,
  shuffle: <T>(arr: T[]) => T[] = randomShuffle,
): Record<string, Card[]> {
  if (playerIds.length < 3 || playerIds.length > 8)
    throw new Error('Judgement needs 3-8 players');
  if (handSize < 1 || handSize > 10)
    throw new Error('Hand size must be 1-10');
  if (playerIds.length * handSize > 52)
    throw new Error('Not enough cards to deal');
  const deck = shuffle(buildDeck());
  const hands: Record<string, Card[]> = {};
  playerIds.forEach((id, i) => {
    hands[id] = deck.slice(i * handSize, (i + 1) * handSize);
  });
  return hands;
}

/** Sort a hand for display: suits S,H,C,D then rank ascending. */
export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
  return [...hand].sort(
    (a, b) =>
      suitOrder[a.suit] - suitOrder[b.suit] ||
      RANK_VALUE[a.rank] - RANK_VALUE[b.rank],
  );
}

/**
 * Bidding order for a round: rotate seats so the first bidder moves each
 * round. Round 0 starts at seats[0], round 1 at seats[1], etc.
 */
export function bidOrderForRound(seats: string[], roundIndex: number): string[] {
  if (seats.length === 0) return [];
  const start = ((roundIndex % seats.length) + seats.length) % seats.length;
  return [...seats.slice(start), ...seats.slice(0, start)];
}

/**
 * Forbidden bid for the final bidder: the value that would make the bids
 * sum exactly to the number of tricks. Returns null when not applicable
 * (not the last bidder, or the value is outside 0..handSize).
 */
export function forbiddenLastBid(
  existingBidsTotal: number,
  handSize: number,
  isLastBidder: boolean,
): number | null {
  if (!isLastBidder) return null;
  const forbidden = handSize - existingBidsTotal;
  if (forbidden < 0 || forbidden > handSize) return null;
  return forbidden;
}

export function isBidLegal(
  bid: number,
  existingBidsTotal: number,
  handSize: number,
  isLastBidder: boolean,
): boolean {
  if (!Number.isInteger(bid) || bid < 0 || bid > handSize) return false;
  const forbidden = forbiddenLastBid(existingBidsTotal, handSize, isLastBidder);
  if (forbidden !== null && bid === forbidden) return false;
  return true;
}

export interface TrickPlay {
  peerId: string;
  card: Card;
}

/**
 * Legal plays from a hand given the led suit. Must follow suit if possible.
 * Empty leadSuit (leader) => every card is legal.
 */
export function legalPlays(hand: Card[], leadSuit: Suit | null): Card[] {
  if (!leadSuit) return [...hand];
  const follow = hand.filter((c) => c.suit === leadSuit);
  return follow.length > 0 ? follow : [...hand];
}

export function isPlayLegal(
  hand: Card[],
  card: Card,
  leadSuit: Suit | null,
): boolean {
  if (!hand.some((c) => c.suit === card.suit && c.rank === card.rank))
    return false;
  return legalPlays(hand, leadSuit).some(
    (c) => c.suit === card.suit && c.rank === card.rank,
  );
}

/**
 * Winner of a completed trick. Highest trump wins if any trump was played,
 * else highest card of the led suit. Unrelated suits can never win.
 */
export function trickWinner(
  plays: TrickPlay[],
  trump: Suit | null,
): string {
  if (plays.length === 0) throw new Error('Empty trick');
  const led = plays[0].card.suit;
  const trumps = trump ? plays.filter((p) => p.card.suit === trump) : [];
  const contenders = trumps.length > 0
    ? trumps
    : plays.filter((p) => p.card.suit === led);
  let best = contenders[0];
  for (const p of contenders.slice(1)) {
    if (RANK_VALUE[p.card.rank] > RANK_VALUE[best.card.rank]) best = p;
  }
  return best.peerId;
}

/** Score for one round: 10 + bid if exact, else 0. */
export function scoreRound(bid: number, won: number): number {
  return won === bid ? 10 + bid : 0;
}

export function roundScores(
  bids: Record<string, number>,
  won: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(bids)) out[id] = scoreRound(bids[id], won[id] ?? 0);
  return out;
}

export function overallWinners(scores: Record<string, number>): string[] {
  let top = -Infinity;
  for (const v of Object.values(scores)) if (v > top) top = v;
  return Object.keys(scores).filter((id) => scores[id] === top);
}
