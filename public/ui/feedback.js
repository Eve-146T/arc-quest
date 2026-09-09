import {$, $$, icon, reduced, CANDY} from './common.js';
let settings;
export function bindSettings(value) {settings = value;}
let audioContext, toastTimer;

export function save(key, data) {try {localStorage.setItem(key, JSON.stringify(data));} catch {notice('Storage is full. Keep the app open to retain your run.');}}
export function notice(text) {$('#notice').textContent = text; $('#notice').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#notice').classList.remove('show'), 2600);}
export function feedback(win = false) {
  if (settings.haptic) window.AndroidGame?.haptic(win);
  if (!settings.sound) return;
  try {
    audioContext ??= new AudioContext(); audioContext.resume();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.connect(gain); gain.connect(audioContext.destination); osc.type = 'sine';
    osc.frequency.setValueAtTime(win ? 660 : 440, audioContext.currentTime); osc.frequency.exponentialRampToValueAtTime(win ? 990 : 330, audioContext.currentTime + .09);
    gain.gain.setValueAtTime(.045, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .13); osc.start(); osc.stop(audioContext.currentTime + .14);
  } catch {}
}
export function updateSettings(settings) {
  save('arc-settings', settings);
  $$('.sound-toggle').forEach(b => {b.innerHTML = icon(settings.sound ? 'sound-on' : 'sound-off'); b.setAttribute('aria-pressed', String(settings.sound)); b.setAttribute('aria-label', `Turn sound ${settings.sound ? 'off' : 'on'}`);});
  $$('.haptic-toggle').forEach(b => {b.innerHTML = icon(settings.haptic ? 'vibrate' : 'vibrate-off'); b.setAttribute('aria-pressed', String(settings.haptic)); b.setAttribute('aria-label', `Turn vibration ${settings.haptic ? 'off' : 'on'}`);});
}
export function confetti(n = 28) {
  if (reduced) return;
  const box = $('#confetti'); box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i'); const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
    p.style.setProperty('--c', CANDY[i % CANDY.length]); p.style.setProperty('--dx', `${Math.cos(a) * d}px`); p.style.setProperty('--dy', `${Math.sin(a) * d - 80}px`); p.style.setProperty('--r', `${(Math.random() - .5) * 720}deg`);
    p.style.animationDelay = `${Math.random() * 120}ms`; box.appendChild(p);
  }
  setTimeout(() => box.innerHTML = '', 1400);
}
export function countUp(el, to, decimals = 1, suffix = '') {
  const from = Number(el.dataset.value ?? 0); el.dataset.value = to;
  if (reduced || from === to) {el.textContent = to.toFixed(decimals) + suffix; return;}
  const t0 = performance.now(), dur = 700;
  const tick = t => {const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = (from + (to - from) * e).toFixed(decimals) + suffix; if (k < 1) requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
}

export function suspendSound() {audioContext?.suspend();}
