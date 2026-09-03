'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  RiotClientService, normalizeMatchDetail, normalizeLoadout, calculateStats, buildAgentMastery,
  isPlayerNameHidden, isKnownPartyMember, isKnownFriend, liveAccountLevel, visiblePlayerIds, filterPregameRoster, shouldHydrateRosterTier, normalizeLivePlayers, normalizeHistoricalRoster,
  selectCompetitiveTier, selectCurrentActUpdates, selectAllTimePeak,
  normalizeRatingUpdate, normalizeServer, normalizeQueueName, decodePresencePrivate,
  summarizePresence, isDodgePenaltyUpdate, summarizeDodgePenalties, mergeSessionMatches, didActiveMatchEnd, mapWithConcurrency,
  parseLiveScore, advanceRoundPulse
} = require('../src/main/services/riot-client.cjs');

function metadata() {
  return {
    maps: new Map([['/game/maps/ascent/ascent', {
      name: 'Ascent', image: 'map.png', tacticalImage: 'map-overhead.png',
      coordinates: { xMultiplier: .01, yMultiplier: -.01, xScalarToAdd: .5, yScalarToAdd: .5 },
      callouts: [{ name: 'A Main', region: 'A', location: { x: 0, y: 0 } }]
    }]]),
    agents: new Map([
      ['agent-jett', { name: 'Jett', role: 'Duelist', image: 'jett.png', color: '#abc123' }],
      ['agent-sova', { name: 'Sova', role: 'Initiator', image: 'sova.png', color: '#63a8e8' }]
    ]),
    weapons: new Map([['gun-vandal', { name: 'Vandal', image: 'vandal.png' }]]),
    skins: new Map([['skin-prime', { name: 'Prime Vandal', weapon: 'Vandal', image: 'prime.png' }]]),
    tiers: new Map([[21, { name: 'Ascendant 1', image: 'https://media.valorant-api.com/tiers/21.png' }]])
  };
}

test('optional loadout 404 does not mark the required Riot connection unhealthy', async () => {
  const service = new RiotClientService();
  service.remoteRequest = async () => {
    const error = new Error('Not found');
    error.status = 404;
    throw error;
  };

  const optional = await service.safeRemote('/personalization/v2/players/self/playerloadout', 'pd', { ignoredStatuses: [404] });
  assert.equal(optional, null);
  assert.deepEqual(service.diagnostics, []);

  const required = await service.safeRemote('/mmr/v1/players/self');
  assert.equal(required, null);
  assert.equal(service.diagnostics.length, 1);
  assert.equal(service.diagnostics[0].status, 404);
  assert.equal(service.diagnostics[0].endpoint, '/mmr/v1/players/self');
});

test('detects a completed live match and merges it ahead of stale act-cache data', () => {
  assert.equal(didActiveMatchEnd('INGAME', 'MENUS'), true);
  assert.equal(didActiveMatchEnd('CORE_GAME', 'MENUS'), true);
  assert.equal(didActiveMatchEnd('PREGAME', 'MENUS'), false);
  assert.equal(didActiveMatchEnd('INGAME', 'CORE_GAME'), false);

  const stale = [{ id: 'old', result: 'DEFEAT', kills: 8, deaths: 14, startedAt: 100 }];
  const recent = [
    { id: 'new', result: 'VICTORY', kills: 20, deaths: 10, startedAt: 200 },
    { id: 'old', result: 'DEFEAT', kills: 9, deaths: 14, startedAt: 100 }
  ];
  const merged = mergeSessionMatches(stale, recent);
  assert.deepEqual(merged.map((match) => match.id), ['new', 'old']);
  assert.equal(merged.find((match) => match.id === 'old').kills, 9);
});

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

test('builds a privacy-safe tactical replay and post-match IGL review from round locations', () => {
  const kill = {
    Victim: 'enemy', RoundTime: 42_000,
    VictimLocation: { X: 10, Y: 20 },
    PlayerLocations: [
      { Subject: 'self', Location: { X: 0, Y: 0 } },
      { Subject: 'enemy', Location: { X: 10, Y: 20 } }
    ]
  };
  const laterKill = {
    Victim: 'enemy-two', RoundTime: 57_000,
    VictimLocation: { X: 5, Y: 15 },
    PlayerLocations: [
      { Subject: 'self', Location: { X: 2, Y: 3 } },
      { Subject: 'enemy-two', Location: { X: 5, Y: 15 } }
    ]
  };
  const detail = {
    MatchInfo: { MatchID: 'tactical-match', QueueID: 'competitive', MapID: '/Game/Maps/Ascent/Ascent' },
    Players: [
      { Subject: 'self', TeamID: 'Blue', CharacterID: 'agent-jett', PlayerStats: { Kills: 2, Deaths: 0, Assists: 0 } },
      { Subject: 'enemy', TeamID: 'Red', CharacterID: 'agent-sova', PlayerIdentity: { Incognito: true }, PlayerStats: { Kills: 0, Deaths: 1, Assists: 0 } },
      { Subject: 'enemy-two', TeamID: 'Red', CharacterID: 'agent-sova', PlayerIdentity: { Incognito: true }, PlayerStats: { Kills: 0, Deaths: 1, Assists: 0 } }
    ],
    Teams: [{ TeamID: 'Blue', Won: true, RoundsWon: 1 }, { TeamID: 'Red', Won: false, RoundsWon: 0 }],
    RoundResults: [{
      RoundNum: 0, WinningTeam: 'Blue',
      PlayerStats: [
        { Subject: 'self', Kills: [laterKill, kill], Damage: [] },
        { Subject: 'enemy', Kills: [], Damage: [] },
        { Subject: 'enemy-two', Kills: [], Damage: [] }
      ]
    }]
  };
  const result = normalizeMatchDetail(detail, 'self', metadata(), {}, { RankedRatingEarned: 18 });
  const [event, secondEvent] = result.report.rounds[0].events;
  assert.equal(result.mapTacticalImage, 'map-overhead.png');
  assert.equal(result.report.eventsAvailable, true);
  assert.equal(event.type, 'KILL');
  assert.equal(event.opponentAgent, 'Sova');
  assert.equal(event.time, '0:42');
  assert.equal(event.timeScope, 'ROUND');
  assert.equal(event.sequence, 1);
  assert.equal(secondEvent.time, '0:57');
  assert.equal(secondEvent.sequence, 2);
  assert.equal(event.callout, 'A • A Main');
  assert.deepEqual(event.playerPoint, { x: 50, y: 50 });
  assert.deepEqual(event.opponentPoint, { x: 70, y: 40 });
  assert.equal(result.report.iglReview.rounds[0].title, 'Opening created');
  assert.match(result.report.iglReview.summary, /completed-match events only/i);
  assert.equal(JSON.stringify(result).includes('enemy'), false);
});

test('shared-match teammate IDs include visible friends but exclude incognito teammates', () => {
  const detail = {
    MatchInfo: { MatchID: 'privacy-match', QueueID: 'competitive', MapID: '/Game/Maps/Ascent/Ascent' },
    Players: [
      { Subject: 'self', TeamID: 'Blue', CharacterID: 'agent-jett', PlayerStats: { Kills: 15, Deaths: 10, Assists: 4 } },
      { Subject: 'visible-friend', TeamID: 'Blue', CharacterID: 'agent-jett', PlayerIdentity: { Incognito: false }, PlayerStats: {} },
      { Subject: 'hidden-stranger', TeamID: 'Blue', CharacterID: 'agent-jett', PlayerIdentity: { Incognito: true }, PlayerStats: {} },
      { Subject: 'hidden-friend', TeamID: 'Blue', CharacterID: 'agent-jett', PlayerIdentity: { Incognito: true }, BYAKUGANFriend: true, PlayerStats: {} }
    ],
    Teams: [{ TeamID: 'Blue', Won: true, RoundsWon: 13 }, { TeamID: 'Red', Won: false, RoundsWon: 9 }]
  };
  const match = normalizeMatchDetail(detail, 'self', metadata(), {}, { RankedRatingEarned: 17 });
  assert.deepEqual(match.teammateIds, ['visible-friend', 'hidden-friend']);
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

test('Match Pulse records observed round order without guessing earlier rounds', () => {
  assert.deepEqual(parseLiveScore('7–5'), { ally: 7, enemy: 5 });
  assert.equal(parseLiveScore('unavailable'), null);

  let pulse = advanceRoundPulse(null, 'match-1', '2–1');
  assert.deepEqual(pulse.rounds, ['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  pulse = advanceRoundPulse(pulse, 'match-1', '3–1');
  assert.equal(pulse.rounds.at(-1), 'WIN');
  pulse = advanceRoundPulse(pulse, 'match-1', '3–2');
  assert.deepEqual(pulse.rounds.slice(-2), ['WIN', 'LOSS']);
  pulse = advanceRoundPulse(pulse, 'match-1', '5–3');
  assert.deepEqual(pulse.rounds.slice(-3), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);

  const nextMatch = advanceRoundPulse(pulse, 'match-2', '0–0');
  assert.deepEqual(nextMatch.rounds, []);
  assert.equal(nextMatch.revision, 0);
});

test('keeps other Riot titles online instead of marking them offline', () => {
  const presence = summarizePresence({ puuid: 'friend-2', product: 'league_of_legends', state: 'online' });
  assert.equal(presence.state, 'other');
  assert.equal(presence.game, 'League of Legends');
  assert.equal(presence.status, 'Playing League of Legends');
  assert.equal(normalizeQueueName('hurm'), 'Team Deathmatch');
  assert.equal(normalizeQueueName('spikerush'), 'Spike Rush');
});

test('treats stale mobile League as offline but preserves an active VALORANT product record', () => {
  const mobileLeague = summarizePresence({ puuid: 'friend-3', product: 'league_of_legends', state: 'mobile' });
  const activeValorant = summarizePresence({ puuid: 'friend-4', product: 'valorant', state: 'chat', private: '' });
  assert.equal(mobileLeague.state, 'offline');
  assert.equal(mobileLeague.game, '');
  assert.equal(activeValorant.state, 'online');
  assert.equal(activeValorant.game, 'VALORANT');
  assert.equal(activeValorant.status, 'VALORANT • Online');
});

test('decodes nested and double-encoded VALORANT presence variants', () => {
  const details = JSON.stringify({
    data: {
      party_owner_session_loop_state: 'CORE_GAME',
      party_owner_queue_id: 'competitive',
      party_owner_match_score_ally_team: 0,
      party_owner_match_score_enemy_team: 0
    }
  });
  const encodedTwice = Buffer.from(JSON.stringify(Buffer.from(details).toString('base64'))).toString('base64');
  const presence = summarizePresence({ puuid: 'friend-variant', Product: 'VALORANT', state: 'dnd', private_data: encodedTwice });
  assert.equal(presence.state, 'ingame');
  assert.equal(presence.playlist, 'Competitive');
  assert.equal(presence.score, '0–0');
  assert.match(presence.status, /Competitive.*0–0/);
});

test('recognizes The Range from alternate presence fields', () => {
  const presence = summarizePresence({
    puuid: 'friend-range', resource: 'RC-VALORANT', state: 'chat',
    Private: { partyOwnerProvisioningFlow: 'ShootingRange', partyOwnerQueueID: 'range', allyScore: 0, enemyScore: 0 }
  });
  assert.equal(presence.state, 'ingame');
  assert.equal(presence.playlist, 'The Range');
  assert.equal(presence.score, '0–0');
  assert.match(presence.status, /The Range.*0–0/);
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

test('friend online flag outranks a stale product presence', async () => {
  const service = new RiotClientService();
  service.localRequest = async (endpoint) => endpoint.endsWith('/friends')
    ? { data: { friends: [{ puuid: 'online-friend', game_name: 'OnlineFriend', is_online: true }] } }
    : { data: { presences: [{ puuid: 'online-friend', product: 'league_of_legends', state: 'mobile' }] } };
  const [friend] = await service.fetchFriends();
  assert.equal(friend.state, 'online');
  assert.equal(friend.game, 'Riot Client');
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

test('detects dodge RR penalties without counting match losses or AFK penalties', () => {
  const rows = [
    { RankedRatingEarned: -3, MatchID: '', Reason: 'Queue Dodge' },
    { RankedRatingEarned: -6, MatchID: '00000000-0000-0000-0000-000000000000' },
    { RankedRatingEarned: -18, MatchID: 'competitive-match' },
    { RankedRatingEarned: -8, MatchID: '', PenaltyReason: 'AFK penalty' },
    { RankedRatingEarned: 12, MatchID: '' }
  ];
  assert.equal(isDodgePenaltyUpdate(rows[0]), true);
  assert.equal(isDodgePenaltyUpdate(rows[2]), false);
  assert.equal(isDodgePenaltyUpdate(rows[3]), false);
  assert.deepEqual(summarizeDodgePenalties(rows), { rrLost: 9, count: 2 });
});

test('uses competitive update match IDs when an ally history index is private', async () => {
  const service = new RiotClientService();
  service.identity = { puuid: 'self' };
  service.metadata = metadata();
  service.fetchMatchDetail = async (matchId) => ({
    MatchInfo: { MatchID: matchId, MapID: '/Game/Maps/Ascent/Ascent' },
    Players: [{ Subject: 'friend', TeamID: 'Blue', CharacterID: 'agent-jett', PlayerStats: { Kills: 20, Deaths: 10, Assists: 5 } }],
    Teams: [{ TeamID: 'Blue', Won: true, RoundsWon: 13 }, { TeamID: 'Red', Won: false, RoundsWon: 8 }]
  });
  const matches = await service.fetchDetailedMatches(null, {
    Matches: [{ MatchID: 'shared-match', RankedRatingEarned: 17 }]
  }, 'friend', 50);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].result, 'VICTORY');
  assert.equal(matches[0].kills, 20);
});

test('live roster never resolves or exposes Riot-incognito names', () => {
  const players = [
    { Subject: 'self', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: false, AccountLevel: 271, HideAccountLevel: false } },
    { Subject: 'visible', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: false } },
    { Subject: 'party-hidden-in-game', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: true }, BYAKUGANPartyMember: true },
    { Subject: 'visible-enemy', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: false, AccountLevel: 144 }, BYAKUGANPeakRank: 'Immortal 1', BYAKUGANPeakEpisode: 'Episode 9', BYAKUGANPeakAct: 'Act 2' },
    { Subject: 'hidden', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: true, AccountLevel: 55, HideAccountLevel: true } },
    { Subject: 'unknown-privacy', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21 },
    { Subject: 'friend-hidden-in-game', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: true }, BYAKUGANFriend: true }
  ];

  assert.equal(isKnownPartyMember(players[2]), true);
  assert.equal(isPlayerNameHidden(players[2], 'self'), false);
  assert.equal(isPlayerNameHidden(players[4], 'self'), true);
  assert.equal(isPlayerNameHidden(players[5], 'self'), true);
  assert.equal(isKnownFriend(players[6]), true);
  assert.equal(isPlayerNameHidden(players[6], 'self'), false);
  assert.deepEqual(visiblePlayerIds(players, 'self'), ['self', 'visible', 'party-hidden-in-game', 'friend-hidden-in-game']);

  const roster = normalizeLivePlayers(players, 'self', metadata(), {
    self: 'MyName#NA1', visible: 'VisibleName#NA1', 'party-hidden-in-game': 'MyPartyFriend#NA1', 'visible-enemy': 'EnemyMustNotAppear#NA1', hidden: 'MustNotAppear#NA1',
    'unknown-privacy': 'MustNotAppearEither#NA1', 'friend-hidden-in-game': 'KnownFriend#NA1'
  });
  assert.equal(roster[0].name, 'You');
  assert.equal(roster[0].level, 271);
  assert.equal(roster[0].levelHidden, false);
  assert.equal(roster[1].name, 'VisibleName#NA1');
  assert.equal(roster[2].name, 'MyPartyFriend#NA1');
  assert.equal(roster[2].partyMember, true);
  assert.equal(roster[2].inspectable, true);
  assert.equal(roster[0].inspectable, true);
  assert.equal(roster[1].inspectable, true);
  assert.equal(roster[3].inspectable, false);
  assert.equal(roster[3].level, 144);
  assert.equal(roster[4].level, 55);
  assert.equal(roster[4].levelHidden, false);
  assert.equal(roster[4].inspectable, false);
  assert.equal(roster[3].name, '');
  assert.equal(roster[4].name, '');
  assert.equal(roster[5].name, '');
  assert.equal(roster[6].name, 'KnownFriend#NA1');
  assert.equal(roster[6].hidden, false);
  assert.equal(roster[6].friend, true);
  assert.equal(roster[6].side, 'enemy');
  assert.equal(roster[6].inspectable, true);
  assert.equal(roster[3].rank, 'Ascendant 1');
  assert.equal(roster[3].peakRank, 'Immortal 1');
  assert.equal(roster[3].peakEpisode, 'Episode 9');
  assert.equal(roster[3].peakAct, 'Act 2');
  assert.equal(roster[3].agent, 'Jett');
  assert.equal(JSON.stringify(roster).includes('MustNotAppear'), false);
  assert.equal(JSON.stringify(roster).includes('EnemyMustNotAppear'), false);
  assert.equal(JSON.stringify(roster).includes('unknown-privacy'), false);
});

test('live account levels support Riot identity variants regardless of the display preference', () => {
  assert.deepEqual(liveAccountLevel({ PlayerIdentity: { AccountLevel: 271 } }), { level: 271, hidden: false });
  assert.deepEqual(liveAccountLevel({ playerIdentity: { accountLevel: 88 } }), { level: 88, hidden: false });
  assert.deepEqual(liveAccountLevel({ AccountLevel: 42 }), { level: 42, hidden: false });
  assert.deepEqual(liveAccountLevel({ BYAKUGANAccountLevel: 144 }), { level: 144, hidden: false });
  assert.deepEqual(liveAccountLevel({ PlayerIdentity: { AccountLevel: 9001, HideAccountLevel: true } }), { level: 9001, hidden: false });
  assert.deepEqual(liveAccountLevel({ BYAKUGANAccountLevel: 55, BYAKUGANLevelHidden: true }), { level: 55, hidden: false });
  assert.deepEqual(liveAccountLevel({ PlayerIdentity: {} }), { level: null, hidden: false });
});

test('missing live levels use cached Riot account XP regardless of the display preference', async () => {
  const service = new RiotClientService();
  service.identity = { puuid: 'self' };
  service.region = { region: 'na', shard: 'na' };
  const calls = [];
  service.remoteRequest = async (url) => {
    calls.push(url);
    const subject = url.split('/').at(-1);
    return { data: { Progress: { Level: subject === 'self' ? 271 : 144 } } };
  };
  const players = [
    { Subject: 'self', PlayerIdentity: { HideAccountLevel: true } },
    { Subject: 'enemy', PlayerIdentity: {} },
    { Subject: 'embedded', PlayerIdentity: { AccountLevel: 88 } },
    { Subject: 'party-hidden', BYAKUGANPartyMember: true, PlayerIdentity: { HideAccountLevel: true } },
    { Subject: 'hidden', PlayerIdentity: { AccountLevel: 55, HideAccountLevel: true } },
    { Subject: 'hidden-missing', PlayerIdentity: { HideAccountLevel: true } }
  ];

  const hydrated = await service.hydrateRosterLevels(players);
  assert.equal(hydrated[0].BYAKUGANAccountLevel, 271);
  assert.equal(hydrated[1].BYAKUGANAccountLevel, 144);
  assert.equal(hydrated[2].BYAKUGANAccountLevel, 88);
  assert.equal(hydrated[3].BYAKUGANAccountLevel, 144);
  assert.equal(hydrated[3].BYAKUGANLevelHidden, false);
  assert.equal(hydrated[4].BYAKUGANAccountLevel, 55);
  assert.equal(hydrated[4].BYAKUGANLevelHidden, false);
  assert.equal(hydrated[5].BYAKUGANAccountLevel, 144);
  assert.equal(hydrated[5].BYAKUGANLevelHidden, false);
  assert.equal(calls.length, 4);

  await service.hydrateRosterLevels(players);
  assert.equal(calls.length, 4);
});

test('pregame roster excludes every opponent until the core game begins', () => {
  const players = [
    { Subject: 'self', TeamID: 'Blue' },
    { Subject: 'ally', TeamID: 'Blue' },
    { Subject: 'enemy', TeamID: 'Red' },
    { Subject: 'enemy-friend', TeamID: 'Red', BYAKUGANFriend: true },
    { Subject: 'party-without-team', BYAKUGANPartyMember: true }
  ];
  assert.deepEqual(
    filterPregameRoster(players, 'self').map((player) => player.Subject),
    ['self', 'ally', 'party-without-team']
  );
});

test('opponent rank hydration requires the active core-game opt-in', () => {
  const ally = { Subject: 'ally', TeamID: 'Blue' };
  const enemy = { Subject: 'enemy', TeamID: 'Red' };
  const enemyFriend = { Subject: 'enemy-friend', TeamID: 'Red', BYAKUGANFriend: true };
  assert.equal(shouldHydrateRosterTier(ally, 'Blue', false), true);
  assert.equal(shouldHydrateRosterTier(enemyFriend, 'Blue', false), true);
  assert.equal(shouldHydrateRosterTier(enemy, 'Blue', false), false);
  assert.equal(shouldHydrateRosterTier(enemy, 'Blue', true), true);
});

test('active core-game hydration resolves a missing enemy tier', async () => {
  const service = Object.create(RiotClientService.prototype);
  service.identity = { puuid: 'self' };
  service.fetchActiveSeasonId = async () => 'current-act';
  const calls = [];
  service.fetchRosterRankSummary = async (player) => {
    calls.push(player.Subject);
    return {
      tier: player.Subject === 'enemy' ? 21 : 20,
      peakRank: player.Subject === 'enemy' ? 'Immortal 1' : 'Ascendant 1',
      peakRankImage: '', peakEpisode: 'Episode 9', peakAct: 'Act 2'
    };
  };
  const players = [
    { Subject: 'self', TeamID: 'Blue', CompetitiveTier: 20 },
    { Subject: 'enemy', TeamID: 'Red', CompetitiveTier: 0 }
  ];

  const pregame = await service.hydrateRosterTiers(players);
  assert.equal(pregame[1].CompetitiveTier, 0);
  assert.equal(calls.includes('enemy'), false);

  calls.length = 0;
  const active = await service.hydrateRosterTiers(players, { allowOpponentRanks: true });
  assert.equal(active[1].CompetitiveTier, 21);
  assert.equal(active[1].BYAKUGANPeakRank, 'Immortal 1');
  assert.equal(calls.includes('enemy'), true);
});

test('historical roster keeps incognito identities hidden and includes match performance', () => {
  const detail = {
    Players: [
      { Subject: 'self', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: false }, PlayerStats: { Kills: 20, Deaths: 10, Assists: 5, Score: 4000 } },
      { Subject: 'visible-enemy', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: false }, PlayerStats: { Kills: 12, Deaths: 14, Assists: 3, Score: 2600 } },
      { Subject: 'hidden-enemy', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: true }, PlayerStats: { Kills: 8, Deaths: 16, Assists: 2, Score: 1800 } },
      { Subject: 'hidden-friend', TeamID: 'Red', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerIdentity: { Incognito: true }, BYAKUGANFriend: true, PlayerStats: { Kills: 10, Deaths: 12, Assists: 4, Score: 2200 } }
    ],
    RoundResults: Array.from({ length: 20 }, () => ({}))
  };
  const roster = normalizeHistoricalRoster(detail, 'self', metadata(), { 'visible-enemy': 'Visible#NA1', 'hidden-enemy': 'MustNotAppear#NA1', 'hidden-friend': 'KnownFriend#NA1' });
  assert.equal(roster[0].acs, 200);
  assert.equal(roster[1].name, 'Visible#NA1');
  assert.equal(roster[1].inspectable, true);
  assert.equal(roster[2].name, '');
  assert.equal(roster[2].inspectable, false);
  assert.equal(roster[3].name, 'KnownFriend#NA1');
  assert.equal(roster[3].hidden, false);
  assert.equal(roster[3].inspectable, true);
  assert.equal(JSON.stringify(roster).includes('MustNotAppear'), false);
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

test('persists completed act stats and restores them for the same account and act', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-act-cache-'));
  try {
    const first = new RiotClientService({ cacheDirectory: directory });
    first.identity = { puuid: 'self' };
    first.persistActStats({
      seasonId: 'current-act', newestMatchId: 'match-1',
      data: { complete: true, stats: { games: 1, wins: 1, losses: 0, kd: 2 }, matches: [{ id: 'match-1', result: 'VICTORY' }] }
    });

    const restored = new RiotClientService({ cacheDirectory: directory });
    restored.identity = { puuid: 'self' };
    const cache = restored.loadPersistedActStats('current-act');
    assert.equal(cache.newestMatchId, 'match-1');
    assert.equal(cache.data.stats.games, 1);
    assert.equal(cache.data.matches[0].result, 'VICTORY');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('hydrates only newly played matches when a complete act cache already exists', async () => {
  const service = new RiotClientService();
  service.identity = { puuid: 'self' };
  service.metadata = metadata();
  service.actStatsCache = {
    seasonId: 'current-act', newestMatchId: 'old-match', expiresAt: Number.MAX_SAFE_INTEGER,
    data: {
      complete: true,
      stats: { games: 1, wins: 1, losses: 0, kd: 1.5, headshot: 20 },
      matches: [{
        id: 'old-match', result: 'VICTORY', queueId: 'competitive', isCompetitive: true,
        kills: 15, deaths: 10, shots: { headshots: 2, bodyshots: 7, legshots: 1 }, competitiveTier: 21
      }]
    }
  };
  const requested = [];
  service.fetchMatchDetail = async (matchId) => {
    requested.push(matchId);
    return {
      MatchInfo: { MatchID: matchId, QueueID: 'competitive', MapID: '/Game/Maps/Ascent/Ascent' },
      Players: [{ Subject: 'self', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerStats: { Kills: 20, Deaths: 10, Assists: 4 } }],
      Teams: [{ TeamID: 'Blue', Won: true, RoundsWon: 13 }, { TeamID: 'Red', Won: false, RoundsWon: 8 }]
    };
  };
  const result = await service.fetchActStats({ Matches: [
    { MatchID: 'new-match', SeasonID: 'current-act', RankedRatingEarned: 18 },
    { MatchID: 'old-match', SeasonID: 'current-act', RankedRatingEarned: 15 }
  ] }, 'current-act');
  assert.deepEqual(requested, ['new-match']);
  assert.equal(result.complete, true);
  assert.equal(result.stats.games, 2);
  assert.deepEqual(result.matches.map((match) => match.id), ['new-match', 'old-match']);
});

test('resumes an interrupted act scan without reloading completed cached matches', async () => {
  const service = new RiotClientService();
  service.identity = { puuid: 'self' };
  service.metadata = metadata();
  service.actStatsCache = {
    seasonId: 'current-act', newestMatchId: 'new-match', expiresAt: 0,
    data: {
      complete: false, progress: { loaded: 1, total: 2 }, stats: {}, observedProfiles: {},
      matches: [{
        id: 'old-match', result: 'VICTORY', queueId: 'competitive', isCompetitive: true,
        kills: 15, deaths: 10, shots: { headshots: 2, bodyshots: 7, legshots: 1 }, competitiveTier: 21
      }]
    }
  };
  const requested = [];
  const progress = [];
  service.on('act-progress', (event) => progress.push(event));
  service.fetchMatchDetail = async (matchId) => {
    requested.push(matchId);
    return {
      MatchInfo: { MatchID: matchId, QueueID: 'competitive', MapID: '/Game/Maps/Ascent/Ascent' },
      Players: [{ Subject: 'self', TeamID: 'Blue', CharacterID: 'agent-jett', CompetitiveTier: 21, PlayerStats: { Kills: 20, Deaths: 10, Assists: 4 } }],
      Teams: [{ TeamID: 'Blue', Won: true, RoundsWon: 13 }, { TeamID: 'Red', Won: false, RoundsWon: 8 }]
    };
  };

  const result = await service.fetchActStats({ Matches: [
    { MatchID: 'new-match', SeasonID: 'current-act', RankedRatingEarned: 18 },
    { MatchID: 'old-match', SeasonID: 'current-act', RankedRatingEarned: 15 },
    { MatchID: 'previous-match', SeasonID: 'old-act', RankedRatingEarned: 12 }
  ] }, 'current-act');
  assert.deepEqual(requested, ['new-match']);
  assert.equal(result.complete, true);
  assert.equal(result.stats.games, 2);
  assert.equal(progress.some((event) => event.loaded === 2 && event.total === 2), true);
});

test('discovers current-act matches from history when rating pagination stops at 20', async () => {
  const service = new RiotClientService();
  service.identity = { puuid: 'self' };
  service.metadata = metadata();
  service.metadata.seasons = new Map();
  service.metadata.seasons.set('current-act', { startTime: '2026-08-01T00:00:00Z' });
  const requests = [];
  service.safeRemote = async (endpoint) => {
    requests.push(endpoint);
    if (endpoint.includes('startIndex=0')) return { History: [
      { MatchID: 'newest', GameStartTime: Date.parse('2026-08-20T00:00:00Z') },
      { MatchID: 'older', GameStartTime: Date.parse('2026-08-05T00:00:00Z') }
    ] };
    return { History: [{ MatchID: 'previous-act', GameStartTime: Date.parse('2026-07-31T23:00:00Z') }] };
  };

  const result = await service.fetchCurrentActHistory('current-act');
  assert.equal(result.complete, true);
  assert.deepEqual(result.rows.map((row) => row.MatchID), ['newest', 'older']);
  assert.equal(requests.length, 2);
  assert.match(requests[0], /startIndex=0&endIndex=20/);
  assert.match(requests[1], /startIndex=2/);
});

test('advances current-act history in Riot-compatible 20-record pages', async () => {
  const service = new RiotClientService();
  service.identity = { puuid: 'self' };
  service.metadata = metadata();
  service.metadata.seasons = new Map([['current-act', { startTime: '2026-08-01T00:00:00Z' }]]);
  const requests = [];
  service.safeRemote = async (endpoint) => {
    requests.push(endpoint);
    if (endpoint.includes('startIndex=0')) return { History: Array.from({ length: 20 }, (_, index) => ({
      MatchID: `current-${index}`,
      GameStartTime: Date.parse('2026-08-20T00:00:00Z') - index * 60_000
    })) };
    return { History: [
      { MatchID: 'current-20', GameStartTime: Date.parse('2026-08-05T00:00:00Z') },
      { MatchID: 'previous-act', GameStartTime: Date.parse('2026-07-31T23:00:00Z') }
    ] };
  };

  const result = await service.fetchCurrentActHistory('current-act');
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 21);
  assert.equal(requests.length, 2);
  assert.match(requests[1], /startIndex=20&endIndex=40/);
});

test('player inspection falls back to observed shared matches when Riot history is private', async () => {
  const service = new RiotClientService();
  service.identity = { puuid: 'self', gameName: 'Self', tagLine: 'NA1' };
  service.metadata = metadata();
  service.inspectablePlayers.set('player-friend', { puuid: 'friend', name: 'Friend#NA1', isSelf: false });
  service.actStatsCache = {
    seasonId: 'current-act', newestMatchId: 'shared-match', expiresAt: Number.MAX_SAFE_INTEGER,
    data: {
      complete: true, stats: {}, matches: [],
      observedProfiles: {
        friend: [{
          id: 'shared-match', result: 'VICTORY', isCompetitive: true, kills: 18, deaths: 9,
          competitiveTier: 21, shots: { headshots: 4, bodyshots: 10, legshots: 2 }, startedAt: 100
        }]
      }
    }
  };
  service.fetchActiveSeasonId = async () => 'current-act';
  service.safeRemote = async (endpoint) => endpoint === '/mmr/v1/players/friend'
    ? { QueueSkills: { competitive: { SeasonalInfoBySeasonID: {
      'current-act': { CompetitiveTier: 21, RankedRating: 44, NumberOfWins: 12 },
      'old-act': { CompetitiveTier: 24 }
    } } } }
    : null;

  const profile = await service.inspectPlayer('player-friend');
  assert.equal(profile.rank, 'Ascendant 1');
  assert.equal(profile.rr, 44);
  assert.equal(profile.stats.source, 'observed');
  assert.equal(profile.stats.games, 1);
  assert.equal(profile.stats.wins, 1);
  assert.equal(profile.stats.kd, 2);
  assert.equal(profile.stats.actWins, 12);
  assert.match(profile.stats.scope, /OBSERVED SHARED/);
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
