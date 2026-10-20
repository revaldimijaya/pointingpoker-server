// In-memory room store: plain data, no socket.io. Participant = { id, name, role, vote }
// where `vote` is a number, or null until the participant has voted.

function createRoomStore() {
  const rooms = new Map(); // roomId -> Map(socketId -> participant)

  const snapshot = (room) => Array.from(room.values()).map((participant) => ({ ...participant }));

  function join(roomId, { id, name, role }) {
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const room = rooms.get(roomId);
    const existing = room.get(id);
    room.set(id, { id, name, role, vote: existing ? existing.vote : null });
    return snapshot(room);
  }

  function leave(socketId) {
    let leftRoomId = null;
    for (const [roomId, room] of rooms) {
      if (!room.delete(socketId)) continue;
      leftRoomId = roomId;
      if (room.size === 0) rooms.delete(roomId);
    }
    return leftRoomId;
  }

  function vote(roomId, socketId, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const room = rooms.get(roomId);
    const participant = room && room.get(socketId);
    if (!participant) return null;
    participant.vote = value;
    return snapshot(room);
  }

  function resetVotes(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    room.forEach((participant) => {
      participant.vote = null;
    });
    return snapshot(room);
  }

  function participants(roomId) {
    const room = rooms.get(roomId);
    return room ? snapshot(room) : [];
  }

  return { join, leave, vote, resetVotes, participants };
}

module.exports = { createRoomStore };
