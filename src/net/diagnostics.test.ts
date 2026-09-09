import { beforeEach, describe, expect, it } from 'vitest';
import { diagText, getDiag, logDiag, resetDiag } from './diagnostics';

beforeEach(() => {
  resetDiag();
});

describe('logDiag / getDiag', () => {
  it('appends entries and returns them in order', () => {
    logDiag('a', '1');
    logDiag('b', '2');
    logDiag('c');
    const entries = getDiag();
    expect(entries.map((e) => e.kind)).toEqual(['a', 'b', 'c']);
    expect(entries[0].detail).toBe('1');
    expect(entries[2].detail).toBeUndefined();
  });

  it('caps the buffer at 200 entries, dropping the oldest', () => {
    for (let i = 0; i < 210; i++) logDiag('e', String(i));
    const entries = getDiag();
    expect(entries.length).toBe(200);
    expect(entries[0].detail).toBe('10');
    expect(entries[entries.length - 1].detail).toBe('209');
  });
});

describe('resetDiag', () => {
  it('clears the log', () => {
    logDiag('a');
    resetDiag();
    expect(getDiag()).toEqual([]);
  });
});

describe('diagText', () => {
  it('includes a header and one line per event, without throwing in node', () => {
    logDiag('join', 'as host ROOM1');
    logDiag('peer-join', 'peer123');
    const text = diagText();
    expect(() => diagText()).not.toThrow();
    expect(text).toContain('userAgent:');
    expect(text).toContain('https:');
    expect(text).toContain('relays:');
    expect(text).toContain('build:');
    expect(text).toContain('join');
    expect(text).toContain('as host ROOM1');
    expect(text).toContain('peer-join');
    expect(text).toContain('peer123');
    const lines = text.split('\n');
    // header (4 lines) + blank + 2 events
    const eventLines = lines.filter((l) => l.startsWith('+'));
    expect(eventLines.length).toBe(2);
  });
});
