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
    mission: null,
    cooldowns: []
  };
}

function normalizeAccount(accountId, value) {
  const base = emptyAccount(accountId);
  if (!value || typeof value !== "object") return base;
  return {
    accountId: String(accountId),
    profile: value.profile && typeof value.profile === "object" ? value.profile : null,
    matches: Array.isArray(value.matches) ? value.matches.slice(-MAX_MATCHES_PER_ACCOUNT) : [],
    leaks: value.leaks && typeof value.leaks === "object"
      ? Object.fromEntries(Object.entries(value.leaks).map(([slug, leak]) => [slug, {
          ...(leak && typeof leak === "object" ? leak : {}),
          accountId: String(accountId),
          slug,
          seenMatchIds: [...new Set([
            ...(Array.isArray(leak?.seenMatchIds) ? leak.seenMatchIds : []),
            ...(leak?.lastSeenMatchId ? [leak.lastSeenMatchId] : [])
          ].map(String).filter(Boolean))].slice(-MAX_MATCHES_PER_ACCOUNT)
        }]))
      : {},
    mission: value.mission && typeof value.mission === "object" ? value.mission : null,
    cooldowns: Array.isArray(value.cooldowns) ? value.cooldowns : []
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
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, this.filePath);
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

  migrateAccount(fromAccountId, toAccountId) {
    const from = String(fromAccountId || "");
    const to = String(toAccountId || "");
    if (!from || !to || from === to) return false;
    const data = this.read();
    const source = data.accounts[from];
    if (!source) return false;
    const target = data.accounts[to];
    if (!target) {
      data.accounts[to] = normalizeAccount(to, source);
    } else {
      const sourceAccount = normalizeAccount(to, source);
      const targetAccount = normalizeAccount(to, target);
      const matches = new Map();
      for (const row of [...sourceAccount.matches, ...targetAccount.matches]) {
        const key = String(row.matchId || "");
        const current = matches.get(key);
        if (!current || Number(row.createdAt || 0) >= Number(current.createdAt || 0)) matches.set(key, row);
      }
      const leaks = { ...sourceAccount.leaks };
      for (const [slug, leak] of Object.entries(targetAccount.leaks)) {
        const older = leaks[slug];
        if (!older) { leaks[slug] = leak; continue; }
        const seenMatchIds = [...new Set([...(older.seenMatchIds || []), ...(leak.seenMatchIds || [])])].slice(-MAX_MATCHES_PER_ACCOUNT);
        leaks[slug] = {
          ...(Number(leak.updatedAt || 0) >= Number(older.updatedAt || 0) ? older : leak),
          ...(Number(leak.updatedAt || 0) >= Number(older.updatedAt || 0) ? leak : older),
          accountId: to,
          slug,
          seenMatchIds,
          timesSeen: Math.max(seenMatchIds.length, Number(older.timesSeen || 0), Number(leak.timesSeen || 0))
        };
      }
      const cooldowns = new Map();
      for (const item of [...sourceAccount.cooldowns, ...targetAccount.cooldowns]) {
        const current = cooldowns.get(item.slug);
        if (!current || Number(item.remaining || 0) > Number(current.remaining || 0)) cooldowns.set(item.slug, item);
      }
      data.accounts[to] = {
        accountId: to,
        profile: { ...(sourceAccount.profile || {}), ...(targetAccount.profile || {}), accountId: to },
        matches: [...matches.values()].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).slice(-MAX_MATCHES_PER_ACCOUNT),
        leaks,
        mission: (targetAccount.mission || sourceAccount.mission)
          ? { ...(targetAccount.mission || sourceAccount.mission), accountId: to }
          : null,
        cooldowns: [...cooldowns.values()]
      };
    }
    delete data.accounts[from];
    this.write(data);
    return true;
  }

  insertMatchMemory(accountId, memory) {
    const data = this.read();
    const account = this.#account(data, accountId);
    const row = {
      matchId: String(memory.matchId || ""),
      map: memory.map || "",
      agent: memory.agent || "",
      result: memory.result || "",
      liteScorecard: memory.liteScorecard || {},
      leakSlugs: Array.isArray(memory.leakSlugs) ? memory.leakSlugs.filter(isLeakSlug) : [],
      vodUsed: Boolean(memory.vodUsed),
      createdAt: now()
    };
    const replacing = account.matches.some((item) => item.matchId === row.matchId);
    account.matches = account.matches.filter((item) => item.matchId !== row.matchId);
    account.matches.push(row);
    if (account.matches.length > MAX_MATCHES_PER_ACCOUNT) {
      account.matches = account.matches.slice(-MAX_MATCHES_PER_ACCOUNT);
    }
    if (!replacing) {
      account.cooldowns = (account.cooldowns || [])
        .map((item) => ({ ...item, remaining: Math.max(0, Number(item.remaining || 0) - 1) }))
        .filter((item) => item.remaining > 0);
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
      seenMatchIds: [],
      updatedAt: 0
    };
    current.seenMatchIds = [...new Set([
      ...(Array.isArray(current.seenMatchIds) ? current.seenMatchIds : []),
      ...(current.lastSeenMatchId ? [current.lastSeenMatchId] : [])
    ].map(String).filter(Boolean))];
    const matchKey = matchId ? String(matchId) : "";
    const alreadyCounted = Boolean(matchKey && current.seenMatchIds.includes(matchKey));
    const nextSeverity = Number(severity);
    const ewma = alreadyCounted
      ? Math.max(Number(current.severityEwma) || 0, Number.isFinite(nextSeverity) ? nextSeverity : 1)
      : current.timesSeen === 0
      ? (Number.isFinite(nextSeverity) ? nextSeverity : 1)
      : (current.severityEwma * 0.7) + ((Number.isFinite(nextSeverity) ? nextSeverity : 1) * 0.3);
    if (!alreadyCounted) current.timesSeen += 1;
    if (matchKey && !alreadyCounted) current.seenMatchIds.push(matchKey);
    current.seenMatchIds = current.seenMatchIds.slice(-MAX_MATCHES_PER_ACCOUNT);
    current.lastSeenMatchId = matchKey || current.lastSeenMatchId;
    current.severityEwma = Math.round(ewma * 100) / 100;
    if (!alreadyCounted && current.status === LEAK_STATUS.RESOLVED) current.status = LEAK_STATUS.ACTIVE;
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

  getBlockedSlugs(accountId) {
    const account = this.#account(this.read(), accountId);
    return (account.cooldowns || []).filter((item) => Number(item.remaining) > 0).map((item) => item.slug);
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

  closeMission(accountId, reason, fallbackSlug) {
    const data = this.read();
    const account = this.#account(data, accountId);
    if (!account.mission && !fallbackSlug) return null;
    const allowed = new Set(Object.values(MISSION_STATUS));
    const status = allowed.has(reason) ? reason : MISSION_STATUS.SKIPPED;
    if (account.mission) {
      account.mission.status = status;
      account.mission.updatedAt = now();
    }
    const slug = (account.mission && account.mission.slug) || fallbackSlug;
    const remaining = status === MISSION_STATUS.WRONG ? 8 : status === MISSION_STATUS.RESOLVED_BY_USER || status === "resolved_by_user" ? 5 : 3;
    if (slug) {
      account.cooldowns = (account.cooldowns || []).filter((item) => item.slug !== slug);
      account.cooldowns.push({ slug, reason: status, remaining });
    }
    this.write(data);
    return account.mission;
  }
}

module.exports = {
  FILE_NAME,
  SenseiBrainStore
};
