import {$, $$, icon, reduced, ARC, CANDY} from './common.js';
import {show} from './navigation.js';
import {feedback, confetti} from './feedback.js';
let settings, home, updateSettings, launchTimer;
export function bindIntro(deps) {({settings, home, updateSettings} = deps);}

// Launch: a 6×6 puzzle that solves itself while the engine warms up.
export function launch() {
  const grid = $('#launch-grid'); grid.innerHTML = Array.from({length: 36}, (_, i) => `<i style="--c:${CANDY[(i * 7) % CANDY.length]};--d:${(i % 6 + Math.floor(i / 6)) * 60 + 200}ms"></i>`).join('');
  const cells = [...grid.children];
  launchTimer = setInterval(() => {if ($('#launch').hidden) {clearInterval(launchTimer); return;} if (reduced) return; const c = cells[Math.floor(Math.random() * cells.length)]; c.style.setProperty('--c', CANDY[Math.floor(Math.random() * CANDY.length)]); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');}, 380);
  show('launch');
  document.fonts.ready.then(() => requestAnimationFrame(() => window.AndroidGame?.launchReady?.()));
}
$('#launch-start').onclick = () => {feedback(); if (settings.onboarded) home(); else onboarding(0);};

// Onboarding: what the games are, how to play, how scoring works, and which mode to start in.
const pages = [
  {title: 'Nobody tells you the rules.', text: 'These are the 25 original ARC-AGI-3 games, the puzzles used to test AI. Poke around, notice what changes, and work out each game as you go.', art: () => `<div class="mini-board">${Array.from({length: 64}, (_, i) => `<i style="--c:${[9, 11, 14, 8, 5, 5, 5, 6][(i * 3 + Math.floor(i / 8)) % 8] === 5 ? '#111' : ARC[[9, 11, 14, 8, 5, 5, 5, 6][(i * 3 + Math.floor(i / 8)) % 8]]};--d:${(i % 8 + Math.floor(i / 8)) * 55}ms"></i>`).join('')}</div>`},
  {title: 'Tap, swipe, press.', text: 'Some games move with the d-pad or a swipe. Some react to taps on the board. A few have a special action or undo. Only the controls a game supports are shown, and reset is always there.', art: () => `<div class="art-controls"><div class="finger"><div class="mini-board">${Array.from({length: 64}, (_, i) => `<i style="--c:${i % 9 === 0 ? '#1E93FF' : '#181818'};--d:${i * 8}ms"></i>`).join('')}</div><span class="tip"></span></div><div><div class="dpad"><span class="chip white" data-action="1">${icon('up')}</span><span class="chip white" data-action="2">${icon('down')}</span><span class="chip white" data-action="3">${icon('left')}</span><span class="chip white" data-action="4">${icon('right')}</span></div></div></div>`},
  {title: 'Every action counts.', text: 'Each level was solved by a human first. Match their action count for 100%, beat it for up to 115%. Retrying a level costs one action.', art: () => `<div class="art-score"><div class="bar-row"><span>Human</span><b style="transform-origin:left"></b><small>10</small></div><div class="bar-row you"><span>You</span><b style="width:80%"></b><small>8</small></div><div class="formula">(10 ÷ 8)² = 115%</div></div>`},
  {title: 'Pick your mode.', text: 'You can switch on the home screen any time.', art: () => `<div class="mode-cards"><button class="mode-card run" data-pick="run">${icon('flag')}<span><strong>BENCHMARK</strong><small>One run at a time across all 25 games, graded like the real thing. Continue from the menu, or reset the whole run whenever you want.</small></span></button><button class="mode-card sandbox" data-pick="sandbox">${icon('flask')}<span><strong>SANDBOX</strong><small>Jump into any level of any game and clear it in as few actions as you can. Beat the human count to earn gold.</small></span></button></div>`},
];
export let pageIndex = 0;
export function onboarding(i) {
  pageIndex = i; show('onboarding');
  const last = i === pages.length - 1, p = pages[i];
  $('#onboard-pages').innerHTML = last
    ? `<div class="page modes"><div><h2>${p.title}</h2><p style="margin-top:8px">${p.text}</p></div><div class="art">${p.art()}</div></div>`
    : `<div class="page"><div class="art">${p.art()}</div><div><h2>${p.title}</h2><p style="margin-top:10px">${p.text}</p></div></div>`;
  $('#onboard-dots').innerHTML = pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  $('#onboard-next').hidden = last; $('#onboard-skip').hidden = last;
  $$('[data-pick]').forEach(b => b.onclick = () => {feedback(true); settings.mode = b.dataset.pick; settings.onboarded = true; updateSettings(); confetti(20); home();});
}
$('#onboard-next').onclick = () => {feedback(); const page = $('#onboard-pages .page'); if (!page || reduced) return onboarding(pageIndex + 1); page.classList.add('out'); setTimeout(() => onboarding(pageIndex + 1), 180);};
$('#onboard-skip').onclick = () => {feedback(); onboarding(pages.length - 1);};
