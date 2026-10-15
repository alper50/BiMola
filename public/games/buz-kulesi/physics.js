// Shared by the browser and the server: no DOM, no Node APIs.
// Units: x grows to the right inside the tower walls, y grows upwards; one floor is FLOOR_GAP tall.
export const W = 600, FLOOR_GAP = 80, PLAYER_W = 28, PLAYER_H = 44, HALF = PLAYER_W / 2;
export const STEP = 1 / 60;
export const PHYS = Object.freeze({
  runAccel: 1700, airAccel: 1100, friction: 1150, iceFriction: 70, maxVx: 540,
  gravity: 2700, jumpBase: 760, jumpFactor: 1.6, maxFall: 1700,
  wallBounce: .92, windAccel: 950, superJump: 400, coyote: .08,
});
export const MAX_JUMP_VY = PHYS.jumpBase + PHYS.jumpFactor * PHYS.maxVx;
export const MAX_JUMP_HEIGHT = MAX_JUMP_VY ** 2 / (2 * PHYS.gravity);
// Landing tolerance: the body may hang over the edge by a little.
export const EDGE_GRACE = HALF * .5;

export function spawn(x) {
  return {x, y: 0, vx: 0, vy: 0, grounded: true, floor: 0, coyote: 0, pose: 'stand', facing: 1, super: false};
}
export const supports = (platform, x) => x + EDGE_GRACE >= platform.x && x - EDGE_GRACE <= platform.x + platform.w;

// One fixed 60 Hz step. `tower.platform(n)` returns {x, w, y}. `fx` carries sabotage effects.
// Returns a new state plus `landed` (floor number) and `jumped` for sounds and combo tracking.
export function step(state, input, tower, fx = {}) {
  const s = {...state, landed: null, jumped: false}, dt = STEP;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) {
    s.vx += dir * (s.grounded ? PHYS.runAccel : PHYS.airAccel) * dt;
    s.facing = dir;
  } else if (s.grounded && !fx.wind) {
    // Wind beats ground friction; running against it is the counter.
    const friction = (fx.ice ? PHYS.iceFriction : PHYS.friction) * dt;
    s.vx = Math.abs(s.vx) <= friction ? 0 : s.vx - Math.sign(s.vx) * friction;
  }
  if (fx.wind) s.vx += fx.wind * PHYS.windAccel * dt;
  s.vx = Math.max(-PHYS.maxVx, Math.min(PHYS.maxVx, s.vx));

  // Holding jump keeps bouncing, like the original.
  if (input.jump && (s.grounded || s.coyote > 0)) {
    s.vy = PHYS.jumpBase + PHYS.jumpFactor * Math.abs(s.vx);
    s.super = Math.abs(s.vx) >= PHYS.superJump;
    s.grounded = false; s.coyote = 0; s.jumped = true;
  }

  s.x += s.vx * dt;
  if (s.x < HALF) { s.x = HALF; s.vx = Math.abs(s.vx) * PHYS.wallBounce; if (s.vx) s.facing = 1; }
  if (s.x > W - HALF) { s.x = W - HALF; s.vx = -Math.abs(s.vx) * PHYS.wallBounce; if (s.vx) s.facing = -1; }

  if (s.grounded) {
    s.vy = 0;
    if (!supports(tower.platform(s.floor), s.x)) { s.grounded = false; s.coyote = PHYS.coyote; }
  } else {
    s.coyote = Math.max(0, s.coyote - dt);
    const previous = s.y;
    s.vy = Math.max(-PHYS.maxFall, s.vy - PHYS.gravity * dt);
    s.y += s.vy * dt;
    // One-way platforms: only a falling body that crosses a top surface lands on it.
    if (s.vy <= 0) {
      for (let n = Math.floor(previous / FLOOR_GAP); n >= 0 && n * FLOOR_GAP >= s.y; n--) {
        const platform = tower.platform(n);
        if (previous >= platform.y && supports(platform, s.x)) {
          Object.assign(s, {y: platform.y, vy: 0, grounded: true, floor: n, landed: n, coyote: 0, super: false});
          break;
        }
      }
    }
    if (s.y < 0) Object.assign(s, {y: 0, vy: 0, grounded: true, floor: 0, landed: 0, super: false});
  }
  s.pose = !s.grounded ? (s.super ? 'spin' : s.vy > 0 ? 'jump' : 'fall') : Math.abs(s.vx) > 20 ? 'run' : 'stand';
  return s;
}
