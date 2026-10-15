import {randomInt, randomUUID} from 'node:crypto';
import {W, HALF, FLOOR_GAP, PLAYER_H, PHYS, MAX_JUMP_VY, MAX_JUMP_HEIGHT, EDGE_GRACE} from '../../../public/games/buz-kulesi/physics.js';
import {createTower} from '../../../public/games/buz-kulesi/tower.js';
import {
  COUNTDOWN_MS, CAMERA_START, COMBO_MS, DEFAULT_SETTINGS, SPEEDS, START_ZONES, SABOTAGES, SABOTAGE_COMBO, MAX_CHARGES,
  PROTECT_MS, SABOTAGE_LOCK_MS, advanceCamera, fallen, freshCombo, land, validCombo, comboPoints, score, sabotageTarget, rankPlayers,
} from '../../../public/games/buz-kulesi/rules.js';
import {DEFAULT_CHARACTER, validCharacter} from '../../../public/platform/characters.js';

// The browser simulates its own climber; the server owns the clock, the tower, combos,
// sabotage charges and eliminations. Movement packets are checked for physical plausibility.
export const MAX_PLAYERS = 12, TICK_MS = 50, FALL_GRACE_MS = 600, SILENCE_MS = 3000;
export const STRIKE_LIMIT = 5, STRIKE_WINDOW_MS = 10000, MAX_LANDINGS = 8, FEED = 6;
export const MAX_JUMP_FLOORS = Math.floor(MAX_JUMP_HEIGHT / FLOOR_GAP);
const POSES = new Set(['stand', 'run', 'jump', 'fall', 'spin']);
const REASONS = {fell: 'düştü', left: 'oyundan ayrıldı', silent: 'bağlantısı koptu', sync: 'senkron hatası yüzünden elendi'};
// Shortest possible flight that lands `floors` higher: launched just fast enough to reach it.
export const minClimbMs = floors => 1000 * Math.sqrt(2 * floors * FLOOR_GAP / PHYS.gravity) * .8;
const finite = value => typeof value === 'number' && Number.isFinite(value);
// Like physics.supports, with room for rounded coordinates.
const standsOn = (ledge, x) => x + EDGE_GRACE + 2 >= ledge.x && x - EDGE_GRACE - 2 <= ledge.x + ledge.w;

function race(p, spawnX = W / 2, now = 0) {
  return Object.assign(p, {
    racing: false, waiting: false, alive: false, x: spawnX, spawnX, y: 0, vx: 0, vy: 0, pose: 'stand', facing: 1,
    floor: 0, maxFloor: 0, landId: 0, landAt: -Infinity, seq: -1, combo: freshCombo(), bestCombo: 0, comboPoints: 0, score: 0,
    charges: [], sent: 0, effect: null, protectedUntil: 0, camera: CAMERA_START, belowSince: null, lastMoveAt: now,
    closest: Infinity, dip: Infinity, strikes: [], syncFailed: false, outAt: null, reason: '',
  });
}
export function createRoom({code, host}) {
  return {code, host, phase: 'lobby', players: {}, settings: {...DEFAULT_SETTINGS}, seed: 0, tower: null, startedAt: 0, elapsed: 0,
    matchId: null, racers: 0, winnerId: null, departed: [], results: null, feed: [], feedId: 0, scoreEvents: []};
}
function announce(room, text, kind = 'info') { room.feed = [...room.feed, {id: ++room.feedId, text, kind}].slice(-FEED); }
const players = room => Object.values(room.players);
const climbers = room => players(room).filter(p => p.racing && p.alive);
const inMatch = room => room.phase === 'countdown' || room.phase === 'play';

export function addPlayer(room, {id, name, profileId, character}) {
  const p = race({id, name, profileId, character: validCharacter(character) ? character : DEFAULT_CHARACTER});
  p.waiting = inMatch(room);
  room.players[id] = p;
  return {waiting: p.waiting};
}
export function removePlayer(room, id, now = Date.now()) {
  const p = room.players[id];
  if (!p) return;
  // Leaving during the countdown simply shrinks the field; later it counts as an elimination.
  if (room.phase === 'countdown' && p.racing) room.racers--;
  else if (room.phase === 'play' && p.racing) {
    eliminate(room, p, 'left', now);
    room.departed.push({...p});
  }
  delete room.players[id];
  if (room.host === id) room.host = Object.keys(room.players)[0];
  settle(room, now);
}

export function configure(room, id, data) {
  if (id !== room.host) return {error: 'Ayarları yalnız oda sahibi değiştirebilir.'};
  if (inMatch(room)) return {error: 'Maç sürerken ayarlar değişmez.'};
  if (!data || typeof data !== 'object') return {error: 'Ayar geçersiz.'};
  const next = {...room.settings};
  if ('speed' in data) { if (!Object.hasOwn(SPEEDS, data.speed)) return {error: 'Hız profili geçersiz.'}; next.speed = data.speed; }
  if ('sabotage' in data) { if (typeof data.sabotage !== 'boolean') return {error: 'Sabotaj ayarı geçersiz.'}; next.sabotage = data.sabotage; }
  if ('startZone' in data) { if (!START_ZONES.includes(data.startZone)) return {error: 'Başlangıç bölgesi geçersiz.'}; next.startZone = data.startZone; }
  room.settings = next;
  return {ok: true};
}
// The platform validates the id; the game only decides when a change is allowed.
export function setCharacter(room, id, character) {
  const p = room.players[id];
  if (!p) return {error: 'Oyuncu bulunamadı.'};
  if (!validCharacter(character)) return {error: 'Böyle bir karakter yok.'};
  if (inMatch(room) && p.racing && p.alive) return {error: 'Karakterini maç arasında değiştirebilirsin.'};
  p.character = character;
  return {ok: true};
}

export function start(room, id, now = Date.now()) {
  if (id !== room.host) return {error: 'Maçı yalnız oda sahibi başlatabilir.'};
  if (inMatch(room)) return {error: 'Maç zaten sürüyor.'};
  const list = players(room);
  if (!list.length) return {error: 'Odada oyuncu yok.'};
  room.seed = randomInt(1, 2 ** 31);
  room.tower = createTower(room.seed, room.settings.startZone);
  Object.assign(room, {phase: 'countdown', startedAt: now + COUNTDOWN_MS, elapsed: 0, matchId: randomUUID(), racers: list.length,
    winnerId: null, departed: [], results: null, feed: []});
  list.forEach((p, i) => { race(p, Math.round(W * (i + 1) / (list.length + 1)), now); p.racing = true; p.alive = true; });
  announce(room, list.length > 1 ? `${list.length} tırmanıcı kulenin dibinde. Son kalan kazanır!` : 'Antrenman: düşene kadar tırman!', 'start');
  return {ok: true};
}

function addPoints(room, p, combo) {
  if (!validCombo(combo)) return;
  p.comboPoints += comboPoints(combo); p.bestCombo = Math.max(p.bestCombo, combo.floors);
  p.score = score(p.maxFloor, p.comboPoints);
  const earned = room.settings.sabotage && combo.floors >= SABOTAGE_COMBO && p.charges.length < MAX_CHARGES;
  if (earned) p.charges.push(Object.keys(SABOTAGES)[randomInt(Object.keys(SABOTAGES).length)]);
  if (combo.floors >= SABOTAGE_COMBO) announce(room, `${p.name} ${combo.floors} katlık kombo yaptı!${earned ? ' Sabotaj hakkı kazandı.' : ''}`, 'combo');
}
function eliminate(room, p, reason, now) {
  if (!p.alive) return;
  p.alive = false; p.outAt = now; p.reason = reason; p.effect = null;
  addPoints(room, p, p.combo); p.combo = freshCombo();
  announce(room, `${p.name} ${REASONS[reason]} · ${p.maxFloor}. kat`, 'out');
  const left = climbers(room);
  if (room.racers > 1 && left.length === 1 && !room.winnerId) {
    room.winnerId = left[0].id;
    announce(room, `${left[0].name} kazandı! Rekor için tırmanmaya devam ediyor.`, 'win');
  }
}
// Ends an empty match, or falls back to the lobby when everyone left during the countdown.
function settle(room, now) {
  if (room.phase === 'countdown' && !players(room).some(p => p.racing)) { room.phase = 'lobby'; return true; }
  if (room.phase === 'play' && !climbers(room).length) { finish(room, now); return true; }
  return false;
}
function finish(room, now) {
  room.phase = 'end';
  const everyone = [...players(room).filter(p => p.racing), ...room.departed];
  const ranking = rankPlayers(everyone).map((p, i) => ({id: p.id, name: p.name, character: p.character, place: i + 1, maxFloor: p.maxFloor,
    bestCombo: p.bestCombo, score: p.score, sent: p.sent, reason: p.reason, left: !room.players[p.id]}));
  const best = (pick, min) => everyone.filter(p => pick(p) >= min).sort((a, b) => pick(b) - pick(a))[0];
  const awards = [];
  const combo = best(p => p.bestCombo, 4); if (combo) awards.push({title: 'En uzun kombo', name: combo.name, value: `${combo.bestCombo} kat`});
  const high = best(p => p.maxFloor, 1); if (high) awards.push({title: 'En yüksek kat', name: high.name, value: `${high.maxFloor}. kat`});
  const saboteur = best(p => p.sent, 1); if (saboteur) awards.push({title: 'Sabotaj ustası', name: saboteur.name, value: `${saboteur.sent} sabotaj`});
  const close = everyone.filter(p => p.closest < 60).sort((a, b) => a.closest - b.closest)[0];
  if (close) awards.push({title: 'Kıl payı', name: close.name, value: `${Math.max(0, Math.round(close.closest))} birim`});
  const winnerId = room.racers > 1 ? room.winnerId || ranking[0]?.id : null;
  room.results = {ranking, awards, winnerId, solo: room.racers === 1};
  for (const p of everyone) if (p.profileId) {
    const base = {profileId: p.profileId, name: p.name, matchId: room.matchId};
    room.scoreEvents.push({...base, round: 1, points: p.score, score: p.score, streak: p.bestCombo, correct: Number(p.id === winnerId), answered: 1},
      {...base, round: 2, completed: true});
  }
  for (const p of players(room)) p.waiting = false;
  announce(room, winnerId ? `Maç bitti. ${ranking[0].name} kazandı!` : `Antrenman bitti · ${ranking[0]?.maxFloor ?? 0}. kat`, 'end');
}

function strike(p, now) {
  p.strikes = [...p.strikes.filter(at => now - at < STRIKE_WINDOW_MS), now];
  // Elimination waits for the next tick so the result is published reliably.
  if (p.strikes.length >= STRIKE_LIMIT) p.syncFailed = true;
  return {error: 'Hareket kabul edilmedi.'};
}
export function move(room, id, data, now = Date.now()) {
  const p = room.players[id];
  if (room.phase !== 'play' || !p?.racing || !p.alive) return {error: 'Aktif bir tırmanış yok.'};
  if (!data || typeof data !== 'object' || !Number.isInteger(data.seq) || data.seq <= p.seq) return {error: 'Eski hareket.'};
  if (!['x', 'y', 'vx', 'vy'].every(key => finite(data[key])) || !POSES.has(data.pose) || ![1, -1].includes(data.facing)) return strike(p, now);
  const landings = Array.isArray(data.lands) ? data.lands : [];
  if (landings.length > MAX_LANDINGS) return strike(p, now);
  for (const entry of [...landings].sort((a, b) => (a?.[0] ?? 0) - (b?.[0] ?? 0))) {
    if (!Array.isArray(entry) || !Number.isInteger(entry[0]) || !Number.isInteger(entry[1]) || !finite(entry[2])) return strike(p, now);
    const [landId, floor, at] = entry;
    if (landId <= p.landId) continue;
    // Upward landings need a jump: bounded height and a minimum flight time. Client time may not run ahead.
    // A rejected landing is skipped for good, so the resent history cannot strike again.
    const impossible = floor < 0 || floor > p.floor + MAX_JUMP_FLOORS || at > now + 1000 || at < p.landAt
      || (floor > p.floor && at - p.landAt < minClimbMs(floor - p.floor));
    if (impossible) { p.landId = landId; return strike(p, now); }
    const {combo, ended} = land(p.combo, p.floor, floor, at);
    if (ended) addPoints(room, p, ended);
    Object.assign(p, {combo, floor, landId, landAt: at, maxFloor: Math.max(p.maxFloor, floor)});
    p.score = score(p.maxFloor, p.comboPoints);
  }
  const {x, y, vx, vy} = data, ground = data.pose === 'stand' || data.pose === 'run';
  if (x < HALF - 1 || x > W - HALF + 1 || Math.abs(vx) > PHYS.maxVx + 1 || vy < -PHYS.maxFall - 1 || vy > MAX_JUMP_VY + 1) return strike(p, now);
  if (y < -1 || y > p.floor * FLOOR_GAP + MAX_JUMP_HEIGHT + 8) return strike(p, now);
  if (ground && (Math.abs(y - p.floor * FLOOR_GAP) > 1 || !standsOn(room.tower.platform(p.floor), x))) return strike(p, now);
  Object.assign(p, {seq: data.seq, x, y, vx, vy, pose: data.pose, facing: data.facing, lastMoveAt: now});
  return {ok: true};
}
export function fell(room, id, _, now = Date.now()) {
  const p = room.players[id];
  if (room.phase !== 'play' || !p?.racing || !p.alive) return {error: 'Zaten oyunda değilsin.'};
  eliminate(room, p, 'fell', now); settle(room, now);
  return {ok: true};
}
export function sabotage(room, id, _, now = Date.now()) {
  const p = room.players[id];
  if (room.phase !== 'play' || !p?.racing || !p.alive) return {error: 'Sabotaj yalnız tırmanırken gönderilir.'};
  if (!room.settings.sabotage) return {error: 'Bu odada sabotaj kapalı.'};
  if (now - room.startedAt < SABOTAGE_LOCK_MS) return {error: 'İlk 10 saniyede sabotaj yok.'};
  if (!p.charges.length) return {error: 'Sabotaj hakkın yok. 10 katlık kombo yap.'};
  const target = sabotageTarget(players(room), id);
  if (!target) return {error: 'Sabotaj gönderecek rakip yok.'};
  if (target.protectedUntil > now) return {error: `${target.name} korunuyor. Hakkın harcanmadı.`};
  const type = p.charges.shift(), info = SABOTAGES[type];
  target.effect = {type, until: now + info.ms, ...(type === 'wind' ? {dir: randomInt(2) ? 1 : -1} : {})};
  target.protectedUntil = now + PROTECT_MS; p.sent++;
  announce(room, `${p.name} → ${target.name}: ${info.name}!`, 'sabotage');
  return {ok: true, type, target: target.id};
}

export function tick(room, now) {
  if (room.phase === 'countdown') {
    if (now < room.startedAt) return {changed: false};
    room.phase = 'play'; room.elapsed = 0;
    for (const p of climbers(room)) p.lastMoveAt = now;
    return {changed: true};
  }
  if (room.phase !== 'play') return {changed: false};
  const elapsed = now - room.startedAt, before = room.feed.at(-1)?.id;
  for (const p of climbers(room)) {
    p.camera = advanceCamera(p.camera, p.y, room.elapsed, elapsed, room.settings.speed);
    if (p.effect && p.effect.until <= now) p.effect = null;
    if (p.combo.jumps && now - p.combo.at > COMBO_MS + 250) { addPoints(room, p, p.combo); p.combo = freshCombo(); }
    // A close call counts only once the climber gets clear again; the final fall is not one.
    const margin = p.y + PLAYER_H - p.camera;
    if (elapsed > 3000) p.dip = Math.min(p.dip, margin);
    if (margin > 160 && p.dip < 60) { p.closest = Math.min(p.closest, Math.max(0, p.dip)); p.dip = Infinity; }
    p.belowSince = fallen(p.y, p.camera) ? p.belowSince ?? now : null;
    if (p.syncFailed) eliminate(room, p, 'sync', now);
    else if (now - p.lastMoveAt > SILENCE_MS) eliminate(room, p, 'silent', now);
    else if (p.belowSince !== null && now - p.belowSince >= FALL_GRACE_MS) eliminate(room, p, 'fell', now);
  }
  room.elapsed = elapsed;
  return {changed: settle(room, now) || room.feed.at(-1)?.id !== before};
}

export function view(room, id, now = Date.now()) {
  const me = room.players[id];
  return {
    code: room.code, hostId: room.host, me: id, phase: room.phase, serverNow: now, startedAt: room.startedAt, seed: room.seed,
    settings: {...room.settings}, winnerId: room.winnerId, racers: room.racers, feed: room.feed, results: room.results,
    players: players(room).map(p => ({
      id: p.id, name: p.name, character: p.character, racing: p.racing, waiting: p.waiting, alive: p.alive, spawnX: p.spawnX,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, pose: p.pose, facing: p.facing, floor: p.floor, maxFloor: p.maxFloor, score: p.score,
      combo: p.combo.jumps ? {...p.combo} : null, bestCombo: p.bestCombo, charges: p.charges.length,
      effect: p.effect && p.effect.until > now ? {...p.effect} : null, protectedUntil: p.protectedUntil, outAt: p.outAt, reason: p.reason,
    })),
    mine: me ? {charges: [...me.charges], target: sabotageTarget(players(room), id)?.id || null} : null,
  };
}
