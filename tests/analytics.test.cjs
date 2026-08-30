'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, buildActAnalytics, buildSynergy } = require('../src/main/services/analytics.cjs');

const matches = [
  { id: 'new', result: 'VICTORY', map: 'Lotus', server: 'Virginia', serverRegion: 'North America', agent: 'Omen', agentRole: 'Controller', kills: 20, deaths: 10, assists: 8, rr: 20, rrAfter: 60, tierAfter: 21, startedAt: 200, shots: { headshots: 5, bodyshots: 10, legshots: 5 }, teammateIds: ['friend-1'], report: { openingKills: 2, openingDeaths: 1 } },
  { id: 'old', result: 'DEFEAT', map: 'Lotus', server: 'Virginia', serverRegion: 'North America', agent: 'Jett', agentRole: 'Duelist', kills: 10, deaths: 20, assists: 4, rr: -15, rrAfter: 40, tierAfter: 21, startedAt: 100, shots: { headshots: 3, bodyshots: 15, legshots: 2 }, teammateIds: ['friend-1'], report: { openingKills: 0, openingDeaths: 2 } }
];

test('summarizes act matches using aggregate kills and deaths', () => {
  assert.deepEqual(summarize(matches), {
    games: 2, wins: 1, losses: 1, draws: 0, winRate: 50,
    kills: 30, deaths: 30, assists: 12, kd: 1, headshot: 20,
    averageKills: 15, rr: 5
  });
});

test('builds journey, map, agent, insight, challenge, and session analytics', () => {
  const result = buildActAnalytics(matches, {
    friends: [{ id: 'friend-1', name: 'Duo', tag: 'NA1' }],
    session: { startedAt: 150, startingRR: 40, currentRR: 60, startingRank: 'Ascendant 1', currentRank: 'Ascendant 1' }
  });
  assert.deepEqual(result.journey.map((point) => point.matchId), ['old', 'new']);
  assert.equal(result.maps[0].name, 'Lotus');
  assert.equal(result.agents.length, 2);
  assert.equal(result.servers[0].name, 'Virginia');
  assert.equal(result.servers[0].kd, 1);
  assert.ok(result.insights.length > 0);
  assert.ok(result.challenges.length > 0);
  assert.equal(result.session.games, 1);
  assert.equal(result.synergy[0].name, 'Duo');
  assert.deepEqual(result.synergy[0].matchIds, ['new', 'old']);
});

test('session counts a match observed in progress even when it started before the app', () => {
  const result = buildActAnalytics(matches, {
    session: { startedAt: 300, trackedMatchIds: ['new'], startingRR: 60, currentRR: 45 }
  });
  assert.equal(result.session.games, 1);
  assert.equal(result.session.wins, 1);
  assert.equal(result.session.losses, 0);
  assert.equal(result.session.kd, 2);
  assert.deepEqual(result.session.matchIds, ['new']);
});

test('keeps a rating-only update in the full act journey', () => {
  const result = buildActAnalytics([...matches, { id: 'earliest', result: 'RATING', tierAfter: 18, rrAfter: 22, rr: 18, startedAt: 50 }]);
  assert.deepEqual(result.journey.map((point) => point.matchId), ['earliest', 'old', 'new']);
  assert.equal(result.summary.games, 2);
});

test('synergy includes known friends only', () => {
  const result = buildSynergy([{ ...matches[0], teammateIds: ['friend-1', 'stranger'] }], [{ id: 'friend-1', name: 'Duo', tag: 'NA1' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'friend-1');
  assert.deepEqual(result[0].matchIds, ['new']);
});
