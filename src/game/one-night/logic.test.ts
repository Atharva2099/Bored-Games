import { describe, expect, it } from 'vitest';
import {
  applyHunterShot,
  CENTER,
  checkONUWinner,
  deal,
  emptyInputs,
  isWolfPack,
  masons,
  recommendedPool,
  resolveNight,
  resolveVote,
  wolfPack,
  type Cards,
} from './logic';

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `p${i}`);

describe('recommendedPool', () => {
  it('always deals players+3 (verified official 3-5, house 6-10)', () => {
    for (let n = 3; n <= 10; n++)
      expect(recommendedPool(n)).toHaveLength(n + 3);
  });
  it('3p pool is the verified official basic setup', () => {
    const pool = recommendedPool(3);
    expect(pool.filter((r) => r === 'werewolf')).toHaveLength(2);
    expect(pool).toContain('seer');
    expect(pool).toContain('robber');
    expect(pool).toContain('troublemaker');
    expect(pool).toContain('villager');
  });
  it('rejects out-of-range tables', () => {
    expect(() => recommendedPool(2)).toThrow();
    expect(() => recommendedPool(11)).toThrow();
  });
});

describe('deal', () => {
  it('deals players in order, rest to center, exact pool required', () => {
    const players = ids(5);
    const cards = deal(recommendedPool(5), players, (x) => x);
    expect(Object.keys(cards)).toHaveLength(8);
    expect([...CENTER.map((c) => cards[c])]).toHaveLength(3);
    expect(cards['p0']).toBe('werewolf');
    expect(() => deal(['villager'], players)).toThrow();
  });
});

describe('knowledge helpers', () => {
  it('wolves see wolves, masons see masons', () => {
    const cards: Cards = { a: 'werewolf', b: 'werewolf', c: 'mason', d: 'mason', e: 'seer' };
    expect(wolfPack(cards, ['a', 'b', 'c'])).toEqual(['a', 'b']);
    expect(masons(cards, ['a', 'b', 'c', 'd'])).toEqual(['c', 'd']);
    expect(isWolfPack('minion')).toBe(true);
    expect(isWolfPack('tanner')).toBe(false);
  });
});

describe('resolveNight order', () => {
  it('seer views pre-swap, robber/trouble/drunk chain in order', () => {
    // p0 seer views p1(robber); p1 steals p2; p3 trouble-swaps p4,p5; p6 drunk takes center
    const players = ids(7);
    const initial: Cards = {
      p0: 'seer',
      p1: 'robber',
      p2: 'villager',
      p3: 'troublemaker',
      p4: 'werewolf',
      p5: 'tanner',
      p6: 'drunk',
      c0: 'hunter',
      c1: 'mason',
      c2: 'insomniac',
    };
    const inputs = {
      ...emptyInputs(),
      seerPlayer: 'p1',
      seerCenter: null,
      robberTarget: 'p2',
      troublePair: ['p4', 'p5'] as [string, string],
      drunkCenter: 0,
    };
    const { final, seen } = resolveNight(initial, players, inputs);
    // seer saw robber BEFORE the steal
    expect(seen['p0']).toEqual(['robber']);
    // robber now holds villager, p2 holds robber
    expect(final['p1']).toBe('villager');
    expect(final['p2']).toBe('robber');
    expect(seen['p1']).toEqual(['villager']);
    // trouble swapped wolf/tanner AFTER robber acted
    expect(final['p4']).toBe('tanner');
    expect(final['p5']).toBe('werewolf');
    // drunk took hunter from center blind
    expect(final['p6']).toBe('hunter');
    expect(final['c0']).toBe('drunk');
  });

  it('lone wolf peeks center; pack wolves get no peek', () => {
    const players = ids(4);
    const solo: Cards = { p0: 'werewolf', p1: 'seer', p2: 'robber', p3: 'villager', c0: 'hunter', c1: 'mason', c2: 'tanner' };
    const r1 = resolveNight(solo, players, { ...emptyInputs(), loneWolfCenter: 2 });
    expect(r1.seen['p0']).toEqual(['tanner']);
    const pack: Cards = { ...solo, p3: 'werewolf' };
    const r2 = resolveNight(pack, players, { ...emptyInputs(), loneWolfCenter: 2 });
    expect(r2.seen['p0']).toBeUndefined();
  });

  it('invalid inputs are ignored, never throw', () => {
    const players = ids(3);
    const initial: Cards = { p0: 'robber', p1: 'villager', p2: 'villager', c0: 'seer', c1: 'seer', c2: 'seer' };
    const r = resolveNight(initial, players, {
      ...emptyInputs(),
      robberTarget: 'p0', // self-steal invalid
      troublePair: ['p1', 'nope'] as [string, string],
      drunkCenter: 9,
      seerCenter: [0, 0] as [number, number],
    });
    expect(r.final).toEqual(initial);
  });

  it('insomniac views final own card', () => {
    const players = ids(4);
    const initial: Cards = { p0: 'insomniac', p1: 'robber', p2: 'villager', p3: 'villager', c0: 'seer', c1: 'seer', c2: 'seer' };
    // robber steals insomniac: robber (now holding it) sees it
    const r = resolveNight(initial, players, { ...emptyInputs(), robberTarget: 'p0' });
    expect(r.final['p1']).toBe('insomniac');
    expect(r.seen['p1']).toEqual(['insomniac']);
  });
});

describe('resolveVote', () => {
  it('plurality wins, ties and empties kill nobody', () => {
    expect(resolveVote({ a: 'b', b: 'b', c: 'a' }, ['a', 'b', 'c'])).toBe('b');
    expect(resolveVote({ a: 'b', b: 'a' }, ['a', 'b'])).toBeNull();
    expect(resolveVote({}, ['a'])).toBeNull();
    expect(resolveVote({ dead: 'a', a: 'b' }, ['a', 'b'])).toBe('b');
  });
});

describe('applyHunterShot', () => {
  it('hunter death takes the target down too', () => {
    const final: Cards = { a: 'hunter', b: 'werewolf', c: 'seer' };
    expect(applyHunterShot(['a'], final, 'b')).toEqual(['a', 'b']);
    expect(applyHunterShot(['c'], final, 'b')).toEqual(['c']);
    expect(applyHunterShot(['a'], final, null)).toEqual(['a']);
  });
});

describe('checkONUWinner', () => {
  const P = ['a', 'b', 'c'];
  it('wolf voted out -> village team wins', () => {
    const final: Cards = { a: 'werewolf', b: 'seer', c: 'villager' };
    const out = checkONUWinner(final, P, ['a']);
    expect(out.winnerIds).toEqual(expect.arrayContaining(['b', 'c']));
    expect(out.winnerIds).not.toContain('a');
  });
  it('no wolf dies, wolves exist -> pack wins', () => {
    const final: Cards = { a: 'werewolf', b: 'minion', c: 'seer' };
    expect(checkONUWinner(final, P, ['c']).winnerIds).toEqual(
      expect.arrayContaining(['a', 'b']),
    );
  });
  it('tanner dies alone -> only tanner wins', () => {
    const final: Cards = { a: 'tanner', b: 'seer', c: 'werewolf' };
    const out = checkONUWinner(final, P, ['a']);
    expect(out.winnerIds).toEqual(['a']);
  });
  it('tanner + wolf die -> tanner AND village win', () => {
    const final: Cards = { a: 'tanner', b: 'werewolf', c: 'seer' };
    const out = checkONUWinner(final, P, ['a', 'b']);
    expect(out.winnerIds).toEqual(expect.arrayContaining(['a', 'c']));
    expect(out.winnerIds).not.toContain('b');
  });
  it('hunter shot flipping the outcome counts', () => {
    const final: Cards = { a: 'hunter', b: 'werewolf', c: 'seer' };
    const died = applyHunterShot(['a'], final, 'b');
    expect(checkONUWinner(final, P, died).winnerIds).toEqual(
      expect.arrayContaining(['a', 'c']),
    );
  });
  it('no wolves anywhere, nobody dies -> village wins', () => {
    const final: Cards = { a: 'seer', b: 'villager', c: 'tanner' };
    expect(checkONUWinner(final, P, []).winnerIds).toEqual(
      expect.arrayContaining(['a', 'b']),
    );
  });
  it('no wolves, minion alive, villager dies -> minion wins', () => {
    const final: Cards = { a: 'minion', b: 'seer', c: 'villager' };
    expect(checkONUWinner(final, P, ['c']).winnerIds).toEqual(['a']);
  });
});
