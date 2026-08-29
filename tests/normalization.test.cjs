'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RiotClientService, normalizeMatchDetail, normalizeLoadout, calculateStats, buildAgentMastery,
  isPlayerNameHidden, isKnownPartyMember, visiblePlayerIds, normalizeLivePlayers,
  selectCompetitiveTier, selectCurrentActUpdates, selectAllTimePeak,
  normalizeRatingUpdate, normalizeServer, normalizeQueueName, decodePresencePrivate,
  summarizePresence, mapWithConcurrency
} = require('../src/main/services/riot-client.cjs');

function metadata() {
  return {
    maps: new Map([['/game/maps/ascent/ascent', { name: 'Ascent', image: 'map.png' }]]),
    agents: new Map([['agent-jett', { name: 'Jett', role: 'Duelist', image: 'jett.png', color: '#abc123' }]]),
    weapons: new Map([['gun-vandal', { name: 'Vandal', image: 'vandal.png' }]]),
    skins: new Map([['skin-prime', { name: 'Prime Vandal', weapon: 'Vandal', image: 'prime.png' }]]),
    tiers: new Map([[21, { name: 'Ascendant 1', image: 'https://media.valorant-api.com/tiers/21.png' }]])
  };
}

test('normalizes a Riot match-detail response for the current player', () => {
  const detail = {
    MatchInfo: { MatchID: 'match-1', MapID: '/Game/Maps/Ascent/Ascent', GameStartMillis: Date.now() - 60_000 },
    Players: [{ Subject: 'player-1', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerStats: { Kills: 20, Deaths: 10, Assists: 5 } }],
    Teams: [{ TeamID: 'Blue', Won: true, RoundsWon: 13 }, { TeamID: 'Red', Won: false, RoundsWon: 8 }],
    RoundResults: [{ PlayerStats: [{ Subject: 'player-1', Damage: [{ Headshots: 3, Bodyshots: 5, Legshots: 1 }] }] }]
  };
  const result = normalizeMatchDetail(detail, 'player-1', metadata(), {}, { RankedRatingEarned: 18 });
  assert.equal(result.result, 'VICTORY');
  assert.equal(result.map, 'Ascent');
  assert.equal(result.agent, 'Jett');
  assert.equal(result.score, '13 – 8');
  assert.equal(result.kd, 2);
  assert.equal(result.rr, 18);
  assert.equal(result.playlist, 'Competitive');
  assert.equal(result.isCompetitive, true);
  assert.equal(result.hasRating, true);
  assert.equal(result.shots.headshots, 3);
  assert.equal(result.rankName, 'Ascendant 1');
  assert.equal(result.rankImage, 'https://media.valorant-api.com/tiers/21.png');
});

test('normalizes non-competitive playlists without showing RR', () => {
  const detail = {
    MatchInfo: { MatchID: 'match-unrated', QueueID: 'unrated', MapID: '/Game/Maps/Ascent/Ascent' },
    Players: [{ Subject: 'player-1', TeamID: 'Blue', CharacterID: 'agent-jett', PlayerStats: { Kills: 12, Deaths: 10, Assists: 3 } }],
    Teams: [{ TeamID: 'Blue', Won: true, RoundsWon: 13 }, { TeamID: 'Red', Won: false, RoundsWon: 9 }]
  };
  const result = normalizeMatchDetail(detail, 'player-1', metadata());
  assert.equal(result.playlist, 'Unrated');
  assert.equal(result.queueId, 'unrated');
  assert.equal(result.isCompetitive, false);
  assert.equal(result.hasRating, false);
  assert.equal(result.rr, null);
});

test('decodes VALORANT friend presence with playlist and live score', () => {
  const details = {
    sessionLoopState: 'INGAME', queueId: 'competitive',
    partyOwnerMatchScoreAllyTeam: 7, partyOwnerMatchScoreEnemyTeam: 5
  };
  const encoded = Buffer.from(JSON.stringify(details)).toString('base64');
  assert.deepEqual(decodePresencePrivate(encoded), details);
  const presence = summarizePresence({ puuid: 'friend-1', product: 'valorant', state: 'online', private: encoded });
  assert.equal(presence.state, 'ingame');
  assert.equal(presence.game, 'VALORANT');
  assert.equal(presence.playlist, 'Competitive');
  assert.equal(presence.score, '7–5');
  assert.match(presence.status, /Competitive.*7–5/);
});

test('keeps other Riot titles online instead of marking them offline', () => {
  const presence = summarizePresence({ puuid: 'friend-2', product: 'league_of_legends', state: 'online' });
  assert.equal(presence.state, 'other');
  assert.equal(presence.game, 'League of Legends');
  assert.equal(presence.status, 'Playing League of Legends');
  assert.equal(normalizeQueueName('hurm'), 'Team Deathmatch');
  assert.equal(normalizeQueueName('spikerush'), 'Spike Rush');
});

test('friend roster joins Riot presences and preserves live activity', async () => {
  const valorantPrivate = Buffer.from(JSON.stringify({ sessionLoopState: 'PREGAME', queueId: 'unrated' })).toString('base64');
  const service = new RiotClientService();
  service.localRequest = async (endpoint) => endpoint.endsWith('/friends')
    ? { data: { friends: [
      { puuid: 'valorant-friend', game_name: 'ValFriend', game_tag: 'NA1' },
      { puuid: 'league-friend', game_name: 'LeagueFriend', game_tag: 'NA1' }
    ] } }
    : { data: { presences: [
      { puuid: 'valorant-friend', product: 'valorant', state: 'online', private: valorantPrivate },
      { puuid: 'league-friend', product: 'league_of_legends', state: 'online' }
    ] } };
  const friends = await service.fetchFriends();
  assert.equal(friends[0].state, 'pregame');
  assert.equal(friends[0].playlist, 'Unrated');
  assert.match(friends[0].status, /Agent Select.*Unrated/);
  assert.equal(friends[1].state, 'other');
  assert.equal(friends[1].game, 'League of Legends');
});

test('normalizes a tied competitive match as a draw instead of a loss', () => {
  const detail = {
    MatchInfo: { MatchID: 'match-draw', MapID: '/Game/Maps/Ascent/Ascent' },
    Players: [{ Subject: 'player-1', TeamID: 'Blue', CharacterID: 'agent-jett', PlayerStats: { Kills: 15, Deaths: 15, Assists: 4 } }],
    Teams: [{ TeamID: 'Blue', Won: false, RoundsWon: 14 }, { TeamID: 'Red', Won: false, RoundsWon: 14 }]
  };
  assert.equal(normalizeMatchDetail(detail, 'player-1', metadata()).result, 'DRAW');
});

test('resolves weapon and skin UUIDs in a Riot loadout', () => {
  const result = normalizeLoadout({ Guns: [{ ID: 'gun-vandal', SkinID: 'skin-prime' }] }, metadata());
  assert.equal(result[0].slot, 'Vandal');
  assert.equal(result[0].skin, 'Prime Vandal');
  assert.equal(result[0].image, 'prime.png');
});

test('calculates recent statistics and agent pick rate', () => {
  const matches = [
    { result: 'VICTORY', agent: 'Jett', agentRole: 'Duelist', kills: 20, deaths: 10, competitiveTier: 21, shots: { headshots: 3, bodyshots: 5, legshots: 2 } },
    { result: 'DEFEAT', agent: 'Jett', agentRole: 'Duelist', kills: 10, deaths: 10, competitiveTier: 20, shots: { headshots: 2, bodyshots: 8, legshots: 0 } }
  ];
  assert.deepEqual(calculateStats(matches), { wins: 1, losses: 1, kd: 1.5, headshot: 25, peakTier: 21 });
  const agents = buildAgentMastery(matches);
  assert.equal(agents[0].name, 'Jett');
  assert.equal(agents[0].mastery, 100);
  assert.equal(agents[0].games, 2);
});

test('live roster never resolves or exposes Riot-incognito names', () => {
  const players = [
    { Subject: 'self', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: false } },
    { Subject: 'visible', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: false } },
    { Subject: 'party-hidden-in-game', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: true }, BYAKUGANPartyMember: true },
    { Subject: 'visible-enemy', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: false } },
    { Subject: 'hidden', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: true } },
    { Subject: 'unknown-privacy', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21 }
  ];

  assert.equal(isKnownPartyMember(players[2]), true);
  assert.equal(isPlayerNameHidden(players[2], 'self'), false);
  assert.equal(isPlayerNameHidden(players[4], 'self'), true);
  assert.equal(isPlayerNameHidden(players[5], 'self'), true);
  assert.deepEqual(visiblePlayerIds(players, 'self'), ['self', 'visible', 'party-hidden-in-game']);

  const roster = normalizeLivePlayers(players, 'self', metadata(), {
    self: 'MyName#NA1', visible: 'VisibleName#NA1', 'party-hidden-in-game': 'MyPartyFriend#NA1', 'visible-enemy': 'EnemyMustNotAppear#NA1', hidden: 'MustNotAppear#NA1',
    'unknown-privacy': 'MustNotAppearEither#NA1'
  });
  assert.equal(roster[0].name, 'You');
  assert.equal(roster[1].name, 'VisibleName#NA1');
  assert.equal(roster[2].name, 'MyPartyFriend#NA1');
  assert.equal(roster[2].partyMember, true);
  assert.equal(roster[2].inspectable, true);
  assert.equal(roster[0].inspectable, true);
  assert.equal(roster[1].inspectable, true);
  assert.equal(roster[3].inspectable, false);
  assert.equal(roster[4].inspectable, false);
  assert.equal(roster[3].name, '');
  assert.equal(roster[4].name, '');
  assert.equal(roster[5].name, '');
  assert.equal(roster[3].rank, 'Ascendant 1');
  assert.equal(roster[3].agent, 'Jett');
  assert.equal(JSON.stringify(roster).includes('MustNotAppear'), false);
  assert.equal(JSON.stringify(roster).includes('EnemyMustNotAppear'), false);
  assert.equal(JSON.stringify(roster).includes('unknown-privacy'), false);
});

test('selects a roster rank from the active act, then competitive updates', () => {
  const mmr = {
    QueueSkills: { competitive: { SeasonalInfoBySeasonID: {
      'old-act': { CompetitiveTier: 24 },
      'current-act': { CompetitiveTier: 21 }
    } } }
  };
  assert.equal(selectCompetitiveTier({ mmr, activeSeasonId: 'current-act' }), 21);
  assert.equal(selectCompetitiveTier({ fallbackTier: 22, mmr, activeSeasonId: 'current-act' }), 22);
  assert.equal(selectCompetitiveTier({ updates: { Matches: [{ TierAfterUpdate: 19 }] } }), 19);
  assert.equal(selectCompetitiveTier({ mmr, activeSeasonId: 'missing-act' }), 0);
});

test('selects only current-act competitive updates and stops at the previous act', () => {
  const result = selectCurrentActUpdates([
    { MatchID: 'newest', SeasonID: 'current-act' },
    { MatchID: 'older', SeasonID: 'current-act' },
    { MatchID: 'previous', SeasonID: 'old-act' },
    { MatchID: 'too-old', SeasonID: 'old-act' }
  ], 'current-act');
  assert.deepEqual(result.rows.map((row) => row.MatchID), ['newest', 'older']);
  assert.equal(result.reachedPreviousAct, true);
});

test('bounded concurrent mapping preserves roster order', async () => {
  const result = await mapWithConcurrency([3, 1, 2], 2, async (value) => value * 10);
  assert.deepEqual(result, [30, 10, 20]);
});

test('resolves all-time peak rank with its episode and act', () => {
  const data = metadata();
  data.tiers.set(24, { name: 'Immortal 1', image: 'immortal.png' });
  data.seasons = new Map([
    ['episode-8', { name: 'Episode 8' }],
    ['act-2', { name: 'Act 2', parentId: 'episode-8' }]
  ]);
  const result = selectAllTimePeak({ QueueSkills: { competitive: { SeasonalInfoBySeasonID: {
    'act-2': { CompetitiveTier: 23, WinsByTier: { 21: 4, 24: 1 } },
    'older-act': { CompetitiveTier: 22 }
  } } } }, data);
  assert.deepEqual(result, { tier: 24, rank: 'Immortal 1', image: 'immortal.png', act: 'Act 2', episode: 'Episode 8' });
});

test('normalizes game pod locations and rating-only journey milestones', () => {
  assert.deepEqual(normalizeServer('aresriot.aws-rclusterprod-use1-1.na-gp-ashburn-aws-1'), {
    id: 'aresriot.aws-rclusterprod-use1-1.na-gp-ashburn-aws-1', name: 'Virginia', region: 'North America'
  });
  const update = normalizeRatingUpdate({ MatchID: 'older', TierAfterUpdate: 18, RankedRatingAfterUpdate: 42, RankedRatingEarned: -17, MatchStartTime: 1_700_000_000 }, metadata());
  assert.equal(update.startedAt, 1_700_000_000_000);
  assert.equal(update.result, 'RATING');
  assert.equal(update.rrAfter, 42);
});
