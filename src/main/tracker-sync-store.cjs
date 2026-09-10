'use strict';

const fs = require('node:fs');
const path = require('node:path');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanIdentity = value => String(value || '').normalize('NFC').trim().toLowerCase();
const finite = (value, minimum, maximum) => Number.isFinite(value) && value >= minimum && value <= maximum;

function contextFor(profile) {
  const accountKey = String(profile?.senseiAccountKey || '');
  const seasonId = String(profile?.activeSeasonId || '').toLowerCase();
  if (!/^riot-[a-f0-9]{32}$/.test(accountKey) || !UUID.test(seasonId) || !profile?.gameName || !profile?.tagLine) {
    throw new Error('Connect BYAKUGAN to your Riot account and current Act first.');
  }
  return { accountKey, seasonId };
}

function trackerProfileUrl(profile) {
  const context = contextFor(profile);
  const handle = `${String(profile.gameName).trim()}#${String(profile.tagLine).replace(/^#/, '').trim()}`;
  const url = new URL(`https://tracker.gg/valorant/profile/riot/${encodeURIComponent(handle)}/overview`);
  url.searchParams.set('playlist', 'competitive');
  url.searchParams.set('season', context.seasonId);
  return url.href;
}

function numberFrom(value) {
  const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function metric(lines, label, direction = 1) {
  for (let index = 0; index < lines.length; index++) {
    const found = lines[index].match(label);
    if (!found) continue;
    const before = lines[index].slice(0, found.index);
    const after = lines[index].slice(found.index + found[0].length);
    const beforeNumbers = [...before.replace(/,/g, '').matchAll(/-?\d+(?:\.\d+)?/g)];
    if (beforeNumbers.length) return Number(beforeNumbers.at(-1)[0]);
    const afterNumber = numberFrom(after);
    if (afterNumber != null) return afterNumber;
    for (const distance of [1, 2, 3]) {
      const offset = distance * direction;
      const candidate = lines[index + offset];
      if (candidate && /^[-+]?\d[\d,.]*%?$/.test(candidate)) return numberFrom(candidate);
    }
  }
  return null;
}

function compactOutcome(text, marker) {
  const values = [];
  const pattern = new RegExp(`(?:^|\\s)(\\d[\\d,]*)\\s*${marker}(?=\\s|$)`, 'gi');
  for (const match of String(text || '').matchAll(pattern)) {
    const value = numberFrom(match[1]);
    if (Number.isInteger(value) && finite(value, 0, 100_000)) values.push(value);
  }
  return values.length ? Math.max(...values) : null;
}

function parseTrackerPage({ text, url }, profile) {
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 500_000) {
    throw new Error('Tracker did not expose a readable profile overview. Make the profile public and let the page finish loading.');
  }
  let page;
  try { page = new URL(url); } catch { throw new Error('Open the Tracker profile from BYAKUGAN before syncing.'); }
  if (page.protocol !== 'https:' || !['tracker.gg', 'www.tracker.gg'].includes(page.hostname)) {
    throw new Error('The open window is not a Tracker.gg profile.');
  }
  const segments = page.pathname.split('/').filter(Boolean);
  const riotIndex = segments.findIndex(value => value.toLowerCase() === 'riot');
  let handle = '';
  try { handle = decodeURIComponent(segments[riotIndex + 1] || ''); } catch {}
  const expectedHandle = `${profile.gameName}#${String(profile.tagLine).replace(/^#/, '')}`;
  if (riotIndex < 0 || cleanIdentity(handle) !== cleanIdentity(expectedHandle)) {
    throw new Error('The open Tracker profile does not match the Riot account connected to BYAKUGAN.');
  }
  const context = contextFor(profile);
  const season = String(page.searchParams.get('season') || '').toLowerCase();
  const playlist = String(page.searchParams.get('playlist') || '').toLowerCase();
  if (season !== context.seasonId || playlist !== 'competitive') {
    throw new Error('Use the BYAKUGAN button again so Tracker opens the current Competitive Act.');
  }
  if (/profile\s+(?:is\s+)?private|private\s+profile/i.test(text)) {
    throw new Error('Tracker says this profile is private. Make it public, reload the Tracker window, and try again.');
  }
  const lines = text.split(/\r?\n/).map(value => value.replace(/[\u200b-\u200d\ufeff]/g, '').trim()).filter(Boolean);
  const labels = {
    matches: /\b(?:matches?|games?)\s+played\b|\bmatches\b/i,
    wins: /\bwins?\b|\b(?:matches?|games?)\s+won\b/i,
    losses: /\bloss(?:es)?\b|\b(?:matches?|games?)\s+lost\b/i,
    kd: /\bk\s*\/\s*d(?:\s+ratio)?\b/i,
    headshot: /\b(?:headshot|hs)\s*%/i
  };
  const badgeWins = compactOutcome(text, 'W');
  const badgeLosses = compactOutcome(text, 'L');
  const variants = [1, -1].map(direction => ({
    matches: metric(lines, labels.matches, direction),
    wins: badgeWins ?? metric(lines, labels.wins, direction),
    losses: badgeLosses ?? metric(lines, labels.losses, direction),
    kd: metric(lines, labels.kd, direction),
    headshot: metric(lines, labels.headshot, direction)
  }));
  const record = variants.find(candidate => [candidate.matches, candidate.wins, candidate.losses].every(Number.isInteger)
    && finite(candidate.matches, 0, 100_000) && finite(candidate.wins, 0, candidate.matches)
    && finite(candidate.losses, 0, candidate.matches) && candidate.wins + candidate.losses <= candidate.matches
    && finite(candidate.kd, 0, 20) && finite(candidate.headshot, 0, 100));
  if (!record) {
    const visible = label => lines.some(line => label.test(line));
    const missing = [!visible(labels.matches) && 'Matches Played', badgeWins == null && !visible(labels.wins) && 'Wins',
      badgeLosses == null && !visible(labels.losses) && 'Losses', !visible(labels.kd) && 'K/D Ratio',
      !visible(labels.headshot) && 'Headshot %'].filter(Boolean);
    const detail = missing.length ? ` Missing visible field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.` : '';
    throw new Error(`Could not read a complete current-Act Competitive record.${detail} Confirm the overview finished loading and its stat cards show valid values.`);
  }
  const { matches, wins, losses, kd, headshot } = record;
  return { matches, wins, losses, draws: matches - wins - losses, kd, headshot,
    source: 'tracker-visible-profile', syncedAt: new Date().toISOString() };
}

function validSummary(summary) {
  return summary?.source === 'tracker-visible-profile' && Number.isInteger(summary.matches)
    && Number.isInteger(summary.wins) && Number.isInteger(summary.losses) && Number.isInteger(summary.draws)
    && finite(summary.matches, 0, 100_000)
    && finite(summary.wins, 0, summary.matches)
    && finite(summary.losses, 0, summary.matches)
    && finite(summary.draws, 0, summary.matches)
    && summary.matches === summary.wins + summary.losses + summary.draws
    && finite(summary.kd, 0, 20) && finite(summary.headshot, 0, 100)
    && Number.isFinite(Date.parse(summary.syncedAt));
}

class TrackerSyncStore {
  constructor(directory) {
    this.file = path.join(directory, 'tracker-sync.json');
    this.entries = {};
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version === 1 && data.entries && typeof data.entries === 'object' && !Array.isArray(data.entries)) this.entries = data.entries;
    } catch {}
  }

  key(context) { return `${context.accountKey}:${context.seasonId}:competitive`; }

  get(profile) {
    try {
      const summary = this.entries[this.key(contextFor(profile))];
      return validSummary(summary) ? structuredClone(summary) : null;
    } catch { return null; }
  }

  save(summary, profile) {
    if (!validSummary(summary)) throw new Error('Tracker returned an invalid summary.');
    const context = contextFor(profile);
    const entries = { ...this.entries, [this.key(context)]: structuredClone(summary) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify({ version: 1, entries }, null, 2));
    fs.renameSync(`${this.file}.tmp`, this.file);
    this.entries = entries;
    return this.get(profile);
  }

  remove(profile) {
    const entries = { ...this.entries };
    delete entries[this.key(contextFor(profile))];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify({ version: 1, entries }, null, 2));
    fs.renameSync(`${this.file}.tmp`, this.file);
    this.entries = entries;
  }

  decorate(snapshot) {
    if (!snapshot?.profile) return snapshot;
    return { ...snapshot, trackerSync: this.get(snapshot.profile) };
  }
}

module.exports = { TrackerSyncStore, trackerProfileUrl, parseTrackerPage, contextFor };
