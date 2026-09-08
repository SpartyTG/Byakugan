'use strict';
const { createHash } = require('node:crypto');
function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function buildActRecordAudit({ accountKey, seasonId, activeSeason = {}, metadataSeason = {}, mmr, updates, data, now = Date.now() }) {
  const queue = mmr?.QueueSkills?.competitive || mmr?.queueSkills?.competitive || {};
  const seasons = queue.SeasonalInfoBySeasonID || queue.seasonalInfoBySeasonId || {};
  const season = seasons[seasonId];
  const counters = {
    NumberOfWins: count(season?.NumberOfWins ?? season?.numberOfWins),
    NumberOfWinsWithPlacements: count(season?.NumberOfWinsWithPlacements ?? season?.numberOfWinsWithPlacements),
    NumberOfGames: count(season?.NumberOfGames ?? season?.numberOfGames),
    GamesNeededForRating: count(season?.GamesNeededForRating ?? season?.gamesNeededForRating),
    CurrentSeasonGamesNeededForRating: count(queue.CurrentSeasonGamesNeededForRating ?? queue.currentSeasonGamesNeededForRating)
  };
  const winsByTier = season?.WinsByTier ?? season?.winsByTier;
  const tierWins = winsByTier && typeof winsByTier === 'object' ? Object.values(winsByTier).map(count) : [];
  const rows = data?.matches || [];
  const completed = rows.filter(m => ['VICTORY', 'DEFEAT', 'DRAW'].includes(m.result));
  const totals = { wins: 0, losses: 0, draws: 0, games: completed.length };
  for (const row of completed) totals[row.result === 'VICTORY' ? 'wins' : row.result === 'DEFEAT' ? 'losses' : 'draws'] += 1;
  const describe = row => ({
    matchHash: createHash('sha256').update(String(row.id || '')).digest('hex'),
    startedAt: Number(row.startedAt) || null, result: row.result,
    source: row.source === 'henrik-stored' ? 'henrik-stored' : 'local-riot',
    tier: Number(row.competitiveTier) || 0,
    rrChange: typeof row.rr === 'number' && Number.isFinite(row.rr) ? row.rr : null
  });
  const sorted = completed.slice().sort((a,b) => a.startedAt - b.startedAt);
  const recent = updates?.Matches || updates?.matches || [];
  const completedIds = new Set(completed.map(m => m.id));
  return {
    version: 1, accountKey, seasonId, capturedAt: new Date(now).toISOString(),
    mmrAvailable: Boolean(mmr), seasonalRecordAvailable: Boolean(season),
    act: { selectedId: activeSeason.id || seasonId, source: activeSeason.source || 'unknown',
      riotStartTime: activeSeason.startTime || null, riotEndTime: activeSeason.endTime || null,
      metadataStartTime: metadataSeason.startTime || null, metadataEndTime: metadataSeason.endTime || null,
      name: metadataSeason.name || null,
      latestMmrUpdateSeason: mmr?.LatestCompetitiveUpdate?.SeasonID || null },
    counters, winsByTierTotal: tierWins.length && tierWins.every(v => v !== null) ? tierWins.reduce((a,b) => a+b,0) : null,
    totals,
    differences: {
      wins: counters.NumberOfWins === null ? null : counters.NumberOfWins - totals.wins,
      winsWithPlacements: counters.NumberOfWinsWithPlacements === null ? null : counters.NumberOfWinsWithPlacements - totals.wins,
      games: counters.NumberOfGames === null ? null : counters.NumberOfGames - totals.games
    },
    sources: { imported: completed.filter(m => m.source === 'henrik-stored').length, local: completed.filter(m => m.source !== 'henrik-stored').length },
    oldest: sorted.slice(0,5).map(describe), newest: sorted.slice(-5).map(describe),
    unresolved: rows.filter(m => !['VICTORY','DEFEAT','DRAW'].includes(m.result)).map(describe),
    recentUpdatesWithoutCompletedDetail: recent.filter(row => !completedIds.has(row.MatchID || row.matchID || row.matchId)).map(row => ({
      matchHash: createHash('sha256').update(String(row.MatchID || row.matchID || row.matchId || '')).digest('hex'),
      seasonId: row.SeasonID || row.seasonID || row.seasonId || null,
      startedAt: row.MatchStartTime || row.matchStartTime || null,
      rrChange: typeof row.RankedRatingEarned === 'number' ? row.RankedRatingEarned : null
    })),
    note: 'Raw seasonal counters are shown separately. No placement adjustment or missing-result inference has been applied.'
  };
}
module.exports = { buildActRecordAudit };
