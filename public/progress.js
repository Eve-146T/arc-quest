// Keep benchmark order, completed records and sandbox awards independent of rendering.
// Per-level action efficiency uses the official equation, before game-level weighting.
export function levelScore(baseline, actions) {
  return Number.isInteger(actions) && actions > 0 ? Math.min(115, 100 * (baseline / actions) ** 2) : 0;
}
export function nextRunGame(games, run) {
  return games.find(g => run.games[g.id]?.summary?.state !== 'WIN')?.id ?? null;
}
export function completedRecord(games, run, pastRuns, score) {
  if (!games.length) return null;
  const total = games.reduce((n, g) => n + g.levels, 0);
  const records = pastRuns.filter(r => r.games === games.length && r.levels === total);
  if (games.every(g => run.games[g.id]?.summary?.state === 'WIN')) records.push({score});
  return records.reduce((best, r) => Number.isFinite(r.score) && r.score > (best?.score ?? -1) ? r : best, null);
}
export function allGold(games, sandbox) {
  return games.length > 0 && games.every(g => g.baseline.every((human, level) => Number.isInteger(sandbox[g.id]?.[level]) && sandbox[g.id][level] <= human));
}
export function sandboxRating(games, sandbox, diamonds, id, level, attempt) {
  const game = games.find(g => g.id === id), best = attempt ?? sandbox[id]?.[level];
  if (!game || !Number.isInteger(best)) return '';
  if (best > game.baseline[level]) return 'cleared';
  const record = diamonds.games?.[id], target = record?.recordActions?.[level];
  // Only compare records from the exact bundled version. Missing records stay gold.
  if (allGold(games, sandbox) && record?.sha256 === game.sha256 && record?.version === game.version && Number.isInteger(target) && best <= target) return 'diamond';
  return 'gold';
}
