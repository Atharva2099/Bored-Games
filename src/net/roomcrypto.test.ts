import { describe, expect, it } from 'vitest';
import { getRoomKey, open, seal } from './roomcrypto';

describe('roomcrypto', () => {
  it('round-trips seal/open with the same room code', async () => {
    const key = await getRoomKey('ROOM-A');
    const payload = { hello: 'world', n: 42, nested: { a: [1, 2, 3] } };
    const sealed = await seal(key, payload);
    const opened = await open<typeof payload>(key, sealed);
    expect(opened).toEqual(payload);
  });

  it('fails to open with the wrong room code', async () => {
    const keyA = await getRoomKey('ROOM-B');
    const keyWrong = await getRoomKey('ROOM-WRONG');
    const sealed = await seal(keyA, { secret: 'role' });
    const opened = await open(keyWrong, sealed);
    expect(opened).toBeNull();
  });

  it('returns null on garbage input instead of throwing', async () => {
    const key = await getRoomKey('ROOM-C');
    await expect(open(key, 'not-valid-base64-ciphertext!!!')).resolves.toBeNull();
    await expect(open(key, '')).resolves.toBeNull();
    await expect(open(key, btoa('short'))).resolves.toBeNull();
  });

  it('uses a fresh IV so two seals of the same object differ', async () => {
    const key = await getRoomKey('ROOM-D');
    const payload = { same: true };
    const sealedOne = await seal(key, payload);
    const sealedTwo = await seal(key, payload);
    expect(sealedOne).not.toEqual(sealedTwo);
  });
});
