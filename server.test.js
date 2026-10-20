const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { io } = require('socket.io-client');
const { EVENTS } = require('./events');

// These tests run the real server.js in a child process and talk to it over a
// real socket, so a crash in a handler shows up as the process exiting.

let server;
let url;
const clients = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

beforeEach(async () => {
  const port = await freePort();
  url = `http://localhost:${port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port) },
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Server is running')) resolve();
    });
    server.once('exit', (code) => reject(new Error(`server exited early, code ${code}`)));
  });
});

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  if (server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await exited;
  }
});

// Connects a client that records every event it receives in `socket.events`.
function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(url, { transports: ['websocket'], forceNew: true });
    socket.events = [];
    socket.onAny((event, payload) => socket.events.push({ event, payload }));
    clients.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, message) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await settle(20);
  }
  assert.fail(message);
}

const received = (socket, event) => socket.events.filter((e) => e.event === event).map((e) => e.payload);
const lastParticipants = (socket) => received(socket, EVENTS.PARTICIPANTS).at(-1);

async function assertServerStillRunning() {
  await settle();
  assert.strictEqual(server.exitCode, null, `server exited with code ${server.exitCode}`);
  assert.strictEqual(server.signalCode, null, `server was killed by ${server.signalCode}`);
  const res = await fetch(url);
  assert.strictEqual(res.status, 200);
}

// Alice (Alice#1) and Bob (Bob#2) join `room` and both see two participants.
async function joinTwo(room) {
  const alice = await connect();
  const bob = await connect();
  alice.emit(EVENTS.JOIN_ROOM, { room, name: 'Alice#1', role: 'member' });
  bob.emit(EVENTS.JOIN_ROOM, { room, name: 'Bob#2', role: 'member' });
  await waitFor(() => lastParticipants(alice)?.length === 2 && lastParticipants(bob)?.length === 2, 'both should see two participants');
  return { alice, bob };
}

test('a vote for a room nobody has joined does not crash the server', { timeout: 5000 }, async () => {
  const client = await connect();
  client.emit(EVENTS.VOTE, { room: 'no-such-room', value: 5 });
  await assertServerStillRunning();
});

test('a reset for a room nobody has joined does not crash the server', { timeout: 5000 }, async () => {
  const client = await connect();
  client.emit(EVENTS.RESET, { room: 'no-such-room' });
  await assertServerStillRunning();
});

test('events with a missing or malformed payload do not crash the server', { timeout: 5000 }, async () => {
  const client = await connect();
  for (const event of Object.values(EVENTS)) {
    for (const payload of [undefined, null, 'text', 42, {}]) client.emit(event, payload);
  }
  await assertServerStillRunning();
});

test('joining without a name or role is ignored', { timeout: 5000 }, async () => {
  const client = await connect();
  client.emit(EVENTS.JOIN_ROOM, { room: 'room-bad-join' });
  client.emit(EVENTS.JOIN_ROOM, { room: 'room-bad-join', name: 'Alice#1' });
  await assertServerStillRunning();
  assert.strictEqual(received(client, EVENTS.PARTICIPANTS).length, 0);
});

test('a vote in a joined room is broadcast to the other participants', { timeout: 5000 }, async () => {
  const { alice, bob } = await joinTwo('room-with-two-members');
  alice.emit(EVENTS.VOTE, { room: 'room-with-two-members', value: 5 });
  const entry = await waitFor(
    () => lastParticipants(bob).find((p) => p.id === alice.id && p.vote === 5),
    'bob should see alice vote 5',
  );
  assert.strictEqual(entry.name, 'Alice#1');
});

test('a vote uses the socket id, not an id in the payload', { timeout: 5000 }, async () => {
  const room = 'room-id-spoof';
  const { alice, bob } = await joinTwo(room);
  alice.emit(EVENTS.VOTE, { room, value: 5, id: bob.id });
  const list = await waitFor(() => {
    const latest = lastParticipants(alice);
    return latest.some((p) => p.vote !== null) && latest;
  }, 'a vote should be broadcast');
  assert.strictEqual(list.find((p) => p.id === alice.id).vote, 5);
  assert.strictEqual(list.find((p) => p.id === bob.id).vote, null);
});

test('reveal reaches everyone in the room, including the sender', { timeout: 5000 }, async () => {
  const { alice, bob } = await joinTwo('room-reveal');
  alice.emit(EVENTS.REVEAL, { room: 'room-reveal' });
  await waitFor(() => received(alice, EVENTS.REVEAL).length === 1, 'alice should get reveal');
  await waitFor(() => received(bob, EVENTS.REVEAL).length === 1, 'bob should get reveal');
});

test('reset clears every vote and notifies the room', { timeout: 5000 }, async () => {
  const room = 'room-reset';
  const { alice, bob } = await joinTwo(room);
  alice.emit(EVENTS.VOTE, { room, value: 5 });
  bob.emit(EVENTS.VOTE, { room, value: 8 });
  await waitFor(() => lastParticipants(alice).every((p) => p.vote !== null), 'both votes should be in');
  alice.emit(EVENTS.RESET, { room });
  for (const client of [alice, bob]) {
    await waitFor(() => received(client, EVENTS.RESET).length === 1, 'every client should get reset');
    const resetAt = client.events.findIndex((e) => e.event === EVENTS.RESET);
    const before = client.events.slice(0, resetAt).filter((e) => e.event === EVENTS.PARTICIPANTS).at(-1);
    assert.ok(before.payload.every((p) => p.vote === null), 'the participants list sent before reset has no votes');
  }
});

test('result is delivered to the whole room with average and task', { timeout: 5000 }, async () => {
  const { alice, bob } = await joinTwo('room-result');
  alice.emit(EVENTS.RESULT, { room: 'room-result', average: 5, task: 'PTP-1' });
  for (const client of [alice, bob]) {
    const [payload] = await waitFor(() => {
      const results = received(client, EVENTS.RESULT);
      return results.length === 1 && results;
    }, 'every client should get the result');
    assert.deepStrictEqual(payload, { average: 5, task: 'PTP-1' });
  }
});

test('description reaches the others but not the sender', { timeout: 5000 }, async () => {
  const { alice, bob } = await joinTwo('room-description');
  alice.emit(EVENTS.DESCRIPTION, { room: 'room-description', value: 'PTP-1' });
  await waitFor(() => received(bob, EVENTS.DESCRIPTION).length === 1, 'bob should get the description');
  assert.deepStrictEqual(received(bob, EVENTS.DESCRIPTION)[0], { value: 'PTP-1' });
  await settle();
  assert.strictEqual(received(alice, EVENTS.DESCRIPTION).length, 0);
});

test('a disconnected participant is removed from the room', { timeout: 5000 }, async () => {
  const { alice, bob } = await joinTwo('room-disconnect');
  bob.close();
  const list = await waitFor(() => lastParticipants(alice).length === 1 && lastParticipants(alice), 'alice should see one participant');
  assert.strictEqual(list[0].name, 'Alice#1');
});

test('a participant who disconnects and rejoins on a new connection is listed once', { timeout: 5000 }, async () => {
  const room = 'room-rejoin';
  const { alice, bob } = await joinTwo(room);
  alice.close();
  const alice2 = await connect();
  alice2.emit(EVENTS.JOIN_ROOM, { room, name: 'Alice#1', role: 'member' });
  await waitFor(() => {
    const list = lastParticipants(bob);
    return list.length === 2 && list.filter((p) => p.name === 'Alice#1').length === 1;
  }, 'bob should see Alice exactly once');
});
