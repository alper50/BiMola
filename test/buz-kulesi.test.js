import test from 'node:test';
import assert from 'node:assert/strict';
import {adapter} from '../server/games/buz-kulesi/adapter.js';
import {createRoom, start, move, tick, view, removePlayer, minClimbMs, MAX_JUMP_FLOORS, FALL_GRACE_MS, SILENCE_MS, STRIKE_LIMIT} from '../server/games/buz-kulesi/game.js';
import {FLOOR_GAP, W, STEP, step, spawn} from '../public/games/buz-kulesi/physics.js';
import {COUNTDOWN_MS, SABOTAGE_LOCK_MS, PROTECT_MS, land, freshCombo, scrollDistance, SCROLL_DELAY_MS, LEVEL_MS, SPEEDS, hurry} from '../public/games/buz-kulesi/rules.js';
import {createScores} from '../server/platform/scores.js';

function room(count = 2) {
  const r = adapter.create({code: '1234', host: 'p0'});
  for (let i = 0; i < count; i++) adapter.addPlayer(r, {id: `p${i}`, name: `Oyuncu ${i}`, profileId: `profile${i}`, data: {}});
  return r;
}
function play(r, now = 0) {
  assert.ok(adapter.commands.start.handle(r, 'p0', {}, now).ok);
  tick(r, now + COUNTDOWN_MS); assert.equal(r.phase, 'play');
  return now + COUNTDOWN_MS;
}
// Sends a landing on `floor` at time `at`, standing in the middle of that ledge.
function landOn(r, id, floor, at, serverNow = at) {
  const p = r.players[id], ledge = r.tower.platform(floor);
  return move(r, id, {seq: p.seq + 1, x: ledge.x + ledge.w / 2, y: floor * FLOOR_GAP, vx: 0, vy: 0, pose: 'stand', facing: 1, lands: [[p.landId + 1, floor, at]]}, serverNow);
}
const stay = (r, id, at) => { const p = r.players[id]; return move(r, id, {seq: p.seq + 1, x: p.x, y: p.y, vx: 0, vy: 0, pose: 'stand', facing: 1, lands: []}, at); };

test('host-only start and settings, countdown to play, idle lobby clock and lobby summary', () => {
  const r = room();
  assert.equal(adapter.tickInterval(r), 0);
  assert.ok(adapter.commands.settings.handle(r, 'p1', {speed: 'wild'}).error);
  for (const bad of [{speed: 'fast'}, {sabotage: 'yes'}, {startZone: 7}, null]) assert.ok(adapter.commands.settings.handle(r, 'p0', bad).error);
  assert.ok(adapter.commands.settings.handle(r, 'p0', {speed: 'wild', sabotage: false, startZone: 2}).ok);
  assert.deepEqual(r.settings, {speed: 'wild', sabotage: false, startZone: 2});
  assert.ok(adapter.setCharacter(r, 'p1', 'lokum').ok); assert.equal(r.players.p1.character, 'lokum');
  assert.ok(adapter.commands.start.handle(r, 'p1', {}, 0).error);
  assert.ok(adapter.commands.start.handle(r, 'p0', {}, 0).ok);
  assert.equal(r.phase, 'countdown'); assert.equal(adapter.summary(r).phase, 'play'); assert.equal(adapter.tickInterval(r), 50);
  assert.ok(adapter.commands.start.handle(r, 'p0', {}, 1).error); assert.ok(adapter.commands.settings.handle(r, 'p0', {speed: 'calm'}).error);
  assert.ok(adapter.setCharacter(r, 'p1', 'gece').error, 'no costume change while racing');
  tick(r, COUNTDOWN_MS - 1); assert.equal(r.phase, 'countdown');
  tick(r, COUNTDOWN_MS); assert.equal(r.phase, 'play');
  assert.deepEqual(Object.values(r.players).map(p => p.spawnX), [W / 3, 2 * W / 3].map(Math.round));
  assert.equal(r.tower.startZone, 2);
});

test('the scroll curve speeds up every level and is exact across level boundaries', () => {
  assert.equal(scrollDistance(SCROLL_DELAY_MS), 0);
  assert.equal(scrollDistance(SCROLL_DELAY_MS + 1000), SPEEDS.normal.base);
  const split = scrollDistance(SCROLL_DELAY_MS + LEVEL_MS + 1000);
  assert.equal(split, SPEEDS.normal.base * 30 + SPEEDS.normal.base + SPEEDS.normal.step);
  assert.ok(scrollDistance(60000, 'wild') > scrollDistance(60000, 'calm'));
  assert.ok(hurry(SCROLL_DELAY_MS - 500) && hurry(SCROLL_DELAY_MS + LEVEL_MS - 500) && !hurry(SCROLL_DELAY_MS + 500));
});

test('the camera drops a climber who stays below it; the last climber wins but keeps climbing for a record', () => {
  const r = room(2);
  let now = play(r);
  // p1 climbs a floor every 400 ms; p0 stands still on the ground.
  let floor = 0;
  for (; now < 20000; now += 50) {
    if (now % 400 === 0 && floor < 60) floor++, assert.ok(landOn(r, 'p1', floor, now).ok, `climb to ${floor}`);
    stay(r, 'p0', now); tick(r, now);
    if (!r.players.p0.alive) break;
  }
  assert.equal(r.players.p0.alive, false); assert.equal(r.players.p0.reason, 'fell');
  assert.ok(now - COUNTDOWN_MS > SCROLL_DELAY_MS + FALL_GRACE_MS, 'not before the scroll and the grace period');
  assert.equal(r.winnerId, 'p1'); assert.equal(r.phase, 'play', 'winner keeps climbing');
  assert.ok(adapter.commands.fell.handle(r, 'p1', {}, now + 100).ok);
  assert.equal(r.phase, 'end'); assert.equal(adapter.tickInterval(r), 0);
  assert.deepEqual(r.results.ranking.map(p => p.id), ['p1', 'p0']); assert.equal(r.results.winnerId, 'p1');
  const events = adapter.takeScores(r);
  assert.deepEqual(events.filter(e => !e.completed).map(e => [e.profileId, e.correct, e.answered]).sort(), [['profile0', 0, 1], ['profile1', 1, 1]]);
  assert.equal(events.filter(e => e.completed).length, 2);
});

test('a silent climber is dropped, and a solo practice ends without a winner', () => {
  const r = room(1);
  let now = play(r);
  stay(r, 'p0', now + 1000); tick(r, now + 1000 + SILENCE_MS - 50); assert.equal(r.players.p0.alive, true);
  tick(r, now + 1000 + SILENCE_MS + 50);
  assert.equal(r.players.p0.reason, 'silent'); assert.equal(r.phase, 'end');
  assert.equal(r.results.solo, true); assert.equal(r.results.winnerId, null);
  assert.equal(adapter.takeScores(r)[0].correct, 0);
});

test('implausible movement is ignored and repeated cheating eliminates on the next tick', () => {
  const r = room(2), now = play(r);
  const p = r.players.p0, base = {x: 300, y: 0, vx: 0, vy: 0, pose: 'stand', facing: 1, lands: []};
  const cheats = [
    {...base, y: MAX_JUMP_FLOORS * FLOOR_GAP + 200, pose: 'jump'},                    // flying above any jump
    {...base, x: -50},                                                               // inside the wall
    {...base, vx: 5000},                                                             // impossible speed
    {...base, lands: [[1, MAX_JUMP_FLOORS + 1, now]]},                               // landing beyond a jump
    {...base, y: 3 * FLOOR_GAP, pose: 'stand'},                                      // standing in mid-air
  ];
  cheats.forEach((cheat, i) => assert.ok(move(r, 'p0', {...cheat, seq: i + 1}, now + i).error, JSON.stringify(cheat)));
  assert.equal(p.floor, 0); assert.equal(p.y, 0);
  assert.ok(move(r, 'p0', {...base, seq: 10}, now + 10).ok);
  assert.ok(move(r, 'p0', {...base, seq: 9}, now + 11).error, 'old sequence numbers are ignored');
  assert.equal(p.syncFailed, STRIKE_LIMIT <= cheats.length);
  tick(r, now + 60); assert.equal(p.alive, false); assert.equal(p.reason, 'sync');
});

test('climbing faster than a real flight is rejected', () => {
  const r = room(2), now = play(r);
  assert.ok(landOn(r, 'p0', 3, now + 1000).ok);
  assert.ok(landOn(r, 'p0', 6, now + 1000 + minClimbMs(3) - 20).error);
  assert.ok(landOn(r, 'p0', 6, now + 1000 + minClimbMs(3) + 20).ok);
  assert.ok(landOn(r, 'p0', 7, now + 60000, now + 3000).error, 'client time may not run ahead of the server');
});

test('combos need two multi-floor jumps within three seconds; they score floors squared', () => {
  let {combo, ended} = land(freshCombo(), 0, 2, 1000);
  ({combo, ended} = land(combo, 2, 5, 2000)); assert.equal(ended, null);
  ({combo, ended} = land(combo, 5, 6, 3000)); assert.deepEqual(ended, {jumps: 2, floors: 5, at: 2000}); assert.equal(combo.jumps, 0);
  ({combo} = land(freshCombo(), 0, 2, 0));
  ({combo, ended} = land(combo, 2, 4, 3500)); assert.deepEqual([ended.jumps, combo.jumps, combo.floors], [1, 1, 2], 'a late jump starts a new chain');

  const r = room(2); let now = play(r);
  for (const floor of [2, 4, 7]) { now += 600; assert.ok(landOn(r, 'p0', floor, now).ok); }
  now += 600; assert.ok(landOn(r, 'p0', 8, now).ok);
  const p = r.players.p0;
  assert.equal(p.comboPoints, 49); assert.equal(p.bestCombo, 7); assert.equal(p.score, 8 * 10 + 49);
  assert.equal(p.charges.length, 0, 'short combos give no sabotage');
  // A combo still running when the timer expires ends on the server tick.
  for (const floor of [10, 12, 15, 18]) { now += 600; assert.ok(landOn(r, 'p0', floor, now).ok); }
  tick(r, now + 3300); assert.equal(p.bestCombo, 10); assert.equal(p.charges.length, 1);
  assert.equal(view(r, 'p1', now).mine.charges.length, 0); assert.equal(view(r, 'p1', now).players[0].charges, 1);
});

test('sabotage goes to the leader, protects the target and keeps the charge when blocked', () => {
  const r = room(3), now = play(r);
  Object.assign(r.players.p0, {charges: ['ice', 'fog']}); Object.assign(r.players.p2, {charges: ['wind']});
  r.players.p1.floor = 9; r.players.p2.floor = 4; r.players.p0.floor = 2;
  assert.ok(adapter.commands.sabotage.handle(r, 'p0', {}, now + SABOTAGE_LOCK_MS - 1).error, 'locked at the start');
  const at = now + SABOTAGE_LOCK_MS;
  assert.equal(view(r, 'p0', at).mine.target, 'p1');
  const hit = adapter.commands.sabotage.handle(r, 'p0', {}, at);
  assert.deepEqual([hit.type, hit.target], ['ice', 'p1']);
  assert.equal(r.players.p1.effect.type, 'ice'); assert.equal(r.players.p1.protectedUntil, at + PROTECT_MS);
  assert.ok(adapter.commands.sabotage.handle(r, 'p2', {}, at + 10).error.includes('korunuyor'));
  assert.deepEqual(r.players.p2.charges, ['wind'], 'blocked sabotage is not spent');
  // The leader's own sabotage hits second place.
  r.players.p1.charges = ['fog'];
  assert.equal(adapter.commands.sabotage.handle(r, 'p1', {}, at + 20).target, 'p2');
  assert.equal(view(r, 'p0', at + 30).players.find(p => p.id === 'p2').effect.type, 'fog');
  assert.equal(view(r, 'p0', at + 4100).players.find(p => p.id === 'p1').effect, null, 'effects expire');
  r.settings.sabotage = false;
  assert.ok(adapter.commands.sabotage.handle(r, 'p0', {}, at + PROTECT_MS + 1).error.includes('kapalı'));
});

test('leaving mid-match counts as an elimination; late joiners wait for the next match', () => {
  const r = room(3), now = play(r);
  adapter.addPlayer(r, {id: 'late', name: 'Geç', data: {}});
  assert.equal(r.players.late.waiting, true); assert.equal(r.players.late.racing, false);
  removePlayer(r, 'p0', now + 1000);
  assert.equal(r.host, 'p1'); assert.equal(r.departed[0].reason, 'left');
  removePlayer(r, 'p2', now + 2000);
  assert.equal(r.winnerId, 'p1');
  assert.ok(adapter.commands.fell.handle(r, 'p1', {}, now + 5000).ok);
  assert.deepEqual(r.results.ranking.map(p => [p.id, p.left]), [['p1', false], ['p2', true], ['p0', true]]);
  assert.equal(r.players.late.waiting, false);
  assert.ok(adapter.commands.start.handle(r, 'p1', {}, now + 6000).ok);
  assert.equal(r.players.late.racing, true);
  assert.deepEqual(adapter.canJoin(r, {profileId: 'profile1'}), {error: 'Bu kulede başka bir sekmede zaten varsın.'});
});

test('leaving during the countdown shrinks the field; an empty countdown returns to the lobby', () => {
  const r = room(2);
  assert.ok(adapter.commands.start.handle(r, 'p0', {}, 0).ok);
  adapter.removePlayer(r, 'p1'); assert.equal(r.racers, 1); assert.equal(r.phase, 'countdown');
  adapter.removePlayer(r, 'p0'); assert.equal(r.phase, 'lobby');
});

test('the leaderboard can rank by the best single match', () => {
  const store = createScores(), a = store.identity().id, b = store.identity().id;
  const event = (profileId, matchId, points) => ({profileId, name: profileId === a ? 'Ada' : 'Bora', matchId, round: 1, points, score: points, streak: 0, correct: 0, answered: 1});
  store.record('buz-kulesi', [event(a, 'm1', 300), event(a, 'm2', 300), event(b, 'm3', 500)]);
  assert.deepEqual(store.leaderboard('buz-kulesi', a).rows.map(row => row.name), ['Ada', 'Bora']);
  assert.deepEqual(store.leaderboard('buz-kulesi', a, 'best').rows.map(row => row.name), ['Bora', 'Ada']);
});

// Plays like the browser: 60 Hz physics, a packet every third step with the landing history.
function honestClimb(r, id, from, seconds, policy) {
  let s = spawn(r.players[id].spawnX), seq = 0, landId = 0, lands = [], strikes = 0;
  for (let i = 0; i < seconds * 60; i++) {
    const now = from + Math.round(i * STEP * 1000), next = step(s, policy(s, r.tower), r.tower);
    if (next.landed !== null) lands = [...lands, [++landId, next.landed, now]].slice(-8);
    s = next;
    if (i % 3 === 0 && move(r, id, {seq: ++seq, x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, vx: Math.round(s.vx * 100) / 100,
      vy: Math.round(s.vy * 100) / 100, pose: s.pose, facing: s.facing, lands}, now).error) strikes++;
  }
  return strikes;
}
test('an honest physics client is never rejected: runs, wall bounces, big jumps and falls', () => {
  // Bounce between the walls and jump at full speed: high, long flights and drops to lower ledges.
  const wild = s => ({left: s.vx < 0, right: s.vx >= 0, jump: Math.abs(s.vx) > 450});
  // Hold jump and steer toward the ledge above.
  const steady = (s, tower) => { const ledge = tower.platform(s.floor + 1), target = ledge.x + ledge.w / 2; return {jump: true, left: s.x > target + 10, right: s.x < target - 10}; };
  for (const policy of [wild, steady]) {
    const r = room(1), now = play(r);
    assert.equal(honestClimb(r, 'p0', now, 40, policy), 0);
    assert.ok(r.players.p0.maxFloor >= 8, `climbed ${r.players.p0.maxFloor} floors`);
    assert.equal(r.players.p0.syncFailed, false);
  }
});
test('a rejected landing is skipped, so the resent history does not strike again', () => {
  const r = room(2), now = play(r), p = r.players.p0;
  const packet = seq => ({seq, x: 300, y: 0, vx: 0, vy: 0, pose: 'stand', facing: 1, lands: [[1, 20, now + 500]]});
  assert.ok(move(r, 'p0', packet(1), now + 600).error);
  assert.ok(move(r, 'p0', packet(2), now + 650).ok);
  assert.equal(p.strikes.length, 1); assert.equal(p.floor, 0);
});

test('a close call is awarded only when the climber gets clear again', () => {
  const r = room(2), now = play(r), [a, b] = [r.players.p0, r.players.p1];
  for (const p of [a, b]) Object.assign(p, {camera: 100, lastMoveAt: now + 9000});
  r.elapsed = 9000; // no accumulated scroll before the first tick
  a.y = 70; b.y = 40; tick(r, now + 9000);                 // both dip close to the bottom edge
  a.y = 400; tick(r, now + 9050);                           // a recovers, b stays down and falls
  tick(r, now + 9700); assert.equal(b.alive, false);
  assert.equal(a.closest, 14); assert.equal(b.closest, Infinity);
});
