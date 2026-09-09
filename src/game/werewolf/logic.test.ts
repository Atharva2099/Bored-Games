import { describe, expect, it } from 'vitest';
import {
  assignRoles,
  checkWinner,
  resolveNight,
  resolveVote,
  roleCounts,
} from './logic';

describe('roleCounts', () => {
  it('demo tables let 1-4 players start', () => {
    expect(roleCounts(1)).toEqual({
      werewolf: 0,
      seer: 0,
      doctor: 0,
      villager: 1,
    });
    expect(roleCounts(2).werewolf).toBe(1);
    expect(roleCounts(4)).toEqual({
      werewolf: 1,
      seer: 1,
      doctor: 1,
      villager: 1,
    });
  });
  it('scales wolves and support roles', () => {
    expect(roleCounts(5)).toEqual({
      werewolf: 1,
      seer: 0,
      doctor: 0,
      villager: 4,
    });
    expect(roleCounts(7)).toEqual({
      werewolf: 2,
      seer: 1,
      doctor: 1,
      villager: 3,
    });
    expect(roleCounts(12).werewolf).toBe(3);
  });
});

describe('assignRoles', () => {
  it('deals exact counts with identity shuffle', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const roles = assignRoles(ids, (arr) => arr);
    expect(Object.keys(roles)).toHaveLength(7);
    expect(Object.values(roles).filter((r) => r === 'werewolf')).toHaveLength(
      2,
    );
  });
});

describe('resolveNight', () => {
  const roles = { w: 'werewolf', v: 'villager', d: 'doctor' } as const;
  it('kill lands when not saved', () => {
    expect(
      resolveNight(
        { wolfTarget: 'v', doctorSave: 'd', seerCheck: null },
        roles as never,
      ).diedId,
    ).toBe('v');
  });
  it('save cancels kill on same target, no kill otherwise', () => {
    expect(
      resolveNight(
        { wolfTarget: 'v', doctorSave: 'v', seerCheck: null },
        roles as never,
      ).diedId,
    ).toBeNull();
    expect(
      resolveNight(
        { wolfTarget: null, doctorSave: 'v', seerCheck: null },
        roles as never,
      ).diedId,
    ).toBeNull();
  });
});

describe('resolveVote', () => {
  it('exiles plurality, tie or empty = nobody', () => {
    expect(
      resolveVote({ a: 'b', b: 'b', c: 'a' }, ['a', 'b', 'c']),
    ).toBe('b');
    expect(resolveVote({ a: 'b', b: 'a' }, ['a', 'b'])).toBeNull();
    expect(resolveVote({}, ['a', 'b'])).toBeNull();
  });
  it('ignores dead voters and votes for dead players', () => {
    expect(resolveVote({ a: 'b', dead: 'b' }, ['a', 'b'])).toBe('b');
    expect(resolveVote({ a: 'dead' }, ['a', 'b'])).toBeNull();
  });
});

describe('checkWinner', () => {
  it('villagers win when no wolves alive; wolves win at parity', () => {
    const roles = { a: 'werewolf', b: 'villager', c: 'villager' } as never;
    expect(checkWinner(roles, ['b', 'c'])).toBe('villagers');
    expect(checkWinner(roles, ['a', 'b'])).toBe('werewolves');
    expect(
      checkWinner(roles, ['a', 'b', 'c']),
    ).toBeNull();
  });
});
