// Socket event names. Keep in sync with the client's src/constants.js.
const EVENTS = {
  JOIN_ROOM: 'joinRoom',
  VOTE: 'vote',
  REVEAL: 'reveal',
  RESET: 'reset',
  DESCRIPTION: 'description',
  RESULT: 'result',
  PARTICIPANTS: 'participants',
};

module.exports = { EVENTS };
