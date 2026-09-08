const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
const safeRead = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ARC = ['#FFFFFF', '#CCCCCC', '#999999', '#666666', '#333333', '#000000', '#E53AA3', '#FF7BCC', '#F93C31', '#1E93FF', '#88D8F1', '#FFDC00', '#FF851B', '#921231', '#4FCC30', '#A356D6'];
const CANDY = ['#1E93FF', '#FFDC00', '#4FCC30', '#F93C31', '#A356D6', '#FF851B', '#88D8F1', '#E53AA3', '#2EE6A6'];

// ---- persistent state
let settings = {sound: false, haptic: true, onboarded: false, mode: 'run', ...safeRead('arc-settings', {})};
if (!['run', 'sandbox'].includes(settings.mode)) settings.mode = 'run';
// One benchmark run at a time: per game, the action history and the official summary.
let run = safeRead('arc-run-v2', null);
if (!run) {
  const legacy = safeRead('arc-progress-v1', null);
  run = {startedAt: Date.now(), lastGame: null, games: {}};
  if (legacy) for (const [id, r] of Object.entries(legacy)) if (r?.history?.length) run.games[id] = {history: r.history, summary: r.summary ?? null};
}
let pastRuns = safeRead('arc-runs-v1', []); // archived runs: {score, levels, actions, endedAt}
let sandbox = safeRead('arc-sandbox-v1', {}); // {gameId: {levelIndex: bestActions}}

let games = [], worker, ready = false, bootError = null, requestId = 0, pending = new Map();
let state = null, playing = false, loadingGame = false, sessionId = null, framesToken = 0;
let session = null; // {game, level, sandbox, attempt}
const metrics = {latencies: [], inputCount: 0, errors: [], boot: {}};
window.arcMetrics = metrics;
let audioContext, toastTimer, launchTimer;

function save(key, data) {try {localStorage.setItem(key, JSON.stringify(data));} catch {notice('Storage is full. Keep this tab open to retain your run.');}}
const persistRun = () => save('arc-run-v2', run);
function notice(text) {$('#notice').textContent = text; $('#notice').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#notice').classList.remove('show'), 2600);}
function feedback(win = false) {
  if (settings.haptic) {if (window.AndroidGame) window.AndroidGame.haptic(win); else if (navigator.vibrate) navigator.vibrate(win ? [25, 30, 35] : 8);}
  if (!settings.sound) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.connect(gain); gain.connect(audioContext.destination); osc.type = 'sine';
    osc.frequency.setValueAtTime(win ? 660 : 440, audioContext.currentTime); osc.frequency.exponentialRampToValueAtTime(win ? 990 : 330, audioContext.currentTime + .09);
    gain.gain.setValueAtTime(.045, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .13); osc.start(); osc.stop(audioContext.currentTime + .14);
  } catch {}
}
function updateSettings() {
  save('arc-settings', settings);
  $$('.sound-toggle').forEach(b => {b.innerHTML = icon(settings.sound ? 'sound-on' : 'sound-off'); b.setAttribute('aria-pressed', String(settings.sound)); b.setAttribute('aria-label', `Turn sound ${settings.sound ? 'off' : 'on'}`);});
  $$('.haptic-toggle').forEach(b => {b.classList.toggle('muted-setting', !settings.haptic); b.setAttribute('aria-pressed', String(settings.haptic)); b.setAttribute('aria-label', `Turn vibration ${settings.haptic ? 'off' : 'on'}`);});
}
function confetti(n = 28) {
  if (reduced) return;
  const box = $('#confetti'); box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i'); const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
    p.style.setProperty('--c', CANDY[i % CANDY.length]); p.style.setProperty('--dx', `${Math.cos(a) * d}px`); p.style.setProperty('--dy', `${Math.sin(a) * d - 80}px`); p.style.setProperty('--r', `${(Math.random() - .5) * 720}deg`);
    p.style.animationDelay = `${Math.random() * 120}ms`; box.appendChild(p);
  }
  setTimeout(() => box.innerHTML = '', 1400);
}
function countUp(el, to, decimals = 1, suffix = '') {
  const from = Number(el.dataset.value ?? 0); el.dataset.value = to;
  if (reduced || from === to) {el.textContent = to.toFixed(decimals) + suffix; return;}
  const t0 = performance.now(), dur = 700;
  const tick = t => {const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = (from + (to - from) * e).toFixed(decimals) + suffix; if (k < 1) requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
}

// ---- screens
const screens = ['launch', 'onboarding', 'home', 'game'];
function show(name) {for (const s of screens) $('#' + s).hidden = s !== name; if (name !== 'launch') clearInterval(launchTimer);}

// Launch: a 6×6 puzzle that solves itself while the engine warms up.
function launch() {
  const grid = $('#launch-grid'); grid.innerHTML = Array.from({length: 36}, (_, i) => `<i style="--c:${CANDY[(i * 7) % CANDY.length]};--d:${(i % 6 + Math.floor(i / 6)) * 60 + 200}ms"></i>`).join('');
  const cells = [...grid.children];
  launchTimer = setInterval(() => {if (reduced) return; const c = cells[Math.floor(Math.random() * cells.length)]; c.style.setProperty('--c', CANDY[Math.floor(Math.random() * CANDY.length)]); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');}, 380);
  show('launch');
}
$('#launch-start').onclick = () => {feedback(); if (settings.onboarded) home(); else onboarding(0);};

// Onboarding: what the games are, how to play, how scoring works, and which mode to start in.
const pages = [
  {title: 'Nobody tells you the rules.', text: 'These are the 25 original ARC-AGI-3 games, the puzzles used to test AI. Poke around, notice what changes, and work out each game as you go.', art: () => `<div class="mini-board">${Array.from({length: 64}, (_, i) => `<i style="--c:${[9, 11, 14, 8, 5, 5, 5, 6][(i * 3 + Math.floor(i / 8)) % 8] === 5 ? '#111' : ARC[[9, 11, 14, 8, 5, 5, 5, 6][(i * 3 + Math.floor(i / 8)) % 8]]};--d:${(i % 8 + Math.floor(i / 8)) * 55}ms"></i>`).join('')}</div>`},
  {title: 'Tap, swipe, press.', text: 'Some games move with the d-pad or a swipe. Some react to taps on the board. A few have a special action or undo. Only the controls a game supports are shown, and reset is always there.', art: () => `<div class="art-controls"><div class="finger"><div class="mini-board">${Array.from({length: 64}, (_, i) => `<i style="--c:${i % 9 === 0 ? '#1E93FF' : '#181818'};--d:${i * 8}ms"></i>`).join('')}</div><span class="tip"></span></div><div><div class="dpad"><span class="chip white" data-action="1">${icon('up')}</span><span class="chip white" data-action="2">${icon('down')}</span><span class="chip white" data-action="3">${icon('left')}</span><span class="chip white" data-action="4">${icon('right')}</span></div></div></div>`},
  {title: 'Every action counts.', text: 'Each level was solved by a human first. Match their action count for 100%, beat it for up to 115%. Retrying a level costs one action.', art: () => `<div class="art-score"><div class="bar-row"><span>Human</span><b style="transform-origin:left"></b><small>10</small></div><div class="bar-row you"><span>You</span><b style="width:80%"></b><small>8</small></div><div class="formula">(10 ÷ 8)² = 115%</div></div>`},
  {title: 'Pick your mode.', text: 'You can switch on the home screen any time.', art: () => `<div class="mode-cards"><button class="mode-card run" data-pick="run">${icon('flag')}<span><strong>BENCHMARK</strong><small>One run at a time across all 25 games, graded like the real thing. Continue from the menu, or reset the whole run whenever you want.</small></span></button><button class="mode-card sandbox" data-pick="sandbox">${icon('flask')}<span><strong>SANDBOX</strong><small>Jump into any level of any game and clear it in as few actions as you can. Beat the human count to earn gold.</small></span></button></div>`},
];
let pageIndex = 0;
function onboarding(i) {
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

// ---- scores and progress
const gameOf = id => games.find(g => g.id === id);
const runGame = id => run.games[id];
const gameScore = id => runGame(id)?.summary?.score ?? 0;
const runScore = () => games.reduce((a, g) => a + gameScore(g.id), 0) / Math.max(games.length, 1);
const runLevels = () => games.reduce((a, g) => a + (runGame(g.id)?.summary?.levels_completed ?? 0), 0);
const runActions = () => games.reduce((a, g) => a + (runGame(g.id)?.summary?.actions ?? 0), 0);
const totalLevels = () => games.reduce((a, g) => a + g.levels, 0);
const runStarted = () => Object.values(run.games).some(g => g.history?.length);
const isWon = id => runGame(id)?.summary?.state === 'WIN';
const bestRun = () => pastRuns.reduce((b, r) => r.score > (b?.score ?? -1) ? r : b, null);
const sandboxBest = (id, level) => sandbox[id]?.[level];
const isGold = (id, level) => sandboxBest(id, level) != null && sandboxBest(id, level) <= gameOf(id).baseline[level];
const sandboxCleared = () => games.reduce((a, g) => a + Object.keys(sandbox[g.id] ?? {}).length, 0);
const sandboxGold = () => games.reduce((a, g) => a + g.baseline.filter((_, i) => isGold(g.id, i)).length, 0);

function segments(cls, levels, classOf, extra = '') {return `<span class="segments ${cls}" aria-hidden="true">${Array.from({length: levels}, (_, i) => `<i class="${classOf(i)}"></i>`).join('')}${extra}</span>`;}

function home() {
  closeDialog(); playing = false; framesToken++; pointer = null; show('home');
  $('.mode-switch').dataset.mode = settings.mode; $$('.mode-switch [data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === settings.mode)));
  $('#best-score').innerHTML = `${(bestRun()?.score ?? runScore()).toFixed(1)}<small>%</small>`;
  renderHero(); renderGrid();
}
function renderHero() {
  const hero = $('#hero'), total = totalLevels();
  if (settings.mode === 'run') {
    const best = bestRun(), levels = runLevels(), started = runStarted();
    hero.className = 'hero run';
    hero.innerHTML = `<div class="hero-top"><span class="hero-label">${started ? 'CURRENT RUN' : 'NEW RUN'}</span>${best ? `<span class="hero-best">${icon('trophy')}Best ${best.score.toFixed(1)}%</span>` : ''}</div><div class="hero-score"><b id="run-score">0.0</b><small>%</small></div><div class="hero-bar"><i style="width:${(levels / total * 100).toFixed(1)}%"></i></div><div class="hero-meta"><span>${levels} / ${total} levels</span><span>${games.filter(g => isWon(g.id)).length} / ${games.length} games</span></div><div class="hero-actions"><button id="continue-run" class="chunk mint">${icon('play-icon')}${started ? 'CONTINUE RUN' : 'START RUN'}</button>${started ? `<button id="reset-run" class="chip white" aria-label="Reset run">${icon('reset')}</button>` : ''}</div>`;
    countUp($('#run-score'), runScore());
    $('#continue-run').onclick = () => {feedback(); continueRun();};
    $('#reset-run')?.addEventListener('click', () => {feedback(); confirmResetRun();});
  } else {
    const cleared = sandboxCleared(), gold = sandboxGold();
    hero.className = 'hero sandbox';
    hero.innerHTML = `<div class="hero-top"><span class="hero-label">SANDBOX</span><span class="hero-best">${icon('star')}${gold} gold</span></div><div class="hero-score"><b id="sandbox-count">0</b><small>/ ${total}</small><span class="unit">LEVELS</span></div><div class="hero-bar"><i class="gold" style="width:${(gold / total * 100).toFixed(1)}%"></i><i style="width:${(cleared / total * 100).toFixed(1)}%;background:#ffd23f80"></i></div><div class="hero-meta"><span>${cleared} cleared</span><span>${gold} at or under human</span></div><div class="hero-actions"><button id="next-level" class="chunk yellow">${icon('play-icon')}${cleared ? 'NEXT UNCLEARED' : 'FIRST LEVEL'}</button></div>`;
    countUp($('#sandbox-count'), cleared, 0);
    $('#next-level').onclick = () => {feedback(); const next = firstUncleared(); if (next) playSandbox(next.id, next.level); else notice('Every level is cleared. Chase gold!');};
  }
}
function renderGrid() {
  $('#game-grid').innerHTML = games.map((g, i) => {
    let cls = '', badge = '', segs;
    if (settings.mode === 'run') {
      const r = runGame(g.id), done = r?.summary?.levels_completed ?? 0, won = isWon(g.id), active = Boolean(r?.history?.length) && !won;
      cls = won ? 'done' : active ? 'active' : '';
      badge = won ? `<span class="badge gold">${icon('trophy')}${Math.round(gameScore(g.id))}%</span>` : done ? `<span class="badge">${Math.round(gameScore(g.id))}%</span>` : '';
      segs = segments('', g.levels, k => k < done ? 'done' : k === done && active ? 'current' : '');
    } else {
      const golds = g.baseline.filter((_, k) => isGold(g.id, k)).length, cleared = Object.keys(sandbox[g.id] ?? {}).length;
      cls = golds === g.levels ? 'done' : cleared ? 'active' : '';
      badge = golds === g.levels ? `<span class="badge gold">${icon('star')}</span>` : cleared ? `<span class="badge">${cleared}/${g.levels}</span>` : '';
      segs = segments('', g.levels, k => isGold(g.id, k) ? 'gold' : sandboxBest(g.id, k) != null ? 'done' : '');
    }
    return `<button class="game-card ${cls}" data-game="${g.id}" style="--i:${i}" aria-label="${g.id.toUpperCase()}, ${g.levels} levels">${badge}<img src="./assets/${g.id}.png" alt="" loading="lazy"><strong>${g.id.toUpperCase()}</strong>${segs}</button>`;
  }).join('');
  $$('[data-game]').forEach(b => b.addEventListener('click', () => settings.mode === 'run' ? openRunGame(b.dataset.game) : levelPicker(b.dataset.game)));
}
function setMode(mode) {if (settings.mode === mode) return; settings.mode = mode; updateSettings(); feedback(); home();}
$$('.mode-switch [data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

// ---- benchmark run
function openRunGame(id) {
  if (isWon(id)) {runScorecard(id); return;}
  play({game: id, level: 0, sandbox: false});
}
function continueRun() {
  const order = [run.lastGame, ...games.map(g => g.id)].filter(Boolean);
  const next = order.find(id => !isWon(id));
  if (next) play({game: next, level: 0, sandbox: false}); else runComplete();
}
function runComplete() {
  modal('Run complete!', `<div class="win-art">${icon('trophy')}</div><div class="score-big">${runScore().toFixed(1)}<small>%</small></div><p class="score-label">${games.length} games · ${runLevels()} levels · ${runActions()} actions</p><div class="dialog-stack"><button id="archive-run" class="chunk mint">${icon('reset')}Save & start a new run</button><button id="see-runs" class="chunk lavender">Your scores</button></div>`);
  $('#archive-run').onclick = () => {resetRun(); closeDialog(); home();}; $('#see-runs').onclick = () => scorecard();
}
function confirmResetRun() {
  const score = runScore(), scored = runLevels() > 0;
  modal('Reset your run?', `<div class="dialog-stack"><p class="dialog-note">${scored ? `Your run so far (${score.toFixed(1)}%, ${runLevels()} levels) is saved to your past runs${score > (bestRun()?.score ?? -1) ? ' as your new best' : ''}.` : 'Nothing is scored yet, so there is nothing to save.'} All 25 games start over.</p><button id="do-reset" class="chunk berry">${icon('reset')}Reset run</button><button id="keep-run" class="chunk white">Keep playing</button></div>`);
  $('#do-reset').onclick = () => {feedback(true); const wasBest = score > (bestRun()?.score ?? -1); resetRun(); closeDialog(); home(); if (wasBest && score > 0) {confetti(); notice('New best run saved!');}};
  $('#keep-run').onclick = closeDialog;
}
function resetRun() {
  if (runLevels() > 0) {pastRuns.push({score: runScore(), levels: runLevels(), actions: runActions(), games: games.filter(g => isWon(g.id)).length, endedAt: Date.now()}); save('arc-runs-v1', pastRuns);}
  run = {startedAt: Date.now(), lastGame: null, games: {}}; persistRun();
}

// ---- sandbox
function firstUncleared() {for (const g of games) for (let level = 0; level < g.levels; level++) if (sandboxBest(g.id, level) == null) return {id: g.id, level}; return null;}
function levelPicker(id) {
  const g = gameOf(id), golds = g.baseline.filter((_, k) => isGold(id, k)).length;
  modal(id.toUpperCase(), `<div class="picker-head"><img src="./assets/${id}.png" alt=""><div><span class="stars">${icon('star')}${golds} / ${g.levels} gold</span><p class="dialog-note" style="text-align:left;margin-top:4px">Clear a level in as few actions as you can. Match or beat the human count for gold.</p></div></div><div class="level-list">${g.baseline.map((human, k) => {const best = sandboxBest(id, k); const cls = isGold(id, k) ? 'gold' : best != null ? 'cleared' : ''; return `<button class="level-row ${cls}" data-level="${k}"><span class="num">${k + 1}</span><span class="info"><strong>${best == null ? 'Not cleared yet' : best <= human ? 'Gold' : 'Cleared'}</strong><small>${best == null ? '' : `Your best ${best} · `}Human ${human}</small></span><span class="go">${icon('play-icon')}</span></button>`;}).join('')}</div>`);
  $$('[data-level]').forEach(b => b.onclick = () => {feedback(); closeDialog(); playSandbox(id, Number(b.dataset.level));});
}
function playSandbox(id, level) {play({game: id, level, sandbox: true});}
function levelCleared() {
  const g = gameOf(session.game), human = g.baseline[session.level], used = session.attempt, prev = sandboxBest(session.game, session.level);
  if (prev == null || used < prev) {(sandbox[session.game] ??= {})[session.level] = used; save('arc-sandbox-v1', sandbox);}
  const gold = used <= human, stars = used <= human ? 3 : used <= human * 1.5 ? 2 : 1, last = session.level === g.levels - 1;
  feedback(true); confetti(gold ? 40 : 22);
  modal(gold ? 'Gold!' : 'Level cleared!', `<div class="cleared-stars">${[0, 1, 2].map(i => icon('star', i < stars ? '' : 'off')).join('').replace(/<svg/g, (m, off) => m)}</div><div class="score-big">${used}<small> actions</small></div><p class="score-label">Human ${human}${prev != null && prev < used ? ` · your best ${prev}` : prev != null && used < prev ? ' · new best!' : ''}</p><div class="dialog-stack">${last ? '' : `<button id="next" class="chunk mint">${icon('play-icon')}Next level</button>`}<button id="again" class="chunk ${last ? 'mint' : 'yellow'}">${icon('reset')}Play again</button><button id="levels" class="chunk white">${icon('grid')}All levels</button></div>`, () => {if (!last) playSandbox(session.game, session.level + 1); else home();});
  $$('.cleared-stars .icon').forEach((s, i) => s.style.setProperty('--d', `${150 + i * 160}ms`));
  $('#next')?.addEventListener('click', () => {closeDialog(true); playSandbox(session.game, session.level + 1);});
  $('#again').onclick = () => {closeDialog(true); playSandbox(session.game, session.level);};
  $('#levels').onclick = () => {closeDialog(true); home(); levelPicker(session.game);};
}

// ---- dialogs
let onDialogClose = null;
function closeDialog(silent = false) {if (silent) onDialogClose = null; if ($('#dialog').open) $('#dialog').close();}
function modal(title, content, onClose = null) {
  onDialogClose = onClose;
  $('#dialog-body').innerHTML = `<div class="dialog-top"><h2>${title}</h2><button class="close-button" aria-label="Close">${icon('close')}</button></div>${content}`;
  $('#dialog .close-button').onclick = () => closeDialog();
  if (!$('#dialog').open) $('#dialog').showModal();
}
$('#dialog').addEventListener('close', () => {const cb = onDialogClose; onDialogClose = null; cb?.();});

// ---- engine worker
function startWorker() {
  worker = new Worker('./engine-worker.js'); ready = false; bootError = null; metrics.boot.startedAt = performance.now();
  worker.onmessage = ({data}) => {
    if (data.type === 'loading') {$('#loading-text').textContent = data.text; $('#loading-progress').style.width = `${data.progress}%`; $('#boot-bar').style.width = `${Math.max(8, data.progress)}%`;}
    if (data.type === 'ready') {ready = true; metrics.boot.readyMs = performance.now() - metrics.boot.startedAt; $('#loading-progress').style.width = '100%'; $('#boot-bar').style.width = '100%'; $('.boot').classList.add('done'); if (loadingGame) beginSession();}
    if (data.type === 'warm') metrics.boot.warm = data;
    if (data.type === 'result') {
      const req = pending.get(data.requestId); pending.delete(data.requestId); if (!req) return;
      metrics.latencies.push(performance.now() - req.at); if (metrics.latencies.length > 200) metrics.latencies.shift();
      if (req.session !== sessionId) return;
      const old = state; state = data.result;
      if (req.kind === 'start') {loadingGame = false; $('#loading').hidden = true; playing = true; show('game');}
      if (req.kind === 'action' && state.accepted !== false) {
        metrics.inputCount++;
        if (session.sandbox) session.attempt = req.action.id === 0 ? 0 : session.attempt + 1;
        else {const g = run.games[session.game] ??= {history: [], summary: null}; g.history.push(req.action);}
      }
      persist(); render(old, req.kind === 'start');
    }
    if (data.type === 'error') {
      metrics.errors.push(data.error); pending.delete(data.requestId); if (!data.requestId) bootError = data.error;
      loadingGame = false; $('#loading').hidden = true;
      modal('A little hiccup', `<div class="dialog-stack"><p class="dialog-note">Your saved progress is safe. Reload the arcade and try again.</p><button id="reload" class="chunk mint">Reload arcade</button><details class="about-copy"><summary>Details</summary><p class="error-detail"></p></details></div>`);
      $('#dialog .error-detail').textContent = data.error; $('#reload').onclick = () => location.reload();
    }
  };
  worker.onerror = e => {bootError = e.message; notice('Could not load the arcade. Reload to try again.');};
}
function request(payload, kind, action) {const id = ++requestId; pending.set(id, {at: performance.now(), kind, action, session: sessionId}); worker.postMessage({...payload, requestId: id});}
function play(config) {
  if (loadingGame || !gameOf(config.game)) return;
  feedback(); session = {...config, attempt: 0}; loadingGame = true; closeDialog(true);
  if (bootError) {worker?.terminate(); startWorker();}
  if (ready) beginSession(); else $('#loading').hidden = false;
}
function beginSession() {
  if (!loadingGame) return;
  if (pending.size) {setTimeout(beginSession, 15); return;}
  $('#level-toast').classList.remove('show'); sessionId = session.game + ':' + Date.now(); state = null;
  let history = [];
  if (!session.sandbox) {const g = run.games[session.game]; if (g && !isWon(session.game)) history = g.history; else run.games[session.game] = {history: [], summary: null}; run.lastGame = session.game; persistRun();}
  $('#loading-text').textContent = history.length ? 'Restoring your game…' : 'Opening your game…';
  request({type: 'start', game: session.game, history, level: session.level, sandbox: session.sandbox}, 'start');
}
function persist() {if (!state || session.sandbox) return; run.games[session.game].summary = state.score; persistRun();}

// ---- board
const rgba = ARC.map(c => [...c.slice(1).match(/../g).map(x => parseInt(x, 16)), 255]);
const ctx = $('#board').getContext('2d', {alpha: false}); ctx.imageSmoothingEnabled = false;
function draw(frame) {
  if (!frame) return;
  const image = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) image.data.set(rgba[frame[y][x]], (y * 64 + x) * 4);
  ctx.putImageData(image, 0, 0);
}
function render(old, initial = false) {
  const g = gameOf(session.game);
  $('#playing-name').textContent = session.game.toUpperCase();
  $('#mode-badge').className = `pill mode-badge ${session.sandbox ? 'sandbox' : 'run'}`; $('#mode-badge').innerHTML = icon(session.sandbox ? 'flask' : 'flag'); $('#mode-badge').setAttribute('aria-label', session.sandbox ? 'Sandbox' : 'Benchmark run');
  $('#live-score').hidden = session.sandbox; $('#target').hidden = !session.sandbox;
  if (session.sandbox) {$('#actions').textContent = session.attempt; $('#target-value').textContent = g.baseline[session.level];}
  else {$('#actions').textContent = state.score.actions; $('#rhae').innerHTML = `${state.score.score.toFixed(1)}<small>%</small>`;}
  $('#level-dots').innerHTML = session.sandbox
    ? Array.from({length: state.levels}, (_, i) => `<i class="${isGold(session.game, i) ? 'gold' : sandboxBest(session.game, i) != null ? 'done' : ''}${i === session.level ? ' here' : ''}"></i>`).join('')
    : Array.from({length: state.levels}, (_, i) => `<i class="${i < state.completed ? 'done' : i === state.completed ? 'current' : ''}"></i>`).join('');
  const token = ++framesToken;
  if (state.animation && !initial) {
    const raw = atob(state.animation), total = raw.length / 4096; let frameIndex = 0;
    const paint = () => {
      if (token !== framesToken || !playing) return;
      const im = ctx.createImageData(64, 64);
      for (let i = 0; i < 4096; i++) im.data.set(rgba[raw.charCodeAt(frameIndex * 4096 + i)], i * 4);
      ctx.putImageData(im, 0, 0); frameIndex++;
      if (frameIndex < total) setTimeout(paint, 1000 / Math.max(30, state.fps));
    };
    paint();
  } else draw(state.frames.at(-1));
  if (initial || old?.available.join() !== state.available.join()) renderControls();
  $('#game-over').hidden = state.state !== 'GAME_OVER';
  if (session.sandbox) {if (old && state.completed > old.completed) levelCleared(); return;}
  if (old && state.completed > old.completed) {feedback(true); confetti(18); const t = $('#level-toast'); t.textContent = 'Level cleared!'; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');}
  if (state.state === 'WIN') won();
}
function control(id, name, label, cls) {return `<button class="chip ${cls}" data-action="${id}" aria-label="${label}">${icon(name)}</button>`;}
function renderControls() {
  const a = state.available;
  const dirs = [[1, 'up', 'Move up', 'white'], [2, 'down', 'Move down', 'white'], [3, 'left', 'Move left', 'white'], [4, 'right', 'Move right', 'white']].filter(([id]) => a.includes(id));
  let html = '';
  if (dirs.length) html += `<div class="dpad${a.includes(1) || a.includes(2) ? '' : ' row'}">${dirs.map(v => control(...v)).join('')}</div>`;
  let extra = '';
  if (a.includes(5)) extra += control(5, 'bolt', 'Action', 'yellow');
  if (a.includes(7)) extra += control(7, 'undo', 'Undo', 'grape');
  extra += control(0, 'reset', 'Retry level', 'sky');
  html += `<div class="extras${dirs.length ? '' : ' row'}">${extra}</div>`;
  $('#controls').innerHTML = html;
  $$('#controls [data-action]').forEach(b => {
    b.addEventListener('pointerdown', e => {e.preventDefault(); act({id: Number(b.dataset.action)});});
    b.addEventListener('click', e => {if (e.detail === 0) act({id: Number(b.dataset.action)});}); // keyboard and assistive clicks only
  });
}
function act(action) {
  if (!playing || !state || $('#dialog').open || loadingGame) return;
  if (state.state === 'WIN' || (state.state === 'GAME_OVER' && action.id !== 0)) return;
  if (action.id !== 0 && !state.available.includes(action.id)) return;
  framesToken++; draw(state.frames.at(-1)); feedback(); request({type: 'action', action}, 'action', action);
}
function won() {
  confetti(44);
  modal('Game complete!', `<div class="win-art">${icon('trophy')}</div><div class="score-big">${state.score.score.toFixed(1)}<small>%</small></div><p class="score-label">${state.levels} levels · ${state.score.actions} actions</p><div class="dialog-stack"><button id="see-run" class="chunk lavender">This game’s scorecard</button><button id="go-next" class="chunk mint">${icon('play-icon')}Next game</button><button id="go-home" class="chunk white">${icon('grid')}All games</button></div>`);
  $('#see-run').onclick = () => runScorecard(session.game); $('#go-next').onclick = () => {home(); continueRun();}; $('#go-home').onclick = home;
}
function downloadScore() {
  const data = {app: 'ARC Quest', mode: 'local practice — not an official leaderboard submission', engine: 'arcengine 0.9.3', scoring: 'arc-agi 0.9.9', currentRun: {score: runScore(), levels: runLevels(), startedAt: run.startedAt, games: games.map(g => ({game_id: g.version, source_sha256: g.sha256, current: runGame(g.id)?.summary ?? null, actions: runGame(g.id)?.history ?? []}))}, pastRuns, sandbox};
  if (window.AndroidGame) {window.AndroidGame.exportScore(JSON.stringify(data, null, 2)); return;}
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'arc-quest-scorecard.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function runScorecard(id) {
  const s = runGame(id)?.summary, g = gameOf(id); if (!s) return;
  modal(id.toUpperCase() + ' scorecard', `<div class="score-big">${s.score.toFixed(1)}<small>%</small></div><p class="score-label">${s.levels_completed} / ${g.levels} levels · ${s.actions} actions</p><table class="score-table"><thead><tr><th>Level</th><th>Actions</th><th>Human</th><th>Score</th></tr></thead><tbody>${s.level_baseline_actions.map((b, i) => `<tr><td>${i + 1}${i < s.levels_completed ? ' ✓' : ''}</td><td>${s.level_actions[i] || '—'}</td><td>${b}</td><td>${s.level_scores[i].toFixed(1)}%</td></tr>`).join('')}</tbody></table><p class="dialog-note">Unfinished levels score zero. Later levels carry more weight.</p><button id="export" class="text-button">Export scorecard</button>`);
  $('#export').onclick = downloadScore;
}
function scorecard() {
  const best = bestRun(), attempted = games.filter(g => runGame(g.id)?.summary);
  modal('Your scores', `<div class="score-big">${runScore().toFixed(1)}<small>%</small></div><p class="score-label">Current run · ${runLevels()} / ${totalLevels()} levels${best ? ` · best run ${best.score.toFixed(1)}%` : ''}</p>${attempted.length ? `<div class="score-list">${attempted.map(g => `<div class="score-row"><strong>${g.id.toUpperCase()}</strong><small>${runGame(g.id).summary.levels_completed} / ${g.levels} levels</small><b>${gameScore(g.id).toFixed(1)}%</b></div>`).join('')}</div>` : '<p class="dialog-note">Start a run to fill this in.</p>'}${pastRuns.length ? `<p class="score-label" style="margin-top:14px">Past runs</p><div class="score-list">${[...pastRuns].reverse().slice(0, 8).map(r => `<div class="score-row"><strong>${new Date(r.endedAt).toLocaleDateString()}</strong><small>${r.levels} levels · ${r.actions} actions</small><b>${r.score.toFixed(1)}%</b></div>`).join('')}</div>` : ''}<p class="dialog-note">Sandbox: ${sandboxCleared()} / ${totalLevels()} levels cleared, ${sandboxGold()} gold.</p><p class="dialog-note">Local practice scores, averaged across all 25 games. Unplayed games count as zero.</p><button id="export" class="text-button">Export scorecard</button>`);
  $('#export').onclick = downloadScore;
}
function about() {
  modal('How it works', `<div class="about-copy"><p>Play the <strong>25 original public ARC-AGI-3 games</strong> from ARC Prize. Discover each game’s rules as you go.</p><p><strong>Every action counts.</strong> Your score compares the actions you take with the recorded human baseline.</p><div class="formula">(human actions ÷ your actions)²</div><p>A level can earn up to 115%. Levels are weighted by their number; unfinished levels earn zero. Retrying a level costs one action.</p><p><strong>Benchmark</strong> is one graded run across all games; reset it any time from the home screen. <strong>Sandbox</strong> lets you replay any level and chase gold by matching the human count.</p><p><a href="https://docs.arcprize.org/methodology" target="_blank" rel="noopener">Official scoring methodology ↗</a></p><p>Games & engine © ARC Prize Foundation, MIT. Fredoka by Milena Brandão, OFL. Interface inspired by Cube Run.</p><p><a href="./credits.html" target="_blank">Credits & licenses ↗</a></p><p>All game actions run on your device.</p><button id="replay-intro" class="text-button">Show the intro again</button></div>`);
  $('#replay-intro').onclick = () => {closeDialog(true); onboarding(0);};
}

// ---- wiring
$('#record').onclick = () => {feedback(); scorecard();};
$('#live-score').onclick = () => {feedback(); runScorecard(session.game);};
$('#about').onclick = () => {feedback(); about();};
$('#back').onclick = () => {feedback(); home();};
$('#game-over').addEventListener('click', () => act({id: 0}));
$$('.sound-toggle').forEach(b => b.onclick = () => {settings.sound = !settings.sound; updateSettings(); feedback();});
$$('.haptic-toggle').forEach(b => b.onclick = () => {settings.haptic = !settings.haptic; updateSettings(); feedback(); if (settings.haptic && !navigator.vibrate && !window.AndroidGame) notice('Vibration isn’t supported by this browser.');});
$('#cancel-loading').onclick = () => {loadingGame = false; $('#loading').hidden = true; sessionId = null;};
$('#dialog').addEventListener('click', e => {if (e.target === $('#dialog')) {const r = $('#dialog').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog();}});

// Board gestures. A short press is a click (action 6) at the pressed cell; a longer drag is a swipe
// in the games that move. Both are decided on release, so a swipe never fires a click first.
const SWIPE = 18;
let pointer = null;
const board = $('#board');
board.addEventListener('pointerdown', e => {
  if (!playing || $('#dialog').open || !e.isPrimary) return;
  e.preventDefault(); board.setPointerCapture(e.pointerId);
  pointer = {x: e.clientX, y: e.clientY, id: e.pointerId};
});
board.addEventListener('pointerup', e => {
  if (!pointer || pointer.id !== e.pointerId) return;
  const start = pointer; pointer = null;
  if (!state) return;
  const dx = e.clientX - start.x, dy = e.clientY - start.y, a = state.available;
  if (Math.hypot(dx, dy) >= SWIPE) {
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 4 : 3) : (dy > 0 ? 2 : 1);
    if (a.includes(dir)) act({id: dir});
    return;
  }
  if (!a.includes(6)) return;
  const r = board.getBoundingClientRect();
  act({id: 6, x: Math.max(0, Math.min(63, Math.floor((start.x - r.left) / r.width * 64))), y: Math.max(0, Math.min(63, Math.floor((start.y - r.top) / r.height * 64)))});
});
board.addEventListener('pointercancel', () => pointer = null);
board.addEventListener('contextmenu', e => e.preventDefault());

window.arcBack = () => {
  if ($('#dialog').open) {closeDialog(); return true;}
  if (!$('#loading').hidden) {$('#cancel-loading').click(); return true;}
  if (!$('#game').hidden) {home(); return true;}
  if (!$('#onboarding').hidden) {if (pageIndex > 0) onboarding(pageIndex - 1); else if (settings.onboarded) home(); else return false; return true;}
  return false;
};
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (!$('#launch').hidden && (e.key === 'Enter' || e.key === ' ')) {e.preventDefault(); $('#launch-start').click(); return;}
  if (!playing) return;
  if (e.key === 'Escape') {if ($('#dialog').open) closeDialog(); else home(); return;}
  if ($('#dialog').open) return;
  const map = {ArrowUp: 1, w: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3, ArrowRight: 4, d: 4, ' ': 5, z: 7, r: 0};
  if (e.key in map) {e.preventDefault(); act({id: map[e.key]});}
});

updateSettings();
try {
  games = await (await fetch('./games.json')).json();
  games.sort((a, b) => {const first = ['ls20', 'ft09', 'vc33']; const ai = first.indexOf(a.id), bi = first.indexOf(b.id); return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.id.localeCompare(b.id);});
  startWorker(); launch();
} catch (e) {notice('Could not load games. Please reload.'); metrics.errors.push(String(e));}
if ('serviceWorker' in navigator && !navigator.userAgent.includes('ArcQuestAndroid')) navigator.serviceWorker.register('./sw.js').catch(() => {});
