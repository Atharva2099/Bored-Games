import { describe, expect, it } from 'vitest';
import {
  bidOrderForRound,
  buildDeck,
  dealHands,
  forbiddenLastBid,
  handSizeForRound,
  isBidLegal,
  isPlayLegal,
  legalPlays,
  overallWinners,
  roundScores,
  scoreRound,
  trickWinner,
  trumpForRound,
} from './logic';

describe('deck', () => {
  it('builds 52 unique cards', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });

  it('deals unique hands per player', () => {
    const seats = ['a', 'b', 'c', 'd', 'e'];
    const hands = dealHands(seats, 7);
    for (const s of seats) expect(hands[s]).toHaveLength(7);
    const all = seats.flatMap((s) => hands[s].map((c) => `${c.rank}${c.suit}`));
    expect(new Set(all).size).toBe(35);
  });
});

describe('schedule', () => {
  it('runs 10 -> 1', () => {
    expect(Array.from({ length: 10 }, (_, i) => handSizeForRound(i))).toEqual([
      10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
  });

  it('matches the specified trump table', () => {
    expect(Array.from({ length: 10 }, (_, i) => trumpForRound(i))).toEqual([
      null, 'S', 'H', 'C', 'D', null, 'S', 'H', 'C', 'D',
    ]);
  });
});

describe('bidding', () => {
  it('rotates first bidder', () => {
    const seats = ['a', 'b', 'c'];
    expect(bidOrderForRound(seats, 0)).toEqual(['a', 'b', 'c']);
    expect(bidOrderForRound(seats, 1)).toEqual(['b', 'c', 'a']);
    expect(bidOrderForRound(seats, 3)).toEqual(['a', 'b', 'c']);
  });

  it('forbids the bid that makes sum == tricks', () => {
    // 7 tricks, existing 5 -> last bidder cannot bid 2
    expect(forbiddenLastBid(5, 7, true)).toBe(2);
    expect(isBidLegal(2, 5, 7, true)).toBe(false);
    expect(isBidLegal(3, 5, 7, true)).toBe(true);
    expect(isBidLegal(2, 5, 7, false)).toBe(true);
  });
});

describe('play', () => {
  it('forces following suit', () => {
    const hand = [
      { suit: 'H' as const, rank: 'A' as const },
      { suit: 'S' as const, rank: '2' as const },
    ];
    expect(legalPlays(hand, 'H')).toHaveLength(1);
    expect(isPlayLegal(hand, { suit: 'S', rank: '2' }, 'H')).toBe(false);
    expect(isPlayLegal(hand, { suit: 'H', rank: 'A' }, 'H')).toBe(true);
  });

  it('trump beats led suit; led beats off-suit', () => {
    const plays = [
      { peerId: 'a', card: { suit: 'H' as const, rank: 'A' as const } },
      { peerId: 'b', card: { suit: 'H' as const, rank: 'K' as const } },
      { peerId: 'c', card: { suit: 'S' as const, rank: '2' as const } },
    ];
    expect(trickWinner(plays, 'S')).toBe('c');
    expect(trickWinner(plays, null)).toBe('a');
    // off-suit non-trump can never win
    const plays2 = [
      { peerId: 'a', card: { suit: 'C' as const, rank: '5' as const } },
      { peerId: 'b', card: { suit: 'D' as const, rank: 'A' as const } },
    ];
    expect(trickWinner(plays2, null)).toBe('a');
  });
});

describe('scoring', () => {
  it('10 + bid on exact, else 0', () => {
    expect(scoreRound(0, 0)).toBe(10);
    expect(scoreRound(2, 2)).toBe(12);
    expect(scoreRound(3, 4)).toBe(0);
    expect(scoreRound(3, 2)).toBe(0);
    expect(scoreRound(0, 1)).toBe(0);
  });

  it('totals and picks winners', () => {
    expect(roundScores({ a: 2, b: 1 }, { a: 2, b: 0 })).toEqual({ a: 12, b: 0 });
    expect(overallWinners({ a: 30, b: 30, c: 10 })).toEqual(['a', 'b']);
  });
});
