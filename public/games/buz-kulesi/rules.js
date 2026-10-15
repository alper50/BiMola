import {PLAYER_H} from './physics.js';

// Shared clock rules: the browser and the server scroll every camera with the same curve.
export const VIEW_H = 720, CAMERA_START = -60, PUSH = .62;
// Speeds are world units per second (80 = one floor). A steady climber without combos manages
// about three floors a second, so Normal forces combos after roughly two minutes; the cap ends every match.
export const COUNTDOWN_MS = 3000, SCROLL_DELAY_MS = 3000, LEVEL_MS = 30000, HURRY_MS = 2000, MAX_SCROLL = 520;
export const SPEEDS = Object.freeze({
  calm: {name: 'Sakin', base: 35, step: 25},
  normal: {name: 'Normal', base: 55, step: 40},
  wild: {name: 'Çılgın', base: 85, step: 60},
});
export const START_ZONES = Object.freeze([0, 1, 2]);
export const DEFAULT_SETTINGS = Object.freeze({speed: 'normal', sabotage: true, startZone: 0});

export const COMBO_MS = 3000, COMBO_MIN_JUMP = 2, COMBO_MIN_JUMPS = 2, COMBO_MIN_FLOORS = 4;
export const SABOTAGE_COMBO = 10, MAX_CHARGES = 2, PROTECT_MS = 6000, SABOTAGE_LOCK_MS = 10000;
export const SABOTAGES = Object.freeze({
  ice: {name: 'Buzlanma', icon: '❄', ms: 4000, text: 'Zemin buz kesti: durmak zor!'},
  wind: {name: 'Rüzgâr', icon: '≋', ms: 3000, text: 'Rüzgâr seni itiyor!'},
  fog: {name: 'Sis', icon: '☁', ms: 3000, text: 'Sis çöktü: yukarısı görünmüyor!'},
});

export const speedLevel = elapsed => elapsed < SCROLL_DELAY_MS ? -1 : Math.floor((elapsed - SCROLL_DELAY_MS) / LEVEL_MS);
export function scrollSpeed(elapsed, profile = 'normal') {
  const level = speedLevel(elapsed), speed = SPEEDS[profile] || SPEEDS.normal;
  return level < 0 ? 0 : Math.min(MAX_SCROLL, speed.base + speed.step * level);
}
// Total automatic scroll since the match started, exact across level boundaries.
export function scrollDistance(elapsed, profile = 'normal') {
  let distance = 0, level = 0;
  for (let from = SCROLL_DELAY_MS; from < elapsed; from += LEVEL_MS, level++) {
    distance += scrollSpeed(from, profile) * Math.min(LEVEL_MS, elapsed - from) / 1000;
  }
  return distance;
}
export const hurry = elapsed => elapsed >= SCROLL_DELAY_MS - HURRY_MS && (elapsed - SCROLL_DELAY_MS + HURRY_MS) % LEVEL_MS < HURRY_MS;
// The camera scrolls on its own and is also pushed up by a climber near the top.
export function advanceCamera(camera, y, fromElapsed, toElapsed, profile) {
  return Math.max(camera + scrollDistance(toElapsed, profile) - scrollDistance(fromElapsed, profile), y - VIEW_H * PUSH);
}
export const fallen = (y, camera) => y + PLAYER_H < camera;

// Combo: a chain of jumps that each skip at least two floors, with at most COMBO_MS between landings.
export const freshCombo = () => ({jumps: 0, floors: 0, at: 0});
export function land(combo, from, to, at) {
  const ended = combo.jumps && at - combo.at > COMBO_MS ? combo : null;
  const active = ended ? freshCombo() : combo;
  if (to - from >= COMBO_MIN_JUMP) return {combo: {jumps: active.jumps + 1, floors: active.floors + to - from, at}, ended};
  return {combo: freshCombo(), ended: ended || (active.jumps ? active : null)};
}
export const validCombo = combo => !!combo && combo.jumps >= COMBO_MIN_JUMPS && combo.floors >= COMBO_MIN_FLOORS;
export const comboPoints = combo => validCombo(combo) ? combo.floors ** 2 : 0;
export const score = (maxFloor, points) => maxFloor * 10 + points;

// The leader is the highest other climber, so the leader's own sabotage hits second place.
export function sabotageTarget(players, id) {
  return players.filter(p => p.id !== id && p.racing && p.alive)
    .sort((a, b) => b.floor - a.floor || b.y - a.y || a.id.localeCompare(b.id))[0] || null;
}
// Later elimination ranks higher; a same-moment fall is decided by the highest floor, then score.
export const rankPlayers = list => [...list].sort((a, b) => (b.outAt ?? Infinity) - (a.outAt ?? Infinity) || b.maxFloor - a.maxFloor || b.score - a.score);
