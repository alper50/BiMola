// Synthesized locally: no audio downloads or external requests.
export function createAudio() {
  let context, enabled = true, disposed = false;
  const voices = new Set();
  async function unlock() {
    if (!enabled || disposed) return;
    try { context ||= new (window.AudioContext || window.webkitAudioContext)(); if (context.state === 'suspended') await context.resume(); } catch { enabled = false; }
  }
  function tone(frequency, duration, volume = .06, type = 'sine', delay = 0, end = frequency) {
    if (document.hidden || !enabled || disposed || context?.state !== 'running') return;
    const oscillator = context.createOscillator(), gain = context.createGain(), at = context.currentTime + delay;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain); gain.connect(context.destination); voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + duration + .02);
  }
  function play(event, value = 0) {
    if (event === 'jump') tone(320, .12, .035, 'square', 0, 520);
    if (event === 'super') { tone(300, .35, .05, 'sawtooth', 0, 1200); tone(600, .3, .03, 'sine', .05, 1500); }
    if (event === 'combo') tone(500 + Math.min(value, 20) * 40, .1, .04, 'triangle');
    if (event === 'combo-end') [0, .08, .16].forEach((delay, i) => tone(660 * (1 + i * .25) * (value >= 10 ? 1.5 : 1), .18, .05, 'triangle', delay));
    if (event === 'hurry') { tone(880, .14, .05, 'square'); tone(880, .14, .05, 'square', .22); }
    if (event === 'countdown') tone(value ? 600 : 1000, value ? .1 : .3, .06);
    if (event === 'sabotage') tone(1200, .25, .05, 'sawtooth', 0, 300);
    if (event === 'hit') { tone(200, .4, .07, 'sawtooth', 0, 60); tone(90, .3, .05, 'square', .05, 40); }
    if (event === 'fall') tone(500, .7, .07, 'triangle', 0, 60);
    if (event === 'win') [523, 659, 784, 1046].forEach((f, i) => tone(f, .3, .06, 'triangle', i * .12));
  }
  return {play, unlock, get enabled() { return enabled; },
    async toggle() { enabled = !enabled; if (enabled) await unlock(); else for (const voice of voices) { try { voice.stop(); } catch {} } return enabled; },
    dispose() { disposed = true; for (const voice of voices) { try { voice.stop(); } catch {} } voices.clear(); context?.close().catch(() => {}); }};
}
