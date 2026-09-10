'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const MAX_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const accountName = value => String(value || '').normalize('NFC').trim().toLowerCase();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function label(value, field, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Invalid ${field}.`);
  }
  return value.trim();
}

function number(value, field, { required = false, integer = false, min = 0, max = 10_000_000 } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid ${field}.`);
  }
  return value;
}

function normalizeSummary(input) {
  if (!input || Buffer.byteLength(JSON.stringify(input)) > MAX_BYTES) throw new Error('Summary file is too large.');
  if (input.format !== 'byakugan.act-summary' || input.version !== 1 || input.source !== 'tracker-screenshot') {
    throw new Error('Choose a BYAKUGAN Tracker summary JSON file (version 1).');
  }
  // Each queue needs its own validation and presentation. Never treat other modes as Competitive.
  if (input.queue !== 'competitive') throw new Error('This importer currently accepts Competitive summaries only.');
  const riotId = {
    gameName: label(input.riotId?.gameName, 'Riot name'),
    tagLine: label(input.riotId?.tagLine, 'Riot tag', 24).replace(/^#/, '')
  };
  if (!riotId.tagLine) throw new Error('Invalid Riot tag.');
  const act = { label: label(input.act?.label, 'Act label'), seasonId: null };
  if (input.act?.seasonId != null) {
    if (!UUID.test(input.act.seasonId)) throw new Error('Invalid Act ID.');
    act.seasonId = input.act.seasonId.toLowerCase();
  }
  let capturedAt = null;
  if (input.capturedAt != null) {
    if (typeof input.capturedAt !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(input.capturedAt) || !Number.isFinite(Date.parse(input.capturedAt))) {
      throw new Error('Invalid capture date.');
    }
    capturedAt = new Date(input.capturedAt).toISOString();
  }
  const raw = input.totals || {};
  const totals = {};
  for (const key of ['matches', 'wins', 'losses', 'draws', 'kills', 'deaths', 'assists', 'firstBloods', 'flawlessRounds', 'aces']) {
    totals[key] = number(raw[key], key, { integer: true, required: ['matches', 'wins', 'losses'].includes(key) });
  }
  if (totals.matches > 100_000 || totals.wins + totals.losses + (totals.draws ?? 0) > totals.matches) {
    throw new Error('Results exceed the match total.');
  }
  for (const key of ['headshotPct', 'winPct', 'kastPct']) totals[key] = number(raw[key], key, { max: 100 });
  for (const key of ['kd', 'kad', 'adr', 'acs', 'killsPerRound', 'playtimeHours']) totals[key] = number(raw[key], key, { max: 100_000 });
  totals.ddaPerRound = number(raw.ddaPerRound, 'ddaPerRound', { min: -100_000, max: 100_000 });
  if (totals.kd != null && totals.kills != null && totals.deaths > 0
    && Math.abs(totals.kd - totals.kills / totals.deaths) > 0.011) throw new Error('K/D does not match the supplied kills and deaths.');
  const agents = [];
  if (input.agents != null) {
    if (!Array.isArray(input.agents) || input.agents.length > 50) throw new Error('Invalid agent summary.');
    for (const row of input.agents) {
      const agent = { label: label(row.label, 'agent label'), matches: number(row.matches, 'agent matches', { required: true, integer: true }) };
      for (const key of ['winPct', 'headshotPct']) agent[key] = number(row[key], `agent ${key}`, { max: 100 });
      for (const key of ['kd', 'adr', 'acs', 'playtimeHours']) agent[key] = number(row[key], `agent ${key}`, { max: 100_000 });
      agent.ddaPerRound = number(row.ddaPerRound, 'agent DDA', { min: -100_000, max: 100_000 });
      agents.push(agent);
    }
    if (agents.reduce((sum, row) => sum + row.matches, 0) > totals.matches) throw new Error('Agent matches exceed the match total.');
  }
  const notes = input.notes == null || input.notes === '' ? '' : label(input.notes, 'source notes', 500);
  return { format: input.format, version: 1, source: input.source, riotId, act, queue: 'competitive', capturedAt, totals, agents, notes };
}

function summaryContext(profile) {
  const accountKey = profile?.senseiAccountKey;
  const seasonId = String(profile?.activeSeasonId || '').toLowerCase();
  if (!/^riot-[a-f0-9]{32}$/.test(accountKey || '') || !UUID.test(seasonId) || !profile.gameName || !profile.tagLine) {
    throw new Error('Load your BYAKUGAN account and current Act before importing.');
  }
  return { accountKey, seasonId };
}

function prepareSummary(input, profile) {
  const summary = normalizeSummary(input);
  const context = summaryContext(profile);
  if (accountName(summary.riotId.gameName) !== accountName(profile.gameName)
    || accountName(summary.riotId.tagLine) !== accountName(profile.tagLine)) {
    throw new Error('This summary belongs to a different Riot ID. Connect the matching account first.');
  }
  if (summary.act.seasonId && summary.act.seasonId !== context.seasonId) throw new Error('This summary is for a different Act.');
  return { summary, context, digest: digest(summary), activeActLabel: profile.activeActLabel || 'Current Act',
    requiresActConfirmation: !summary.act.seasonId };
}

class ActSummaryStore {
  constructor(directory) {
    this.file = path.join(directory, 'act-summary-imports.json');
    this.entries = {};
    this.loadError = '';
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) throw new Error('Invalid summary store.');
      this.entries = data.entries;
    } catch (error) {
      if (error.code !== 'ENOENT') this.loadError = 'Saved imports could not be read. Export or back up act-summary-imports.json before replacing it.';
    }
  }

  key(context) { return `${context.accountKey}:${context.seasonId}:competitive`; }

  write(entries) {
    if (this.loadError) throw new Error(this.loadError);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, entries }, null, 2));
    fs.renameSync(temporary, this.file);
    this.entries = entries;
  }

  get(profile) {
    try {
      const context = summaryContext(profile);
      const entry = this.entries[this.key(context)];
      if (!entry || entry.context?.accountKey !== context.accountKey || entry.context?.seasonId !== context.seasonId) return null;
      const prepared = prepareSummary(entry.summary, profile);
      if (entry.digest !== prepared.digest || !Number.isFinite(Date.parse(entry.importedAt))) return null;
      return structuredClone(entry);
    } catch { return null; }
  }

  import(preview, profile, actConfirmed = false) {
    const prepared = prepareSummary(preview.summary, profile);
    if (prepared.context.accountKey !== preview.context?.accountKey || prepared.context.seasonId !== preview.context?.seasonId
      || prepared.digest !== preview.digest) throw new Error('Account, Act, or file changed. Preview the import again.');
    if (prepared.requiresActConfirmation && actConfirmed !== true) throw new Error('Confirm that the screenshot belongs to the current Act.');
    const existing = this.get(profile);
    if (existing?.digest === prepared.digest) return existing;
    const entry = { summary: prepared.summary, context: prepared.context, digest: prepared.digest, importedAt: new Date().toISOString() };
    this.write({ ...this.entries, [this.key(prepared.context)]: entry });
    return structuredClone(entry);
  }

  remove(profile) {
    const entries = { ...this.entries };
    delete entries[this.key(summaryContext(profile))];
    this.write(entries);
  }

  decorate(snapshot) {
    if (!snapshot?.profile) return snapshot;
    return { ...snapshot, importedActSummary: this.get(snapshot.profile), actSummaryNotice: this.loadError };
  }
}

module.exports = { ActSummaryStore, normalizeSummary, prepareSummary, summaryContext, MAX_BYTES };
