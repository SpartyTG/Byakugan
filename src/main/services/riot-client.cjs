'use strict';

const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
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
  premier: 'Premier', custom: 'Custom Game', newmap: 'New Map'
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

function decodePresencePrivate(value) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) return {};
  for (const candidate of [raw, Buffer.from(raw, 'base64').toString('utf8')]) {
    try { return JSON.parse(candidate.replace(/\u0000+$/g, '')); } catch {}
  }
  return {};
}

function productLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return PRODUCT_LABELS.get(key) || (key ? key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Riot Client');
}

function summarizePresence(presence) {
  const details = decodePresencePrivate(presence.private);
  const productKey = String(presence.product || presence.productName || (details.sessionLoopState ? 'valorant' : '')).toLowerCase();
  const game = productLabel(productKey);
  const rawState = String(presence.state || presence.availability || '').toLowerCase();
  const offline = ['offline', 'unavailable'].includes(rawState);
  const away = ['away', 'mobile'].includes(rawState);
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
  if (offline) return { ...base, status: 'Offline', state: 'offline' };
  if (productKey !== 'valorant') {
    return {
      ...base,
      status: game === 'Riot Client' ? 'Online in Riot Client' : `Playing ${game}`,
      state: away ? 'away' : 'other'
    };
  }

  const loopState = String(details.sessionLoopState || details.partyOwnerSessionLoopState || 'MENUS').toUpperCase();
  const queueId = details.queueId || details.queueID || details.partyOwnerQueueId || '';
  const playlist = normalizeQueueName(queueId);
  const rawAlly = details.partyOwnerMatchScoreAllyTeam ?? details.matchScoreAllyTeam;
  const rawEnemy = details.partyOwnerMatchScoreEnemyTeam ?? details.matchScoreEnemyTeam;
  const ally = rawAlly === '' || rawAlly === null || rawAlly === undefined ? NaN : Number(rawAlly);
  const enemy = rawEnemy === '' || rawEnemy === null || rawEnemy === undefined ? NaN : Number(rawEnemy);
  const score = Number.isFinite(ally) && Number.isFinite(enemy) ? `${ally}–${enemy}` : '';
  if (['INGAME', 'CORE_GAME'].includes(loopState)) {
    return { ...base, playlist, score, status: `VALORANT • ${playlist}${score ? ` • ${score}` : ' • Score unavailable'}`, state: 'ingame' };
  }
  if (loopState === 'PREGAME') {
    return { ...base, playlist, status: `VALORANT • Agent Select${queueId ? ` • ${playlist}` : ''}`, state: 'pregame' };
  }
  return { ...base, status: away ? 'VALORANT • Away' : 'VALORANT • In menus', state: away ? 'away' : 'online' };
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
    .filter((entry) => (entry.TeamID || entry.teamId) === teamId && (entry.Subject || entry.subject || entry.puuid) !== puuid)
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

function isPlayerNameHidden(player, ownPuuid) {
  const subject = player?.Subject || player?.subject || player?.puuid;
  if (subject === ownPuuid) return false;
  // A current party member is already explicitly known to the signed-in
  // player. Preserve that relationship even when Riot's in-match incognito
  // flag hides the same person from non-party participants.
  if (isKnownPartyMember(player)) return false;
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
      return (!ownTeam || teamId === ownTeam) && !isPlayerNameHidden(player, ownPuuid);
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
      name: isAlly ? (hidden ? 'Hidden Player' : isSelf ? 'You' : (names[subject] || 'Riot Player')) : '',
      hidden: isAlly ? hidden : true,
      isSelf,
      side: isAlly ? 'ally' : 'enemy',
      inspectable: Boolean(isAlly && !hidden),
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
    this.actStatsCache = null;
    this.actStatsPromise = null;
    this.inspectablePlayers = new Map();
    this.activeSeason = { id: '', expiresAt: 0 };
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
      return friends.slice(0, 80).map((friend) => {
        const id = friend.puuid || friend.PUUID || friend.cid || friend.id;
        const options = (presenceById.get(id) || []).map(summarizePresence);
        const presence = options.find((item) => item.state === 'ingame' || item.state === 'pregame')
          || options.find((item) => item.product !== 'valorant' && item.game !== 'Riot Client' && item.state !== 'offline')
          || options.find((item) => item.product === 'valorant' && item.state !== 'offline')
          || options.find((item) => item.state !== 'offline')
          || options[0]
          || ((friend.is_online || friend.isOnline || ['online', 'away', 'mobile'].includes(String(friend.state || friend.availability || '').toLowerCase()))
            ? { status: 'Online in Riot Client', state: 'online', game: 'Riot Client', product: 'riot_client' }
            : null)
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
    } catch {
      return [];
    }
  }

  async lookupVisibleNames(players) {
    const visible = new Set(visiblePlayerIds(players, this.identity.puuid));
    for (const player of players) {
      const subject = player.Subject || player.subject || player.puuid;
      if (subject && !visible.has(subject)) this.nameCache.delete(subject);
    }
    const missing = [...visible].filter((puuid) => !this.nameCache.has(puuid));
    if (!missing.length) return Object.fromEntries([...visible].map((puuid) => [puuid, this.nameCache.get(puuid)]));
    try {
      const response = await this.localRequest('/player-account/lookup/v2/namesets-for-puuids', {
        method: 'POST',
        body: { puuids: missing }
      });
      for (const entry of response.data?.namesets || response.data?.Namesets || []) {
        const alias = entry.alias || entry.Alias || {};
        const puuid = entry.puuid || entry.PUUID || entry.subject;
        if (!puuid || !visible.has(puuid) || !alias.gameName) continue;
        this.nameCache.set(puuid, alias.tagLine ? `${alias.gameName}#${alias.tagLine}` : alias.gameName);
      }
      return Object.fromEntries([...visible].map((puuid) => [puuid, this.nameCache.get(puuid)]));
    } catch {
      return Object.fromEntries([...visible].map((puuid) => [puuid, this.nameCache.get(puuid)]));
    }
  }

  async fetchActiveSeasonId() {
    if (this.activeSeason.expiresAt > Date.now()) return this.activeSeason.id;
    let id = '';
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
    } catch {}
    this.activeSeason = { id, expiresAt: Date.now() + (id ? 60 * 60_000 : 2 * 60_000) };
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
      CompetitiveTier: ownTeam && (player.TeamID || player.teamId) !== ownTeam
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
        ? 'Visible party members can be inspected. Private identities remain unavailable.'
        : loopState === 'PREGAME'
        ? 'Opponent information remains hidden during agent select.'
        : roster.length
          ? 'Roster supplied by the active Riot match session.'
          : 'Waiting for Riot to expose the active roster.'
    };
  }

  async fetchDetailedMatches(history, ratingUpdates, subject = this.identity.puuid, limit = 10) {
    const rows = history?.History || history?.history || [];
    const updateRows = ratingUpdates?.Matches || ratingUpdates?.matches || [];
    const updatesByMatch = new Map(updateRows.map((row) => [row.MatchID || row.matchId, row]));
    const details = await mapWithConcurrency(rows.slice(0, limit), 5, async (row) => {
      const matchId = row.MatchID || row.matchId;
      if (!matchId) return null;
      const detail = await this.fetchMatchDetail(matchId);
      return detail ? normalizeMatchDetail(detail, subject, this.metadata, row, updatesByMatch.get(matchId)) : null;
    });
    const normalized = details.filter(Boolean);
    return normalized.length ? normalized : normalizeMatchHistory(history);
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

  async fetchActStats(initialUpdates, activeSeasonId) {
    if (!initialUpdates || !activeSeasonId) return null;
    const initialRows = initialUpdates?.Matches || initialUpdates?.matches || [];
    const newestMatchId = updateMatchId(initialRows[0]);
    if (this.actStatsCache?.seasonId === activeSeasonId && this.actStatsCache.newestMatchId === newestMatchId && this.actStatsCache.expiresAt > Date.now()) {
      return this.actStatsCache.data;
    }

    const pageSize = 20;
    const maximumMatches = 1000;
    const updates = [];
    const seen = new Set();
    let complete = true;
    let page = selectCurrentActUpdates(initialRows, activeSeasonId);
    for (const row of page.rows) {
      const matchId = updateMatchId(row);
      if (!seen.has(matchId)) { seen.add(matchId); updates.push(row); }
    }

    let startIndex = pageSize;
    while (!page.reachedPreviousAct && initialRows.length >= pageSize && startIndex < maximumMatches) {
      const next = await this.safeRemote(`/mmr/v1/players/${this.identity.puuid}/competitiveupdates?startIndex=${startIndex}&endIndex=${startIndex + pageSize}&queue=competitive`);
      if (!next) { complete = false; break; }
      const nextRows = next?.Matches || next?.matches || [];
      page = selectCurrentActUpdates(nextRows, activeSeasonId);
      for (const row of page.rows) {
        const matchId = updateMatchId(row);
        if (!seen.has(matchId)) { seen.add(matchId); updates.push(row); }
      }
      if (page.reachedPreviousAct || nextRows.length < pageSize) break;
      startIndex += pageSize;
    }
    if (!page.reachedPreviousAct && startIndex >= maximumMatches) complete = false;

    const details = await mapWithConcurrency(updates, 4, async (row) => {
      const detail = await this.fetchMatchDetail(updateMatchId(row));
      return detail ? normalizeMatchDetail(detail, this.identity.puuid, this.metadata, {}, row) : null;
    });
    const matches = details.map((detail, index) => detail || normalizeRatingUpdate(updates[index], this.metadata));
    const completedMatches = matches.filter((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result));
    if (completedMatches.length !== updates.length) complete = false;
    const stats = {
      ...calculateStats(completedMatches),
      games: completedMatches.length,
      scope: complete ? 'THIS ACT' : 'LOADING FULL ACT STATS'
    };
    const data = { stats, matches, complete };
    this.actStatsCache = {
      seasonId: activeSeasonId,
      newestMatchId,
      data,
      expiresAt: Date.now() + (complete ? 60 * 60_000 : 2 * 60_000)
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

  async buildSnapshot({ hydrateAct = true } = {}) {
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
    const newestMatchId = updateMatchId(initialRows[0]);
    const actData = this.actStatsCache?.seasonId === activeSeasonId
      && this.actStatsCache?.newestMatchId === newestMatchId
      && this.actStatsCache?.expiresAt > Date.now()
      ? this.actStatsCache.data
      : null;
    if (!actData && hydrateAct) this.startActStatsHydration(ratingUpdates, activeSeasonId);

    const tier = mmr?.QueueSkills?.competitive?.SeasonalInfoBySeasonID;
    const latestSeason = tier?.[activeSeasonId] || (tier ? Object.values(tier).at(-1) : null);
    const newestUpdate = ratingUpdates?.Matches?.[0] || ratingUpdates?.matches?.[0];
    const rankNumber = Number(newestUpdate?.TierAfterUpdate ?? newestUpdate?.tierAfterUpdate ?? latestSeason?.CompetitiveTier ?? 0);
    const rr = Number(newestUpdate?.RankedRatingAfterUpdate ?? newestUpdate?.rankedRatingAfterUpdate ?? latestSeason?.RankedRating ?? 0);
    const level = xp?.Progress?.Level || 0;
    const rank = this.metadata.tiers.get(rankNumber) || { name: rankNumber ? `Competitive tier ${rankNumber}` : 'Unrated', color: '#735cff' };
    const recentStats = calculateStats(matches.filter((match) => match.isCompetitive || match.queueId === 'competitive'));
    const stats = actData?.stats || { ...recentStats, scope: 'LOADING FULL ACT STATS' };
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
        card: { initials: this.identity.gameName.slice(0, 2).toUpperCase(), color: rank.color || '#735cff' }
      },
      live,
      matches: publicMatches,
      friends,
      loadout: normalizeLoadout(loadout, this.metadata),
      agents: analytics.agents,
      analytics,
      diagnostics: this.diagnostics.slice(0, 20)
    };
  }

  async inspectPlayer(playerId) {
    const target = this.inspectablePlayers.get(String(playerId || ''));
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
    const completedMatches = matches.filter((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result));
    const stats = calculateStats(completedMatches);
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
      peakRank: allTimePeak.rank,
      peakRankImage: allTimePeak.image,
      peakAct: allTimePeak.act,
      peakEpisode: allTimePeak.episode,
      stats: {
        games: completedMatches.length,
        wins: stats.wins,
        losses: stats.losses,
        kd: stats.kd,
        headshot: stats.headshot,
        scope: completedMatches.length >= 50 ? 'LAST 50 COMPETITIVE' : `${completedMatches.length} AVAILABLE COMPETITIVE`
      },
      loadout: normalizeLoadout(loadout, this.metadata),
      privacy: 'Visible ally or party member. Opponent and incognito profiles are never inspected.'
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
    this.inspectablePlayers.clear();
    this.activeSeason = { id: '', expiresAt: 0 };
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
  visiblePlayerIds,
  normalizeLivePlayers,
  normalizeServer,
  selectCompetitiveTier,
  selectAllTimePeak,
  normalizeRatingUpdate,
  selectCurrentActUpdates,
  mapWithConcurrency
};
