import {$, $$, icon, reduced, ARC} from './common.js';
import {show, screenName} from './navigation.js';
import {feedback, confetti} from './feedback.js';
let settings, home, updateSettings;
export function bindIntro(deps) {({settings, home, updateSettings} = deps);}

// The optional intro explains the two modes with short, looping illustrations.
const pages = [
  {title: 'ARC-AGI-3, in your hands.', text: 'Play the 25 puzzle games that GPT6-Astra scored so well on, in a friendly Android app made with its help. Discover each game’s rules as you play.', art: () => `<div class="mini-board">${Array.from({length: 64}, (_, i) => `<i style="--c:${[9, 11, 14, 8, 5, 5, 5, 6][(i * 3 + Math.floor(i / 8)) % 8] === 5 ? '#111' : ARC[[9, 11, 14, 8, 5, 5, 5, 6][(i * 3 + Math.floor(i / 8)) % 8]]};--d:${(i % 8 + Math.floor(i / 8)) * 55}ms"></i>`).join('')}</div>`},
  {title: 'Sandbox: try freely.', text: 'Play levels in any order and aim for fewer actions. Only your best clear counts. The human baseline includes retries; your earlier attempts don’t, so maximum scores are easier to reach.', art: () => `<div class="art-controls"><div class="finger"><div class="mini-board">${Array.from({length: 64}, (_, i) => `<i style="--c:${i % 9 === 0 ? '#1E93FF' : '#181818'};--d:${i * 8}ms"></i>`).join('')}</div><span class="tip"></span></div><div><div class="dpad"><span class="chip white" data-action="1">${icon('up')}</span><span class="chip white" data-action="2">${icon('down')}</span><span class="chip white" data-action="3">${icon('left')}</span><span class="chip white" data-action="4">${icon('right')}</span></div></div></div>`},
  {title: 'Benchmark: think first.', text: 'All 25 games, in order. Pause and resume any time. Every action from earlier attempts stays in your score, and restarting adds one action. Think before you tap.', art: () => `<div class="art-score"><div class="bar-row"><span>Human<small>10 actions</small></span><div class="score-track"><b style="--fill:86.9565%"></b></div><strong>100%</strong></div><div class="bar-row you"><span>You<small>8 actions</small></span><div class="score-track"><b style="--fill:100%"></b></div><strong>115%</strong></div><div class="formula">Fewer actions, higher score.<small>Up to 115% per level</small></div></div>`},
  {title: 'Pick your mode.', text: 'Switch modes on the home screen any time.', art: () => `<div class="mode-cards"><button class="mode-card sandbox" data-pick="sandbox">${icon('flask')}<span><strong>SANDBOX</strong><small>Any level, any order. Improve your best clear without carrying over earlier attempts.</small></span></button><button class="mode-card run" data-pick="run">${icon('flag')}<span><strong>BENCHMARK</strong><small>The full run, with every attempt counted. Pause now, pick up where you left off.</small></span></button></div>`},
];
export let pageIndex = 0;
let pageTimer;
export function onboarding(i) {
  clearTimeout(pageTimer); $('#onboard-next').disabled = false;
  pageIndex = i; show('onboarding');
  const last = i === pages.length - 1, p = pages[i];
  $('#onboard-pages').innerHTML = last
    ? `<div class="page modes"><div><h2>${p.title}</h2><p style="margin-top:8px">${p.text}</p></div><div class="art">${p.art()}</div></div>`
    : `<div class="page"><div class="art">${p.art()}</div><div><h2>${p.title}</h2><p style="margin-top:10px">${p.text}</p></div></div>`;
  $('#onboard-dots').innerHTML = pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  $('#onboard-next').hidden = last; $('#onboard-skip').hidden = last;
  $$('[data-pick]').forEach(b => b.onclick = () => {feedback(true); settings.mode = b.dataset.pick; settings.onboarded = true; updateSettings(); confetti(20); home();});
}
$('#onboard-next').onclick = () => {feedback(); const page = $('#onboard-pages .page'); if (!page || reduced) return onboarding(pageIndex + 1); $('#onboard-next').disabled = true; page.classList.add('out'); pageTimer = setTimeout(() => {if (screenName === 'onboarding') onboarding(pageIndex + 1);}, 140);};
$('#onboard-skip').onclick = () => {feedback(); onboarding(pages.length - 1);};
