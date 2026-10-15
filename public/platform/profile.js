import {DEFAULT_CHARACTER, validCharacter} from './characters.js';

// Only preferences belong in storage; room membership always belongs to the server.
export function readName() {
  try { return localStorage.getItem('bimola-name') || localStorage.getItem('mola-name') || ''; } catch { return ''; }
}
export function saveName(value) {
  const name = String(value).trim().slice(0, 18);
  try { localStorage.setItem('bimola-name', name); } catch { /* Storage may be disabled. */ }
  return name;
}
// The BiMola character is chosen once and used by every game that draws players.
export function readCharacter() {
  try {
    const id = localStorage.getItem('bimola-character') || localStorage.getItem('bimola-buz-kulesi-character');
    return validCharacter(id) ? id : DEFAULT_CHARACTER;
  } catch { return DEFAULT_CHARACTER; }
}
export function saveCharacter(id) {
  const character = validCharacter(id) ? id : DEFAULT_CHARACTER;
  try { localStorage.setItem('bimola-character', character); } catch { /* Storage may be disabled. */ }
  return character;
}
