'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActRecordAudit } = require('../src/main/services/act-record-audit.cjs');
test('audit keeps placement counters distinct, reports missing detail, and omits account credentials', () => {
  const report = buildActRecordAudit({ accountKey:'hashed', seasonId:'act',
    activeSeason:{id:'act',startTime:10},
    mmr:{ Subject:'secret-player', Token:'secret-token', QueueSkills:{competitive:{SeasonalInfoBySeasonID:{act:{NumberOfWins:3,NumberOfWinsWithPlacements:5,NumberOfGames:8,WinsByTier:{20:3}}}}}},
    data:{matches:[{id:'private-match',result:'VICTORY',startedAt:20},{id:'missing',result:'RATING',startedAt:21}]},
    updates:{Matches:[{MatchID:'missing',SeasonID:'act',RankedRatingEarned:20}]}
  });
  assert.deepEqual(report.differences,{wins:2,winsWithPlacements:4,games:7});
  assert.equal(report.winsByTierTotal,3);
  assert.equal(report.unresolved.length,1);
  assert.equal(report.recentUpdatesWithoutCompletedDetail.length,1);
  for(const value of ['secret-player','secret-token','private-match']) assert.ok(!JSON.stringify(report).includes(value));
});
test('unavailable counters stay unknown instead of becoming zero', () => {
  const report=buildActRecordAudit({accountKey:'a',seasonId:'b'});
  assert.equal(report.mmrAvailable,false);
  assert.equal(report.differences.wins,null);
  assert.equal(report.counters.NumberOfWinsWithPlacements,null);
});
