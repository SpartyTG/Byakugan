"use strict";

const fs = require("fs");
const path = require("path");
const { LEAK_STATUS, MISSION_STATUS, isLeakSlug } = require("./types.cjs");

const FILE_NAME = "sensei-brain.json";
const STORE_VERSION = 1;
const MAX_MATCHES_PER_ACCOUNT = 40;

function now() {
  return Date.now();
}

function emptyAccount(accountId) {
  return {
    accountId: String(accountId),
    profile: null,
    matches: [],
    leaks: {},
    mission: null
  };
}

function normalizeAccount(accountId, value) {
  const base = emptyAccount(accountId);
  if (!value || typeof value !== "object") return base;
  return {
    accountId: String(accountId),
    profile: value.profile && typeof value.profile === "object" ? value.profile : null,
    matches: Array.isArray(value.matches) ? value.matches.slice(-MAX_MATCHES_PER_ACCOUNT) : [],
    leaks: value.leaks && typeof value.leaks === "object" ? value.leaks : {},
    mission: value.mission && typeof value.mission === "object" ? value.mission : null
  };
}

class SenseiBrainStore {
  constructor(directory) {
    this.directory = directory;
    this.filePath = path.join(directory, FILE_NAME);
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return this.#blank();
      const accounts = {};
      const incoming = parsed.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {};
      for (const [accountId, value] of Object.entries(incoming)) {
        accounts[accountId] = normalizeAccount(accountId, value);
      }
      return { version: STORE_VERSION, accounts };
    } catch (error) {
      if (error && error.code === "ENOENT") return this.#blank();
      return this.#blank();
    }
  }

  write(data) {
    fs.mkdirSync(this.directory, { recursive: true });
    const payload = {
      version: STORE_VERSION,
      accounts: data && data.accounts ? data.accounts : {}
    };
    fs.writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  #blank() {
    return { version: STORE_VERSION, accounts: {} };
  }

  #account(data, accountId) {
    const id = String(accountId || "default");
    if (!data.accounts[id]) data.accounts[id] = emptyAccount(id);
    return data.accounts[id];
  }

  upsertProfile(accountId, patch) {
    const data = this.read();
    const account = this.#account(data, accountId);
    account.profile = {
      ...(account.profile || {}),
      ...(patch || {}),
      accountId: String(accountId),
      updatedAt: now()
    };
    this.write(data);
    return account.profile;
  }

  insertMatchMemory(accountId, memory) {
    const data = this.read();
    const account = this.#account(data, accountId);
    const row = {
      accountId: String(accountId),
      matchId: String(memory.matchId || ""),
      map: memory.map || null,
      agent: memory.agent || null,
      result: memory.result || null,
      liteScorecard: memory.liteScorecard || {},
      leakSlugs: Array.isArray(memory.leakSlugs) ? memory.leakSlugs.filter(isLeakSlug) : [],
      primaryMissionId: memory.primaryMissionId || null,
      vodUsed: Boolean(memory.vodUsed),
      createdAt: now()
    };
    account.matches.push(row);
    if (account.matches.length > MAX_MATCHES_PER_ACCOUNT) {
      account.matches = account.matches.slice(-MAX_MATCHES_PER_ACCOUNT);
    }
    this.write(data);
    return row;
  }

  touchLeak(accountId, slug, severity, matchId) {
    if (!isLeakSlug(slug)) return null;
    const data = this.read();
    const account = this.#account(data, accountId);
    const current = account.leaks[slug] || {
      accountId: String(accountId),
      slug,
      timesSeen: 0,
      lastSeenMatchId: null,
      severityEwma: 0,
      status: LEAK_STATUS.ACTIVE,
      lastDrillName: null,
      updatedAt: 0
    };
    const nextSeverity = Number(severity);
    const ewma = current.timesSeen === 0
      ? (Number.isFinite(nextSeverity) ? nextSeverity : 1)
      : (current.severityEwma * 0.7) + ((Number.isFinite(nextSeverity) ? nextSeverity : 1) * 0.3);
    current.timesSeen += 1;
    current.lastSeenMatchId = matchId ? String(matchId) : current.lastSeenMatchId;
    current.severityEwma = Math.round(ewma * 100) / 100;
    if (current.status === LEAK_STATUS.RESOLVED) current.status = LEAK_STATUS.ACTIVE;
    current.updatedAt = now();
    account.leaks[slug] = current;
    this.write(data);
    return current;
  }

  getLastMatches(accountId, n = 8) {
    const account = this.#account(this.read(), accountId);
    const count = Math.max(1, Number(n) || 8);
    return account.matches.slice(-count);
  }

  getLedger(accountId) {
    return this.#account(this.read(), accountId).leaks;
  }

  getOpenMission(accountId) {
    const mission = this.#account(this.read(), accountId).mission;
    if (!mission || mission.status !== MISSION_STATUS.PENDING) return null;
    return mission;
  }

  setMission(accountId, mission) {
    const data = this.read();
    const account = this.#account(data, accountId);
    account.mission = {
      ...mission,
      accountId: String(accountId),
      status: MISSION_STATUS.PENDING,
      createdAt: mission && mission.createdAt ? mission.createdAt : now(),
      updatedAt: now()
    };
    this.write(data);
    return account.mission;
  }

  closeMission(accountId, reason) {
    const data = this.read();
    const account = this.#account(data, accountId);
    if (!account.mission) return null;
    const allowed = new Set(Object.values(MISSION_STATUS));
    account.mission.status = allowed.has(reason) ? reason : MISSION_STATUS.SKIPPED;
    account.mission.updatedAt = now();
    this.write(data);
    return account.mission;
  }
}

module.exports = {
  FILE_NAME,
  SenseiBrainStore
};