import test from 'node:test';
import assert from 'node:assert/strict';
import {io as client} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {FLOOR_GAP} from '../public/games/buz-kulesi/physics.js';

function event(socket, name, match = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Timed out: ${name}`)); }, 3000);
    function receive(data) { if (match(data)) { clearTimeout(timer); socket.off(name, receive); resolve(data); } }
    socket.on(name, receive);
  });
}

test('real sockets: catalog, assets, a full two-player match and best-score records', async t => {
  const server = createGameServer();
  await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.http.address().port}`;
  const catalog = await (await fetch(url + '/api/games')).json(), entry = catalog.find(game => game.id === 'buz-kulesi');
  assert.equal(entry.rankBy, 'best'); assert.equal(entry.status, 'available');
  for (const path of ['', 'app.js', 'physics.js', 'tower.js', 'rules.js', 'render.js', 'characters.js', 'input.js', 'audio.js', 'style.css', 'cover.svg']) {
    assert.equal((await fetch(`${url}/games/buz-kulesi/${path}`)).status, 200, path);
  }
  assert.equal((await fetch(url + '/server/games/buz-kulesi/game.js')).status, 404, 'server rules are not public');

  async function player() {
    const response = await fetch(url + '/api/player'), cookie = response.headers.get('set-cookie').split(';')[0];
    const socket = client(url + '/games/buz-kulesi', {transports: ['websocket'], extraHeaders: {Cookie: cookie}, reconnection: false, forceNew: true});
    t.after(() => socket.disconnect()); await event(socket, 'connect');
    return {socket, cookie};
  }
  const ada = await player(), bora = await player();
  const made = await ada.socket.emitWithAck('join', {name: 'Ada', character: 'gece'});
  assert.ok(made.code);
  const joined = await bora.socket.emitWithAck('join', {name: 'Bora', code: made.code});
  assert.equal(joined.code, made.code);
  const room = server.rooms.get(made.code);
  assert.equal(room.players[made.id].character, 'gece');
  assert.equal(room.players[joined.id].character, 'kartopu', 'missing characters fall back to the default');
  assert.ok((await bora.socket.emitWithAck('character', 'olmayan')).error);
  await new Promise(resolve => setTimeout(resolve, 320)); // one character change per 300 ms
  assert.ok((await bora.socket.emitWithAck('character', 'limon')).ok);
  assert.equal(room.players[joined.id].character, 'limon');
  assert.equal(server.metrics.ticks, 0, 'a waiting room runs no clock');
  assert.ok((await bora.socket.emitWithAck('start')).error);
  assert.ok((await ada.socket.emitWithAck('start')).ok);
  room.startedAt = Date.now(); // Skip the three second countdown.
  await event(bora.socket, 'state', state => state.phase === 'play');

  // Bora lands on floor 2; Ada falls; Bora wins and climbs on until he falls too.
  const ledge = room.tower.platform(2);
  assert.ok((await bora.socket.emitWithAck('move', {seq: 1, x: ledge.x + ledge.w / 2, y: 2 * FLOOR_GAP, vx: 0, vy: 0, pose: 'stand', facing: 1, lands: [[1, 2, Date.now()]]})).ok);
  assert.ok((await ada.socket.emitWithAck('fell')).ok);
  const won = await event(bora.socket, 'state', state => state.winnerId === joined.id);
  assert.equal(won.phase, 'play'); assert.equal(won.players.find(p => p.id === made.id).alive, false);
  assert.ok((await bora.socket.emitWithAck('fell')).ok);
  const end = await event(ada.socket, 'state', state => state.phase === 'end');
  assert.deepEqual(end.results.ranking.map(p => [p.name, p.maxFloor, p.score]), [['Bora', 2, 20], ['Ada', 0, 0]]);
  assert.equal(end.results.winnerId, joined.id);

  const board = await (await fetch(url + '/api/games/buz-kulesi/scores', {headers: {Cookie: bora.cookie}})).json();
  assert.deepEqual([board.me.best, board.me.correct, board.me.played], [20, 1, 1]);
  assert.deepEqual(board.rows.map(row => row.name), ['Bora', 'Ada']); assert.equal(board.rank, 1);
  const before = server.metrics.ticks; await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(server.metrics.ticks, before, 'a finished match stops its clock');
});
