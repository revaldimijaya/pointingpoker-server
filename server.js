const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { createRoomStore } = require('./rooms');
const { registerHandlers } = require('./handlers');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.get('/', (req, res) => {
  res.send(`<h1>Socket IO Start on Port : ${PORT}</h1>`);
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
registerHandlers(io, createRoomStore());

httpServer.listen(PORT, () => {
  console.log('Server is running on *:', PORT);
});
