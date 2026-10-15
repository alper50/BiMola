import {characterFor} from './characters.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// The flat BiMola figure: lobby portraits and 2D games. (x, y) is the middle of the feet;
// the figure is about 28×44 at scale 1 and looks to the right unless `facing` is negative.
export function drawCharacter(ctx, id, {x, y, pose = 'stand', facing = 1, time = 0, alpha = 1, scale = 1} = {}) {
  const c = characterFor(id);
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale * (facing < 0 ? -1 : 1), scale);
  if (pose === 'spin') { ctx.translate(0, -22); ctx.rotate(time * 14); ctx.translate(0, 22); }
  const run = pose === 'run' ? Math.sin(time * 18) : 0, air = pose === 'jump' || pose === 'spin' || pose === 'fall';
  ctx.strokeStyle = c.shade; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath();
  if (air) { ctx.moveTo(-5, -12); ctx.lineTo(-8, -3); ctx.moveTo(5, -12); ctx.lineTo(9, -5); }
  else { ctx.moveTo(-5, -12); ctx.lineTo(-5 + run * 5, -2); ctx.moveTo(5, -12); ctx.lineTo(5 - run * 5, -2); }
  ctx.stroke();
  ctx.fillStyle = c.body; roundRect(ctx, -12, -36, 24, 26, 10); ctx.fill();
  ctx.fillStyle = c.shade; roundRect(ctx, -12, -18, 24, 8, 4); ctx.fill();
  ctx.strokeStyle = c.body; ctx.lineWidth = 5; ctx.beginPath();
  const arm = air ? -9 : run * 4;
  ctx.moveTo(-11, -26); ctx.lineTo(-16, -20 + arm); ctx.moveTo(11, -26); ctx.lineTo(16, -20 - arm); ctx.stroke();
  ctx.fillStyle = '#1b2140';
  ctx.beginPath(); ctx.arc(2, -29, 2.4, 0, Math.PI * 2); ctx.arc(8, -29, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(2.8, -29.8, .9, 0, Math.PI * 2); ctx.arc(8.8, -29.8, .9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.accent; ctx.strokeStyle = c.accent;
  const a = c.accessory;
  if (a === 'beanie') { roundRect(ctx, -12, -42, 24, 9, 5); ctx.fill(); ctx.beginPath(); ctx.arc(0, -43, 4, 0, Math.PI * 2); ctx.fill(); }
  if (a === 'scarf') { roundRect(ctx, -12, -22, 24, 5, 2); ctx.fill(); ctx.fillRect(-12, -20, 5, 10); }
  if (a === 'helmet') { ctx.beginPath(); ctx.arc(0, -32, 13, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#9fb3d9'; ctx.fillRect(-1, -45, 3, 6); }
  if (a === 'headphones') { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -32, 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); roundRect(ctx, -15, -33, 6, 9, 2); ctx.fill(); roundRect(ctx, 9, -33, 6, 9, 2); ctx.fill(); }
  if (a === 'crown') { ctx.beginPath(); ctx.moveTo(-9, -36); ctx.lineTo(-9, -45); ctx.lineTo(-4, -40); ctx.lineTo(0, -47); ctx.lineTo(4, -40); ctx.lineTo(9, -45); ctx.lineTo(9, -36); ctx.closePath(); ctx.fill(); }
  if (a === 'glasses') { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(1.6, -29, 3.4, 0, Math.PI * 2); ctx.moveTo(11.8, -29); ctx.arc(8.4, -29, 3.4, 0, Math.PI * 2); ctx.stroke(); }
  if (a === 'cap') { ctx.beginPath(); ctx.arc(0, -35, 11, Math.PI, 0); ctx.fill(); roundRect(ctx, 4, -37, 14, 4, 2); ctx.fill(); }
  if (a === 'brimhat') { ctx.fillStyle = c.shade; roundRect(ctx, -17, -38, 34, 3, 1.5); ctx.fill(); roundRect(ctx, -9, -49, 18, 12, 3); ctx.fill(); ctx.fillStyle = c.accent; ctx.fillRect(-9, -40.5, 18, 2.5); }
  if (a === 'collar') { roundRect(ctx, -6, -37, 12, 4, 2); ctx.fill(); ctx.fillStyle = c.trim; ctx.fillRect(-.9, -24, 1.8, 7); ctx.fillRect(-2.6, -22, 5.2, 1.8); }
  if (a === 'takke') { ctx.beginPath(); ctx.arc(0, -36, 8, Math.PI, 0); ctx.fill(); roundRect(ctx, -8, -37.5, 16, 3, 1); ctx.fill(); }
  if (a === 'sash') { ctx.beginPath(); ctx.moveTo(-12, -33); ctx.lineTo(-7, -36); ctx.lineTo(12, -15); ctx.lineTo(8, -12); ctx.closePath(); ctx.fill(); }
  if (c.beard) { ctx.fillStyle = c.beard; ctx.beginPath(); ctx.ellipse(5, -23.5, 6.5, 3.6, 0, 0, Math.PI * 2); ctx.fill(); }
  if (a === 'bow') { ctx.beginPath(); ctx.moveTo(4, -39); ctx.lineTo(-3, -45); ctx.lineTo(-3, -33); ctx.closePath(); ctx.moveTo(4, -39); ctx.lineTo(11, -45); ctx.lineTo(11, -33); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(4, -39, 2.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// A small standing portrait canvas, drawn once per size and copied afterwards.
const cache = new Map();
export function portrait(id, width = 44, height = 52) {
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1), key = `${characterFor(id).id}:${width}:${height}:${ratio}`;
  if (!cache.has(key)) {
    const source = document.createElement('canvas'); source.width = width * ratio; source.height = height * ratio;
    const ctx = source.getContext('2d'); ctx.scale(ratio, ratio);
    drawCharacter(ctx, id, {x: width / 2 - 2, y: height - 2, scale: (height - 4) / 50});
    cache.set(key, source);
  }
  const source = cache.get(key), canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  canvas.getContext('2d').drawImage(source, 0, 0); canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}
