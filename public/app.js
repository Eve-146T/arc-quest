import {sandboxRating, allGold, nextRunGame, completedRecord} from './progress.js';
import {$, $$, icon, safeRead, reduced} from './ui/common.js';
import {save, notice, feedback, bindSettings, updateSettings as renderSettings, confetti, countUp, suspendSound} from './ui/feedback.js';
import {show, screenName, detailPage, closeDetails, goDetailBack, gameOverlay, closeGameOverlay, dismissGameOverlay} from './ui/navigation.js';
import {onboarding, pageIndex, bindIntro} from './ui/intro.js';
import {draw, drawAnimationFrame, bindBoard, cancelGesture} from './ui/board.js';
import {benchmarkHero, sandboxHero, gameCard} from './ui/home.js';
import {levelGrid} from './ui/levels.js';
import {gameScorecard, scoreOverview} from './ui/scorecards.js';
import {showInfo} from './ui/info.js';
// ---- persistent state
let settings = {sound: false, haptic: true, onboarded: false, mode: 'sandbox', ...safeRead('arc-settings', {})};
delete settings.dark; // Remove the retired preference without touching saved progress.
if (!['run', 'sandbox'].includes(settings.mode)) settings.mode = 'sandbox';
// One benchmark run at a time: per game, the action history and the official summary.
let run = safeRead('arc-run-v2', null);
if (!run) {
  const legacy = safeRead('arc-progress-v1', null);
  run = {startedAt: Date.now(), lastGame: null, games: {}};
  if (legacy) for (const [id, r] of Object.entries(legacy)) if (r?.history?.length) run.games[id] = {history: r.history, summary: r.summary ?? null};
}
let pastRuns = safeRead('arc-runs-v1', []); // archived runs: {score, levels, actions, endedAt}
let sandbox = safeRead('arc-sandbox-v1', {}); // {gameId: {levelIndex: bestActions}}

let diamonds = {}, games = [], worker, ready = false, bootError = null, requestId = 0, pending = new Map();
let state = null, playing = false, loadingGame = false, sessionId = null, framesToken = 0;
let session = null; // {game, level, sandbox, attempt}
const metrics = {latencies: [], inputCount: 0, errors: [], boot: {}};
window.arcMetrics = metrics;
const persistRun = () => save('arc-run-v2', run);
const updateSettings = () => renderSettings(settings);
bindSettings(settings);

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
const bestRun = () => completedRecord(games, run, pastRuns, runScore());
const sandboxBest = (id, level) => sandbox[id]?.[level];
const isGold = (id, level) => sandboxBest(id, level) != null && sandboxBest(id, level) <= gameOf(id).baseline[level];
const sandboxCleared = () => games.reduce((a, g) => a + Object.keys(sandbox[g.id] ?? {}).length, 0);
const sandboxGold = () => games.reduce((a, g) => a + g.baseline.filter((_, i) => isGold(g.id, i)).length, 0);

function segments(cls, levels, classOf, extra = '') {return `<span class="segments ${cls}" aria-hidden="true">${Array.from({length: levels}, (_, i) => `<i class="${classOf(i)}"></i>`).join('')}${extra}</span>`;}

function home() {
  closeGameOverlay(); closeDetails(); playing = false; framesToken++; cancelGesture(); show('home', true);
  $('.mode-switch').dataset.mode = settings.mode; $$('.mode-switch [data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === settings.mode)));
  const best = bestRun(); $('#record').hidden = !best;
  $('#best-score').innerHTML = best ? `${best.score.toFixed(1)}<small>%</small>` : '';
  renderHero(); renderGrid();
}
function renderHero() {
  const hero = $('#hero'), total = totalLevels();
  if (settings.mode === 'run') {
    const best = bestRun(), levels = runLevels(), started = runStarted();
    hero.className = 'hero run';
    hero.innerHTML = benchmarkHero({started, best, levels, total, won: games.filter(g => isWon(g.id)).length, count: games.length});
    countUp($('#run-score'), levels / total * 100);
    $('#continue-run').onclick = () => {feedback(); continueRun();};
    $('#reset-run')?.addEventListener('click', () => {feedback(); confirmResetRun();});
  } else {
    const cleared = sandboxCleared(), gold = sandboxGold();
    hero.className = 'hero sandbox';
    hero.innerHTML = sandboxHero({gold, total, cleared});
    countUp($('#sandbox-count'), cleared, 0);
    $('#sandbox-help').onclick = sandboxInfo;
    $('#next-level').onclick = () => {feedback(); const next = firstUncleared(); if (next) playSandbox(next.id, next.level); else notice('Every level is cleared. Chase gold!');};
  }
}
function renderGrid() {
  $('#game-grid').innerHTML = games.map((g, i) => {
    let cls = '', segs;
    if (settings.mode === 'run') {
      const r = runGame(g.id), done = r?.summary?.levels_completed ?? 0, won = isWon(g.id), active = Boolean(r?.history?.length) && !won;
      cls = won ? 'done' : active ? 'active' : '';
      segs = segments('', g.levels, k => k < done ? 'done' : k === done && active ? 'current' : '');
    } else {
      const golds = g.baseline.filter((_, k) => isGold(g.id, k)).length, cleared = Object.keys(sandbox[g.id] ?? {}).length;
      cls = golds === g.levels ? 'done' : cleared ? 'active' : '';
      segs = segments('', g.levels, k => rating(g.id, k) === 'diamond' ? 'diamond' : isGold(g.id, k) ? 'gold' : sandboxBest(g.id, k) != null ? 'done' : '');
    }
    const locked = settings.mode === 'run' && !isWon(g.id) && g.id !== nextRunGame(games, run);
    return gameCard(g, {locked, cls, segs, i});
  }).join('');
  $$('[data-game]').forEach(b => b.addEventListener('click', () => settings.mode === 'run' ? openRunGame(b.dataset.game) : levelPicker(b.dataset.game)));
}
function setMode(mode) {
  if (settings.mode === mode) return;
  const direction = mode === 'run' ? 1 : -1;
  settings.mode = mode; updateSettings(); feedback(); home();
  const content = $('#home-scroll'); content.scrollTop = 0;
  content.getAnimations().forEach(a => a.cancel());
  if (!reduced) content.animate([{opacity: .45, transform: `translateX(${direction * 12}px)`}, {opacity: 1, transform: 'none'}], {duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)'});
}
$$('.mode-switch [data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

// ---- benchmark run
function openRunGame(id) {
  if (isWon(id)) {runScorecard(id); return;}
  if (id === nextRunGame(games, run)) play({game: id, level: 0, sandbox: false});
}
function continueRun() {
  const next = nextRunGame(games, run);
  if (next) play({game: next, level: 0, sandbox: false}); else runComplete();
}
function runComplete() {
  detailPage('Run complete!', `<div class="win-art">${icon('trophy')}</div><div class="score-big">${runScore().toFixed(1)}<small>%</small></div><p class="score-label">${games.length} games · ${runLevels()} levels · ${runActions()} actions</p><div class="dialog-stack"><button id="archive-run" class="chunk mint">${icon('reset')}Save & start a new run</button><button id="see-runs" class="chunk lavender">Your scores</button></div>`);
  $('#archive-run').onclick = () => {resetRun(); closeDetails(); home();}; $('#see-runs').onclick = () => scorecard();
}
function confirmResetRun() {
  detailPage('Delete this run?', `<div class="dialog-stack"><p class="dialog-note">All 25 games start over. Your sandbox progress and completed records are kept.</p><button id="do-reset" class="chunk berry">${icon('trash')}Delete run</button><button id="keep-run" class="chunk lavender">Keep playing</button></div>`);
  $('#do-reset').onclick = () => {feedback(); resetRun(); home();};
  $('#keep-run').onclick = goDetailBack;
}
function resetRun() {
  if (games.every(g => isWon(g.id))) {pastRuns.push({score: runScore(), levels: runLevels(), actions: runActions(), games: games.length, complete: true, endedAt: Date.now()}); save('arc-runs-v1', pastRuns);}
  run = {startedAt: Date.now(), lastGame: null, games: {}}; persistRun();
}
function confirmRetry() {
  if (!playing || screenName !== 'game' || loadingGame || pending.size || $('#game-dialog').open) return;
  gameOverlay('Restart level?', `<p class="overlay-note">${session.sandbox ? 'Your best is kept. This attempt starts over.' : 'One retry action is added to your score.'}</p><div class="overlay-actions"><button id="do-retry" class="chunk berry">${icon('trash')}Restart</button><button id="keep-playing" class="chunk white">Keep playing</button></div>`, 'retry-overlay');
  $('#keep-playing').onclick = () => closeGameOverlay();
  $('#do-retry').onclick = () => {closeGameOverlay(); act({id: 0}, true);};
  $('#keep-playing').focus({preventScroll: true});
}

// ---- sandbox
function firstUncleared() {for (const g of games) for (let level = 0; level < g.levels; level++) if (sandboxBest(g.id, level) == null) return {id: g.id, level}; return null;}
const rating = (id, level, attempt) => sandboxRating(games, sandbox, diamonds, id, level, attempt);
function levelPicker(id) {
  const g = gameOf(id);
  detailPage(id.toUpperCase(), levelGrid(g, sandbox[id] ?? {}, level => rating(id, level)), home, 'picker-screen');
  $$('[data-level]').forEach(b => b.onclick = () => {feedback(); playSandbox(id, Number(b.dataset.level));});
}
function sandboxInfo() {
  feedback();
  detailPage('Sandbox', `<div class="about-copy"><p>Play any level. Your fewest actions are saved.</p><div class="info-row">${icon('check')}<span>Mint means cleared.</span></div><div class="info-row">${icon('star')}<span>Gold means you matched or beat the human count.</span></div>${allGold(games, sandbox) ? `<div class="info-row">${icon('diamond')}<span>Diamond means you matched or beat the public level record. Earlier bests count too.</span></div>` : ''}<p>Finish a level to see your score. 100% matches the human action count; fewer actions can earn up to 115%. If you miss gold, your next attempt shows the action target.</p>${allGold(games, sandbox) ? `<p class="local-note">Records from <a href="https://arc3.games/" target="_blank" rel="noopener">ARC3.Games ↗</a> · ${diamonds.fetchedAt?.slice(0, 10) ?? ""}</p>` : ""}</div>`);
}
function playSandbox(id, level) {play({game: id, level, sandbox: true});}
function levelCleared() {
  const g = gameOf(session.game), human = g.baseline[session.level], used = session.attempt, prev = sandboxBest(session.game, session.level);
  if (prev == null || used < prev) {(sandbox[session.game] ??= {})[session.level] = used; save('arc-sandbox-v1', sandbox);}
  const award = rating(session.game, session.level, used), last = session.level === g.levels - 1;
  feedback(true);
  framesToken++; draw(oldLevelFrame ?? state.frames.at(-1));
  gameOverlay('Level complete', `<p class="result-level">${session.game.toUpperCase()} · Level ${session.level + 1}</p><div class="result-count"><b>${used}</b><span>actions</span></div><p class="overlay-note">${prev == null || used <= prev ? 'Personal best' : `Best: ${prev} actions`}${used > human ? ` · ${human} for gold` : ''}</p><div class="overlay-actions"><button id="${last ? 'levels' : 'next'}" class="chunk mint">${icon(last ? 'grid' : 'play-icon')}${last ? 'All levels' : 'Next level'}</button><button id="again" class="chunk white">${icon('reset')}Play again</button>${last ? '' : '<button id="levels" class="text-button">All levels</button>'}</div>`, `result-overlay ${award}`, () => {home(); levelPicker(session.game);});
  $('#next')?.addEventListener('click', () => playSandbox(session.game, session.level + 1));
  $('#again').onclick = () => playSandbox(session.game, session.level);
  $('#levels').onclick = () => {home(); levelPicker(session.game);};
}

let oldLevelFrame = null;
$('#detail-back').onclick = () => {feedback(); goDetailBack();};

// Show the usable menu while the independent game worker initializes in the background.
function revealApp() {document.fonts.ready.then(() => requestAnimationFrame(() => {metrics.boot.menuReadyMs = performance.now(); window.AndroidGame?.launchReady?.();}));}
function enterApp() {settings.onboarded = true; updateSettings(); home(); revealApp();}
function showLoadError(error) {
  loadingGame = false; $('#loading').hidden = true; $('#app').inert = false;
  detailPage('A little hiccup', `<div class="dialog-stack"><p class="dialog-note">Your saved progress is safe. Reload the arcade and try again.</p><button id="reload" class="chunk mint">Reload arcade</button><details class="about-copy"><summary>Details</summary><p class="error-detail"></p></details></div>`);
  $('#detail .error-detail').textContent = error; $('#reload').onclick = () => location.reload();
  revealApp();
}

// ---- engine worker
function startWorker() {
  worker = new Worker('./engine-worker.js'); ready = false; bootError = null; metrics.boot.startedAt = performance.now();
  worker.onmessage = ({data}) => {
    if (data.type === 'loading') {$('#loading-text').textContent = data.text; $('#loading-progress').style.width = `${data.progress}%`;}
    if (data.type === 'ready') {ready = true; metrics.boot.readyMs = performance.now() - metrics.boot.startedAt; $('#loading-progress').style.width = '100%'; if (loadingGame) beginSession();}
    if (data.type === 'warm') metrics.boot.warm = data;
    if (data.type === 'result') {
      const req = pending.get(data.requestId); pending.delete(data.requestId); if (!req) return;
      metrics.latencies.push(performance.now() - req.at); if (metrics.latencies.length > 200) metrics.latencies.shift();
      if (req.session !== sessionId) return;
      const old = state; state = data.result;
      if (req.kind === 'start') {loadingGame = false; $('#loading').hidden = true; $('#app').inert = false; closeDetails(false); playing = true; show('game');}
      if (req.kind === 'action' && state.accepted !== false) {
        metrics.inputCount++;
        if (session.sandbox) session.attempt = req.action.id === 0 ? 0 : session.attempt + 1;
        else {const g = run.games[session.game] ??= {history: [], summary: null}; g.history.push(req.action);}
      }
      persist(); render(old, req.kind === 'start');
    }
    if (data.type === 'error') {
      metrics.errors.push(data.error); pending.delete(data.requestId); if (!data.requestId) bootError = data.error;
      showLoadError(data.error);
    }
  };
  worker.onerror = e => {bootError = e.message; metrics.errors.push(e.message); showLoadError(e.message);};
}
function request(payload, kind, action) {const id = ++requestId; pending.set(id, {at: performance.now(), kind, action, session: sessionId}); worker.postMessage({...payload, requestId: id});}
function play(config) {
  if (loadingGame || !gameOf(config.game) || (!config.sandbox && config.game !== nextRunGame(games, run))) return;
  closeGameOverlay(); cancelGesture(); feedback(); session = {...config, attempt: 0}; loadingGame = true;
  $('#loading-title').textContent = `Opening ${config.game.toUpperCase()}…`;
  const level = config.sandbox ? config.level : runGame(config.game)?.summary?.levels_completed ?? 0;
  const preview = new URL(`./assets/levels/${config.game}/${level + 1}.png`, document.baseURI);
  $('#loading-preview').style.setProperty('--preview', `url("${preview.href}")`);
  $('#loading').hidden = false; $('#app').inert = true;
  $('#cancel-loading').focus({preventScroll: true});
  if (bootError) {worker?.terminate(); startWorker();}
  if (ready) beginSession();
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
function render(old, initial = false) {
  const g = gameOf(session.game);
  $('#playing-name').textContent = session.game.toUpperCase();
  $('#mode-badge').hidden = session.sandbox;
  $('#mode-badge').className = `pill mode-badge ${session.sandbox ? 'sandbox' : 'run'}`; $('#mode-badge').innerHTML = icon(session.sandbox ? 'flask' : 'trophy'); $('#mode-badge').setAttribute('aria-label', session.sandbox ? 'About sandbox' : 'View benchmark scores');
  $('#live-score').hidden = session.sandbox; $('#target').hidden = !session.sandbox || sandboxBest(session.game, session.level) == null || isGold(session.game, session.level);
  if (session.sandbox) {$('#actions').textContent = session.attempt; $('#target-value').textContent = g.baseline[session.level];}
  else {$('#actions').textContent = state.score.actions; $('#rhae').innerHTML = `${state.score.score.toFixed(1)}<small>%</small>`;}
  $('#level-dots').innerHTML = session.sandbox
    ? Array.from({length: state.levels}, (_, i) => `<i class="${rating(session.game, i) === 'diamond' ? 'diamond' : isGold(session.game, i) ? 'gold' : sandboxBest(session.game, i) != null ? 'done' : ''}${i === session.level ? ' here' : ''}"></i>`).join('')
    : Array.from({length: state.levels}, (_, i) => `<i class="${i < state.completed ? 'done' : i === state.completed ? 'current' : ''}"></i>`).join('');
  const token = ++framesToken;
  if (state.animation && !initial) {
    const raw = atob(state.animation), total = raw.length / 4096; let frameIndex = 0;
    const paint = () => {
      if (token !== framesToken || !playing) return;
      drawAnimationFrame(raw, frameIndex++);
      if (frameIndex < total) setTimeout(paint, 1000 / Math.max(30, state.fps));
    };
    paint();
  } else draw(state.frames.at(-1));
  if (initial || old?.available.join() !== state.available.join()) renderControls();
  $('#game-over').hidden = state.state !== 'GAME_OVER';
  if (session.sandbox) {if (old && state.completed > old.completed) {oldLevelFrame = old.frames.at(-1); levelCleared();} return;}
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
  extra += control(0, 'trash', 'Restart level', 'berry');
  html += `<div class="extras${dirs.length ? '' : ' row'}">${extra}</div>`;
  $('#controls').innerHTML = html;
  $$('#controls [data-action]').forEach(b => {
    if (b.dataset.action === '0') {b.onclick = confirmRetry; return;}
    b.addEventListener('pointerdown', e => {e.preventDefault(); act({id: Number(b.dataset.action)});});
    // Some WebViews give touch clicks detail=0 too. Only non-pointer activation belongs here.
    b.addEventListener('click', e => {if (e.detail === 0 && !e.pointerType) act({id: Number(b.dataset.action)});});
  });
}
function act(action, confirmed = false) {
  if (!playing || !state || screenName !== 'game' || loadingGame || $('#game-dialog').open) return;
  if (state.state === 'WIN' || (state.state === 'GAME_OVER' && action.id !== 0)) return;
  if (action.id !== 0 && !state.available.includes(action.id)) return;
  if (action.id === 6 && state.tap_mask && state.tap_mask[action.y * 64 + action.x] !== '1') return;
  if (action.id === 0 && !confirmed) {confirmRetry(); return;}
  framesToken++; draw(state.frames.at(-1)); feedback(); request({type: 'action', action}, 'action', action);
}
function won() {
  confetti(44);
  detailPage('Game complete!', `<div class="win-art">${icon('trophy')}</div><div class="score-big">${state.score.score.toFixed(1)}<small>%</small></div><p class="score-label">${state.levels} levels · ${state.score.actions} actions</p><div class="dialog-stack"><button id="see-run" class="chunk lavender">This game’s scorecard</button><button id="go-next" class="chunk mint">${icon('play-icon')}Next game</button><button id="go-home" class="chunk white">${icon('grid')}All games</button></div>`);
  $('#see-run').onclick = () => runScorecard(session.game); $('#go-next').onclick = () => {home(); continueRun();}; $('#go-home').onclick = home;
}
function downloadScore() {
  const data = {app: 'ARC Quest', mode: 'local practice — not an official leaderboard submission', engine: 'arcengine 0.9.3', scoring: 'arc-agi 0.9.9', currentRun: {score: runScore(), levels: runLevels(), startedAt: run.startedAt, games: games.map(g => ({game_id: g.version, source_sha256: g.sha256, current: runGame(g.id)?.summary ?? null, actions: runGame(g.id)?.history ?? []}))}, pastRuns, sandbox};
  window.AndroidGame?.exportScore(JSON.stringify(data, null, 2));
}
function runScorecard(id) {
  const summary = runGame(id)?.summary;
  if (!summary) {scorecard(); return;}
  detailPage(id.toUpperCase() + ' scorecard', gameScorecard(gameOf(id), summary));
  $('#export').onclick = downloadScore;
}
function scorecard() {
  detailPage('Your scores', scoreOverview({games, pastRuns, best: bestRun(), runGame, runScore, runLevels, totalLevels, gameScore, sandboxCleared, sandboxGold}));
  $('#export').onclick = downloadScore;
}
function about() {
  showInfo(() => {closeDetails(); onboarding(0);});
}

// ---- wiring
$('#record').onclick = () => {feedback(); scorecard();};
$('#mode-badge').onclick = () => {feedback(); if (session.sandbox) sandboxInfo(); else scorecard();};
$('#live-score').onclick = () => {feedback(); runScorecard(session.game);};
$('#about').onclick = () => {feedback(); about();};
$('#back').onclick = () => {feedback(); const id = session?.game, practice = session?.sandbox; home(); if (practice) levelPicker(id);};
$('#game-over').addEventListener('click', () => act({id: 0}));
$$('.sound-toggle').forEach(b => b.onclick = () => {settings.sound = !settings.sound; updateSettings(); feedback();});
$$('.haptic-toggle').forEach(b => b.onclick = () => {settings.haptic = !settings.haptic; updateSettings(); feedback();});
$('#cancel-loading').onclick = () => {loadingGame = false; $('#loading').hidden = true; $('#app').inert = false; sessionId = null; if (screenName === 'game') {const id = session.game, practice = session.sandbox; home(); if (practice) levelPicker(id);} else $('#detail-back').focus({preventScroll: true});};
window.arcBack = () => {
  if ($('#game-dialog').open) {dismissGameOverlay(); return true;}
  if (!$('#loading').hidden) {$('#cancel-loading').click(); return true;}
  if (screenName === 'detail') {goDetailBack(); return true;}
  if (!$('#game').hidden) {$('#back').click(); return true;}
  if (!$('#onboarding').hidden) {if (pageIndex > 0) onboarding(pageIndex - 1); else if (settings.onboarded) home(); else return false; return true;}
  return false;
};
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.key === 'Escape') {e.preventDefault(); window.arcBack(); return;}
  if (!playing) return;
  if (loadingGame || screenName === 'detail' || $('#game-dialog').open) return;
  const map = {ArrowUp: 1, w: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3, ArrowRight: 4, d: 4, ' ': 5, z: 7, r: 0};
  if (e.key in map) {e.preventDefault(); act({id: map[e.key]});}
});

// Drop stale gestures/animation frames when Android changes focus.
function suspendView() {for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish(); cancelGesture(); framesToken++; $('#confetti').replaceChildren(); if (state) draw(state.frames.at(-1)); suspendSound();}
window.arcSuspend = suspendView;
window.addEventListener('blur', suspendView);
document.addEventListener('visibilitychange', () => {if (document.hidden) suspendView(); else if (state) {framesToken++; draw(state.frames.at(-1));}});
bindIntro({settings, home, updateSettings});
bindBoard({getState: () => state, canInput: () => playing && !loadingGame && screenName === 'game' && !$('#game-dialog').open, act});
updateSettings();
try {
  startWorker();
  [games, diamonds] = await Promise.all(['./games.json', './diamonds.json'].map(async url => (await fetch(url)).json()));
  games.sort((a, b) => {const first = ['ls20', 'ft09', 'vc33']; const ai = first.indexOf(a.id), bi = first.indexOf(b.id); return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.id.localeCompare(b.id);});
  if (!bootError) enterApp();
} catch (e) {metrics.errors.push(String(e)); showLoadError(String(e));}
