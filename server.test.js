const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { io } = require('socket.io-client');

// These tests run the real server.js in a child process and talk to it over a
// real socket, so a crash in a handler shows up as the process exiting.

let server;
let url;

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

const clients = [];

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(url, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

async function assertServerStillRunning() {
  await settle();
  assert.strictEqual(server.exitCode, null, `server exited with code ${server.exitCode}`);
  assert.strictEqual(server.signalCode, null, `server was killed by ${server.signalCode}`);
  const res = await fetch(url);
  assert.strictEqual(res.status, 200);
}

test('a vote for a room nobody has joined does not crash the server', { timeout: 5000 }, async () => {
  const client = await connect();
  client.emit('message', { id: client.id, room: 'no-such-room', pointingValue: 5 });
  await assertServerStillRunning();
});

test('a reset for a room nobody has joined does not crash the server', { timeout: 5000 }, async () => {
  const client = await connect();
  client.emit('reset', { value: false, room: 'no-such-room' });
  await assertServerStillRunning();
});

test('a vote in a joined room is broadcast to the other participants', { timeout: 5000 }, async () => {
  const room = 'room-with-two-members';
  const alice = await connect();
  const bob = await connect();

  const bothJoined = new Promise((resolve) => {
    alice.on('participants', (list) => list.length === 2 && resolve());
  });
  alice.emit('joinRoom', { room, name: 'Alice#1', value: 0, role: 'member' });
  bob.emit('joinRoom', { room, name: 'Bob#2', value: 0, role: 'member' });
  await bothJoined;

  const bobSeesVote = new Promise((resolve) => {
    bob.on('participants', (list) => {
      const entry = list.find((p) => p.id === alice.id);
      if (entry && entry.value === '5') resolve(entry);
    });
  });
  alice.emit('message', { id: alice.id, room, pointingValue: '5' });

  const entry = await bobSeesVote;
  assert.strictEqual(entry.name, 'Alice#1');
});
