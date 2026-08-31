'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SESSION_RESUME_WINDOW_MS = 18 * 60 * 60_000;
const MAX_SESSION_MATCH_IDS = 100;

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter((value) => value && value.length <= 100))].slice(-MAX_SESSION_MATCH_IDS);
}

function normalizeSession(value = {}, now = Date.now()) {
  const startedAt = Number(value.startedAt);
  const updatedAt = Number(value.updatedAt);
  return {
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : now,
    startingRank: String(value.startingRank || '').slice(0, 80),
    startingRR: Number.isFinite(Number(value.startingRR)) ? Number(value.startingRR) : 0,
    initialized: value.initialized === true,
    trackedMatchIds: uniqueIds(value.trackedMatchIds),
    excludedMatchIds: uniqueIds(value.excludedMatchIds),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now
  };
}

class SessionStore {
  constructor(directory, { now = () => Date.now(), resumeWindowMs = SESSION_RESUME_WINDOW_MS } = {}) {
    this.file = path.join(directory, 'session-state.json');
    this.now = now;
    this.resumeWindowMs = resumeWindowMs;
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

  get(accountId) {
    const key = String(accountId || '').trim();
    if (!key) return null;
    const value = this.read().accounts[key];
    if (!value) return null;
    const session = normalizeSession(value, this.now());
    if (this.now() - session.updatedAt > this.resumeWindowMs) return null;
    return session;
  }

  save(accountId, value) {
    const key = String(accountId || '').trim();
    if (!key) return null;
    const data = this.read();
    const session = normalizeSession({ ...value, updatedAt: this.now() }, this.now());
    data.accounts[key] = session;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
    return { ...session };
  }

  clear(accountId) {
    const key = String(accountId || '').trim();
    if (!key) return;
    const data = this.read();
    delete data.accounts[key];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
  }
}

module.exports = {
  MAX_SESSION_MATCH_IDS,
  SESSION_RESUME_WINDOW_MS,
  SessionStore,
  normalizeSession,
  uniqueIds
};
