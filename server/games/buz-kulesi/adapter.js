import {createRoom, addPlayer, removePlayer, configure, setCharacter, start, move, fell, sabotage, tick, view, MAX_PLAYERS, TICK_MS} from './game.js';

const members = room => Object.values(room.players);
export const adapter = {
  // Climbers move continuously: positions go out at the same 20 Hz the browsers send them.
  snapshotInterval: 50,
  create: ({code, host}) => createRoom({code, host}),
  members,
  canJoin(room, data = {}) {
    if (data.profileId && members(room).some(p => p.profileId === data.profileId)) return {error: 'Bu kulede başka bir sekmede zaten varsın.'};
    return members(room).length >= MAX_PLAYERS ? {error: `Oda dolu (${MAX_PLAYERS} kişi).`} : {ok: true};
  },
  addPlayer: (room, player) => addPlayer(room, player),
  setCharacter: (room, id, character) => setCharacter(room, id, character),
  removePlayer: (room, id) => removePlayer(room, id),
  summary(room) {
    const players = members(room).length;
    return {players, capacity: MAX_PLAYERS, phase: room.phase === 'countdown' ? 'play' : room.phase, joinable: players < MAX_PLAYERS};
  },
  view,
  takeScores: room => room.scoreEvents.splice(0),
  tickInterval: room => ['countdown', 'play'].includes(room.phase) ? TICK_MS : 0,
  tick: (room, now) => tick(room, now),
  commands: {
    settings: {interval: 200, publish: true, handle: (room, id, data) => configure(room, id, data)},
    start: {interval: 500, publish: true, handle: (room, id, _, now) => start(room, id, now)},
    // Not published: the next 50 ms snapshot carries the new position.
    move: {interval: 16, handle: (room, id, data, now) => move(room, id, data, now)},
    fell: {interval: 200, publish: true, handle: (room, id, data, now) => fell(room, id, data, now)},
    sabotage: {interval: 300, publish: true, handle: (room, id, data, now) => sabotage(room, id, data, now)},
  },
};
