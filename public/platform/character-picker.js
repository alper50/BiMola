import {CHARACTERS} from './characters.js';
import {portrait} from './portrait.js';
import {readCharacter, saveCharacter} from './profile.js';

// The one character picker: the lobby opens it and every game opens the same dialog as a
// shortcut. It carries its own styles so it looks the same on every page.
const STYLE = `
.bm-picker{border:0;border-radius:18px;padding:20px;width:min(460px,calc(100vw - 32px));color:#242d55;background:#fff;font-family:Arial,Helvetica,sans-serif;box-shadow:0 18px 44px #252f5933}
.bm-picker::backdrop{background:rgba(15,20,45,.5)}
.bm-picker h2{margin:0 0 4px;font-size:20px}
.bm-picker p{margin:0 0 14px;color:#666d89;font-size:13px;line-height:1.4}
.bm-picker-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.bm-picker-grid button{display:grid;justify-items:center;gap:3px;padding:8px 2px 9px;border:1px solid #dce0ee;border-radius:12px;background:#f4f5fb;color:#242d55;font:700 12px Arial,Helvetica,sans-serif;cursor:pointer}
.bm-picker-grid button:hover{border-color:#c7cde2}
.bm-picker-grid button[aria-pressed="true"]{border-color:#4959d8;box-shadow:0 0 0 2px #4959d8 inset;background:#eef0ff}
.bm-picker-close{float:right;border:1px solid #dce0ee;border-radius:10px;background:#fff;color:#242d55;padding:4px 10px;font:700 14px Arial,sans-serif;cursor:pointer}
@media(max-width:420px){.bm-picker-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
let dialog = null, resolve = null;

function build() {
  const style = document.createElement('style'); style.textContent = STYLE; document.head.append(style);
  dialog = document.createElement('dialog'); dialog.className = 'bm-picker'; dialog.setAttribute('aria-labelledby', 'bm-picker-title');
  const close = document.createElement('button'); close.type = 'button'; close.className = 'bm-picker-close'; close.textContent = '✕'; close.setAttribute('aria-label', 'Kapat');
  close.addEventListener('click', () => dialog.close());
  const title = document.createElement('h2'); title.id = 'bm-picker-title'; title.textContent = 'BiMola karakterin';
  const note = document.createElement('p'); note.textContent = 'Seçtiğin karakter karakterli bütün oyunlarda seninle gelir. Her oyun onu kendi tarzında çizer.';
  const grid = document.createElement('div'); grid.className = 'bm-picker-grid'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Karakterler');
  grid.append(...CHARACTERS.map(c => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.character = c.id;
    const name = document.createElement('span'); name.textContent = c.name;
    button.append(portrait(c.id, 44, 52), name);
    button.addEventListener('click', () => { const pick = resolve; resolve = null; dialog.close(); pick?.(saveCharacter(c.id)); });
    return button;
  }));
  dialog.append(close, title, note, grid);
  dialog.addEventListener('close', () => { const pick = resolve; resolve = null; pick?.(null); });
  document.body.append(dialog);
}

// Resolves with the newly chosen id (already saved), or null when closed without a choice.
export function pickCharacter() {
  if (!dialog) build();
  const current = readCharacter();
  for (const button of dialog.querySelectorAll('[data-character]')) button.setAttribute('aria-pressed', String(button.dataset.character === current));
  return new Promise(done => {
    resolve = done;
    dialog.showModal();
    dialog.querySelector('[aria-pressed="true"]')?.focus();
  });
}
