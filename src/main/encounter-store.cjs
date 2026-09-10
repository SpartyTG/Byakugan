'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const accountKeyFor = subject => `riot-${createHash('sha256').update(String(subject)).digest('hex').slice(0, 32)}`;
const playerKeyFor = (owner, subject) => createHash('sha256').update(JSON.stringify(['encounter', owner, subject])).digest('hex');
const clean = (value, max = 100) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const subjectOf = player => player?.Subject || player?.subject || player?.puuid || '';
const teamOf = player => player?.TeamID || player?.teamId || '';
const count = value => Number.isFinite(Number(value)) && value != null && Number(value) >= 0 ? Math.floor(Number(value)) : null;
const resolve = (map, id, fallback) => map?.get(String(id || '').toLowerCase())?.name || fallback;
const isCompetitive = row => String(row?.queueId || '').trim().toLowerCase() === 'competitive';

function performance(player, metadata) {
  const stats = player.PlayerStats || player.playerStats || player.stats || {};
  return { agent: clean(resolve(metadata?.agents, player.CharacterID || player.characterId, 'Unknown agent')),
    kills: count(stats.Kills ?? stats.kills), deaths: count(stats.Deaths ?? stats.deaths), assists: count(stats.Assists ?? stats.assists) };
}

function recordFromDetail(detail, owner, metadata) {
  const info = detail?.MatchInfo || detail?.matchInfo || {};
  const players = detail?.Players || detail?.players || [];
  if (!Array.isArray(players)) return null;
  const self = players.find(player => subjectOf(player) === owner);
  const id = clean(info.MatchID || info.matchId);
  if (!owner || !self || !id || (info.IsCompleted ?? info.isCompleted) === false) return null;
  const rounds = detail?.RoundResults || detail?.roundResults || [];
  const teams = detail?.Teams || detail?.teams || [];
  if (!Array.isArray(rounds) || !Array.isArray(teams)) return null;
  if ((info.IsCompleted ?? info.isCompleted) !== true && !rounds.length
    && !teams.some(team => (team.Won ?? team.won) === true)) return null;
  const ownTeam = teamOf(self);
  const queueId = clean(info.QueueID || info.queueId || 'unknown').toLowerCase();
  if (queueId !== 'competitive') return null;
  const teamMode = queueId !== 'deathmatch' && Boolean(ownTeam && teams.some(team => teamOf(team) === ownTeam));
  const ours = teams.find(team => teamOf(team) === ownTeam);
  const theirs = teams.find(team => teamOf(team) !== ownTeam);
  const ourRounds = count(ours?.RoundsWon ?? ours?.roundsWon);
  const theirRounds = count(theirs?.RoundsWon ?? theirs?.roundsWon);
  const won = (ours?.Won ?? ours?.won) === true;
  const lost = teams.some(team => teamOf(team) !== ownTeam && (team.Won ?? team.won) === true);
  const result = !teamMode ? 'COMPLETED' : won ? 'VICTORY' : lost ? 'DEFEAT'
    : teamMode && ourRounds != null && theirRounds === ourRounds ? 'DRAW' : 'COMPLETED';
  const start = Number(info.GameStartMillis ?? info.gameStartMillis ?? info.GameStartTime ?? info.gameStartTime);
  const startedAt = Number.isFinite(start) && start > 0 ? (start < 1e12 ? start * 1000 : start) : null;
  const participants = players.filter(player => subjectOf(player) && subjectOf(player) !== owner).map(player => ({
    key: playerKeyFor(owner, subjectOf(player)),
    relationship: !teamMode || !teamOf(player) ? 'same-match' : teamOf(player) === ownTeam ? 'with' : 'against',
    ...performance(player, metadata)
  }));
  if (!participants.length) return null;
  return { id, startedAt, seasonId: clean(info.SeasonID || info.seasonId), queueId,
    map: clean(resolve(metadata?.maps, info.MapID || info.mapId, 'Unknown map')), result,
    score: teamMode && ourRounds != null && theirRounds != null ? `${ourRounds} – ${theirRounds}` : '',
    self: performance(self, metadata), players: participants, completeRoster: true };
}

function recordFromLegacy(match, owner, seasonId) {
  // Older Act caches retained explicit teammate IDs, but no opponent roster.
  // Recover only those proven relationships; a later full detail replaces this row.
  if (!match?.id || String(match.queueId || 'competitive').toLowerCase() !== 'competitive'
    || !['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result) || !Array.isArray(match.teammateIds) || !match.teammateIds.length) return null;
  return { id: clean(match.id), startedAt: Number(match.startedAt) || null, seasonId: clean(seasonId),
    queueId: clean(match.queueId || 'competitive'), map: clean(match.map), result: match.result, score: clean(match.score),
    self: { agent: clean(match.agent), kills: count(match.kills), deaths: count(match.deaths), assists: count(match.assists) },
    players: [...new Set(match.teammateIds.filter(id => typeof id === 'string' && id && id !== owner))].map(subject => ({
      key: playerKeyFor(owner, subject), relationship: 'with', agent: 'Not saved', kills: null, deaths: null, assists: null
    })), completeRoster: false };
}

function validRecord(row) {
  return Boolean(row && typeof row.id === 'string' && row.id.length && row.id.length <= 100
    && (row.startedAt === null || (Number.isFinite(row.startedAt) && row.startedAt > 0))
    && ['VICTORY', 'DEFEAT', 'DRAW', 'COMPLETED'].includes(row.result)
    && row.self && Array.isArray(row.players) && row.players.length > 0 && row.players.length <= 100
    && row.players.every(player => /^[a-f0-9]{64}$/.test(player.key) && ['with', 'against', 'same-match'].includes(player.relationship)));
}

class EncounterStore {
  constructor(directory = '') {
    this.directory = directory;
    this.accountKey = '';
    this.records = new Map();
    this.byPlayer = new Map();
    this.timer = null;
    this.dirty = false;
    this.error = '';
    this.readFailed = false;
  }

  useAccount(accountKey) {
    if (accountKey === this.accountKey) return;
    if (!/^riot-[a-f0-9]{32}$/.test(accountKey || '')) throw new Error('Encounter history requires a known account.');
    this.flush();
    this.accountKey = accountKey;
    this.records = new Map(); this.byPlayer = new Map(); this.dirty = false; this.error = ''; this.readFailed = false;
    if (!this.directory) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
      if (data.version !== 1 || data.accountKey !== accountKey || !Array.isArray(data.matches) || !data.matches.every(validRecord)) throw new Error('Invalid encounter file');
      // beta.145 briefly collected every queue. Keep only Competitive history in
      // memory so existing files migrate safely without exposing those records.
      for (const row of data.matches) if (isCompetitive(row)) this.put(row);
    } catch (error) {
      if (error.code !== 'ENOENT') { this.readFailed = true; this.error = 'Saved encounter history could not be read.'; }
    }
  }

  file() { return path.join(this.directory, `encounters-${this.accountKey}.json`); }

  put(row) {
    const old = this.records.get(row.id);
    if (old) for (const player of old.players) this.byPlayer.get(player.key)?.delete(row.id);
    this.records.set(row.id, row);
    for (const player of row.players) {
      if (!this.byPlayer.has(player.key)) this.byPlayer.set(player.key, new Set());
      this.byPlayer.get(player.key).add(row.id);
    }
  }

  remember(accountKey, row) {
    this.useAccount(accountKey);
    if (!validRecord(row) || !isCompetitive(row)) return false;
    const previous = this.records.get(row.id);
    if (previous?.completeRoster && !row.completeRoster) return false;
    if (JSON.stringify(previous) === JSON.stringify(row)) return false;
    this.put(row); this.dirty = true;
    if (this.directory && !this.timer) {
      this.timer = setTimeout(() => this.flush(), 250);
      this.timer.unref?.();
    }
    return true;
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty || !this.directory || this.readFailed) return;
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      const file = this.file();
      fs.writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, accountKey: this.accountKey, matches: [...this.records.values()] }));
      fs.renameSync(`${file}.tmp`, file);
      this.dirty = false; this.error = '';
    } catch { this.error = 'Encounter history could not be saved on this PC.'; }
  }

  page(owner, subject, { excludeMatchId = '', offset = 0 } = {}) {
    this.useAccount(accountKeyFor(owner));
    const key = playerKeyFor(owner, subject);
    const records = [...(this.byPlayer.get(key) || [])].filter(id => id !== excludeMatchId)
      .map(id => this.records.get(id)).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0) || a.id.localeCompare(b.id));
    const counts = { with: 0, against: 0, sameMatch: 0 };
    for (const row of records) {
      const side = row.players.find(player => player.key === key).relationship;
      counts[side === 'same-match' ? 'sameMatch' : side]++;
    }
    const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const matches = records.slice(start, start + 50).map(row => {
      const { key: _key, relationship, ...other } = row.players.find(player => player.key === key);
      return { id: row.id, startedAt: row.startedAt, seasonId: row.seasonId, queueId: row.queueId,
        map: row.map, result: row.result, score: row.score, self: row.self, other, relationship };
    });
    return { available: true, total: records.length, ...counts, matches,
      nextOffset: start + matches.length < records.length ? start + matches.length : null,
      indexedMatches: this.records.size, scope: 'SAVED MATCH HISTORY', warning: this.error };
  }
}

module.exports = { EncounterStore, recordFromDetail, recordFromLegacy, accountKeyFor, playerKeyFor };
