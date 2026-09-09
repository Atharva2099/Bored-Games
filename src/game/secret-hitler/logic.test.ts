import { describe, expect, it } from 'vitest';
import {
  assignSHRoles,
  buildPolicyDeck,
  checkSHWinner,
  drawThree,
  eligibleChancellors,
  hitlerChancellorWins,
  powerForSlot,
  resolveSHElection,
  shKnowledge,
  shRoleCounts,
  vetoUnlocked,
} from './logic';

describe('shRoleCounts', () => {
  it('matches the official roster table', () => {
    expect(shRoleCounts(5)).toEqual({ liberals: 3, fascists: 2 });
    expect(shRoleCounts(6)).toEqual({ liberals: 4, fascists: 2 });
    expect(shRoleCounts(7)).toEqual({ liberals: 4, fascists: 3 });
    expect(shRoleCounts(8)).toEqual({ liberals: 5, fascists: 3 });
    expect(shRoleCounts(9)).toEqual({ liberals: 5, fascists: 4 });
    expect(shRoleCounts(10)).toEqual({ liberals: 6, fascists: 4 });
  });
  it('rejects out-of-range tables', () => {
    expect(() => shRoleCounts(4)).toThrow();
    expect(() => shRoleCounts(11)).toThrow();
  });
});

describe('assignSHRoles', () => {
  it('deals exactly 1 hitler with identity shuffle', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const roles = assignSHRoles(ids, (arr) => arr);
    const vals = Object.values(roles);
    expect(vals.filter((r) => r === 'hitler')).toHaveLength(1);
    expect(vals.filter((r) => r === 'fascist')).toHaveLength(3);
    expect(vals.filter((r) => r === 'liberal')).toHaveLength(5);
  });
});

describe('shKnowledge', () => {
  it('fascists always know hitler; hitler knows team only in 5-6p', () => {
    const small = assignSHRoles(['a', 'b', 'c', 'd', 'e'], (x) => x);
    // identity shuffle: a=hitler, b=fascist, c/d/e=liberal
    const kSmall = shKnowledge(small);
    expect(kSmall.hitlerId).toBe('a');
    expect(kSmall.knownFascistsFor('b')).toEqual(['a']);
    expect(kSmall.hitlerKnowsTeam).toBe(true);
    expect(kSmall.knownFascistsFor('a')).toEqual(['b']);
    expect(kSmall.knownFascistsFor('c')).toEqual([]);

    const bigRoles = {
      a: 'hitler',
      b: 'fascist',
      c: 'fascist',
      d: 'liberal',
      e: 'liberal',
      f: 'liberal',
      g: 'liberal',
    } as const;
    const kBig = shKnowledge(bigRoles as never);
    expect(kBig.hitlerKnowsTeam).toBe(false);
    expect(kBig.knownFascistsFor('a')).toEqual([]);
    expect(kBig.knownFascistsFor('b')).toEqual(['a']);
  });
});

describe('policy deck', () => {
  it('builds 6 liberal + 11 fascist', () => {
    const deck = buildPolicyDeck((x) => x);
    expect(deck).toHaveLength(17);
    expect(deck.filter((p) => p === 'liberal')).toHaveLength(6);
    expect(deck.filter((p) => p === 'fascist')).toHaveLength(11);
  });
  it('draws 3 and reshuffles discards when short', () => {
    const r1 = drawThree(['liberal', 'fascist', 'liberal', 'fascist'], [], (x) => x);
    expect(r1.drawn).toHaveLength(3);
    expect(r1.deck).toHaveLength(1);

    const r2 = drawThree(['fascist'], ['liberal', 'liberal', 'fascist'], (x) => x);
    expect(r2.drawn).toHaveLength(3);
    expect(r2.discards).toHaveLength(0);
    expect(r2.deck).toHaveLength(1);
  });
});

describe('powerForSlot', () => {
  it('5-6p board', () => {
    expect(powerForSlot(5, 1)).toBeNull();
    expect(powerForSlot(6, 3)).toBe('peek');
    expect(powerForSlot(5, 4)).toBe('execution');
    expect(powerForSlot(5, 6)).toBeNull();
  });
  it('7-8p board', () => {
    expect(powerForSlot(7, 2)).toBe('investigate');
    expect(powerForSlot(8, 3)).toBe('special');
    expect(powerForSlot(7, 5)).toBe('execution');
  });
  it('9-10p board', () => {
    expect(powerForSlot(9, 1)).toBe('investigate');
    expect(powerForSlot(10, 2)).toBe('investigate');
    expect(powerForSlot(9, 3)).toBe('special');
    expect(powerForSlot(10, 4)).toBe('execution');
  });
  it('veto unlocks at 5 fascist policies', () => {
    expect(vetoUnlocked(4)).toBe(false);
    expect(vetoUnlocked(5)).toBe(true);
  });
});

describe('resolveSHElection', () => {
  it('needs strict majority of the living; ties and missing fail', () => {
    const alive = ['a', 'b', 'c', 'd', 'e'];
    expect(resolveSHElection(['a', 'b', 'c'], alive)).toBe(true);
    expect(resolveSHElection(['a', 'b'], alive)).toBe(false); // tie-ish
    expect(resolveSHElection(['a'], alive)).toBe(false);
    expect(resolveSHElection(['a', 'b', 'c', 'dead'], ['a', 'b', 'c'])).toBe(true);
  });
});

describe('eligibleChancellors', () => {
  it('excludes last elected pair, falls back when all limited', () => {
    expect(eligibleChancellors(['a', 'b', 'c'], 'a', 'b')).toEqual(['c']);
    expect(eligibleChancellors(['a', 'b'], 'a', 'b')).toEqual(['a', 'b']);
    expect(eligibleChancellors(['a', 'b', 'c'], null, null)).toEqual(['a', 'b', 'c']);
  });
});

describe('checkSHWinner', () => {
  it('covers all four endings', () => {
    const base = {
      libTrack: 0,
      fasTrack: 0,
      hitlerIsChancellor: false,
      hitlerExecuted: false,
    };
    expect(checkSHWinner({ ...base, libTrack: 5 })).toBe('liberals');
    expect(checkSHWinner({ ...base, hitlerExecuted: true })).toBe('liberals');
    expect(checkSHWinner({ ...base, fasTrack: 6 })).toBe('fascists');
    expect(checkSHWinner({ ...base, hitlerIsChancellor: true })).toBe('fascists');
    expect(checkSHWinner(base)).toBeNull();
  });
  it('hitler-chancellor win needs 3 fascist policies', () => {
    expect(hitlerChancellorWins(2)).toBe(false);
    expect(hitlerChancellorWins(3)).toBe(true);
  });
});
