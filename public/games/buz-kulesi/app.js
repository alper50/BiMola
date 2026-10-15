import {readName, saveName, readCharacter} from '../../platform/profile.js';
import {pickCharacter} from '../../platform/character-picker.js';
import {portrait} from '../../platform/portrait.js';
import {step, spawn, STEP, W, PLAYER_H} from './physics.js';
import {createTower} from './tower.js';
import {VIEW_H, CAMERA_START, COMBO_MS, SABOTAGES, SPEEDS, SABOTAGE_LOCK_MS, SABOTAGE_COMBO, advanceCamera, fallen, land, freshCombo, validCombo, comboPoints, score, hurry, speedLevel} from './rules.js';
import {characterFor} from './characters.js';
import {createRenderer} from './render.js';
import {createInput} from './input.js';
import {createAudio} from './audio.js';

const GAME = 'buz-kulesi', SEND_MS = 50, GHOST_DELAY = 100, MAX_LANDS = 8;
const $ = id => document.getElementById(id);
const el = (tag, className = '', text = '') => { const node = document.createElement(tag); if (className) node.className = className; if (text !== '') node.textContent = text; return node; };
const socket = io('/games/' + GAME, {autoConnect: false, reconnection: false});
const audio = createAudio(), renderer = createRenderer($('tower')), demoTower = createTower(20261015);
// The browser simulates only its own climber; everyone else is drawn ~100 ms behind from server snapshots.
let state = null, offset = null, tower = demoTower, local = null, matchKey = '', frame = 0, lastFrame = 0, lastSent = 0;
let joining = false, closing = false, resultsDismissed = false, spectating = null, spectateCamera = CAMERA_START;
let noticeTimer, banner = null, panelKey = '', lastLevel = -1, lastCount = null, records = null, recordBefore = 0, recordRequest = null;
const ghosts = new Map();
let character = readCharacter();

const serverNow = () => Date.now() + (offset ?? 0);
const me = () => state?.players.find(p => p.id === state.me);
const inMatch = () => state && (state.phase === 'countdown' || state.phase === 'play');
const climbing = () => !!local && !local.dead && inMatch();
function notice(message) { $('notice').textContent = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('notice').textContent = ''; }, 4500); }
function flash(text, ms = 1600, alert = false) { banner = {text, until: performance.now() + ms, alert}; }
function command(event, data = {}, quiet = false) {
  return new Promise(resolve => socket.timeout(6000).emit(event, data, (error, result) => {
    if (error) { if (!quiet) notice('Sunucudan yanıt alınamadı. Bağlantını kontrol et.'); resolve(null); return; }
    if (result?.error && !quiet) notice(result.error);
    resolve(result);
  }));
}

// ---------- Karakter ----------
// The character is the shared BiMola one; this page only offers a shortcut to the common picker.
function showCharacter() {
  const c = characterFor(character);
  for (const prefix of ['home', 'room']) { $(`${prefix}-portrait`).replaceChildren(portrait(c.id, 44, 52)); $(`${prefix}-character-name`).textContent = c.name; }
}
async function changeCharacter() {
  const id = await pickCharacter();
  if (!id) return;
  if (state) { const result = await command('character', id); if (!result?.ok) return; }
  character = id; showCharacter();
}
for (const button of document.querySelectorAll('[data-character-change]')) button.addEventListener('click', changeCharacter);

// ---------- Rekorlar ----------
// Kimlik sunucunun HttpOnly çerezinde kalır; tarayıcı hiçbir zaman puan göndermez.
async function loadScores() {
  if (recordRequest) return recordRequest;
  recordRequest = (async () => {
    try {
      const response = await fetch(`/api/games/${GAME}/scores`, {cache: 'no-store'});
      if (!response.ok) throw new Error();
      records = await response.json();
      const stats = records.me;
      $('home-records').replaceChildren(...[['Rekor', stats.best], ['En iyi kombo', stats.streak], ['Galibiyet', stats.correct], ['Maç', stats.played]].map(([label, value]) => {
        const card = el('div', 'record'); card.append(el('b', '', value.toLocaleString('tr')), el('small', '', label)); return card;
      }));
      $('records-note').textContent = records.durable ? 'Rekorların bu tarayıcıdaki oyuncu kimliğinle korunur.' : 'Geçici sunucu: rekorlar yeniden başlatmada kaybolur.';
      $('alltime-board').replaceChildren(...records.rows.map(row => {
        const item = el('li', row.mine ? 'me' : ''); item.append(el('span', '', `${row.rank}. ${row.name}${row.mine ? ' (sen)' : ''}`), el('b', '', row.best.toLocaleString('tr'))); return item;
      }));
      $('alltime-note').textContent = records.rows.length ? `${records.rank ? `Senin sıran: ${records.rank}. · ` : ''}İlk 20 oyuncu.` : 'Kule henüz boş. İlk rekoru sen kır.';
      if (state?.phase === 'end') $('results-note').textContent = stats.best > recordBefore ? `Yeni kişisel rekor: ${stats.best.toLocaleString('tr')} puan!` : `Kişisel rekorun: ${stats.best.toLocaleString('tr')} puan.`;
    } catch { $('records-note').textContent = 'Kule defteri yüklenemedi.'; }
    finally { recordRequest = null; }
  })();
  return recordRequest;
}

// ---------- Oda ----------
$('join-form').addEventListener('submit', event => {
  event.preventDefault(); if (joining) return;
  audio.unlock(); joining = true; $('join-button').disabled = true; $('join-error').textContent = '';
  const join = async () => {
    const result = await command('join', {name: saveName($('name').value) || 'Misafir', code: $('code').value.trim() || undefined, character}, true);
    joining = false; $('join-button').disabled = false;
    if (!result || result.error) { $('join-error').textContent = result?.error || 'Sunucuya ulaşılamadı. Tekrar dene.'; return; }
    recordBefore = records?.me.best || 0;
    $('home').hidden = true; $('room').hidden = false; history.replaceState(null, '', `?room=${result.code}`);
    renderer.resize(); $('tower').focus();
    if (result.waiting) notice('Maç sürüyor. Sonraki maçta tırmanacaksın; şimdilik izle.');
  };
  if (socket.connected) join(); else { socket.once('connect', join); socket.connect(); }
});
socket.on('connect_error', () => { socket.off('connect'); joining = false; $('join-button').disabled = false; $('join-error').textContent = 'Bağlantı kurulamadı. Tekrar dene.'; });
function exit(message) {
  state = null; local = null; matchKey = ''; tower = demoTower; ghosts.clear(); panelKey = ''; spectating = null; input.clear();
  $('home').hidden = false; $('room').hidden = true; $('results').hidden = true; joining = false; $('join-button').disabled = false;
  history.replaceState(null, '', location.pathname); if (message) notice(message);
  loadScores();
}
socket.on('disconnect', () => { if (state && !closing) exit('Bağlantın koptu. Odaya yeniden katılabilirsin.'); });
socket.on('room-error', result => exit(result.error));
$('leave').addEventListener('click', () => { socket.emit('leave'); exit(); });
$('invite').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${location.origin}/games/${GAME}/?room=${state.code}`); notice('Davet bağlantısı kopyalandı.'); }
  catch { notice(`Oda kodu: ${state.code}`); }
});
$('start').addEventListener('click', () => { audio.unlock(); command('start'); });
$('results-restart').addEventListener('click', () => command('start'));
$('results-close').addEventListener('click', () => { resultsDismissed = true; $('results').hidden = true; });
$('speed').replaceChildren(...Object.entries(SPEEDS).map(([id, speed]) => new Option(speed.name, id)));
$('speed').addEventListener('change', event => command('settings', {speed: event.target.value}));
$('start-zone').addEventListener('change', event => command('settings', {startZone: Number(event.target.value)}));
$('sabotage').addEventListener('change', event => command('settings', {sabotage: event.target.checked}));

function freshLocal(p) {
  return {s: spawn(p.spawnX), acc: 0, camera: CAMERA_START, elapsed: 0, combo: freshCombo(), points: 0, maxFloor: 0, landId: 0, lands: [], lastAt: 0, seq: 0, dead: false};
}
socket.on('state', packet => {
  if (packet.gameId !== GAME || packet.protocolVersion !== 1) return;
  const sample = packet.serverNow - Date.now();
  offset = offset === null || Math.abs(sample - offset) > 1000 ? sample : offset * .9 + sample * .1;
  const previous = state, previousMe = me();
  state = packet;
  const key = `${packet.seed}:${packet.startedAt}`;
  if (packet.phase === 'lobby') { local = null; matchKey = ''; tower = demoTower; }
  else if (packet.seed && key !== matchKey) {
    matchKey = key; tower = createTower(packet.seed, packet.settings.startZone);
    ghosts.clear(); resultsDismissed = false; spectating = null; lastLevel = -1; lastCount = null;
    local = me()?.racing ? freshLocal(me()) : null;
    recordBefore = records?.me.best || 0;
  }
  for (const p of packet.players) {
    if (p.id === packet.me) continue;
    const samples = ghosts.get(p.id) || [];
    samples.push({t: packet.serverNow, x: p.x, y: p.y, pose: p.pose, facing: p.facing});
    if (samples.length > 12) samples.shift();
    ghosts.set(p.id, samples);
  }
  for (const id of ghosts.keys()) if (!packet.players.some(p => p.id === id)) ghosts.delete(id);
  const mine = me();
  // The server can drop us too (silence, cheating checks); follow it.
  if (local && !local.dead && mine && !mine.alive && packet.phase === 'play') { local.dead = true; audio.play('fall'); }
  if (mine?.effect && mine.effect.until !== previousMe?.effect?.until) { audio.play('hit'); flash(SABOTAGES[mine.effect.type].text, 2200, true); }
  if (packet.phase === 'end' && previous?.phase !== 'end') {
    audio.play(packet.results?.winnerId === packet.me ? 'win' : 'combo-end');
    setTimeout(loadScores, 250);
  }
  if (packet.winnerId && packet.winnerId !== previous?.winnerId && packet.winnerId === packet.me) { audio.play('win'); flash('KAZANDIN! Rekor için tırmanmaya devam et.', 3000); }
  renderPanel();
});

// ---------- Yerel tırmanış ----------
function effects(p, now) {
  const effect = p?.effect && p.effect.until > now ? p.effect : null;
  return {ice: effect?.type === 'ice', wind: effect?.type === 'wind' ? effect.dir : 0, fog: effect?.type === 'fog'};
}
function finishCombo(combo) {
  if (!validCombo(combo)) return;
  local.points += comboPoints(combo);
  audio.play('combo-end', combo.floors);
  flash(combo.floors >= SABOTAGE_COMBO ? `${combo.floors} KAT KOMBO! Sabotaj hakkı ↗` : `${combo.floors} KAT KOMBO!`, 1600);
}
function landed(from, floor, now) {
  // Landing times stay monotonic even if the clock estimate shifts a little.
  const at = Math.max(local.lastAt, Math.round(now));
  const {combo, ended} = land(local.combo, from, floor, at);
  if (ended) finishCombo(ended);
  if (combo.jumps) audio.play('combo', combo.floors);
  local.combo = combo; local.maxFloor = Math.max(local.maxFloor, floor); local.lastAt = at;
  local.lands = [...local.lands, [++local.landId, floor, at]].slice(-MAX_LANDS);
}
function simulate(dt, now, elapsed, fx) {
  local.acc = Math.min(local.acc + dt, .25);
  while (local.acc >= STEP) {
    local.acc -= STEP;
    const next = step(local.s, input.state, tower, fx);
    if (next.jumped) audio.play(next.super ? 'super' : 'jump');
    if (next.landed !== null) landed(local.s.floor, next.landed, now);
    local.s = next;
  }
  local.camera = advanceCamera(local.camera, local.s.y, local.elapsed, elapsed, state.settings.speed);
  local.elapsed = elapsed;
  if (local.combo.jumps && now - local.combo.at > COMBO_MS) { finishCombo(local.combo); local.combo = freshCombo(); }
  if (performance.now() - lastSent >= SEND_MS) send();
  if (fallen(local.s.y, local.camera)) {
    local.dead = true; send(); socket.emit('fell', {}, () => {});
    finishCombo(local.combo); local.combo = freshCombo();
    audio.play('fall'); flash('DÜŞTÜN!', 1800, true);
  }
}
const round = value => Math.round(value * 100) / 100;
function send() {
  lastSent = performance.now();
  const s = local.s;
  socket.volatile.emit('move', {seq: ++local.seq, x: round(s.x), y: round(s.y), vx: round(s.vx), vy: round(s.vy), pose: s.pose, facing: s.facing, lands: local.lands});
}

// ---------- İzleme ----------
const alive = () => (state?.players || []).filter(p => p.racing && p.alive).sort((a, b) => b.floor - a.floor || b.y - a.y);
function cycle(direction) {
  if (climbing()) return;
  const list = alive(); if (!list.length) return;
  const index = list.findIndex(p => p.id === spectating);
  spectating = list[(index + direction + list.length) % list.length].id;
}
function ghost(p, now) {
  const samples = ghosts.get(p.id);
  if (!samples?.length) return {x: p.x, y: p.y, pose: p.pose, facing: p.facing};
  const at = now - GHOST_DELAY;
  let index = samples.findIndex(sample => sample.t > at);
  if (index === -1) return samples.at(-1);
  if (index === 0) return samples[0];
  const a = samples[index - 1], b = samples[index], k = (at - a.t) / Math.max(1, b.t - a.t);
  return {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, pose: b.pose, facing: b.facing};
}

// ---------- Çizim ----------
function draw(now, elapsed, dt, fx) {
  const list = state ? state.players : [], lobby = !state || state.phase === 'lobby';
  const players = list.map((p, i) => {
    const mine = p.id === state.me;
    let position;
    if (lobby) position = {x: Math.round(W * (i + 1) / (list.length + 1)), y: 0, pose: 'stand', facing: i % 2 ? -1 : 1};
    else if (mine && local) position = {x: local.s.x, y: local.s.y, pose: local.s.pose, facing: local.s.facing};
    else position = ghost(p, now);
    const floor = mine && local ? local.s.floor : p.floor;
    const visible = lobby || (mine && local ? !local.dead : p.racing && p.alive);
    const effect = p.effect && p.effect.until > now ? SABOTAGES[p.effect.type].icon : '';
    return {...p, ...position, floor, me: mine, visible, effect, alive: mine && local ? !local.dead && p.alive : p.alive, maxFloor: Math.max(p.maxFloor, mine && local ? local.maxFloor : 0)};
  });
  let camera = CAMERA_START, danger = 0;
  if (climbing()) {
    camera = local.camera;
    if (state.phase === 'play' && elapsed > 2000) danger = Math.max(0, Math.min(1, 1 - (local.s.y + PLAYER_H - camera) / 160));
  } else if (!lobby) {
    const racers = alive();
    if (!racers.some(p => p.id === spectating)) spectating = racers[0]?.id || null;
    const target = players.find(p => p.id === spectating);
    if (target) spectateCamera += (target.y - VIEW_H * .35 - spectateCamera) * Math.min(1, dt * 5);
    camera = Math.max(CAMERA_START, spectateCamera);
  }
  renderer.draw({tower, camera, players, time: performance.now() / 1000, fx: climbing() ? fx : {}, danger, showBar: !lobby});
}
function hud(now, elapsed) {
  const mine = me(), lobby = !state || state.phase === 'lobby';
  const watched = !climbing() && spectating ? state.players.find(p => p.id === spectating) : null;
  const floor = climbing() ? local.s.floor : watched ? watched.floor : mine?.maxFloor || 0;
  const points = climbing() ? score(local.maxFloor, local.points) : watched ? watched.score : mine?.score || 0;
  $('hud-floor').textContent = floor; $('hud-score').textContent = points.toLocaleString('tr');
  const combo = climbing() ? local.combo : watched?.combo;
  $('hud-combo').hidden = !combo?.jumps;
  if (combo?.jumps) {
    $('combo-floors').textContent = combo.floors;
    $('hud-combo').classList.toggle('big', combo.floors >= SABOTAGE_COMBO);
    $('combo-timer').style.transform = `scaleX(${Math.max(0, 1 - (now - combo.at) / COMBO_MS)})`;
  }
  const charges = state?.mine?.charges || [], locked = elapsed < SABOTAGE_LOCK_MS;
  const target = state?.players.find(p => p.id === state.mine?.target);
  const chargeKey = `${charges.join()}|${locked}|${target?.name}|${climbing()}|${state?.settings.sabotage}`;
  if ($('hud-charges').dataset.key !== chargeKey) {
    $('hud-charges').dataset.key = chargeKey;
    const nodes = charges.map(type => el('span', `charge${locked ? '' : ' ready'}`, `${SABOTAGES[type].icon} ${SABOTAGES[type].name}`));
    if (charges.length && climbing()) nodes.push(el('small', '', locked ? 'İlk 10 sn sabotaj yok' : `E → ${target ? target.name : 'rakip yok'}`));
    $('hud-charges').replaceChildren(...nodes);
  }
  // Countdown, speed-up warning and short banners.
  let count = null;
  if (state?.phase === 'countdown') count = Math.max(1, Math.ceil((state.startedAt - now) / 1000));
  else if (state?.phase === 'play' && elapsed < 700 && local) count = 0;
  if (count !== lastCount) { if (count !== null) audio.play('countdown', count); lastCount = count; }
  $('countdown').hidden = count === null; $('countdown').textContent = count ? String(count) : 'ZIPLA!';
  const level = state?.phase === 'play' ? speedLevel(elapsed) : -1;
  if (level > lastLevel) { if (level > 0) flash('HIZLANDI!', 1400, true); lastLevel = level; }
  let text = banner && banner.until > performance.now() ? banner : null;
  if (!text && state?.phase === 'play' && hurry(elapsed)) {
    text = {text: level < 0 ? 'KULE KAYMAYA BAŞLIYOR' : 'HIZLANIYOR!', alert: true};
    if ($('banner').textContent !== text.text) audio.play('hurry');
  }
  $('banner').hidden = !text; if (text) { $('banner').textContent = text.text; $('banner').classList.toggle('alert', !!text.alert); }
  let spectate = '';
  if (!lobby && !climbing() && inMatch()) {
    const name = watched?.name;
    spectate = mine?.waiting ? `Maç sürüyor · sonraki maçta tırmanacaksın${name ? ` · İzlenen: ${name}` : ''}` : name ? `İzliyorsun: ${name} · ←/→ değiştir` : 'Herkes düştü.';
  }
  $('spectate').hidden = !spectate; $('spectate').textContent = spectate;
}

// ---------- Panel ----------
function status(p) {
  if (state.phase === 'lobby') return p.id === state.hostId ? 'Oda sahibi' : 'Hazır';
  if (p.waiting) return 'İzliyor';
  if (!p.racing) return '';
  return p.alive ? `${p.floor}. kat` : `Düştü · ${p.maxFloor}. kat`;
}
function renderPanel() {
  if (!state) return;
  const mine = me(), host = state.hostId === state.me, racers = state.players.filter(p => p.racing), up = racers.filter(p => p.alive);
  const key = JSON.stringify([state.phase, state.hostId, state.settings, state.feed.at(-1)?.id, state.winnerId, !!state.results, resultsDismissed,
    state.players.map(p => [p.id, p.name, p.character, p.alive, p.racing, p.waiting, p.floor, p.maxFloor])]);
  if (key === panelKey) return;
  panelKey = key;
  $('room-code').textContent = `ODA ${state.code} / BUZ KULESİ`;
  let title = 'Kule hazır.', hint = host ? 'Arkadaşlarını davet et ve maçı başlat. Tek başına antrenman da yapabilirsin.' : 'Oda sahibi başlatınca tırmanış başlar.';
  if (state.phase === 'countdown') { title = 'Hazır ol!'; hint = 'Duvardan duvara koşarak hızlan, Space ile zıpla.'; }
  if (state.phase === 'play') {
    if (mine?.waiting) { title = 'Maç sürüyor.'; hint = 'Sonraki maçta tırmanacaksın.'; }
    else if (mine?.alive) { title = state.winnerId === state.me ? 'Kazandın! Rekor için tırman.' : 'Tırman!'; hint = `${up.length}/${racers.length} tırmanıcı ayakta.`; }
    else { title = 'Düştün.'; hint = `${up.length} tırmanıcı ayakta. Maç bitince yeni maç başlar.`; }
  }
  if (state.phase === 'end') {
    const winner = state.players.find(p => p.id === state.results?.winnerId) || state.results?.ranking.find(p => p.id === state.results.winnerId);
    title = state.results?.solo ? 'Antrenman bitti.' : winner ? `${winner.name} kazandı!` : 'Maç bitti.';
    hint = host ? 'Yeni maçı başlatabilirsin.' : 'Oda sahibi yeni maçı başlatabilir.';
  }
  $('title').textContent = title; $('hint').textContent = hint;
  const order = [...state.players].sort((a, b) => Number(b.racing && b.alive) - Number(a.racing && a.alive) || b.floor - a.floor);
  $('players').replaceChildren(...order.map(p => {
    const item = el('li', `${p.id === state.me ? 'me' : ''}${p.racing && !p.alive && state.phase !== 'lobby' ? ' out' : ''}`);
    item.append(portrait(p.character, 30, 36), el('span', 'name', `${p.id === state.hostId ? '★ ' : ''}${p.name}${p.id === state.me ? ' (sen)' : ''}`), el('span', 'status', status(p)));
    return item;
  }));
  const editable = host && !inMatch();
  $('speed').value = state.settings.speed; $('start-zone').value = String(state.settings.startZone); $('sabotage').checked = state.settings.sabotage;
  for (const id of ['speed', 'start-zone', 'sabotage']) $(id).disabled = !editable;
  $('settings-hint').textContent = host ? (inMatch() ? 'Ayarlar maç arasında değişir.' : '') : 'Ayarları oda sahibi seçer.';
  $('start').hidden = !host; $('start').disabled = inMatch();
  $('start').textContent = state.players.length === 1 ? 'Antrenmana başla' : state.phase === 'end' ? 'Yeni maç' : 'Maçı başlat';
  if (mine && mine.character !== character) { character = mine.character; showCharacter(); }
  $('feed').replaceChildren(...[...state.feed].reverse().map(entry => el('li', entry.kind, entry.text)));
  renderResults(host);
}
function renderResults(host) {
  const results = state.phase === 'end' ? state.results : null;
  $('results').hidden = !results || resultsDismissed;
  if (!results) return;
  const winner = results.ranking.find(p => p.id === results.winnerId);
  $('results-title').textContent = results.solo ? `Antrenman bitti · ${results.ranking[0]?.maxFloor ?? 0}. kat` : winner ? `${winner.name} kazandı!` : 'Maç bitti.';
  $('awards').replaceChildren(...results.awards.map(award => { const node = el('div', 'award'); node.append(el('b', '', award.title), `${award.name} · ${award.value}`); return node; }));
  $('ranking').replaceChildren(...results.ranking.map(p => {
    const row = el('tr', `${p.id === state.me ? 'me' : ''}${p.id === results.winnerId ? ' winner' : ''}`);
    for (const value of [p.id === results.winnerId ? '🏆 1' : String(p.place), `${p.name}${p.left ? ' (ayrıldı)' : ''}`, `${p.maxFloor}`, p.bestCombo ? `${p.bestCombo} kat` : '—', p.score.toLocaleString('tr')]) row.append(el('td', '', value));
    return row;
  }));
  $('results-restart').hidden = !host;
}

// ---------- Döngü ----------
function loop(timestamp) {
  frame = requestAnimationFrame(loop);
  const dt = lastFrame ? Math.min(.1, (timestamp - lastFrame) / 1000) : 0; lastFrame = timestamp;
  if (!state) return;
  const now = serverNow(), elapsed = now - state.startedAt, fx = effects(me(), now);
  if (climbing() && state.phase === 'play' && elapsed >= 0) simulate(dt, now, elapsed, fx);
  draw(now, elapsed, dt, fx); hud(now, elapsed);
}
function startLoop() { if (!frame && !closing) { lastFrame = 0; frame = requestAnimationFrame(loop); } }
function stopLoop() { cancelAnimationFrame(frame); frame = 0; }

const input = createInput({
  active: () => !!state && !$('room').hidden && !document.querySelector('dialog[open]'),
  onSabotage: async () => {
    if (!climbing() || state.phase !== 'play') return;
    if (!state.mine?.charges.length) { notice('Sabotaj hakkın yok. 10 katlık kombo yap.'); return; }
    const result = await command('sabotage');
    if (result?.ok) { audio.play('sabotage'); flash(`${SABOTAGES[result.type].icon} ${SABOTAGES[result.type].name} → ${state.players.find(p => p.id === result.target)?.name || 'lider'}`, 1600); }
  },
  onCycle: cycle,
});

$('sound').addEventListener('click', async () => {
  const enabled = await audio.toggle();
  $('sound').textContent = enabled ? '♫ Ses açık' : '♫ Ses kapalı'; $('sound').setAttribute('aria-pressed', String(enabled));
});
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => audio.unlock(), {passive: true});
$('rules-open').addEventListener('click', () => $('rules').showModal());
$('alltime-open').addEventListener('click', () => { $('alltime-dialog').showModal(); loadScores(); });
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
const resize = new ResizeObserver(() => renderer.resize()); resize.observe($('tower'));
document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else startLoop(); });
addEventListener('pagehide', () => {
  closing = true; stopLoop(); clearTimeout(noticeTimer); resize.disconnect(); input.dispose(); audio.dispose(); socket.disconnect();
});
// A page restored from the back/forward cache starts a fresh session.
addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

$('name').value = readName();
$('name').addEventListener('change', event => { event.target.value = saveName(event.target.value); });
$('code').value = new URLSearchParams(location.search).get('room') || '';
showCharacter(); startLoop();
fetch('/api/player', {cache: 'no-store'}).then(response => { if (!response.ok) throw new Error(); return loadScores(); })
  .catch(() => { $('records-note').textContent = 'Oyuncu kimliğin açılamadı; rekorların kaydedilmeyebilir.'; })
  .finally(() => { if (!closing) socket.connect(); });
