'use strict';

const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readLockfile, getLockfilePath, canReachPort } = require('./riot-lockfile.cjs');
const { deriveRegion } = require('./region.cjs');
const { requestJson } = require('./http.cjs');
const { fetchMetadata, resolveById } = require('./valorant-metadata.cjs');
const { buildActAnalytics } = require('./analytics.cjs');

const CLIENT_PLATFORM = Buffer.from(JSON.stringify({
  platformType: 'PC',
  platformOS: 'Windows',
  platformOSVersion: '10.0.19045.1.256.64bit',
  platformChipset: 'Unknown'
})).toString('base64');

const REMOTE_HOST_PATTERNS = [
  /(^|\.)a\.pvp\.net$/i,
  /(^|\.)riotgames\.com$/i,
  /^valorant-api\.com$/i
];

function isAllowedRemoteHost(hostname) {
  return REMOTE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function decodeJwtPayload(token) {
  try {
    const encoded = token.split('.')[1];
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

const QUEUE_LABELS = new Map(Object.entries({
  competitive: 'Competitive', unrated: 'Unrated', swiftplay: 'Swiftplay',
  spikerush: 'Spike Rush', deathmatch: 'Deathmatch', hurm: 'Team Deathmatch',
  ggteam: 'Escalation', onefa: 'Replication', snowball: 'Snowball Fight',
  premier: 'Premier', custom: 'Custom Game', newmap: 'New Map',
  range: 'The Range', practice: 'The Range', shootingrange: 'The Range'
}));

const PRODUCT_LABELS = new Map(Object.entries({
  valorant: 'VALORANT', league_of_legends: 'League of Legends', league: 'League of Legends',
  lor: 'Legends of Runeterra', bacon: 'Legends of Runeterra', wildrift: 'Wild Rift',
  riot_client: 'Riot Client', keystone: 'Riot Client'
}));

function normalizeQueueName(queueId) {
  const key = String(queueId || '').trim().toLowerCase();
  if (!key) return 'Unknown Playlist';
  return QUEUE_LABELS.get(key) || key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function decodePresencePrivate(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return {};
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  const raw = (Buffer.isBuffer(value) ? value.toString('utf8') : String(value)).trim();
  if (!raw) return {};
  const candidates = [raw];
  try { candidates.push(Buffer.from(raw, 'base64').toString('utf8')); } catch {}
  if (raw.includes('%')) {
    try { candidates.push(decodeURIComponent(raw)); } catch {}
  }
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/^\uFEFF/, '').replace(/\u0000+$/g, '').trim();
    if (!cleaned) continue;
    try {
      const parsed = JSON.parse(cleaned);
      return typeof parsed === 'string' ? decodePresencePrivate(parsed, depth + 1) : parsed;
    } catch {}
  }
  return {};
}

function presenceSources(presence) {
  const privateValue = presence.private ?? presence.Private ?? presence.privateData ?? presence.private_data;
  const decoded = decodePresencePrivate(privateValue);
  const sources = [];
  const seen = new Set();
  const visit = (value, depth) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 4) return;
    seen.add(value);
    sources.push(value);
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) visit(nested, depth + 1);
    }
  };
  visit(decoded, 0);
  visit(presence, 0);
  return sources;
}

function pickPresenceValue(sources, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')));
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (wanted.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')) && value !== '' && value !== null && value !== undefined) {
        return value;
      }
    }
  }
  return undefined;
}

function productLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return PRODUCT_LABELS.get(key) || (key ? key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Riot Client');
}

function summarizePresence(presence) {
  const sources = presenceSources(presence);
  const presenceLoopState = pickPresenceValue(sources, [
    'sessionLoopState', 'partyOwnerSessionLoopState', 'loopState', 'sessionState', 'partyOwnerSessionState'
  ]);
  const resource = String(presence.resource || presence.Resource || '').toLowerCase();
  const inferredValorant = presenceLoopState || resource.includes('valorant') || resource.includes('ares');
  const productKey = String(
    presence.product || presence.Product || presence.productName || presence.product_name || (inferredValorant ? 'valorant' : '')
  ).toLowerCase();
  const game = productLabel(productKey);
  const rawState = String(presence.state || presence.availability || '').toLowerCase();
  // Riot emits stale mobile records for offline friends, especially for
  // League. The desktop client groups those people under Offline.
  const offline = ['offline', 'unavailable', 'mobile'].includes(rawState);
  const away = rawState === 'away';
  const base = {
    id: presence.puuid || presence.PUUID || presence.cid || presence.name || randomUUID(),
    puuid: presence.puuid || presence.PUUID || presence.cid || null,
    name: presence.game_name || presence.gameName || presence.name || 'Riot friend',
    tag: presence.game_tag || presence.gameTag || '',
    product: productKey || 'riot_client',
    game,
    playlist: '',
    score: '',
    rank: ''
  };
  if (offline) return { ...base, product: '', game: '', status: 'Offline', state: 'offline' };
  if (productKey !== 'valorant') {
    return {
      ...base,
      status: game === 'Riot Client' ? 'Online in Riot Client' : `Playing ${game}`,
      state: away ? 'away' : 'other'
    };
  }

  const queueId = pickPresenceValue(sources, [
    'queueId', 'queueID', 'queue', 'partyOwnerQueueId', 'partyOwnerQueueID'
  ]) || '';
  const provisioningFlow = String(pickPresenceValue(sources, [
    'provisioningFlow', 'partyOwnerProvisioningFlow', 'gameMode', 'mode'
  ]) || '').toLowerCase();
  let loopState = String(presenceLoopState || '').toUpperCase().replace(/[\s-]+/g, '_');
  const rawAlly = pickPresenceValue(sources, [
    'partyOwnerMatchScoreAllyTeam', 'matchScoreAllyTeam', 'allyTeamScore', 'allyScore', 'teamScore'
  ]);
  const rawEnemy = pickPresenceValue(sources, [
    'partyOwnerMatchScoreEnemyTeam', 'matchScoreEnemyTeam', 'enemyTeamScore', 'enemyScore', 'opponentScore'
  ]);
  const hasScoreFields = rawAlly !== undefined && rawEnemy !== undefined;
  if (!loopState && (hasScoreFields || provisioningFlow.includes('shootingrange') || provisioningFlow.includes('matchmaking'))) {
    loopState = 'INGAME';
  }
  const playlist = normalizeQueueName(queueId);
  const ally = rawAlly === '' || rawAlly === null || rawAlly === undefined ? NaN : Number(rawAlly);
  const enemy = rawEnemy === '' || rawEnemy === null || rawEnemy === undefined ? NaN : Number(rawEnemy);
  const score = Number.isFinite(ally) && Number.isFinite(enemy) ? `${ally}–${enemy}` : '';
  if (['INGAME', 'CORE_GAME'].includes(loopState)) {
    return { ...base, playlist, score, status: `VALORANT • ${playlist}${score ? ` • ${score}` : ' • Score unavailable'}`, state: 'ingame' };
  }
  if (loopState === 'PREGAME') {
    return { ...base, playlist, status: `VALORANT • Agent Select${queueId ? ` • ${playlist}` : ''}`, state: 'pregame' };
  }
  const knownMenus = ['MENUS', 'MENU', 'IDLE'].includes(loopState);
  return {
    ...base,
    status: away ? 'VALORANT • Away' : knownMenus ? 'VALORANT • In menus' : 'VALORANT • Online',
    state: away ? 'away' : 'online'
  };
}

function formatAgo(timestamp) {
  if (!timestamp) return 'Recent';
  const milliseconds = Number(timestamp) < 10_000_000_000 ? Number(timestamp) * 1000 : Number(timestamp);
  const elapsed = Math.max(0, Date.now() - milliseconds);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(milliseconds).toLocaleDateString();
}

const SERVER_ALIASES = new Map(Object.entries({
  ashburn: ['Virginia', 'North America'], iad: ['Virginia', 'North America'],
  chicago: ['Illinois', 'North America'], chi: ['Illinois', 'North America'],
  dallas: ['Texas', 'North America'], dfw: ['Texas', 'North America'],
  miami: ['Florida', 'North America'], mia: ['Florida', 'North America'],
  portland: ['Oregon', 'North America'], pdx: ['Oregon', 'North America'],
  sanjose: ['California', 'North America'], sjc: ['California', 'North America'],
  losangeles: ['California', 'North America'], lax: ['California', 'North America'],
  newyork: ['New York', 'North America'], nyc: ['New York', 'North America'],
  atlanta: ['Georgia', 'North America'], atl: ['Georgia', 'North America'],
  london: ['London', 'Europe'], lhr: ['London', 'Europe'],
  frankfurt: ['Frankfurt', 'Europe'], fra: ['Frankfurt', 'Europe'],
  paris: ['Paris', 'Europe'], cdg: ['Paris', 'Europe'],
  stockholm: ['Stockholm', 'Europe'], sto: ['Stockholm', 'Europe'],
  warsaw: ['Warsaw', 'Europe'], waw: ['Warsaw', 'Europe'],
  madrid: ['Madrid', 'Europe'], mad: ['Madrid', 'Europe'],
  tokyo: ['Tokyo', 'Asia Pacific'], nrt: ['Tokyo', 'Asia Pacific'],
  singapore: ['Singapore', 'Asia Pacific'], sin: ['Singapore', 'Asia Pacific'],
  sydney: ['Sydney', 'Asia Pacific'], syd: ['Sydney', 'Asia Pacific'],
  mumbai: ['Mumbai', 'Asia Pacific'], bom: ['Mumbai', 'Asia Pacific'],
  seoul: ['Seoul', 'Asia Pacific'], icn: ['Seoul', 'Asia Pacific'],
  saopaulo: ['São Paulo', 'Brazil'], gru: ['São Paulo', 'Brazil'],
  santiago: ['Santiago', 'Latin America'], scl: ['Santiago', 'Latin America'],
  mexico: ['Mexico City', 'Latin America'], mex: ['Mexico City', 'Latin America']
}));

function normalizeServer(gamePodId) {
  const raw = String(gamePodId || '').toLowerCase();
  if (!raw) return { id: '', name: 'Unknown server', region: '' };
  const compact = raw.replace(/[^a-z0-9]/g, '');
  for (const [alias, [name, region]] of SERVER_ALIASES) {
    if (compact.includes(alias)) return { id: raw, name, region };
  }
  const token = raw.split(/[-_.]/).filter(Boolean).findLast((part) => !/^\d+$/.test(part) && !['gp', 'aws', 'gcp', 'prod', 'riot', 'ares'].includes(part));
  const name = token ? token.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown server';
  return { id: raw, name, region: '' };
}

function findPlayer(detail, puuid) {
  return (detail?.Players || detail?.players || []).find((player) =>
    (player.Subject || player.subject || player.puuid) === puuid
  );
}

function analyzeRounds(detail, puuid, ownTeam) {
  const rounds = detail?.RoundResults || detail?.roundResults || [];
  let openingKills = 0;
  let openingDeaths = 0;
  const timeline = rounds.map((round, index) => {
    const playerRows = round.PlayerStats || round.playerStats || [];
    const mine = playerRows.find((entry) => (entry.Subject || entry.subject) === puuid) || {};
    const kills = mine.Kills || mine.kills || [];
    const damage = (mine.Damage || mine.damage || []).reduce((total, entry) => total + Number(entry.Damage ?? entry.damage ?? 0), 0);
    const allKills = playerRows.flatMap((entry) => (entry.Kills || entry.kills || []).map((kill) => ({
      killer: entry.Subject || entry.subject,
      victim: kill.Victim || kill.victim,
      time: Number(kill.TimeSinceRoundStartMillis ?? kill.timeSinceRoundStartMillis ?? Number.MAX_SAFE_INTEGER)
    }))).sort((a, b) => a.time - b.time);
    const first = allKills[0];
    const opening = first?.killer === puuid ? 'KILL' : first?.victim === puuid ? 'DEATH' : '';
    if (opening === 'KILL') openingKills += 1;
    if (opening === 'DEATH') openingDeaths += 1;
    const died = allKills.some((kill) => kill.victim === puuid);
    const winningTeam = round.WinningTeam || round.winningTeam || '';
    return {
      round: Number(round.RoundNum ?? round.roundNum ?? index) + 1,
      result: winningTeam ? (winningTeam === ownTeam ? 'WIN' : 'LOSS') : '—',
      kills: kills.length,
      deaths: died ? 1 : 0,
      damage,
      opening
    };
  });
  const bestRound = timeline.reduce((best, round) => !best || round.kills * 1000 + round.damage > best.kills * 1000 + best.damage ? round : best, null);
  const worstRound = timeline.find((round) => round.deaths && !round.kills) || timeline.find((round) => round.result === 'LOSS') || null;
  return {
    rounds: timeline,
    openingKills,
    openingDeaths,
    multikillRounds: timeline.filter((round) => round.kills >= 2).length,
    bestRound,
    worstRound
  };
}

function normalizeMatchDetail(detail, puuid, metadata, historyRow = {}, ratingUpdate = null) {
  const info = detail?.MatchInfo || detail?.matchInfo || {};
  const player = findPlayer(detail, puuid);
  if (!player) return null;

  const stats = player.PlayerStats || player.stats || {};
  const teamId = player.TeamID || player.teamId;
  const teams = detail?.Teams || detail?.teams || [];
  const ownTeam = teams.find((team) => (team.TeamID || team.teamId) === teamId) || {};
  const enemyTeam = teams.find((team) => (team.TeamID || team.teamId) !== teamId) || {};
  const won = Boolean(ownTeam.Won ?? ownTeam.won);
  const lost = Boolean(enemyTeam.Won ?? enemyTeam.won);
  const kills = Number(stats.Kills ?? stats.kills ?? 0);
  const deaths = Number(stats.Deaths ?? stats.deaths ?? 0);
  const assists = Number(stats.Assists ?? stats.assists ?? 0);
  const characterId = player.CharacterID || player.characterId;
  const mapId = info.MapID || info.mapId;
  const gamePodId = info.GamePodID || info.gamePodId || info.GamePodId || info.gamePod;
  const server = normalizeServer(gamePodId);
  const map = resolveById(metadata.maps, mapId, { name: 'Unknown map', image: '' });
  const agent = resolveById(metadata.agents, characterId, { name: 'Unknown agent', role: 'Agent', image: '', color: '#7b67f6' });
  const competitiveTier = Number(player.CompetitiveTier ?? player.competitiveTier ?? 0);
  const matchRank = metadata.tiers.get(competitiveTier) || { name: competitiveTier ? `Competitive tier ${competitiveTier}` : 'Unrated', image: '' };
  const queueId = String(info.QueueID || info.queueId || historyRow.QueueID || historyRow.queueId || (ratingUpdate ? 'competitive' : 'unknown')).toLowerCase();
  const playlist = normalizeQueueName(queueId);
  const isCompetitive = queueId === 'competitive';
  const hasRating = Boolean(isCompetitive && ratingUpdate);

  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;
  for (const round of detail?.RoundResults || detail?.roundResults || []) {
    const roundPlayer = (round.PlayerStats || round.playerStats || []).find((entry) =>
      (entry.Subject || entry.subject) === puuid
    );
    for (const damage of roundPlayer?.Damage || roundPlayer?.damage || []) {
      headshots += Number(damage.Headshots ?? damage.headshots ?? 0);
      bodyshots += Number(damage.Bodyshots ?? damage.bodyshots ?? 0);
      legshots += Number(damage.Legshots ?? damage.legshots ?? 0);
    }
  }

  const start = info.GameStartMillis || info.gameStartMillis || historyRow.GameStartTime || historyRow.gameStartTime;
  const rr = hasRating ? Number(ratingUpdate?.RankedRatingEarned ?? ratingUpdate?.rankedRatingEarned ?? 0) : null;
  const players = detail?.Players || detail?.players || [];
  const teammateIds = players
    .filter((entry) => (entry.TeamID || entry.teamId) === teamId
      && (entry.Subject || entry.subject || entry.puuid) !== puuid
      && !isPlayerNameHidden(entry, puuid))
    .map((entry) => entry.Subject || entry.subject || entry.puuid)
    .filter(Boolean);
  const report = analyzeRounds(detail, puuid, teamId);

  return {
    id: info.MatchID || info.matchId || historyRow.MatchID || historyRow.matchId,
    result: won ? 'VICTORY' : lost ? 'DEFEAT' : 'DRAW',
    queueId,
    playlist,
    isCompetitive,
    hasRating,
    map: map.name,
    mapImage: map.image,
    server: server.name,
    serverId: server.id,
    serverRegion: server.region,
    agent: agent.name,
    agentImage: agent.image,
    agentRole: agent.role,
    agentColor: agent.color,
    competitiveTier,
    rankName: matchRank.name,
    rankImage: matchRank.image || '',
    score: `${ownTeam.RoundsWon ?? ownTeam.roundsWon ?? 0} – ${enemyTeam.RoundsWon ?? enemyTeam.roundsWon ?? 0}`,
    kills, deaths, assists,
    kd: deaths ? Number((kills / deaths).toFixed(2)) : kills,
    rr,
    rrAfter: Number(ratingUpdate?.RankedRatingAfterUpdate ?? ratingUpdate?.rankedRatingAfterUpdate ?? 0),
    tierAfter: Number(ratingUpdate?.TierAfterUpdate ?? ratingUpdate?.tierAfterUpdate ?? competitiveTier),
    startedAt: Number(start) || 0,
    ago: formatAgo(start),
    shots: { headshots, bodyshots, legshots },
    teammateIds,
    report
  };
}

function normalizeMatchHistory(data) {
  const rows = data?.History || data?.history || [];
  return rows.map((row, index) => {
    const queueId = String(row.QueueID || row.queueId || 'unknown').toLowerCase();
    return {
      id: row.MatchID || row.matchId || `match-${index}`,
      result: 'MATCH', queueId, playlist: normalizeQueueName(queueId), isCompetitive: queueId === 'competitive', hasRating: false,
      map: 'Details unavailable', score: '—', agent: '—', kills: '—', deaths: '—', assists: '—', kd: '—', rr: null,
      ago: formatAgo(row.GameStartTime || row.gameStartTime)
    };
  });
}

function playerIdentity(player) {
  return player?.PlayerIdentity || player?.playerIdentity || player?.Identity || player?.identity || {};
}

function isKnownPartyMember(player) {
  return Boolean(player?.BYAKUGANPartyMember || player?.byakuganPartyMember || player?.PartyMember || player?.partyMember);
}

function isKnownFriend(player) {
  return Boolean(player?.BYAKUGANFriend || player?.byakuganFriend || player?.KnownFriend || player?.knownFriend);
}

function isPlayerNameHidden(player, ownPuuid) {
  const subject = player?.Subject || player?.subject || player?.puuid;
  if (subject === ownPuuid) return false;
  // A current party member is already explicitly known to the signed-in
  // player. Preserve that relationship even when Riot's in-match incognito
  // flag hides the same person from non-party participants.
  if (isKnownPartyMember(player) || isKnownFriend(player)) return false;
  const identity = playerIdentity(player);
  const privacyFlag = identity.Incognito ?? identity.incognito ?? identity.IsIncognito ?? identity.isIncognito;
  // Privacy-first: only resolve another player's name when Riot explicitly
  // says incognito mode is off. Missing/unknown flags remain hidden.
  return ![false, 0, 'false'].includes(privacyFlag);
}

function visiblePlayerIds(players, ownPuuid) {
  const ownPlayer = players.find((player) => (player.Subject || player.subject || player.puuid) === ownPuuid);
  const ownTeam = ownPlayer?.TeamID || ownPlayer?.teamId;
  return players
    .filter((player) => {
      const teamId = player.TeamID || player.teamId;
      return (!ownTeam || teamId === ownTeam || isKnownFriend(player)) && !isPlayerNameHidden(player, ownPuuid);
    })
    .map((player) => player.Subject || player.subject || player.puuid)
    .filter(Boolean);
}

function normalizeLivePlayers(players, ownPuuid, metadata, names = {}) {
  const ownPlayer = players.find((player) => (player.Subject || player.subject || player.puuid) === ownPuuid);
  const ownTeam = ownPlayer?.TeamID || ownPlayer?.teamId || 'Blue';

  return players.map((player, index) => {
    const subject = player.Subject || player.subject || player.puuid;
    const hidden = isPlayerNameHidden(player, ownPuuid);
    const isSelf = subject === ownPuuid;
    const teamId = player.TeamID || player.teamId || ownTeam;
    const isAlly = teamId === ownTeam;
    const friend = isKnownFriend(player);
    const canShowIdentity = isAlly || friend;
    const characterId = player.CharacterID || player.characterId;
    const tierNumber = Number(player.CompetitiveTier ?? player.competitiveTier ?? 0);
    const agent = resolveById(metadata.agents, characterId, {
      name: characterId ? 'Unknown agent' : 'Selecting…', role: 'Agent', image: '', color: '#7b67f6'
    });
    const tier = metadata.tiers.get(tierNumber) || {
      name: tierNumber ? `Competitive tier ${tierNumber}` : 'Unrated', image: '', color: '#60667b'
    };

    return {
      id: `player-${index}`,
      name: canShowIdentity ? (hidden ? 'Hidden Player' : isSelf ? 'You' : (names[subject] || 'Riot Player')) : '',
      hidden: canShowIdentity ? hidden : true,
      isSelf,
      side: isAlly ? 'ally' : 'enemy',
      inspectable: Boolean(canShowIdentity && !hidden),
      friend,
      partyMember: Boolean(isAlly && isKnownPartyMember(player)),
      teamId,
      agent: agent.name,
      agentImage: agent.image,
      agentColor: agent.color,
      rank: tier.name,
      rankImage: tier.image,
      rankColor: tier.color,
      locked: Boolean(player.CharacterSelectionState === 'locked' || player.characterSelectionState === 'locked')
    };
  });
}

function normalizeHistoricalRoster(detail, ownPuuid, metadata, names = {}) {
  const players = detail?.Players || detail?.players || [];
  const ownPlayer = players.find((player) => (player.Subject || player.subject || player.puuid) === ownPuuid);
  const ownTeam = ownPlayer?.TeamID || ownPlayer?.teamId;
  const roundCount = Math.max(1, (detail?.RoundResults || detail?.roundResults || []).length);
  return players.map((player) => {
    const subject = player.Subject || player.subject || player.puuid || '';
    const teamId = player.TeamID || player.teamId || '';
    const hidden = isPlayerNameHidden(player, ownPuuid);
    const isSelf = subject === ownPuuid;
    const characterId = player.CharacterID || player.characterId;
    const agent = resolveById(metadata.agents, characterId, {
      name: 'Unknown agent', role: 'Agent', image: '', color: '#7b67f6'
    });
    const tierNumber = Number(player.CompetitiveTier ?? player.competitiveTier ?? 0);
    const tier = metadata.tiers.get(tierNumber) || {
      name: tierNumber ? `Competitive tier ${tierNumber}` : 'Unranked', image: '', color: '#60667b'
    };
    const stats = player.PlayerStats || player.playerStats || player.stats || {};
    const kills = Number(stats.Kills ?? stats.kills ?? 0);
    const deaths = Number(stats.Deaths ?? stats.deaths ?? 0);
    const assists = Number(stats.Assists ?? stats.assists ?? 0);
    const score = Number(stats.Score ?? stats.score ?? 0);
    return {
      subject,
      name: hidden ? '' : isSelf ? 'You' : (names[subject] || 'Riot Player'),
      hidden,
      isSelf,
      side: ownTeam && teamId === ownTeam ? 'ally' : 'enemy',
      teamId,
      agent: agent.name,
      agentImage: agent.image,
      agentColor: agent.color,
      rank: tier.name,
      rankImage: tier.image || '',
      kills,
      deaths,
      assists,
      acs: score ? Math.round(score / roundCount) : 0,
      inspectable: Boolean(subject && !hidden)
    };
  });
}

function normalizeObservedProfileMatches(detail, ownPuuid, metadata) {
  const players = detail?.Players || detail?.players || [];
  const ownPlayer = players.find((player) => (player.Subject || player.subject || player.puuid) === ownPuuid);
  const ownTeam = ownPlayer?.TeamID || ownPlayer?.teamId;
  const observed = {};
  for (const player of players) {
    const subject = player.Subject || player.subject || player.puuid;
    const teamId = player.TeamID || player.teamId;
    if (!subject || subject === ownPuuid || (teamId !== ownTeam && !isKnownFriend(player)) || isPlayerNameHidden(player, ownPuuid)) continue;
    const match = normalizeMatchDetail(detail, subject, metadata);
    if (!match?.isCompetitive || !['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result)) continue;
    const { teammateIds: _teammateIds, report: _report, ...safeMatch } = match;
    (observed[subject] ||= []).push(safeMatch);
  }
  return observed;
}

function mergeObservedProfiles(...collections) {
  const merged = {};
  for (const collection of collections) {
    for (const [subject, matches] of Object.entries(collection || {})) {
      const rows = merged[subject] ||= [];
      const seen = new Set(rows.map((match) => match.id));
      for (const match of matches || []) {
        if (!match?.id || seen.has(match.id)) continue;
        seen.add(match.id);
        rows.push(match);
      }
      rows.sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
    }
  }
  return merged;
}

function buildActStatsData(matches, observedProfiles, complete, progress = {}) {
  const completedMatches = (matches || []).filter((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result));
  const loaded = Number(progress.loaded) || completedMatches.length;
  const total = Number(progress.total) || (matches || []).length;
  return {
    stats: {
      ...calculateStats(completedMatches),
      games: completedMatches.length,
      scope: complete ? 'ACT' : 'PARTIAL ACT'
    },
    matches: matches || [],
    observedProfiles: observedProfiles || {},
    progress: { loaded, total },
    complete
  };
}

function selectCompetitiveTier({ fallbackTier = 0, mmr = null, activeSeasonId = '', updates = null } = {}) {
  const direct = Number(fallbackTier) || 0;
  if (direct > 0) return direct;

  const seasonal = mmr?.QueueSkills?.competitive?.SeasonalInfoBySeasonID
    || mmr?.queueSkills?.competitive?.seasonalInfoBySeasonId
    || {};
  const current = seasonal[activeSeasonId];
  const currentTier = Number(current?.CompetitiveTier ?? current?.competitiveTier ?? 0);
  if (currentTier > 0) return currentTier;

  const latest = updates?.Matches?.[0] || updates?.matches?.[0];
  return Number(latest?.TierAfterUpdate ?? latest?.tierAfterUpdate ?? 0);
}

function updateMatchId(row) {
  return row?.MatchID || row?.matchId || '';
}

function updateSeasonId(row) {
  return row?.SeasonID || row?.SeasonId || row?.seasonID || row?.seasonId || '';
}

function ratingDelta(row) {
  return Number(row?.RankedRatingEarned ?? row?.rankedRatingEarned ?? 0);
}

function updateTimestamp(row) {
  return row?.MatchStartTime ?? row?.matchStartTime ?? row?.MatchStartTimeMillis
    ?? row?.matchStartTimeMillis ?? row?.Timestamp ?? row?.timestamp ?? '';
}

function competitiveUpdateKey(row) {
  if (!row) return '';
  return [updateMatchId(row), updateSeasonId(row), updateTimestamp(row), ratingDelta(row)].join(':');
}

function newestCompetitiveMatchId(rows) {
  return (rows || []).map(updateMatchId).find(Boolean) || '';
}

function timestampMillis(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDodgePenaltyUpdate(row) {
  if (ratingDelta(row) >= 0) return false;
  const reason = [
    row?.Reason, row?.reason, row?.PenaltyReason, row?.penaltyReason,
    row?.CompetitiveMovement, row?.competitiveMovement, row?.Type, row?.type
  ].filter(Boolean).join(' ').toLowerCase();
  if (reason.includes('dodge')) return true;
  if (reason.includes('afk')) return false;
  const matchId = String(updateMatchId(row) || '').replaceAll('-', '');
  return !matchId || /^0+$/.test(matchId);
}

function summarizeDodgePenalties(rows) {
  const penalties = (rows || []).filter(isDodgePenaltyUpdate);
  return {
    rrLost: penalties.reduce((total, row) => total + Math.abs(ratingDelta(row)), 0),
    count: penalties.length
  };
}

function selectCurrentActUpdates(rows, activeSeasonId) {
  const selected = [];
  let reachedPreviousAct = false;
  for (const row of rows || []) {
    const seasonId = updateSeasonId(row);
    if (activeSeasonId && seasonId && seasonId !== activeSeasonId) {
      reachedPreviousAct = true;
      break;
    }
    if (updateMatchId(row)) selected.push(row);
  }
  return { rows: selected, reachedPreviousAct };
}

function normalizeRatingUpdate(row, metadata) {
  const tierNumber = Number(row?.TierAfterUpdate ?? row?.tierAfterUpdate ?? 0);
  const tier = metadata?.tiers?.get(tierNumber) || { name: tierNumber ? `Competitive tier ${tierNumber}` : 'Unrated', image: '' };
  const rawStart = Number(row?.MatchStartTime ?? row?.matchStartTime ?? row?.MatchStartTimeMillis ?? row?.matchStartTimeMillis ?? 0);
  const startedAt = rawStart > 0 && rawStart < 10_000_000_000 ? rawStart * 1000 : rawStart;
  return {
    id: updateMatchId(row),
    result: 'RATING',
    queueId: 'competitive',
    playlist: 'Competitive',
    isCompetitive: true,
    hasRating: true,
    map: 'Competitive match',
    agent: 'Details loading',
    competitiveTier: tierNumber,
    tierAfter: tierNumber,
    rrAfter: Number(row?.RankedRatingAfterUpdate ?? row?.rankedRatingAfterUpdate ?? 0),
    rr: Number(row?.RankedRatingEarned ?? row?.rankedRatingEarned ?? 0),
    rankName: tier.name,
    rankImage: tier.image || '',
    startedAt
  };
}

function selectAllTimePeak(mmr, metadata = { tiers: new Map(), seasons: new Map() }) {
  const seasonal = mmr?.QueueSkills?.competitive?.SeasonalInfoBySeasonID
    || mmr?.queueSkills?.competitive?.seasonalInfoBySeasonId
    || {};
  let best = { tier: 0, seasonId: '' };
  for (const [seasonId, row] of Object.entries(seasonal)) {
    const winsByTier = row?.WinsByTier || row?.winsByTier || {};
    const wonTiers = Object.keys(winsByTier).map(Number).filter(Number.isFinite);
    const tier = Math.max(Number(row?.CompetitiveTier ?? row?.competitiveTier ?? 0), ...wonTiers, 0);
    if (tier > best.tier) best = { tier, seasonId };
  }
  const rank = metadata.tiers?.get(best.tier) || { name: best.tier ? `Competitive tier ${best.tier}` : 'Unrated', image: '' };
  const act = metadata.seasons?.get(String(best.seasonId).toLowerCase()) || {};
  const episode = metadata.seasons?.get(String(act.parentId || '').toLowerCase()) || {};
  return {
    tier: best.tier,
    rank: rank.name,
    image: rank.image || '',
    act: act.name || 'Act unavailable',
    episode: episode.name || ''
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

class RiotClientService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.lockfilePath = options.lockfilePath || getLockfilePath();
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.lockfile = null;
    this.tokens = null;
    this.identity = null;
    this.region = { region: 'na', shard: 'na' };
    this.clientVersion = options.clientVersion || '';
    this.pollTimer = null;
    this.lastSnapshot = null;
    this.metadata = null;
    this.diagnostics = [];
    this.nameCache = new Map();
    this.rankCache = new Map();
    this.matchDetailCache = new Map();
    this.actStatsCacheFile = options.cacheDirectory ? path.join(options.cacheDirectory, 'act-stats-cache.json') : '';
    this.actStatsDiskLoadedFor = '';
    this.actStatsProgress = { loaded: 0, total: 0 };
    this.actStatsCache = null;
    this.actStatsPromise = null;
    this.dodgeStatsCache = null;
    this.dodgeStatsPromise = null;
    this.inspectablePlayers = new Map();
    this.historicalPlayers = new Map();
    this.historicalPlayerIds = new Map();
    this.friendIds = new Set();
    this.activeSeason = { id: '', startTime: 0, expiresAt: 0 };
    this.session = { startedAt: Date.now(), startingRank: '', startingRR: 0, initialized: false };
  }

  localUrl(endpoint) {
    if (!this.lockfile) throw new Error('Riot Client is not connected.');
    return `${this.lockfile.protocol}://127.0.0.1:${this.lockfile.port}${endpoint}`;
  }

  async localRequest(endpoint, options = {}) {
    const auth = Buffer.from(`riot:${this.lockfile.password}`).toString('base64');
    return requestJson(this.localUrl(endpoint), {
      ...options,
      rejectUnauthorized: false,
      headers: { Authorization: `Basic ${auth}`, ...(options.headers || {}) }
    });
  }

  remoteHeaders() {
    if (!this.tokens) throw new Error('Riot tokens are unavailable.');
    return {
      Authorization: `Bearer ${this.tokens.accessToken}`,
      'X-Riot-Entitlements-JWT': this.tokens.entitlementToken,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'X-Riot-ClientVersion': this.clientVersion
    };
  }

  async remoteRequest(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !isAllowedRemoteHost(parsed.hostname)) {
      throw new Error(`Remote Riot host is not allowlisted: ${parsed.hostname}`);
    }
    return requestJson(parsed, {
      ...options,
      headers: { ...this.remoteHeaders(), ...(options.headers || {}) }
    });
  }

  async obtainTokens() {
    const response = await this.localRequest('/entitlements/v1/token');
    const accessToken = response.data?.accessToken;
    const entitlementToken = response.data?.token;
    if (!accessToken || !entitlementToken) throw new Error('Riot token response was incomplete.');
    const payload = decodeJwtPayload(accessToken);
    this.tokens = { accessToken, entitlementToken, puuid: payload.sub || null, expiresAt: payload.exp || 0 };
    return this.tokens;
  }

  async fetchClientVersion() {
    if (this.clientVersion) return this.clientVersion;
    try {
      const response = await requestJson('https://valorant-api.com/v1/version', { timeout: 5000 });
      this.clientVersion = response.data?.data?.riotClientVersion || '';
    } catch {
      this.clientVersion = '';
    }
    return this.clientVersion;
  }

  async bootstrapIdentityAndRegion() {
    const [identityResult, metadataResult, sessionsResult] = await Promise.allSettled([
      this.localRequest('/player-account/aliases/v1/display-name'),
      this.localRequest('/product-metadata/v2/region-locale'),
      this.localRequest('/product-session/v1/external-sessions')
    ]);

    const identity = identityResult.status === 'fulfilled' ? identityResult.value.data : {};
    this.identity = {
      puuid: this.tokens.puuid,
      gameName: identity?.gameName || 'VALORANT Player',
      tagLine: identity?.tagLine || ''
    };

    this.region = deriveRegion(
      metadataResult.status === 'fulfilled' ? metadataResult.value.data : {},
      sessionsResult.status === 'fulfilled' ? sessionsResult.value.data : {}
    );
  }

  pdUrl(endpoint) {
    return `https://pd.${this.region.shard}.a.pvp.net${endpoint}`;
  }

  glzUrl(endpoint) {
    return `https://glz-${this.region.region}-1.${this.region.shard}.a.pvp.net${endpoint}`;
  }

  sharedUrl(endpoint) {
    return `https://shared.${this.region.shard}.a.pvp.net${endpoint}`;
  }

  async safeRemote(endpoint, service = 'pd') {
    try {
      const url = service === 'glz' ? this.glzUrl(endpoint) : this.pdUrl(endpoint);
      return (await this.remoteRequest(url)).data;
    } catch (error) {
      this.diagnostics.push({
        service,
        endpoint: endpoint.replace(/[a-f0-9-]{30,}/gi, '{id}'),
        status: error.status || 0,
        message: error.message
      });
      return null;
    }
  }

  async fetchFriends() {
    try {
      const [friendsResponse, presencesResponse] = await Promise.all([
        this.localRequest('/chat/v4/friends'),
        this.localRequest('/chat/v4/presences')
      ]);
      const friends = friendsResponse.data?.friends || [];
      const presences = presencesResponse.data?.presences || [];
      const presenceById = new Map();
      for (const item of presences) {
        const id = item.puuid || item.PUUID || item.cid;
        if (!id) continue;
        const rows = presenceById.get(id) || [];
        rows.push(item);
        presenceById.set(id, rows);
      }
      const normalizedFriends = friends.slice(0, 80).map((friend) => {
        const id = friend.puuid || friend.PUUID || friend.cid || friend.id;
        const options = (presenceById.get(id) || []).map(summarizePresence);
        const presence = options.find((item) => item.state === 'ingame' || item.state === 'pregame')
          || options.find((item) => item.product !== 'valorant' && item.game !== 'Riot Client' && item.state !== 'offline')
          || options.find((item) => item.product === 'valorant' && item.state !== 'offline')
          || options.find((item) => item.state !== 'offline')
          || ((friend.is_online || friend.isOnline || ['online', 'away'].includes(String(friend.state || friend.availability || '').toLowerCase()))
            ? { status: 'Online in Riot Client', state: 'online', game: 'Riot Client', product: 'riot_client' }
            : null)
          || options[0]
          || {};
        return {
          id,
          name: friend.game_name || friend.gameName || friend.name || presence.name || 'Riot friend',
          tag: friend.game_tag || friend.gameTag || presence.tag || '',
          status: presence.status || 'Offline',
          state: presence.state || 'offline',
          game: presence.game || '',
          product: presence.product || '',
          playlist: presence.playlist || '',
          score: presence.score || '',
          rank: ''
        };
      });
      this.friendIds = new Set(friends.map((friend) => friend.puuid || friend.PUUID || friend.cid || friend.id).filter(Boolean));
      return normalizedFriends;
    } catch {
      this.friendIds.clear();
      return [];
    }
  }

  markKnownFriends(players) {
    return (players || []).map((player) => {
      const subject = player.Subject || player.subject || player.puuid;
      return subject && this.friendIds.has(subject) ? { ...player, BYAKUGANFriend: true } : player;
    });
  }

  markKnownFriendsInDetail(detail) {
    if (!detail) return detail;
    const players = detail.Players || detail.players || [];
    return players.length ? { ...detail, Players: this.markKnownFriends(players) } : detail;
  }

  async lookupVisibleNames(players) {
    const visible = new Set(visiblePlayerIds(players, this.identity.puuid));
    for (const player of players) {
      const subject = player.Subject || player.subject || player.puuid;
      if (subject && !visible.has(subject)) this.nameCache.delete(subject);
    }
    return this.lookupNames([...visible]);
  }

  async lookupNames(puuids) {
    const requested = [...new Set((puuids || []).filter(Boolean))];
    const missing = requested.filter((puuid) => !this.nameCache.has(puuid));
    if (!missing.length) return Object.fromEntries(requested.map((puuid) => [puuid, this.nameCache.get(puuid)]));
    try {
      const response = await this.localRequest('/player-account/lookup/v2/namesets-for-puuids', {
        method: 'POST',
        body: { puuids: missing }
      });
      for (const entry of response.data?.namesets || response.data?.Namesets || []) {
        const alias = entry.alias || entry.Alias || {};
        const puuid = entry.puuid || entry.PUUID || entry.subject;
        if (!puuid || !requested.includes(puuid) || !alias.gameName) continue;
        this.nameCache.set(puuid, alias.tagLine ? `${alias.gameName}#${alias.tagLine}` : alias.gameName);
      }
      return Object.fromEntries(requested.map((puuid) => [puuid, this.nameCache.get(puuid)]));
    } catch {
      return Object.fromEntries(requested.map((puuid) => [puuid, this.nameCache.get(puuid)]));
    }
  }

  rememberHistoricalPlayer(player) {
    if (!player?.subject || !player.inspectable) return '';
    let id = this.historicalPlayerIds.get(player.subject);
    if (!id) {
      id = `history-${randomUUID()}`;
      this.historicalPlayerIds.set(player.subject, id);
    }
    this.historicalPlayers.set(id, {
      puuid: player.subject,
      name: player.name || 'Riot Player',
      isSelf: player.isSelf
    });
    return id;
  }

  async fetchActiveSeasonId() {
    if (this.activeSeason.expiresAt > Date.now()) return this.activeSeason.id;
    let id = '';
    let startTime = 0;
    try {
      const response = await this.remoteRequest(this.sharedUrl('/content-service/v3/content'));
      const seasons = response.data?.Seasons || response.data?.seasons || [];
      const now = Date.now();
      const active = seasons.find((season) =>
        Boolean(season.IsActive ?? season.isActive)
        && String(season.Type || season.type || '').toLowerCase().includes('act')
      ) || seasons.find((season) => {
        const type = String(season.Type || season.type || '').toLowerCase();
        const start = Date.parse(season.StartTime || season.startTime || 0);
        const end = Date.parse(season.EndTime || season.endTime || 0);
        return type.includes('act') && start <= now && now < end;
      }) || seasons.find((season) => Boolean(season.IsActive ?? season.isActive));
      id = active?.ID || active?.id || '';
      startTime = timestampMillis(active?.StartTime || active?.startTime);
    } catch {}
    this.activeSeason = { id, startTime, expiresAt: Date.now() + (id ? 60 * 60_000 : 2 * 60_000) };
    return id;
  }

  async fetchRosterTier(player, activeSeasonId) {
    const subject = player.Subject || player.subject || player.puuid;
    const fallbackTier = Number(player.CompetitiveTier ?? player.competitiveTier ?? 0);
    if (fallbackTier > 0) return fallbackTier;
    if (!subject) return 0;

    const cached = this.rankCache.get(subject);
    if (cached?.expiresAt > Date.now()) return cached.tier;

    let mmr = null;
    let updates = null;
    let responded = false;
    let lastError = null;
    try {
      mmr = (await this.remoteRequest(this.pdUrl(`/mmr/v1/players/${subject}`))).data;
      responded = true;
    } catch (error) { lastError = error; }
    let tier = selectCompetitiveTier({ fallbackTier, mmr, activeSeasonId });

    if (!tier) {
      try {
        updates = (await this.remoteRequest(this.pdUrl(`/mmr/v1/players/${subject}/competitiveupdates?startIndex=0&endIndex=1&queue=competitive`))).data;
        responded = true;
      } catch (error) { lastError = error; }
      tier = selectCompetitiveTier({ fallbackTier, mmr, activeSeasonId, updates });
    }

    if (!responded) {
      this.diagnostics.push({
        service: 'pd', endpoint: '/mmr/v1/players/{roster-player}',
        status: lastError?.status || 0, message: lastError?.message || 'Roster rank lookup failed.'
      });
    }

    this.rankCache.set(subject, {
      tier,
      expiresAt: Date.now() + (tier ? 10 * 60_000 : 2 * 60_000)
    });
    return tier;
  }

  async hydrateRosterTiers(players) {
    if (!players.length) return players;
    const activeSeasonId = await this.fetchActiveSeasonId();
    const ownPlayer = players.find((player) => (player.Subject || player.subject || player.puuid) === this.identity.puuid);
    const ownTeam = ownPlayer?.TeamID || ownPlayer?.teamId;
    return mapWithConcurrency(players, 3, async (player) => ({
      ...player,
      // Never query an opponent's profile to fill a missing rank. If Riot
      // supplies a tier in the active roster we can display it; otherwise the
      // opponent stays Unrated/Unavailable.
      CompetitiveTier: ownTeam && (player.TeamID || player.teamId) !== ownTeam && !isKnownFriend(player)
        ? Number(player.CompetitiveTier ?? player.competitiveTier ?? 0)
        : await this.fetchRosterTier(player, activeSeasonId)
    }));
  }

  async fetchPartyPlayers(puuid) {
    const membership = await this.safeRemote(`/parties/v1/players/${puuid}`, 'glz');
    const partyId = membership?.CurrentPartyID || membership?.currentPartyId || membership?.PartyID || membership?.partyId;
    if (!partyId) return { id: '', players: [] };
    const party = await this.safeRemote(`/parties/v1/parties/${partyId}`, 'glz');
    const members = party?.Members || party?.members || [];
    return {
      id: partyId,
      players: members.map((member) => ({
        Subject: member.Subject || member.subject || member.PlayerIdentity?.Subject || member.playerIdentity?.subject,
        TeamID: 'Party',
        CompetitiveTier: member.CompetitiveTier ?? member.competitiveTier ?? 0,
        PlayerIdentity: member.PlayerIdentity || member.playerIdentity || { Incognito: true },
        BYAKUGANPartyMember: true,
        CharacterID: ''
      })).filter((member) => member.Subject)
    };
  }

  rememberInspectablePlayers(rawPlayers, roster, names) {
    this.inspectablePlayers.clear();
    roster.forEach((player, index) => {
      if (!player.inspectable) return;
      const raw = rawPlayers[index] || {};
      const puuid = raw.Subject || raw.subject || raw.puuid;
      if (!puuid) return;
      this.inspectablePlayers.set(player.id, {
        puuid,
        name: player.isSelf ? `${this.identity.gameName}${this.identity.tagLine ? `#${this.identity.tagLine}` : ''}` : names[puuid] || player.name,
        isSelf: player.isSelf
      });
    });
  }

  async fetchLiveState() {
    const puuid = this.identity.puuid;
    const session = await this.safeRemote(`/session/v1/sessions/${puuid}`, 'glz');
    if (!session) {
      this.inspectablePlayers.clear();
      return { state: 'MENUS', queue: 'Not queued', map: '—', partySize: 1, matchId: '', elapsed: '—', players: [] };
    }

    const loopState = String(session.loopState || session.LoopState || 'MENUS').toUpperCase();
    let match = null;
    let matchId = session.matchId || session.MatchID || session.gameId || session.GameID || '';

    if (loopState === 'PREGAME') {
      const player = await this.safeRemote(`/pregame/v1/players/${puuid}`, 'glz');
      matchId = player?.MatchID || player?.matchId || matchId;
      if (matchId) match = await this.safeRemote(`/pregame/v1/matches/${matchId}`, 'glz');
    } else if (['INGAME', 'CORE_GAME'].includes(loopState)) {
      const player = await this.safeRemote(`/core-game/v1/players/${puuid}`, 'glz');
      matchId = player?.MatchID || player?.matchId || matchId;
      if (matchId) match = await this.safeRemote(`/core-game/v1/matches/${matchId}`, 'glz');
    }

    const mapId = match?.MapID || match?.mapId || session.map || session.MapID;
    const map = resolveById(this.metadata?.maps || new Map(), mapId, { name: mapId ? 'Unknown map' : 'Detecting…' });
    let players = match?.Players || match?.players || match?.AllyTeam?.Players || match?.allyTeam?.players || [];
    const party = await this.fetchPartyPlayers(puuid);
    const partyId = party.id;
    const partyIds = new Set(party.players.map((player) => player.Subject));
    if (players.length && partyIds.size) {
      players = players.map((player) => ({
        ...player,
        BYAKUGANPartyMember: partyIds.has(player.Subject || player.subject || player.puuid)
      }));
    } else if (!players.length && loopState === 'MENUS') {
      players = party.players;
    }
    players = this.markKnownFriends(players);
    const [names, rankedPlayers] = await Promise.all([
      this.lookupVisibleNames(players),
      this.hydrateRosterTiers(players)
    ]);
    const roster = normalizeLivePlayers(rankedPlayers, puuid, this.metadata || { agents: new Map(), tiers: new Map() }, names);
    this.rememberInspectablePlayers(rankedPlayers, roster, names);
    const queueId = match?.MatchmakingData?.QueueID || match?.matchmakingData?.queueId || match?.QueueID || match?.queueId || session.queueId || session.QueueID || '';
    return {
      state: loopState,
      queue: normalizeQueueName(queueId || 'valorant'),
      queueId: String(queueId || '').toLowerCase(),
      map: map.name,
      mapImage: map.image || '',
      partySize: party.players.length || session.partySize || session.PartySize || 1,
      matchId: matchId || partyId,
      elapsed: 'Live',
      players: roster,
      rosterStatus: loopState === 'MENUS' && roster.length
        ? 'Party members and Riot friends can be inspected. Unknown private identities remain unavailable.'
        : loopState === 'PREGAME'
        ? 'Unknown opponents remain hidden during agent select. Riot friends stay visible.'
        : roster.length
          ? 'Roster supplied by the active Riot match session.'
          : 'Waiting for Riot to expose the active roster.'
    };
  }

  async fetchDetailedMatches(history, ratingUpdates, subject = this.identity.puuid, limit = 10) {
    const historyRows = history?.History || history?.history || [];
    const updateRows = ratingUpdates?.Matches || ratingUpdates?.matches || [];
    const updatesByMatch = new Map(updateRows.map((row) => [row.MatchID || row.matchId, row]));
    // Riot may withhold another player's history index while still exposing
    // their competitive updates and the details of matches visible to us.
    const sourceRows = historyRows.length ? historyRows : updateRows;
    const detailRows = await mapWithConcurrency(sourceRows.slice(0, limit), 5, async (row) => {
      const matchId = row.MatchID || row.matchId;
      if (!matchId) return null;
      const detail = this.markKnownFriendsInDetail(await this.fetchMatchDetail(matchId));
      return detail ? { detail, row, ratingUpdate: updatesByMatch.get(matchId) } : null;
    });
    const availableDetails = detailRows.filter(Boolean);
    const visibleSubjects = availableDetails.flatMap(({ detail }) => (detail?.Players || detail?.players || [])
      .filter((player) => !isPlayerNameHidden(player, subject))
      .map((player) => player.Subject || player.subject || player.puuid)
      .filter(Boolean));
    const names = await this.lookupNames(visibleSubjects);
    const normalized = availableDetails.map(({ detail, row, ratingUpdate }) => {
      const match = normalizeMatchDetail(detail, subject, this.metadata, row, ratingUpdate);
      if (!match) return null;
      const roster = normalizeHistoricalRoster(detail, subject, this.metadata, names).map((player) => {
        const profileId = this.rememberHistoricalPlayer(player);
        const { subject: _subject, ...publicPlayer } = player;
        return { ...publicPlayer, profileId };
      });
      return { ...match, roster };
    }).filter(Boolean);
    if (normalized.length) return normalized;
    if (historyRows.length) return normalizeMatchHistory(history);
    return updateRows.slice(0, limit).filter((row) => updateMatchId(row)).map((row) => normalizeRatingUpdate(row, this.metadata));
  }

  async fetchMatchDetail(matchId) {
    if (!matchId) return null;
    if (this.matchDetailCache.has(matchId)) return this.matchDetailCache.get(matchId);
    const pending = this.safeRemote(`/match-details/v1/matches/${matchId}`);
    this.matchDetailCache.set(matchId, pending);
    const detail = await pending;
    if (!detail) this.matchDetailCache.delete(matchId);
    return detail;
  }

  loadPersistedActStats(activeSeasonId) {
    const accountKey = `${this.identity?.puuid || ''}:${activeSeasonId || ''}`;
    if (!this.actStatsCacheFile || !this.identity?.puuid || !activeSeasonId || this.actStatsDiskLoadedFor === accountKey) {
      return this.actStatsCache;
    }
    this.actStatsDiskLoadedFor = accountKey;
    try {
      const cached = JSON.parse(fs.readFileSync(this.actStatsCacheFile, 'utf8'));
      const valid = cached?.schema === 5
        && cached.puuid === this.identity.puuid
        && cached.seasonId === activeSeasonId
        && typeof cached.newestMatchId === 'string'
        && typeof cached.data?.complete === 'boolean'
        && cached.data?.stats && Array.isArray(cached.data?.matches)
        && cached.data.matches.length <= 1000;
      if (valid) {
        this.actStatsCache = {
          seasonId: cached.seasonId,
          newestMatchId: cached.newestMatchId,
          data: cached.data,
          expiresAt: cached.data.complete ? Number.MAX_SAFE_INTEGER : 0
        };
        this.actStatsProgress = cached.data.progress || {
          loaded: cached.data.matches.filter((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result)).length,
          total: cached.data.matches.length
        };
      }
    } catch {}
    return this.actStatsCache;
  }

  persistActStats(cache) {
    if (!this.actStatsCacheFile || !this.identity?.puuid || !cache?.data) return;
    try {
      fs.mkdirSync(path.dirname(this.actStatsCacheFile), { recursive: true });
      const temporary = `${this.actStatsCacheFile}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({
        schema: 5,
        puuid: this.identity.puuid,
        seasonId: cache.seasonId,
        newestMatchId: cache.newestMatchId,
        savedAt: Date.now(),
        data: cache.data
      }), 'utf8');
      fs.renameSync(temporary, this.actStatsCacheFile);
    } catch {}
  }

  async fetchCurrentActHistory(activeSeasonId) {
    const season = this.metadata?.seasons?.get(String(activeSeasonId || '').toLowerCase()) || {};
    const actStart = timestampMillis(season.startTime) || Number(this.activeSeason.startTime) || 0;
    if (!this.identity?.puuid || !actStart) return { rows: [], complete: false };

    // Riot caps this endpoint at 20 records even when a much larger range is
    // requested. Walk it in supported 20-record pages so the scan can advance
    // beyond the first page and stop as soon as it reaches the act boundary.
    const pageSize = 20;
    const maximumMatches = 1000;
    const rows = [];
    const seen = new Set();
    let startIndex = 0;
    let complete = false;
    while (startIndex < maximumMatches) {
      const endIndex = Math.min(startIndex + pageSize, maximumMatches);
      const page = await this.safeRemote(`/match-history/v1/history/${this.identity.puuid}?startIndex=${startIndex}&endIndex=${endIndex}&queue=competitive`);
      if (!page) break;
      const pageRows = page?.History || page?.history || [];
      if (!pageRows.length) { complete = true; break; }
      let reachedActStart = false;
      let added = 0;
      for (const row of pageRows) {
        const startedAt = timestampMillis(row.GameStartTime ?? row.gameStartTime ?? row.MatchStartTime ?? row.matchStartTime);
        if (startedAt && startedAt < actStart) {
          reachedActStart = true;
          break;
        }
        const matchId = updateMatchId(row);
        if (!matchId || seen.has(matchId)) continue;
        seen.add(matchId);
        rows.push({ ...row, SeasonID: activeSeasonId, MatchStartTime: startedAt || updateTimestamp(row) });
        added += 1;
      }
      if (reachedActStart) { complete = true; break; }
      if (!added) break;
      startIndex += pageRows.length;
    }
    return { rows, complete };
  }

  async fetchActStats(initialUpdates, activeSeasonId) {
    if (!initialUpdates || !activeSeasonId) return null;
    const initialRows = initialUpdates?.Matches || initialUpdates?.matches || [];
    const newestMatchId = newestCompetitiveMatchId(initialRows);
    this.loadPersistedActStats(activeSeasonId);
    if (this.actStatsCache?.seasonId === activeSeasonId && this.actStatsCache?.data?.complete
      && (!newestMatchId || this.actStatsCache.newestMatchId === newestMatchId)
      && this.actStatsCache.expiresAt > Date.now()) {
      return this.actStatsCache.data;
    }

    const updates = [];
    const seen = new Set();
    const previousCache = this.actStatsCache?.seasonId === activeSeasonId
      ? this.actStatsCache
      : null;
    const cachedMatchesById = new Map((previousCache?.data?.matches || [])
      .filter((match) => match?.id && ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result))
      .map((match) => [match.id, match]));
    const cachedMatchIds = new Set(cachedMatchesById.keys());
    let reachedCachedData = false;
    let complete = false;
    const page = selectCurrentActUpdates(initialRows, activeSeasonId);
    const collectRows = (rows) => {
      for (const row of rows) {
        const matchId = updateMatchId(row);
        if (previousCache?.data?.complete && cachedMatchIds.has(matchId)) {
          reachedCachedData = true;
          break;
        }
        if (matchId && !seen.has(matchId)) { seen.add(matchId); updates.push(row); }
      }
    };
    collectRows(page.rows);

    // A completed cache makes the common post-match refresh cheap: fetch only
    // the new rows before the cached newest match. A first or interrupted scan
    // uses match history as the authoritative act index instead of waiting for
    // Riot's frequently capped 20-row rating feed.
    if (!reachedCachedData) {
      // Match history is the authoritative current-act index. Do not hold act
      // stats behind an oversized rating-history request that Riot commonly
      // caps or times out; the recent rating rows still enrich matches where
      // Riot supplied them.
      const historyIndex = await this.fetchCurrentActHistory(activeSeasonId);
      const ratingRows = page.rows;
      const ratingById = new Map(ratingRows.map((row) => [updateMatchId(row), row]));
      updates.length = 0;
      seen.clear();
      for (const row of historyIndex.rows) {
        const matchId = updateMatchId(row);
        if (!matchId || seen.has(matchId)) continue;
        seen.add(matchId);
        updates.push(ratingById.get(matchId) || row);
      }
      for (const row of ratingRows) {
        const matchId = updateMatchId(row);
        if (!matchId || seen.has(matchId)) continue;
        seen.add(matchId);
        updates.push(row);
      }
      complete = historyIndex.complete || page.reachedPreviousAct || initialRows.length < 20;
    } else {
      complete = true;
    }

    const hydrated = [];
    const batchSize = 40;
    const carriedMatches = reachedCachedData ? previousCache.data.matches : [];
    const totalMatches = updates.length + carriedMatches.length;
    this.actStatsProgress = { loaded: carriedMatches.length, total: totalMatches };
    this.emit('act-progress', { ...this.actStatsProgress, loading: true });

    for (let offset = 0; offset < updates.length; offset += batchSize) {
      const batch = updates.slice(offset, offset + batchSize);
      const batchResults = await mapWithConcurrency(batch, 20, async (row) => {
        const matchId = updateMatchId(row);
        const cachedMatch = cachedMatchesById.get(matchId);
        if (cachedMatch) return { match: cachedMatch, observedProfiles: {}, cached: true };
        const detail = this.markKnownFriendsInDetail(await this.fetchMatchDetail(matchId));
        return detail ? {
          match: normalizeMatchDetail(detail, this.identity.puuid, this.metadata, {}, row),
          observedProfiles: normalizeObservedProfileMatches(detail, this.identity.puuid, this.metadata),
          cached: false
        } : { match: null, observedProfiles: {}, cached: false };
      });
      hydrated.push(...batchResults);

      const processedMatches = hydrated.map((row, index) => row.match || normalizeRatingUpdate(updates[index], this.metadata));
      const processedIds = new Set(processedMatches.map((match) => match.id));
      const retainedMatches = (previousCache?.data?.matches || []).filter((match) =>
        ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result) && !processedIds.has(match.id)
      );
      const partialMatches = [...processedMatches, ...retainedMatches];
      const partialObserved = mergeObservedProfiles(
        previousCache?.data?.observedProfiles,
        ...hydrated.map((row) => row.observedProfiles)
      );
      const loaded = Math.min(totalMatches, carriedMatches.length + Math.min(offset + batch.length, updates.length));
      const partialData = buildActStatsData(partialMatches, partialObserved, false, { loaded, total: totalMatches });
      this.actStatsCache = {
        seasonId: activeSeasonId,
        newestMatchId,
        data: partialData,
        expiresAt: 0
      };
      this.actStatsProgress = { loaded, total: totalMatches };
      this.persistActStats(this.actStatsCache);
      this.emit('act-progress', { ...this.actStatsProgress, loading: true, stats: partialData.stats });
    }
    const details = hydrated.map((row) => row.match);
    const hydratedMatches = details.map((detail, index) => detail || normalizeRatingUpdate(updates[index], this.metadata));
    const matches = reachedCachedData
      ? [...hydratedMatches, ...previousCache.data.matches.filter((match) => !seen.has(match.id))]
      : hydratedMatches;
    const freshObservedProfiles = mergeObservedProfiles(...hydrated.map((row) => row.observedProfiles));
    const observedProfiles = mergeObservedProfiles(previousCache?.data?.observedProfiles, freshObservedProfiles);
    if (details.some((detail) => !detail) || (reachedCachedData && !previousCache.data.complete)) complete = false;
    const data = buildActStatsData(matches, observedProfiles, complete, { loaded: totalMatches, total: totalMatches });
    this.actStatsCache = {
      seasonId: activeSeasonId,
      newestMatchId,
      data,
      expiresAt: complete ? Number.MAX_SAFE_INTEGER : Date.now() + 2 * 60_000
    };
    this.persistActStats(this.actStatsCache);
    this.actStatsProgress = { loaded: totalMatches, total: totalMatches };
    this.emit('act-progress', { ...this.actStatsProgress, loading: !complete, stats: data.stats });
    return data;
  }

  async fetchDodgeStats(initialUpdates) {
    if (!initialUpdates) return null;
    const initialRows = initialUpdates?.Matches || initialUpdates?.matches || [];
    const newestUpdateKey = competitiveUpdateKey(initialRows[0]);
    if (this.dodgeStatsCache?.newestUpdateKey === newestUpdateKey && this.dodgeStatsCache.expiresAt > Date.now()) {
      return this.dodgeStatsCache.data;
    }

    const initialPageSize = 20;
    const pageSize = 50;
    const maximumUpdates = 1000;
    const penalties = initialRows.filter(isDodgePenaltyUpdate);
    let scanned = initialRows.length;
    let complete = initialRows.length < initialPageSize;
    let startIndex = initialRows.length;

    while (!complete && startIndex < maximumUpdates) {
      const endIndex = Math.min(startIndex + pageSize, maximumUpdates);
      const next = await this.safeRemote(`/mmr/v1/players/${this.identity.puuid}/competitiveupdates?startIndex=${startIndex}&endIndex=${endIndex}&queue=competitive`);
      if (!next) break;
      const nextRows = next?.Matches || next?.matches || [];
      penalties.push(...nextRows.filter(isDodgePenaltyUpdate));
      scanned += nextRows.length;
      if (nextRows.length < endIndex - startIndex) {
        complete = true;
        break;
      }
      startIndex = endIndex;
    }

    const summary = summarizeDodgePenalties(penalties);
    const data = {
      ...summary,
      scanned,
      complete,
      scope: complete ? 'TRACKED HISTORY' : `LAST ${scanned} UPDATES`
    };
    this.dodgeStatsCache = {
      newestUpdateKey,
      data,
      expiresAt: Date.now() + 30 * 60_000
    };
    return data;
  }

  startActStatsHydration(initialUpdates, activeSeasonId) {
    if (!initialUpdates || !activeSeasonId || this.actStatsPromise) return;
    this.actStatsPromise = this.fetchActStats(initialUpdates, activeSeasonId)
      .then(async () => {
        if (!this.lockfile) return;
        this.lastSnapshot = await this.buildSnapshot({ hydrateAct: false });
        this.emit('snapshot', this.lastSnapshot);
      })
      .catch((error) => this.emit('warning', `Full-act tracking: ${error.message}`))
      .finally(() => { this.actStatsPromise = null; });
  }

  startDodgeStatsHydration(initialUpdates) {
    if (!initialUpdates || this.dodgeStatsPromise) return;
    this.dodgeStatsPromise = this.fetchDodgeStats(initialUpdates)
      .then(async () => {
        if (!this.lockfile) return;
        this.lastSnapshot = await this.buildSnapshot({ hydrateAct: false, hydrateDodge: false });
        this.emit('snapshot', this.lastSnapshot);
      })
      .catch((error) => this.emit('warning', `Dodge history tracking: ${error.message}`))
      .finally(() => { this.dodgeStatsPromise = null; });
  }

  async buildSnapshot({ hydrateAct = true, hydrateDodge = true } = {}) {
    this.diagnostics = [];
    this.metadata = await fetchMetadata();
    const puuid = this.identity.puuid;
    const [xp, mmr, loadout, history, ratingUpdates, friends, activeSeasonId] = await Promise.all([
      this.safeRemote(`/account-xp/v1/players/${puuid}`),
      this.safeRemote(`/mmr/v1/players/${puuid}`),
      this.safeRemote(`/personalization/v2/players/${puuid}/playerloadout`),
      this.safeRemote(`/match-history/v1/history/${puuid}?startIndex=0&endIndex=10`),
      this.safeRemote(`/mmr/v1/players/${puuid}/competitiveupdates?startIndex=0&endIndex=20&queue=competitive`),
      this.fetchFriends(),
      this.fetchActiveSeasonId()
    ]);

    const [matches, live] = await Promise.all([
      this.fetchDetailedMatches(history, ratingUpdates),
      this.fetchLiveState()
    ]);

    const initialRows = ratingUpdates?.Matches || ratingUpdates?.matches || [];
    const newestMatchId = newestCompetitiveMatchId(initialRows);
    this.loadPersistedActStats(activeSeasonId);
    const actData = this.actStatsCache?.seasonId === activeSeasonId
      && (!newestMatchId || this.actStatsCache?.newestMatchId === newestMatchId)
      ? this.actStatsCache.data
      : null;
    if (!actData?.complete && hydrateAct) this.startActStatsHydration(ratingUpdates, activeSeasonId);
    const newestUpdateKey = competitiveUpdateKey(initialRows[0]);
    const cachedDodgeData = this.dodgeStatsCache?.newestUpdateKey === newestUpdateKey
      && this.dodgeStatsCache?.expiresAt > Date.now()
      ? this.dodgeStatsCache.data
      : null;
    const initialDodgeData = summarizeDodgePenalties(initialRows);
    const dodgeData = cachedDodgeData || {
      ...initialDodgeData,
      scope: 'LOADING HISTORY'
    };
    if (!cachedDodgeData && hydrateDodge) {
      if (this.actStatsPromise) this.actStatsPromise.finally(() => this.startDodgeStatsHydration(ratingUpdates));
      else this.startDodgeStatsHydration(ratingUpdates);
    }

    const tier = mmr?.QueueSkills?.competitive?.SeasonalInfoBySeasonID;
    const latestSeason = tier?.[activeSeasonId] || (tier ? Object.values(tier).at(-1) : null);
    const newestUpdate = ratingUpdates?.Matches?.[0] || ratingUpdates?.matches?.[0];
    const rankNumber = Number(newestUpdate?.TierAfterUpdate ?? newestUpdate?.tierAfterUpdate ?? latestSeason?.CompetitiveTier ?? 0);
    const rr = Number(newestUpdate?.RankedRatingAfterUpdate ?? newestUpdate?.rankedRatingAfterUpdate ?? latestSeason?.RankedRating ?? 0);
    const level = xp?.Progress?.Level || 0;
    const rank = this.metadata.tiers.get(rankNumber) || { name: rankNumber ? `Competitive tier ${rankNumber}` : 'Unrated', color: '#735cff' };
    const recentStats = calculateStats(matches.filter((match) => match.isCompetitive || match.queueId === 'competitive'));
    const stats = actData?.stats || { ...recentStats, scope: 'PARTIAL ACT' };
    const allTimePeak = selectAllTimePeak(mmr, this.metadata);
    if (!this.session.initialized) {
      this.session = { ...this.session, startingRank: rank.name, startingRR: rr, initialized: true };
    }
    const actMatches = actData?.matches || matches;
    const analytics = buildActAnalytics(actMatches, {
      tiers: this.metadata.tiers,
      friends,
      session: { ...this.session, currentRank: rank.name, currentRR: rr }
    });
    const publicMatches = matches.map(({ teammateIds: _teammateIds, ...match }) => match);
    const sharedMatchIds = new Set(analytics.synergy.flatMap((friend) => friend.matchIds || []));
    const synergyMatches = actMatches
      .filter((match) => sharedMatchIds.has(match.id))
      .map(({ teammateIds: _teammateIds, ...match }) => match);

    return {
      connection: {
        mode: 'live', status: 'connected', label: 'Riot Client connected',
        region: this.region.region.toUpperCase(), lastUpdated: new Date().toISOString()
      },
      profile: {
        gameName: this.identity.gameName,
        tagLine: this.identity.tagLine,
        level,
        rank: rank.name,
        rankImage: rank.image || '',
        rr,
        peakRank: allTimePeak.rank || rank.name,
        peakRankImage: allTimePeak.image || rank.image || '',
        peakAct: allTimePeak.act,
        peakEpisode: allTimePeak.episode,
        wins: stats.wins, losses: stats.losses, kd: stats.kd, headshot: stats.headshot,
        statsScope: stats.scope,
        actStatsLoading: !actData?.complete,
        actStatsLoaded: actData?.progress?.loaded || this.actStatsProgress.loaded || 0,
        actStatsTotal: actData?.progress?.total || this.actStatsProgress.total || 0,
        dodgeRrLost: dodgeData.rrLost,
        dodgeCount: dodgeData.count,
        dodgeStatsScope: dodgeData.scope,
        dodgeStatsLoading: !cachedDodgeData,
        card: { initials: this.identity.gameName.slice(0, 2).toUpperCase(), color: rank.color || '#735cff' }
      },
      live,
      matches: publicMatches,
      synergyMatches,
      friends,
      loadout: normalizeLoadout(loadout, this.metadata),
      agents: analytics.agents,
      analytics,
      diagnostics: this.diagnostics.slice(0, 20)
    };
  }

  async inspectPlayer(playerId) {
    const key = String(playerId || '');
    const target = this.inspectablePlayers.get(key) || this.historicalPlayers.get(key);
    if (!target) throw new Error('This profile is private or is not available for inspection.');
    const subject = target.puuid;
    const activeSeasonId = await this.fetchActiveSeasonId();
    const [xp, mmr, loadout, history, updates] = await Promise.all([
      this.safeRemote(`/account-xp/v1/players/${subject}`),
      this.safeRemote(`/mmr/v1/players/${subject}`),
      this.safeRemote(`/personalization/v2/players/${subject}/playerloadout`),
      this.safeRemote(`/match-history/v1/history/${subject}?startIndex=0&endIndex=50&queue=competitive`),
      this.safeRemote(`/mmr/v1/players/${subject}/competitiveupdates?startIndex=0&endIndex=50&queue=competitive`)
    ]);
    const matches = await this.fetchDetailedMatches(history, updates, subject, 50);
    const directMatches = matches.filter((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result));
    const cachedObserved = this.actStatsCache?.data?.observedProfiles?.[subject] || [];
    const pendingDetails = await Promise.allSettled([...this.matchDetailCache.values()]);
    const liveObserved = mergeObservedProfiles(...pendingDetails
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => normalizeObservedProfileMatches(
        this.markKnownFriendsInDetail(result.value), this.identity.puuid, this.metadata
      )))[subject] || [];
    const observedMatches = mergeObservedProfiles({ [subject]: cachedObserved }, { [subject]: liveObserved })[subject] || [];
    const completedMatches = directMatches.length ? directMatches : observedMatches;
    const statsSource = directMatches.length ? 'riot' : observedMatches.length ? 'observed' : 'private';
    const updateRows = updates?.Matches || updates?.matches || [];
    const statsAvailable = completedMatches.length > 0;
    const stats = calculateStats(completedMatches);
    const seasonal = mmr?.QueueSkills?.competitive?.SeasonalInfoBySeasonID
      || mmr?.queueSkills?.competitive?.seasonalInfoBySeasonId
      || {};
    const season = seasonal[activeSeasonId] || {};
    const winsByTier = season.WinsByTier || season.winsByTier || {};
    const directActWins = Number(season.NumberOfWins ?? season.numberOfWins);
    const actWins = Number.isFinite(directActWins)
      ? directActWins
      : Object.values(winsByTier).reduce((total, wins) => total + (Number(wins) || 0), 0);
    const currentRr = Number(season.RankedRating ?? season.rankedRating);
    const rankNumber = selectCompetitiveTier({ mmr, activeSeasonId, updates });
    const rank = this.metadata.tiers.get(rankNumber) || { name: rankNumber ? `Competitive tier ${rankNumber}` : 'Unrated', image: '' };
    const allTimePeak = selectAllTimePeak(mmr, this.metadata);
    const [gameName, ...tagParts] = String(target.name || 'Riot Player').split('#');
    return {
      id: playerId,
      gameName,
      tagLine: tagParts.join('#'),
      isSelf: target.isSelf,
      level: Number(xp?.Progress?.Level ?? xp?.progress?.level ?? 0),
      rank: rank.name,
      rankImage: rank.image || '',
      rr: Number.isFinite(currentRr) ? currentRr : null,
      peakRank: allTimePeak.rank,
      peakRankImage: allTimePeak.image,
      peakAct: allTimePeak.act,
      peakEpisode: allTimePeak.episode,
      stats: {
        available: statsAvailable,
        games: completedMatches.length,
        wins: stats.wins,
        losses: stats.losses,
        kd: stats.kd,
        headshot: stats.headshot,
        actWins,
        source: statsSource,
        scope: completedMatches.length >= 50
          ? 'LAST 50 COMPETITIVE'
          : statsSource === 'riot'
            ? `${completedMatches.length} AVAILABLE COMPETITIVE`
            : statsSource === 'observed'
              ? `${completedMatches.length} OBSERVED SHARED COMPETITIVE`
            : updateRows.length
              ? `${updateRows.length} RATING UPDATES • MATCH DETAILS PRIVATE`
              : actWins
                ? `CURRENT ACT • DETAILED HISTORY PRIVATE`
                : 'COMPETITIVE HISTORY PRIVATE'
      },
      loadout: normalizeLoadout(loadout, this.metadata),
      loadoutAvailable: Boolean(loadout),
      privacy: statsSource === 'observed'
        ? `Riot kept this player's full history private. These statistics use ${completedMatches.length} competitive ${completedMatches.length === 1 ? 'match' : 'matches'} BYAKUGAN observed while you shared a match. Equipped loadout access is controlled separately by Riot.`
        : statsSource === 'private'
          ? `Riot returned rank information but kept this player's detailed match history and equipped loadout private. Current-act wins are shown when MMR supplies them. BYAKUGAN does not inspect unknown opponents.`
          : 'Riot returned this visible player’s competitive history. Equipped loadout access is controlled separately by Riot; unknown opponents are never inspected.'
    };
  }

  async connect() {
    this.lockfile = readLockfile(this.lockfilePath);
    if (!this.lockfile) throw new Error('Riot Client lockfile was not found. Start Riot Client and VALORANT, then retry.');
    if (!(await canReachPort(this.lockfile.port))) throw new Error('Riot Client lockfile exists, but its local API is not reachable.');

    await Promise.all([this.obtainTokens(), this.fetchClientVersion()]);
    await this.bootstrapIdentityAndRegion();
    this.lastSnapshot = await this.buildSnapshot();
    this.startPolling();
    return this.lastSnapshot;
  }

  async refresh() {
    if (!this.lockfile) return this.connect();
    if (this.tokens?.expiresAt && this.tokens.expiresAt < Math.floor(Date.now() / 1000) + 60) {
      await this.obtainTokens();
    }
    this.lastSnapshot = await this.buildSnapshot();
    return this.lastSnapshot;
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      try {
        const live = await this.fetchLiveState();
        this.emit('live-state', live);
      } catch (error) {
        this.emit('warning', error.message);
      }
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  disconnect() {
    this.stopPolling();
    this.lockfile = null;
    this.tokens = null;
    this.identity = null;
    this.lastSnapshot = null;
    this.diagnostics = [];
    this.nameCache.clear();
    this.rankCache.clear();
    this.matchDetailCache.clear();
    this.actStatsCache = null;
    this.actStatsPromise = null;
    this.actStatsDiskLoadedFor = '';
    this.actStatsProgress = { loaded: 0, total: 0 };
    this.dodgeStatsCache = null;
    this.dodgeStatsPromise = null;
    this.inspectablePlayers.clear();
    this.historicalPlayers.clear();
    this.historicalPlayerIds.clear();
    this.friendIds.clear();
    this.activeSeason = { id: '', startTime: 0, expiresAt: 0 };
    this.session = { startedAt: Date.now(), startingRank: '', startingRR: 0, initialized: false };
  }
}

function normalizeLoadout(loadout, metadata = { weapons: new Map(), skins: new Map() }) {
  const guns = loadout?.Guns || loadout?.guns || [];
  return guns.slice(0, 20).map((gun, index) => {
    const weapon = resolveById(metadata.weapons, gun.ID || gun.id, { name: `Weapon ${index + 1}`, image: '' });
    const skin = resolveById(metadata.skins, gun.SkinID || gun.skinId || gun.ChromaID || gun.chromaId, {
      name: 'Equipped skin', weapon: weapon.name, image: weapon.image
    });
    return {
      slot: weapon.name,
      skin: skin.name,
      image: skin.image || weapon.image,
      edition: 'Equipped',
      color: ['#735cff', '#00d9c0', '#ed5d7d', '#4ab8ec'][index % 4]
    };
  });
}

function calculateStats(matches) {
  const completed = matches.filter((match) => ['VICTORY', 'DEFEAT'].includes(match.result));
  const totals = completed.reduce((sum, match) => {
    sum.kills += Number(match.kills) || 0;
    sum.deaths += Number(match.deaths) || 0;
    sum.headshots += Number(match.shots?.headshots) || 0;
    sum.bodyshots += Number(match.shots?.bodyshots) || 0;
    sum.legshots += Number(match.shots?.legshots) || 0;
    sum.peakTier = Math.max(sum.peakTier, Number(match.competitiveTier) || 0);
    if (match.result === 'VICTORY') sum.wins += 1;
    else sum.losses += 1;
    return sum;
  }, { kills: 0, deaths: 0, headshots: 0, bodyshots: 0, legshots: 0, wins: 0, losses: 0, peakTier: 0 });
  const shots = totals.headshots + totals.bodyshots + totals.legshots;
  return {
    wins: totals.wins,
    losses: totals.losses,
    kd: totals.deaths ? Number((totals.kills / totals.deaths).toFixed(2)) : totals.kills,
    headshot: shots ? Number(((totals.headshots / shots) * 100).toFixed(1)) : 0,
    peakTier: totals.peakTier
  };
}

function buildAgentMastery(matches) {
  const totals = new Map();
  for (const match of matches) {
    if (!match.agent || match.agent === '—') continue;
    const current = totals.get(match.agent) || {
      name: match.agent,
      role: match.agentRole || 'Agent',
      initials: match.agent.slice(0, 2).toUpperCase(),
      color: match.agentColor || '#7b67f6',
      image: match.agentImage || '', games: 0, wins: 0
    };
    current.games += 1;
    if (match.result === 'VICTORY') current.wins += 1;
    totals.set(match.agent, current);
  }
  return [...totals.values()].sort((a, b) => b.games - a.games).map((agent) => ({
    ...agent,
    mastery: Math.round((agent.games / Math.max(1, matches.length)) * 100)
  }));
}

module.exports = {
  RiotClientService,
  isAllowedRemoteHost,
  decodeJwtPayload,
  normalizeMatchHistory,
  normalizeMatchDetail,
  normalizeQueueName,
  decodePresencePrivate,
  summarizePresence,
  normalizeLoadout,
  calculateStats,
  buildAgentMastery,
  formatAgo,
  isPlayerNameHidden,
  isKnownPartyMember,
  isKnownFriend,
  visiblePlayerIds,
  normalizeLivePlayers,
  normalizeHistoricalRoster,
  normalizeServer,
  selectCompetitiveTier,
  selectAllTimePeak,
  normalizeRatingUpdate,
  selectCurrentActUpdates,
  isDodgePenaltyUpdate,
  summarizeDodgePenalties,
  mapWithConcurrency
};
