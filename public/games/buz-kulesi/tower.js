import {W, FLOOR_GAP} from './physics.js';

// Every 100 floors the tower changes zone: narrower ledges and a new palette.
export const ZONES = Object.freeze([
  {name: 'Buz', ledge: '#bfe8ff', edge: '#6fb6e6', wall: '#1d3b63', bg: ['#0f2443', '#1d4170']},
  {name: 'Taş', ledge: '#d9cdb8', edge: '#9a8a70', wall: '#3a3330', bg: ['#231d1b', '#463a33']},
  {name: 'Kristal', ledge: '#e8c9ff', edge: '#a777d6', wall: '#3a2459', bg: ['#1c1033', '#3d2366']},
  {name: 'Lav', ledge: '#ffc49a', edge: '#e0703a', wall: '#4a1f18', bg: ['#2a0f0b', '#5a2316']},
  {name: 'Gökyüzü', ledge: '#ffffff', edge: '#9fc3e6', wall: '#3d6c9c', bg: ['#4a86c0', '#9fd0f0']},
]);
export const ZONE_FLOORS = 100, REST_FLOORS = 50;
// Widest horizontal gap between consecutive ledges; reachable with a short run-up.
export const MAX_GAP = 150;
export const zoneOf = (n, startZone = 0) => ZONES[(Math.floor(n / ZONE_FLOORS) + startZone) % ZONES.length];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ledgeWidth(n, startZone = 0) {
  const zone = Math.floor(n / ZONE_FLOORS) + startZone;
  return Math.max(84, 250 - zone * 38);
}

// Same seed, same tower: ledges are generated lazily in order and cached.
export function createTower(seed, startZone = 0) {
  const random = mulberry32(seed), ledges = [];
  function generate(n) {
    if (n === 0 || n % REST_FLOORS === 0) return {n, x: 0, w: W, y: n * FLOOR_GAP, rest: true};
    const base = ledgeWidth(n, startZone), w = Math.round(Math.max(76, base + (random() - .5) * 60));
    let x = Math.round(random() * (W - w));
    const previous = ledges[n - 1];
    if (x > previous.x + previous.w + MAX_GAP) x = previous.x + previous.w + MAX_GAP;
    if (x + w < previous.x - MAX_GAP) x = previous.x - MAX_GAP - w;
    return {n, x, w, y: n * FLOOR_GAP, rest: false};
  }
  return {
    seed, startZone,
    platform(n) {
      if (n < 0) return {n, x: 0, w: 0, y: n * FLOOR_GAP, rest: false};
      while (ledges.length <= n) ledges.push(generate(ledges.length));
      return ledges[n];
    },
  };
}
