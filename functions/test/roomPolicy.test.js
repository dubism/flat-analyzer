import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomPolicy, RequestError } from '../src/roomPolicy.js';

test('room policy uses the default and rejects rooms outside the allowlist', () => {
  const policy = createRoomPolicy({
    defaultRoomId: 'abc123',
    allowedRoomIds: 'other-room',
  });

  assert.equal(policy.resolve(), 'abc123');
  assert.equal(policy.resolve('OTHER-ROOM'), 'other-room');
  assert.throws(
    () => policy.resolve('blocked-room'),
    (error) => error instanceof RequestError && error.status === 403,
  );
});

test('room policy fails closed when no room is configured', () => {
  const policy = createRoomPolicy();
  assert.throws(
    () => policy.resolve('abc123'),
    (error) => error instanceof RequestError && error.status === 503,
  );
});
