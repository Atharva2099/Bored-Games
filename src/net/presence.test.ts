import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  disconnectedAlive,
  normalize,
  rejoin,
  setPresence,
  type Player,
} from './presence';

const players = (): Player[] => [
  { peerId: 'a', name: 'Alice', alive: true, online: true },
  { peerId: 'b', name: 'Bob', alive: false, online: true },
];

describe('setPresence', () => {
  it('never sets alive:false — a living player stays alive when marked offline', () => {
    const out = setPresence(players(), 'a', false);
    const a = out.find((p) => p.peerId === 'a');
    expect(a?.alive).toBe(true);
    expect(a?.online).toBe(false);
  });

  it('never touches alive for an already-dead player either', () => {
    const out = setPresence(players(), 'b', false);
    const b = out.find((p) => p.peerId === 'b');
    expect(b?.alive).toBe(false);
    expect(b?.online).toBe(false);
  });

  it('is a no-op if the peerId is not found', () => {
    const input = players();
    const out = setPresence(input, 'zzz', false);
    expect(out).toEqual(input);
  });

  it('does not mutate the input array', () => {
    const input = players();
    const snapshot = JSON.parse(JSON.stringify(input));
    setPresence(input, 'a', false);
    expect(input).toEqual(snapshot);
  });
});

describe('rejoin', () => {
  it('keeps a killed player alive:false and sets online:true', () => {
    const out = rejoin(players(), 'b', 'b2', 'Bob');
    const b = out.find((p) => p.peerId === 'b2');
    expect(b?.alive).toBe(false);
    expect(b?.online).toBe(true);
  });

  it('keeps a living player alive:true and sets online:true', () => {
    const out = rejoin(players(), 'a', 'a2', 'Alice');
    const a = out.find((p) => p.peerId === 'a2');
    expect(a?.alive).toBe(true);
    expect(a?.online).toBe(true);
  });

  it('updates the peerId and the name', () => {
    const out = rejoin(players(), 'a', 'a2', 'Alicia');
    expect(out.find((p) => p.peerId === 'a')).toBeUndefined();
    const a = out.find((p) => p.peerId === 'a2');
    expect(a?.name).toBe('Alicia');
  });

  it('is a no-op if prevPeerId is not found', () => {
    const input = players();
    const out = rejoin(input, 'zzz', 'a2', 'Alice');
    expect(out).toEqual(input);
  });

  it('does not mutate the input array', () => {
    const input = players();
    const snapshot = JSON.parse(JSON.stringify(input));
    rejoin(input, 'a', 'a2', 'Alice');
    expect(input).toEqual(snapshot);
  });
});

describe('normalize', () => {
  it('defaults a missing online to true', () => {
    const out = normalize([{ peerId: 'a', name: 'Alice', alive: true }]);
    expect(out[0].online).toBe(true);
  });

  it('preserves an explicit false', () => {
    const out = normalize([
      { peerId: 'a', name: 'Alice', alive: true, online: false },
    ]);
    expect(out[0].online).toBe(false);
  });
});

describe('addPlayer', () => {
  it('spectator=true yields alive:false, online:true', () => {
    const out = addPlayer([], 'a', 'Alice', true);
    expect(out).toEqual([
      { peerId: 'a', name: 'Alice', alive: false, online: true },
    ]);
  });

  it('spectator=false yields alive:true, online:true', () => {
    const out = addPlayer([], 'a', 'Alice', false);
    expect(out).toEqual([
      { peerId: 'a', name: 'Alice', alive: true, online: true },
    ]);
  });

  it('duplicate peerId is a no-op', () => {
    const input = players();
    const out = addPlayer(input, 'a', 'Alice Again', false);
    expect(out).toEqual(input);
  });
});

describe('disconnectedAlive', () => {
  it('returns only alive && !online players', () => {
    const list: Player[] = [
      { peerId: 'a', name: 'Alice', alive: true, online: false },
      { peerId: 'b', name: 'Bob', alive: false, online: false },
      { peerId: 'c', name: 'Carl', alive: true, online: true },
    ];
    expect(disconnectedAlive(list)).toEqual([
      { peerId: 'a', name: 'Alice', alive: true, online: false },
    ]);
  });
});
