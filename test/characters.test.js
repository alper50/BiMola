import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CHARACTERS, DEFAULT_CHARACTER, validCharacter, characterFor, randomCharacter} from '../public/platform/characters.js';
import {buildAccessory} from '../public/platform/accessory3d.js';
import {io as client} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {createRegistry} from '../server/platform/registry.js';

test('the shared catalog has unique ids, colours and accessories; unknown ids fall back safely', () => {
  assert.equal(CHARACTERS.length, 12);
  for (const id of ['levi', 'marco', 'yusuf', 'tenzin']) assert.ok(validCharacter(id), `${id}: Nesne Avı karakteri seçilebilir`);
  for (const key of ['id', 'body', 'accessory']) assert.equal(new Set(CHARACTERS.map(c => c[key])).size, CHARACTERS.length, key);
  for (const c of CHARACTERS) {
    assert.match(c.id, /^[a-z]+$/); assert.ok(c.name.trim());
    for (const color of [c.body, c.shade, c.accent, c.trim, c.beard].filter(Boolean)) assert.match(color, /^#[0-9a-f]{6}$/);
    assert.ok(validCharacter(c.id)); assert.equal(characterFor(c.id), c);
  }
  for (const bad of ['', 'KARTOPU', '__proto__', 'constructor', null, undefined, 3, {id: 'kartopu'}]) {
    assert.equal(validCharacter(bad), false, String(bad)); assert.equal(characterFor(bad).id, DEFAULT_CHARACTER);
  }
  assert.ok(Object.isFrozen(CHARACTERS) && Object.isFrozen(CHARACTERS[0]));
  assert.equal(randomCharacter(() => .99), CHARACTERS.at(-1).id);
});

test('every accessory builds finite geometry around a unit head in the accent colour', () => {
  const used = [];
  const material = color => { used.push(color); return new THREE.MeshStandardMaterial({color}); };
  for (const c of CHARACTERS) {
    used.length = 0;
    const group = buildAccessory(THREE, c.id, {material, forward: -1});
    assert.ok(group, c.id);
    const box = new THREE.Box3().setFromObject(group);
    assert.ok(!box.isEmpty(), `${c.id}: has meshes`);
    for (const value of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) assert.ok(Number.isFinite(value) && Math.abs(value) <= 2.4, `${c.id}: stays near the head (${value})`);
    assert.ok(used.includes(c.accent), `${c.id}: uses its accent`);
    assert.ok(used.every(color => [c.accent, c.shade, c.trim, c.beard].includes(color)), `${c.id}: only character colours`);
    if (c.beard) assert.ok(used.includes(c.beard), `${c.id}: beard`);
  }
  // Glasses sit on the side the face looks at.
  const front = sign => new THREE.Box3().setFromObject(buildAccessory(THREE, 'lokum', {material, forward: sign})).getCenter(new THREE.Vector3()).z;
  assert.ok(front(1) > .5 && front(-1) < -.5);
});

function game(id, extra = {}) {
  const adapter = {
    snapshotInterval: 50, create: ({code, host}) => ({code, host, players: {}}), members: room => Object.values(room.players),
    canJoin: () => ({ok: true}), addPlayer: (room, {id, name, character}) => { room.players[id] = {id, name, character}; return {}; },
    removePlayer: (room, id) => { delete room.players[id]; }, summary: room => ({players: 1, capacity: 4, phase: 'lobby', joinable: true}),
    view: room => ({players: Object.values(room.players)}), tickInterval: () => 0, tick: () => ({}), ...extra,
  };
  return {manifest: {id, name: id, entry: `/games/${id}/`, namespace: `/games/${id}`, status: 'available', protocolVersion: 1}, load: async () => adapter};
}

test('the platform validates the character on join and owns the character event', async t => {
  const dressed = game('dressed', {setCharacter: (room, id, character) => { room.players[id].character = character; return {ok: true}; }});
  const server = createGameServer({games: [dressed, game('plain')]});
  await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.http.address().port}`;
  const connect = async id => { const socket = client(`${url}/games/${id}`, {transports: ['websocket'], reconnection: false, forceNew: true}); t.after(() => socket.disconnect()); await new Promise(r => socket.once('connect', r)); return socket; };
  const a = await connect('dressed'), b = await connect('dressed'), c = await connect('plain');
  const room = await a.emitWithAck('join', {name: 'Ada', character: 'tarcin'});
  const other = await b.emitWithAck('join', {name: 'Bora', code: room.code, character: '<script>'});
  const players = server.rooms.get(room.code).players;
  assert.equal(players[room.id].character, 'tarcin'); assert.equal(players[other.id].character, DEFAULT_CHARACTER);
  assert.ok((await a.emitWithAck('character', 'yok')).error);
  await new Promise(resolve => setTimeout(resolve, 320));
  const published = new Promise(resolve => b.on('state', state => { if (state.players.some(p => p.character === 'limon')) resolve(state); }));
  assert.ok((await a.emitWithAck('character', {character: 'limon'})).ok);
  await published;
  await c.emitWithAck('join', {name: 'Cem'});
  assert.match((await c.emitWithAck('character', 'limon')).error, /karakter yok/);
  assert.match((await connect('dressed').then(s => s.emitWithAck('character', 'limon'))).error, /Oda bulunamadı/);
  // Games cannot claim the character event as a command, and setCharacter must be a function.
  await assert.rejects(createRegistry([game('bad', {commands: {character: {interval: 0, handle: () => ({ok: true})}}})]).load('bad'), /character/);
  await assert.rejects(createRegistry([game('worse', {setCharacter: 'yes'})]).load('worse'), /setCharacter/);
});
