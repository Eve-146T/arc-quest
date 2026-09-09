import {icon} from './common.js';
import {levelScore} from '../progress.js';

export function levelGrid(game, bests, rating) {
  return `<div class="level-list" style="--level-rows:${Math.ceil(game.levels / 3)};--landscape-rows:${Math.ceil(game.levels / 5)}">${game.baseline.map((human, level) => {
    const best = bests[level], award = rating(level), score = levelScore(human, best);
    const label = `Level ${level + 1}, ${award || 'Not Cleared'}, score ${score.toFixed(1)}%${best != null ? `, best ${best} actions` : ''}`;
    return `<button class="level-tile ${award}" data-level="${level}" aria-label="${label}">
      <span class="tile-preview"><img src="./assets/levels/${game.id}/${level + 1}.png" alt="" width="64" height="64"></span>
      <span class="tile-caption"><strong>${String(level + 1).padStart(2, '0')}</strong><span class="tile-score"><b>${score.toFixed(1)}%</b><small>score</small></span></span>
      <span class="tile-best">${icon('bolt')} ${best ?? '—'} <small>actions</small></span>
      ${best != null && best > human ? `<small class="tile-target">${human} actions for gold</small>` : ''}
    </button>`;
  }).join('')}</div>`;
}
