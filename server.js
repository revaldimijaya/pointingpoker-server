const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });
const PORT= process.env.PORT || 4000;
const rooms = new Map(); // Map to store participants in each room

app.get('/', (req,res) => {
  res.write(`<h1>Socket IO Start on Port : ${PORT}</h1>`);
  res.end();
})

io.on('connection', (socket) => {
  // console.log('A user connected ', socket.id);
  // const serverSocketId = socket.id; // Get the server's socket ID

  //  // Custom event to check if a socket ID is the server's socket
  // socket.on('checkServerSocket', (socketIdToCheck) => {
  //   const isServerSocket = socketIdToCheck === serverSocketId;

  //   // Emit the result back to the client
  //   socket.emit('isServerSocket', isServerSocket);
  // });

  socket.on('calculate', (payload) => {
    socket.emit('calculate', payload);
    socket.to(payload.room).emit('calculate', payload)
  })

  socket.on('ticket', (payload) => {
    socket.emit('ticket', payload);
    socket.to(payload.room).emit('ticket', payload)
  });

  socket.on('description', (payload) => {
    // socket.emit('description', payload);
    socket.to(payload.room).emit('description', payload)
  });

  socket.on('message', (message) => {
    // console.log('Received message:', message);
    let room = rooms.get(message.room)
    room.forEach(participant => {
      // console.log("participant: ", participant)
      if (participant.id === message.id) {
        participant.value = message.pointingValue;
        // console.log("found : ",room)
      }
    })

    // console.log("room: ", room)
    const participants = Array.from(room).map(participant => participant);
    socket.emit('participants', participants);
    socket.to(message.room).emit('participants', participants)
  });

  socket.on('showAll', (payload) => {
    console.log("showall ",payload)
    socket.emit('showAll', payload)
    socket.to(payload.room).emit('showAll', payload)
  })

  socket.on('reset', (payload) => {
    console.log('Received reset:', payload);
    let room = rooms.get(payload.room)
    room.forEach(participant => {
      participant.value = 0
    })
    const participants = Array.from(room).map(participant => participant);
    socket.emit('participants', participants);
    socket.to(payload.room).emit('participants', participants)
    socket.emit('reset', payload)
    socket.to(payload.room).emit('reset', payload)
  })

  socket.on('joinRoom', ({ room, name, value, role }) => {
    socket.join(room);

    // Add participant to the room
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room).add({ id: socket.id, name, value, role });
    // console.log(rooms)

    // Get the participant in the room
    const participants = Array.from(rooms.get(room)).map(participant => participant);

    socket.emit('participants', participants);
    socket.to(room).emit('participants', participants);
  });

  socket.on('disconnect', () => {
    // Remove participant from the room
    // console.log("user disconnected ", socket.id)
    let selectedRoom
    rooms.forEach((participants, room) => {
      // console.log("line 1: ", participants, room)
      participants.forEach(participant => {
        // console.log("line 2: ", participant)
        if (participant.id === socket.id) {
          // console.log("found : ", participant)
          participants.delete(participant);
          // console.log("sisa : ", participants)
          selectedRoom = room
        }
      });
    });

    if (selectedRoom) {
      // Get the participant names in the room
      // console.log("selected room: ", selectedRoom)
      const participants = Array.from(rooms.get(selectedRoom) || []).map(participantsLeft => participantsLeft);
      // console.log(participants)
      socket.to(selectedRoom).emit('participants', participants);
    }
  });
});

http.listen(PORT, () => {
  console.log('Server is running on *:', PORT);
});