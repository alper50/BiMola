import {W, FLOOR_GAP, PLAYER_H} from './physics.js';
import {zoneOf} from './tower.js';
import {VIEW_H} from './rules.js';
import {characterFor, drawCharacter} from './characters.js';

export const WALL = 40, VIEW_W = W + WALL * 2, LEDGE_H = 14;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Draws one frame of the tower for a camera (world y at the bottom edge of the view).
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  function resize() {
    const ratio = Math.min(2, devicePixelRatio || 1), width = Math.max(1, canvas.clientWidth);
    scale = width * ratio / VIEW_W;
    canvas.width = Math.round(VIEW_W * scale); canvas.height = Math.round(VIEW_H * scale);
  }
  const sy = (y, camera) => VIEW_H - (y - camera);

  function background(camera, startZone) {
    const zone = zoneOf(Math.max(0, Math.floor((camera + VIEW_H / 2) / FLOOR_GAP)), startZone);
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    gradient.addColorStop(0, zone.bg[1]); gradient.addColorStop(1, zone.bg[0]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Back wall bricks scroll at half speed for depth.
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    const parallax = camera * .5, row = 36;
    for (let y = -((parallax % row) + row) % row; y < VIEW_H + row; y += row) {
      const index = Math.floor((parallax + VIEW_H - y) / row);
      ctx.beginPath(); ctx.moveTo(WALL, y); ctx.lineTo(VIEW_W - WALL, y);
      for (let x = WALL + (index % 2 ? 36 : 0); x < VIEW_W - WALL; x += 72) { ctx.moveTo(x, y); ctx.lineTo(x, y + row); }
      ctx.stroke();
    }
    return zone;
  }
  function walls(camera, zone) {
    for (const x of [0, VIEW_W - WALL]) {
      ctx.fillStyle = zone.wall; ctx.fillRect(x, 0, WALL, VIEW_H);
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 2; ctx.beginPath();
      const block = 48;
      for (let y = VIEW_H + ((camera % block) + block) % block; y > -block; y -= block) {
        ctx.moveTo(x, y); ctx.lineTo(x + WALL, y);
        const index = Math.floor((camera + VIEW_H - y) / block);
        ctx.moveTo(x + (index % 2 ? 14 : 26), y); ctx.lineTo(x + (index % 2 ? 14 : 26), y - block);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x === 0 ? WALL - 4 : x, 0, 4, VIEW_H);
    }
  }
  function ledges(tower, camera) {
    const first = Math.max(0, Math.floor((camera - 40) / FLOOR_GAP)), last = Math.ceil((camera + VIEW_H + 20) / FLOOR_GAP);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let n = first; n <= last; n++) {
      const ledge = tower.platform(n), zone = zoneOf(n, tower.startZone), y = sy(ledge.y, camera), x = WALL + ledge.x;
      ctx.fillStyle = zone.edge; roundRect(ctx, x, y, ledge.w, LEDGE_H, 5); ctx.fill();
      ctx.fillStyle = ledge.rest ? '#ffffff' : zone.ledge; roundRect(ctx, x, y, ledge.w, LEDGE_H - 4, 5); ctx.fill();
      // Icicles under ice ledges
      if (zone.name === 'Buz' && !ledge.rest) {
        ctx.fillStyle = 'rgba(200,236,255,.8)';
        for (let i = x + 12; i < x + ledge.w - 8; i += 22) { ctx.beginPath(); ctx.moveTo(i, y + LEDGE_H); ctx.lineTo(i + 4, y + LEDGE_H + 7 + (n * 7 + i) % 6); ctx.lineTo(i + 8, y + LEDGE_H); ctx.fill(); }
      }
      if (n && n % 10 === 0) {
        const signX = WALL + ledge.x + ledge.w / 2;
        ctx.fillStyle = '#242d55'; roundRect(ctx, signX - 22, y + 16, 44, 20, 4); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial, sans-serif'; ctx.fillText(String(n), signX, y + 26);
      }
    }
  }
  function climber(p, camera, time) {
    const x = WALL + p.x, y = sy(p.y, camera);
    if (y < -60 || y > VIEW_H + 60) return;
    drawCharacter(ctx, p.character, {x, y, pose: p.pose, facing: p.facing, time, alpha: p.me ? 1 : .45});
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = `${p.me ? 'bold ' : ''}12px Arial, sans-serif`;
    const label = p.me ? 'SEN' : p.name;
    ctx.globalAlpha = p.me ? 1 : .75;
    ctx.fillStyle = 'rgba(15,20,45,.65)'; const width = ctx.measureText(label).width + 10;
    roundRect(ctx, x - width / 2, y - PLAYER_H - 24, width, 16, 6); ctx.fill();
    ctx.fillStyle = p.me ? '#ffe27a' : '#fff'; ctx.fillText(label, x, y - PLAYER_H - 10);
    ctx.globalAlpha = 1;
    if (p.effect) { ctx.font = '16px Arial, sans-serif'; ctx.fillText(p.effect, x + 20, y - PLAYER_H + 4); }
  }
  // Right-hand altitude bar: every climber's floor at a glance.
  function altitude(players) {
    const top = Math.max(20, ...players.map(p => p.maxFloor + 5)), x = VIEW_W - 22, from = 30, to = VIEW_H - 30;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, x - 7, from - 10, 14, to - from + 20, 7); ctx.fill();
    const at = floor => to - (to - from) * Math.min(1, floor / top);
    for (const p of [...players].sort((a, b) => Number(a.me) - Number(b.me))) {
      const y = at(p.floor);
      ctx.fillStyle = p.alive ? characterFor(p.character).body : '#7c8199';
      ctx.beginPath(); ctx.arc(x, y, p.me ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      if (p.me) { ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2; ctx.stroke(); }
      if (!p.alive) { ctx.strokeStyle = '#1b2140'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '10px Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(top), x, from - 14); ctx.fillText('0', x, to + 18);
  }
  // Off-screen climbers get a marker at the top or bottom edge.
  function arrows(players, camera, viewFloor) {
    ctx.font = 'bold 11px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of players) {
      if (p.me || !p.alive) continue;
      const above = p.y > camera + VIEW_H - 10, below = p.y + PLAYER_H < camera;
      if (!above && !below) continue;
      const x = Math.max(WALL + 40, Math.min(VIEW_W - WALL - 40, WALL + p.x)), y = above ? 16 : VIEW_H - 16;
      const diff = p.floor - viewFloor, label = `${p.name} ${above ? '▲' : '▼'} ${diff > 0 ? '+' : ''}${diff}`;
      const width = ctx.measureText(label).width + 14;
      ctx.fillStyle = characterFor(p.character).body; ctx.globalAlpha = .9; roundRect(ctx, x - width / 2, y - 9, width, 18, 9); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#1b2140'; ctx.fillText(label, x, y);
    }
  }
  function effects(fx, time, danger) {
    if (danger > 0) {
      const gradient = ctx.createLinearGradient(0, VIEW_H, 0, VIEW_H - 160);
      gradient.addColorStop(0, `rgba(255,70,60,${.45 * danger})`); gradient.addColorStop(1, 'rgba(255,70,60,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, VIEW_H - 160, VIEW_W, 160);
    }
    if (fx.ice) {
      ctx.strokeStyle = 'rgba(190,235,255,.85)'; ctx.lineWidth = 18; ctx.strokeRect(9, 9, VIEW_W - 18, VIEW_H - 18);
      ctx.fillStyle = 'rgba(190,235,255,.08)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (fx.wind) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const y = (i * 53) % VIEW_H, x = ((time * 900 * fx.wind + i * 97) % VIEW_W + VIEW_W) % VIEW_W;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 60 * fx.wind, y); ctx.stroke();
      }
    }
    if (fx.fog) {
      const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H * .62);
      gradient.addColorStop(0, 'rgba(205,212,230,.98)'); gradient.addColorStop(.85, 'rgba(205,212,230,.92)'); gradient.addColorStop(1, 'rgba(205,212,230,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, VIEW_W, VIEW_H * .62);
    }
  }

  return {
    resize,
    draw({tower, camera, players, time, fx = {}, danger = 0, showBar = true}) {
      if (canvas.width < 2) resize();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const zone = background(camera, tower.startZone);
      ledges(tower, camera); walls(camera, zone);
      for (const p of players) if (!p.me && p.visible) climber(p, camera, time);
      for (const p of players) if (p.me && p.visible) climber(p, camera, time);
      effects(fx, time, danger);
      if (showBar) { altitude(players.filter(p => p.racing)); arrows(players.filter(p => p.racing), camera, Math.floor((camera + VIEW_H / 2) / FLOOR_GAP)); }
    },
  };
}
