import test from 'node:test';
import assert from 'node:assert/strict';
import {step, spawn, W, HALF, FLOOR_GAP, PHYS, MAX_JUMP_HEIGHT, STEP} from '../public/games/buz-kulesi/physics.js';
import {createTower, MAX_GAP, REST_FLOORS} from '../public/games/buz-kulesi/tower.js';

const flat = {platform: n => ({n, x: 0, w: n === 0 ? W : 0, y: n * FLOOR_GAP})};
function run(state, input, tower, frames, fx) {
  for (let i = 0; i < frames; i++) state = step(state, typeof input === 'function' ? input(state, i) : input, tower, fx);
  return state;
}

test('the same seed builds the same tower; rest floors span the whole width', () => {
  const a = createTower(42), b = createTower(42), c = createTower(43);
  for (let n = 0; n < 400; n++) assert.deepEqual(a.platform(n), b.platform(n));
  assert.notDeepEqual([1, 2, 3].map(n => a.platform(n)), [1, 2, 3].map(n => c.platform(n)));
  for (const n of [0, REST_FLOORS, 2 * REST_FLOORS]) assert.deepEqual([a.platform(n).x, a.platform(n).w], [0, W]);
  assert.ok(a.platform(251).w < a.platform(21).w, 'higher zones have narrower ledges');
  assert.ok(createTower(42, 2).platform(20).w < a.platform(20).w, 'a later start zone starts narrower');
});

test('ledges stay inside the walls and never leave a gap wider than MAX_GAP', () => {
  for (const seed of [1, 7, 99, 123456]) {
    const tower = createTower(seed);
    for (let n = 1; n < 600; n++) {
      const p = tower.platform(n), q = tower.platform(n - 1);
      assert.ok(p.x >= 0 && p.x + p.w <= W, `floor ${n} inside walls`);
      assert.ok(Math.max(0, p.x - (q.x + q.w), q.x - (p.x + p.w)) <= MAX_GAP, `floor ${n} gap`);
    }
  }
});

test('running against a wall keeps speed and the jump grows with speed', () => {
  let s = run(spawn(40), {right: true}, flat, 25);
  assert.equal(s.vx, PHYS.maxVx);
  s = step({...s, x: W - HALF - 2}, {}, flat);
  assert.ok(s.vx < -.9 * PHYS.maxVx * PHYS.wallBounce, `bounced back from the right wall (${s.vx})`);
  const height = vx => {
    let t = {...spawn(300), vx}, top = 0;
    t = step(t, {jump: true}, flat);
    for (let i = 0; i < 120 && !t.grounded; i++) { t = step(t, {}, flat); top = Math.max(top, t.y); }
    return top;
  };
  const slow = height(0), fast = height(PHYS.maxVx);
  assert.ok(slow > FLOOR_GAP && slow < 2 * FLOOR_GAP, `standing jump clears one floor only (${slow})`);
  assert.ok(fast > 5 * FLOOR_GAP && fast <= MAX_JUMP_HEIGHT + 1, `full speed jump clears five floors (${fast})`);
});

test('ledges are one-way: jump through from below, land on top, walk off the edge', () => {
  const tower = {platform: n => n === 0 ? {x: 0, w: W, y: 0} : n === 1 ? {x: 250, w: 100, y: FLOOR_GAP} : {x: 0, w: 0, y: n * FLOOR_GAP}};
  let s = step(spawn(300), {jump: true}, tower);
  let landed = null;
  for (let i = 0; i < 120; i++) { s = step(s, {}, tower); if (s.landed !== null) { landed = s.landed; break; } }
  assert.equal(landed, 1); assert.equal(s.y, FLOOR_GAP); assert.equal(s.grounded, true);
  s = run(s, {right: true}, tower, 40);
  assert.equal(s.floor, 0, 'walked off and dropped back to the ground');
});

test('holding jump bounces again on landing; ice keeps sliding; wind pushes', () => {
  let jumps = 0, s = spawn(300);
  for (let i = 0; i < 200; i++) { s = step(s, {jump: true}, flat); if (s.jumped) jumps++; }
  assert.ok(jumps >= 3);
  const stop = fx => run({...spawn(300), vx: 400}, {}, flat, 30, fx).vx;
  assert.equal(stop(), 0); assert.ok(stop({ice: true}) > 300);
  assert.ok(run(spawn(300), {}, flat, 30, {wind: -1}).x < 250);
  assert.ok(run(spawn(300), {right: true}, flat, 30, {wind: -1}).x > 300, 'running against the wind still wins');
});

// A simple climber: start somewhere on the ledge, run toward the next ledge, jump, and steer.
function reaches(tower, n) {
  const from = tower.platform(n), to = tower.platform(n + 1), target = to.x + to.w / 2;
  const starts = [from.x + HALF, from.x + from.w / 2, from.x + from.w - HALF].map(x => Math.max(HALF, Math.min(W - HALF, x)));
  for (const startX of starts) for (let delay = 0; delay <= 40; delay += 4) {
    let s = {...spawn(startX), y: from.y, floor: n};
    const direction = Math.sign(target - startX) || 1;
    for (let i = 0; i < 220; i++) {
      const input = i < delay ? {left: direction < 0, right: direction > 0}
        : {jump: i === delay, left: !s.grounded && s.x > target + 8, right: !s.grounded && s.x < target - 8};
      s = step(s, input, tower);
      if (s.landed === n + 1) return true;
      if (i > delay && s.grounded) break;
    }
  }
  return false;
}

test('every ledge can be reached from the one below with real physics', () => {
  for (const seed of [3, 2024, 777]) for (const zone of [0, 2]) {
    const tower = createTower(seed, zone);
    for (let n = 0; n < 320; n++) assert.ok(reaches(tower, n), `seed ${seed}, zone ${zone}, floor ${n}→${n + 1}`);
  }
  assert.ok(STEP < .02);
});
