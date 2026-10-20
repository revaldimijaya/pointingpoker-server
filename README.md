# Pointing Poker server

Socket.IO server for the [Pointing Poker](https://github.com/revaldimijaya/pointingpoker) client.
It keeps who is in each room and their votes in memory and relays the Game Master's
reveal, reset, task and result to everyone in the room.

## Run

```bash
npm install
npm start          # listens on PORT, default 4000
npm test           # node --test
```

Open `http://localhost:4000/` to check it is up.

## Protocol

Event names live in [`events.js`](events.js) and must match the client's `src/constants.js`.

- Client to server: `joinRoom {room,name,role}`, `vote {room,value}`, `reveal {room}`,
  `reset {room}`, `description {room,value}`, `result {room,average,task}`.
- Server to client: `participants [{id,name,role,vote}]`, `reveal`, `reset`,
  `description {value}`, `result {average,task}`.

## Layout

- `server.js`: startup only.
- `handlers.js`: socket event handlers.
- `rooms.js`: the in-memory room store (no socket.io).

State is in memory, so a restart empties all rooms; clients rejoin when they reconnect.
Deploy with the `Procfile` (`web: node server.js`).
