const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createRoomStore } = require('./rooms');

const A = { id: 'a', name: 'Alice#1', role: 'member' };
const B = { id: 'b', name: 'Bob#2', role: 'member' };

let store;
beforeEach(() => {
  store = createRoomStore();
});

test('join returns the participant with vote null', () => {
  assert.deepStrictEqual(store.join('r1', A), [{ ...A, vote: null }]);
});

test('joining twice with the same id updates instead of duplicating and keeps the vote', () => {
  store.join('r1', A);
  store.vote('r1', 'a', 5);
  assert.deepStrictEqual(store.join('r1', { ...A, name: 'Alice#9' }), [{ ...A, name: 'Alice#9', vote: 5 }]);
});

test('vote sets only that participant', () => {
  store.join('r1', A);
  store.join('r1', B);
  assert.deepStrictEqual(store.vote('r1', 'a', 8).map((p) => p.vote), [8, null]);
});

test('vote returns null for an unknown room', () => {
  assert.strictEqual(store.vote('nope', 'a', 3), null);
});

test('vote returns null when the socket is not in that room', () => {
  store.join('r1', A);
  assert.strictEqual(store.vote('r1', 'zzz', 3), null);
});

test('vote ignores values that are not finite numbers', () => {
  store.join('r1', A);
  for (const bad of ['abc', null, undefined, Infinity, NaN]) {
    assert.strictEqual(store.vote('r1', 'a', bad), null);
  }
  assert.strictEqual(store.participants('r1')[0].vote, null);
});

test('resetVotes sets every vote to null', () => {
  store.join('r1', A);
  store.join('r1', B);
  store.vote('r1', 'a', 5);
  store.vote('r1', 'b', 8);
  assert.deepStrictEqual(store.resetVotes('r1').map((p) => p.vote), [null, null]);
});

test('resetVotes returns null for an unknown room', () => {
  assert.strictEqual(store.resetVotes('nope'), null);
});

test('leave removes the participant and returns the room id', () => {
  store.join('r1', A);
  store.join('r1', B);
  assert.strictEqual(store.leave('a'), 'r1');
  assert.deepStrictEqual(store.participants('r1').map((p) => p.id), ['b']);
});

test('leave deletes a room that becomes empty', () => {
  store.join('r1', A);
  store.leave('a');
  assert.deepStrictEqual(store.participants('r1'), []);
  assert.strictEqual(store.vote('r1', 'a', 3), null);
});

test('leave returns null for a socket in no room', () => {
  assert.strictEqual(store.leave('ghost'), null);
});

test('participants returns [] for an unknown room', () => {
  assert.deepStrictEqual(store.participants('nope'), []);
});

test('returned participants are copies', () => {
  store.join('r1', A);
  store.participants('r1')[0].vote = 99;
  assert.strictEqual(store.participants('r1')[0].vote, null);
});
