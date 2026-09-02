'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_REPORTS_PER_ACCOUNT = 250;
const MAX_CHAT_MESSAGES = 40;
const INTERRUPTED_ANALYSIS_MS = 30 * 60 * 1_000;

function cleanText(value, maximum = 4_000) {
  return String(value || '').trim().slice(0, maximum);
}

function normalizeEntry(value = {}) {
  const entry = {
    matchId: cleanText(value.matchId, 100),
    status: ['analyzing', 'ready', 'failed'].includes(value.status) ? value.status : 'not-analyzed',
    tier: ['lite', 'sensei'].includes(value.tier) ? value.tier : 'lite',
    model: cleanText(value.model, 120),
    createdAt: Number(value.createdAt) || 0,
    updatedAt: Number(value.updatedAt) || 0,
    error: cleanText(value.error, 1_000),
    report: value.report && typeof value.report === 'object' ? value.report : null,
    chat: (Array.isArray(value.chat) ? value.chat : []).slice(-MAX_CHAT_MESSAGES).map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      text: cleanText(message?.text, 2_000),
      createdAt: Number(message?.createdAt) || 0
    })),
    vod: value.vod && typeof value.vod === 'object' ? {
      path: cleanText(value.vod.path, 1_000),
      name: cleanText(value.vod.name, 260),
      size: Math.max(0, Number(value.vod.size) || 0),
      importedAt: Number(value.vod.importedAt) || 0,
      analyzedAt: Number(value.vod.analyzedAt) || 0,
      deletedAt: Number(value.vod.deletedAt) || 0,
      status: ['ready', 'analyzing', 'analyzed', 'deleted', 'failed'].includes(value.vod.status) ? value.vod.status : 'ready',
      error: cleanText(value.vod.error, 1_000),
      report: value.vod.report && typeof value.vod.report === 'object' ? value.vod.report : null
    } : null
  };
  if (entry.status === 'ready' && !entry.report) entry.status = 'not-analyzed';
  if (entry.status === 'analyzing' && entry.updatedAt && Date.now() - entry.updatedAt > INTERRUPTED_ANALYSIS_MS) {
    entry.status = 'failed';
    entry.error = 'The previous analysis was interrupted. Run Sensei Vision again when ready.';
  }
  if (entry.vod?.status === 'analyzing' && entry.updatedAt && Date.now() - entry.updatedAt > INTERRUPTED_ANALYSIS_MS) {
    entry.vod.status = 'failed';
    entry.vod.error = 'The previous VOD analysis was interrupted. The original recording was not deleted.';
  }
  return entry;
}

class SenseiStore {
  constructor(directory) {
    this.file = path.join(directory, 'sensei-reports.json');
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return parsed?.version === 1 && parsed.accounts && typeof parsed.accounts === 'object'
        ? parsed
        : { version: 1, accounts: {} };
    } catch {
      return { version: 1, accounts: {} };
    }
  }

  write(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
  }

  get(accountId, matchId) {
    const account = this.read().accounts[cleanText(accountId, 160)] || {};
    const value = account[cleanText(matchId, 100)];
    return value ? normalizeEntry(value) : null;
  }

  save(accountId, matchId, patch = {}) {
    const accountKey = cleanText(accountId, 160);
    const matchKey = cleanText(matchId, 100);
    if (!accountKey || !matchKey) throw new Error('A player and completed match are required.');
    const data = this.read();
    const account = data.accounts[accountKey] ||= {};
    const existing = normalizeEntry(account[matchKey] || { matchId: matchKey });
    const next = normalizeEntry({ ...existing, ...patch, matchId: matchKey, updatedAt: Date.now() });
    if (!next.createdAt) next.createdAt = next.updatedAt;
    account[matchKey] = next;
    const rows = Object.entries(account).sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0));
    data.accounts[accountKey] = Object.fromEntries(rows.slice(0, MAX_REPORTS_PER_ACCOUNT));
    this.write(data);
    return normalizeEntry(next);
  }
}

module.exports = { MAX_CHAT_MESSAGES, SenseiStore, normalizeEntry };
