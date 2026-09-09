import {icon} from './common.js';

export function benchmarkHero({started, best, levels, total, won, count}) {
  return `<div class="hero-top"><span class="hero-label">${started ? 'CURRENT RUN' : 'NEW RUN'}</span>${best ? `<span class="hero-best">${icon('trophy')}Best ${best.score.toFixed(1)}%</span>` : ''}</div><div class="hero-score"><b id="run-score">0.0</b><small>% complete</small></div><div class="hero-bar"><i style="width:${(levels / total * 100).toFixed(1)}%"></i></div><div class="hero-meta"><span>${levels} / ${total} levels</span><span>${won} / ${count} games</span></div><div class="hero-actions"><button id="continue-run" class="chunk mint">${icon('play-icon')}${started ? 'CONTINUE RUN' : 'START RUN'}</button>${started ? `<button id="reset-run" class="chip berry" aria-label="Delete run">${icon('trash')}</button>` : ''}</div>`;
}

export function sandboxHero({gold, total, cleared}) {
  return `<div class="hero-top"><button id="sandbox-help" class="quiet-button" aria-label="About sandbox">${icon('flask')}</button><span class="hero-best">${icon('star')}${gold}</span></div><div class="hero-score"><b id="sandbox-count">0</b><small>/ ${total}</small><span class="unit">LEVELS</span></div><div class="hero-bar"><i class="gold" style="width:${(gold / total * 100).toFixed(1)}%"></i><i style="width:${(cleared / total * 100).toFixed(1)}%;background:#ffd23f80"></i></div><div class="hero-actions"><button id="next-level" class="chunk yellow">${icon('play-icon')}${cleared === total ? 'ALL LEVELS CLEARED' : cleared ? 'NEXT UNCLEARED' : 'FIRST LEVEL'}</button></div>`;
}

export function gameCard(g, {locked, cls, segs, i}) {
  return `<button ${locked ? 'disabled' : ''} class="game-card ${cls}${locked ? ' locked' : ''}" data-game="${g.id}" style="--i:${i}" aria-label="${g.id.toUpperCase()}, ${g.levels} levels"><img src="./assets/${g.id}.png" alt="" loading="lazy"><strong>${g.id.toUpperCase()}</strong>${segs}</button>`;
}
