const { EVENTS } = require('./events');

const namesARoom = (payload) =>
  payload !== null && typeof payload === 'object' && typeof payload.room === 'string';

// Wires the socket events to the room store. Every event is ignored unless its
// payload is an object with a string `room`, so malformed input cannot crash a handler.
function registerHandlers(io, store) {
  io.on('connection', (socket) => {
    const on = (event, handle) =>
      socket.on(event, (payload) => {
        if (namesARoom(payload)) handle(payload);
      });

    on(EVENTS.JOIN_ROOM, ({ room, name, role }) => {
      if (typeof name !== 'string' || typeof role !== 'string') return;
      socket.join(room);
      io.to(room).emit(EVENTS.PARTICIPANTS, store.join(room, { id: socket.id, name, role }));
    });

    on(EVENTS.VOTE, ({ room, value }) => {
      const participants = store.vote(room, socket.id, value);
      if (participants) io.to(room).emit(EVENTS.PARTICIPANTS, participants);
    });

    on(EVENTS.REVEAL, ({ room }) => {
      io.to(room).emit(EVENTS.REVEAL);
    });

    on(EVENTS.RESET, ({ room }) => {
      const participants = store.resetVotes(room);
      if (!participants) return;
      io.to(room).emit(EVENTS.PARTICIPANTS, participants);
      io.to(room).emit(EVENTS.RESET);
    });

    // The sender already has the text, so it is not echoed back.
    on(EVENTS.DESCRIPTION, ({ room, value }) => {
      socket.to(room).emit(EVENTS.DESCRIPTION, { value });
    });

    on(EVENTS.RESULT, ({ room, average, task }) => {
      io.to(room).emit(EVENTS.RESULT, { average, task });
    });

    socket.on('disconnect', () => {
      const room = store.leave(socket.id);
      if (room) io.to(room).emit(EVENTS.PARTICIPANTS, store.participants(room));
    });
  });
}

module.exports = { registerHandlers };
