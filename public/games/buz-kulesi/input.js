const KEYS = {arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', ' ': 'jump', arrowup: 'jump', w: 'jump'};
const typing = target => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));

// Keyboard state for the climber. Keys are released when the page loses focus.
export function createInput({active, onSabotage, onCycle}) {
  const state = {left: false, right: false, jump: false};
  const clear = () => { state.left = state.right = state.jump = false; };
  function down(event) {
    if (typing(event.target) || !active()) return;
    const key = event.key.toLowerCase(), action = KEYS[key];
    if (action) { state[action] = true; event.preventDefault(); }
    if (key === 'e' && !event.repeat) { onSabotage(); event.preventDefault(); }
    if ((key === 'arrowleft' || key === 'arrowright') && !event.repeat) onCycle(key === 'arrowleft' ? -1 : 1);
  }
  function up(event) {
    const action = KEYS[event.key.toLowerCase()];
    if (action) state[action] = false;
  }
  const hidden = () => { if (document.hidden) clear(); };
  addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', clear);
  document.addEventListener('visibilitychange', hidden);
  return {state, clear, dispose() {
    removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', clear);
    document.removeEventListener('visibilitychange', hidden);
  }};
}
