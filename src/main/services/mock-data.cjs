'use strict';

const { buildActAnalytics } = require('./analytics.cjs');

const now = Date.now();
const agents = {
  Omen: { role: 'Controller', color: '#7669d9' }, Jett: { role: 'Duelist', color: '#8fd7ff' },
  Sova: { role: 'Initiator', color: '#63a8e8' }, Cypher: { role: 'Sentinel', color: '#d6c98e' },
  Viper: { role: 'Controller', color: '#72db73' }, Clove: { role: 'Controller', color: '#db84d9' }
};

function demoReport(seed, won) {
  const rounds = Array.from({ length: won ? 21 : 23 }, (_, index) => {
    const kills = (index + seed) % 7 === 0 ? 2 : (index * seed) % 5 === 0 ? 1 : 0;
    const deaths = kills ? 0 : (index + seed) % 3 === 0 ? 1 : 0;
    return { round: index + 1, result: (index + seed) % 2 ? 'WIN' : 'LOSS', kills, deaths, damage: kills * 130 + (deaths ? 42 : 78), opening: index % 9 === 0 ? (kills ? 'KILL' : 'DEATH') : '' };
  });
  return {
    rounds,
    openingKills: rounds.filter((round) => round.opening === 'KILL').length,
    openingDeaths: rounds.filter((round) => round.opening === 'DEATH').length,
    multikillRounds: rounds.filter((round) => round.kills >= 2).length,
    bestRound: rounds.slice().sort((a, b) => b.kills - a.kills || b.damage - a.damage)[0],
    worstRound: rounds.find((round) => round.deaths && !round.kills)
  };
}

function demoMatch(id, hoursAgo, result, map, agent, score, kills, deaths, assists, rr, tierAfter, rrAfter, teammates = [], server = 'Virginia') {
  const agentMeta = agents[agent] || { role: 'Agent', color: '#8b6cff' };
  const headshots = Math.max(4, Math.round(kills * .72));
  return {
    id, result, map, mapImage: '', server, serverId: `demo-${server.toLowerCase().replaceAll(' ', '-')}`, serverRegion: 'North America', score, agent, agentImage: '', agentRole: agentMeta.role, agentColor: agentMeta.color,
    kills, deaths, assists, kd: Number((kills / Math.max(1, deaths)).toFixed(2)), rr,
    competitiveTier: tierAfter, tierAfter, rrAfter, rankName: tierAfter >= 24 ? 'Immortal 1' : tierAfter >= 22 ? 'Ascendant 2' : tierAfter >= 21 ? 'Ascendant 1' : 'Diamond 3', rankImage: '',
    startedAt: now - hoursAgo * 60 * 60_000, ago: hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`,
    shots: { headshots, bodyshots: kills * 2, legshots: Math.round(kills * .2) }, teammateIds: teammates,
    report: demoReport(Number(id.replace(/\D/g, '')) || 1, result === 'VICTORY')
  };
}

const friends = [
  { id: 'f1', name: 'PixelPilot', tag: 'NA1', status: 'In Competitive', state: 'ingame', rank: 'Diamond 3' },
  { id: 'f2', name: 'EchoBloom', tag: 'WAVE', status: 'Agent Select', state: 'pregame', rank: 'Ascendant 1' },
  { id: 'f3', name: 'MangoByte', tag: 'GG', status: 'Available', state: 'online', rank: 'Platinum 3' },
  { id: 'f4', name: 'NightCircuit', tag: '404', status: 'Away', state: 'away', rank: 'Immortal 1' },
  { id: 'f5', name: 'QuietStorm', tag: 'QST', status: 'Offline', state: 'offline', rank: 'Diamond 1' }
];

const matches = [
  demoMatch('m1', .5, 'VICTORY', 'Lotus', 'Omen', '13 – 8', 24, 14, 8, 19, 22, 72, ['f1', 'f2']),
  demoMatch('m2', 2, 'DEFEAT', 'Haven', 'Jett', '10 – 13', 18, 19, 4, -16, 22, 53, ['f1'], 'Illinois'),
  demoMatch('m3', 5, 'VICTORY', 'Bind', 'Sova', '13 – 5', 17, 9, 13, 22, 22, 69, ['f2', 'f3']),
  demoMatch('m4', 22, 'VICTORY', 'Sunset', 'Cypher', '14 – 12', 20, 17, 10, 17, 22, 47, ['f3']),
  demoMatch('m5', 30, 'DEFEAT', 'Icebox', 'Viper', '7 – 13', 12, 18, 7, -18, 22, 30, ['f1'], 'Illinois'),
  demoMatch('m6', 48, 'VICTORY', 'Lotus', 'Omen', '13 – 10', 21, 16, 11, 18, 21, 91, ['f1', 'f2']),
  demoMatch('m7', 54, 'VICTORY', 'Haven', 'Jett', '13 – 11', 26, 19, 5, 20, 21, 73, ['f1']),
  demoMatch('m8', 75, 'DEFEAT', 'Bind', 'Sova', '8 – 13', 14, 17, 9, -17, 21, 53, ['f2']),
  demoMatch('m9', 96, 'VICTORY', 'Lotus', 'Omen', '13 – 6', 19, 11, 12, 21, 21, 70, ['f3']),
  demoMatch('m10', 120, 'DEFEAT', 'Icebox', 'Clove', '11 – 13', 17, 20, 8, -15, 21, 49, [])
];

const analytics = buildActAnalytics(matches, {
  friends,
  session: { startedAt: now - 6 * 60 * 60_000, startingRank: 'Ascendant 1', startingRR: 47, currentRank: 'Ascendant 2', currentRR: 72 }
});

const snapshot = Object.freeze({
  connection: { mode: 'mock', status: 'connected', label: 'Demo data', region: 'NA', lastUpdated: new Date().toISOString() },
  profile: {
    gameName: 'Nova', tagLine: '0420', level: 187,
    rank: 'Ascendant 2', rankImage: '', rr: 72, peakRank: 'Immortal 1', peakRankImage: '', peakAct: 'Act 2', peakEpisode: 'Episode 8',
    wins: analytics.summary.wins, losses: analytics.summary.losses, kd: analytics.summary.kd, headshot: analytics.summary.headshot, statsScope: 'THIS ACT',
    card: { initials: 'NO', color: '#735cff' }
  },
  live: {
    state: 'PREGAME', queue: 'Competitive', map: 'Ascent', mapImage: '', partySize: 5, matchId: 'demo-match-9f31', elapsed: '00:42',
    rosterStatus: 'Opponent identities are withheld; only selected agents and ranks are shown.',
    players: [
      { id: 'p1', name: 'You', hidden: false, inspectable: true, isSelf: true, side: 'ally', agent: 'Omen', agentImage: '', agentColor: '#7669d9', rank: 'Ascendant 2', rankImage: '', rankColor: '#76d7cc', partyLabel: 'YOUR PARTY · DUO', partySize: 2, partyTone: 0, ownParty: true, locked: true },
      { id: 'p2', name: 'PixelPilot#NA1', hidden: false, inspectable: true, isSelf: false, side: 'ally', agent: 'Jett', agentImage: '', agentColor: '#8fd7ff', rank: 'Diamond 3', rankImage: '', rankColor: '#b7d8ef', partyLabel: 'YOUR PARTY · DUO', partySize: 2, partyTone: 0, ownParty: true, locked: true },
      { id: 'p3', name: '', hidden: true, inspectable: false, isSelf: false, side: 'enemy', agent: 'Sova', agentImage: '', agentColor: '#63a8e8', rank: 'Ascendant 1', rankImage: '', rankColor: '#76d7cc', locked: true },
      { id: 'p4', name: '', hidden: true, inspectable: false, isSelf: false, side: 'enemy', agent: 'Killjoy', agentImage: '', agentColor: '#f0d95b', rank: 'Platinum 3', rankImage: '', rankColor: '#69c9c8', locked: true },
      { id: 'p5', name: '', hidden: true, inspectable: false, isSelf: false, side: 'enemy', agent: 'Skye', agentImage: '', agentColor: '#72db73', rank: 'Diamond 1', rankImage: '', rankColor: '#b7d8ef', locked: true }
    ]
  },
  matches: matches.map(({ teammateIds: _teammateIds, ...match }) => match),
  friends,
  loadout: [
    { slot: 'Vandal', skin: 'Araxys Vandal', edition: 'Exclusive', color: '#d84b5f' },
    { slot: 'Phantom', skin: 'Recon Phantom', edition: 'Premium', color: '#63d7b3' },
    { slot: 'Operator', skin: 'Prelude to Chaos Operator', edition: 'Exclusive', color: '#7758ff' },
    { slot: 'Melee', skin: 'Kuronami no Yaiba', edition: 'Exclusive', color: '#4ab8ec' }
  ],
  agents: analytics.agents,
  analytics
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }

class MockService {
  async connect() {
    const data = clone(snapshot);
    data.connection.lastUpdated = new Date().toISOString();
    return data;
  }
  async refresh() { return this.connect(); }
  async inspectPlayer(playerId) {
    if (!['p1', 'p2'].includes(playerId)) throw new Error('This profile is private or unavailable.');
    const self = playerId === 'p1';
    return {
      id: playerId, gameName: self ? 'Nova' : 'PixelPilot', tagLine: self ? '0420' : 'NA1', isSelf: self,
      level: self ? 187 : 143, rank: self ? 'Ascendant 2' : 'Diamond 3', rankImage: '',
      peakRank: self ? 'Immortal 1' : 'Ascendant 1', peakRankImage: '', peakAct: self ? 'Act 2' : 'Act 3', peakEpisode: self ? 'Episode 8' : 'Episode 9',
      stats: { games: 36, wins: 21, losses: 15, kd: self ? 1.22 : 1.08, headshot: self ? 27.4 : 24.1, scope: 'CURRENT ACT' },
      loadout: self ? clone(snapshot.loadout) : [
        { slot: 'Vandal', skin: 'Prime Vandal', edition: 'Equipped', color: '#8b6cff' },
        { slot: 'Melee', skin: 'Reaver Karambit', edition: 'Equipped', color: '#ed5d7d' }
      ],
      privacy: 'Visible ally or party member. Opponent and incognito profiles are never inspected.'
    };
  }
  disconnect() {}
}

module.exports = { MockService, snapshot };
