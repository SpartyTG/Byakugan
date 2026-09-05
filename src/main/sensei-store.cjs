'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_REPORTS_PER_ACCOUNT = 250;
const MAX_CHAT_MESSAGES = 40;
const MAX_VOD_FINDINGS = 1_000;
const INTERRUPTED_ANALYSIS_MS = 30 * 60 * 1_000;

function cleanText(value, maximum = 4_000) {
  return String(value || '').trim().slice(0, maximum);
}

function normalizeVodFinding(value = {}) {
  return {
    timestamp: cleanText(value.timestamp, 20),
    endTimestamp: cleanText(value.endTimestamp, 20),
    seconds: Math.max(0, Number(value.seconds) || 0),
    round: Number.isFinite(Number(value.round)) ? Number(value.round) : null,
    category: cleanText(value.category || 'Decision', 80),
    outcome: ['positive', 'negative', 'neutral'].includes(value.outcome) ? value.outcome : 'neutral',
    actor: ['self', 'teammate', 'uncertain'].includes(value.actor) ? value.actor : 'uncertain',
    decisionVisible: value.decisionVisible === true,
    consequenceVisible: value.consequenceVisible === true,
    decision: cleanText(value.decision, 500),
    consequence: cleanText(value.consequence, 500),
    observation: cleanText(value.observation, 700),
    evidence: cleanText(value.evidence, 500),
    coaching: cleanText(value.coaching, 700),
    confidence: ['high', 'average', 'low'].includes(value.confidence) ? value.confidence : 'low'
  };
}

function normalizeVodCheckpoint(value) {
  const version = Number(value?.version);
  if (!value || typeof value !== 'object' || ![2, 3, 4, 5].includes(version)) return null;
  const mode = value.mode === 'adaptive'
    ? 'adaptive'
    : value.mode === 'exhaustive'
      ? 'exhaustive'
      : version >= 3
        ? 'adaptive'
        : 'exhaustive';
  return {
    version,
    mode,
    durationSeconds: Math.max(0, Number(value.durationSeconds) || 0),
    chunkSeconds: Math.max(1, Number(value.chunkSeconds) || 4),
    frameRate: Math.max(.25, Number(value.frameRate) || 4),
    totalSegments: Math.max(0, Math.floor(Number(value.totalSegments) || 0)),
    completedSegments: Math.max(0, Math.floor(Number(value.completedSegments) || 0)),
    framesReviewed: Math.max(0, Math.floor(Number(value.framesReviewed) || 0)),
    gameplaySegments: Math.max(0, Math.floor(Number(value.gameplaySegments) || 0)),
    actionSegments: Math.max(0, Math.floor(Number(value.actionSegments) || 0)),
    invalidSegments: Math.max(0, Math.floor(Number(value.invalidSegments) || 0)),
    candidateFindings: Math.max(0, Math.floor(Number(value.candidateFindings) || 0)),
    rejectedFindings: Math.max(0, Math.floor(Number(value.rejectedFindings) || 0)),
    spectatorSegments: Math.max(0, Math.floor(Number(value.spectatorSegments) || 0)),
    nonCoachableSegments: Math.max(0, Math.floor(Number(value.nonCoachableSegments) || 0)),
    playerAgent: cleanText(value.playerAgent, 80),
    queue: cleanText(value.queue, 80),
    oneLifePerRound: value.oneLifePerRound !== false,
    roundCount: Math.max(0, Math.floor(Number(value.roundCount) || 0)),
    scanFps: mode === 'adaptive' ? Math.max(.25, Number(value.scanFps) || 1) : 0,
    scanSamples: mode === 'adaptive' ? Math.max(0, Math.floor(Number(value.scanSamples) || 0)) : 0,
    windows: mode === 'adaptive' ? (Array.isArray(value.windows) ? value.windows : []).slice(0, 1_000).map((window) => ({
      startSeconds: Math.max(0, Number(window?.startSeconds) || 0),
      durationSeconds: Math.max(.1, Number(window?.durationSeconds) || 12),
      kind: ['activity', 'supplemental', 'quiet-audit'].includes(window?.kind) ? window.kind : 'activity',
      activityScore: Math.max(0, Number(window?.activityScore) || 0)
    })) : [],
    startedAt: Number(value.startedAt) || 0,
    updatedAt: Number(value.updatedAt) || 0,
    elapsedMs: Math.max(0, Number(value.elapsedMs) || 0),
    findings: (Array.isArray(value.findings) ? value.findings : []).slice(-MAX_VOD_FINDINGS).map(normalizeVodFinding),
    limitations: (Array.isArray(value.limitations) ? value.limitations : []).slice(0, 20).map((item) => cleanText(item, 400))
  };
}

function normalizeEntry(value = {}) {
  const entry = {
    matchId: cleanText(value.matchId, 100),
    status: ['analyzing', 'ready', 'failed'].includes(value.status) ? value.status : 'not-analyzed',
    tier: ['lite', 'sensei'].includes(value.tier) ? value.tier : 'lite',
    model: cleanText(value.model, 120),
    notice: cleanText(value.notice, 1_000),
    createdAt: Number(value.createdAt) || 0,
    updatedAt: Number(value.updatedAt) || 0,
    error: cleanText(value.error, 1_000),
    report: value.report && typeof value.report === 'object' ? value.report : null,
    chat: (Array.isArray(value.chat) ? value.chat : []).slice(-MAX_CHAT_MESSAGES).map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      text: cleanText(message?.text, 2_000),
      createdAt: Number(message?.createdAt) || 0
    })),
    brain: value.brain && typeof value.brain === 'object' ? {
      title: cleanText(value.brain.title, 160),
      why: cleanText(value.brain.why, 400),
      drillName: cleanText(value.brain.drillName, 120),
      drillSetup: cleanText(value.brain.drillSetup, 500),
      successMetric: cleanText(value.brain.successMetric, 400),
      keptOpenMission: Boolean(value.brain.keptOpenMission)
    } : null,
    vod: value.vod && typeof value.vod === 'object' ? {
      path: cleanText(value.vod.path, 1_000),
      name: cleanText(value.vod.name, 260),
      size: Math.max(0, Number(value.vod.size) || 0),
      importedAt: Number(value.vod.importedAt) || 0,
      analyzedAt: Number(value.vod.analyzedAt) || 0,
      analysisStartedAt: Number(value.vod.analysisStartedAt) || 0,
      deletedAt: Number(value.vod.deletedAt) || 0,
      status: ['ready', 'analyzing', 'analyzed', 'deleted', 'failed', 'canceled'].includes(value.vod.status) ? value.vod.status : 'ready',
      error: cleanText(value.vod.error, 1_000),
      report: value.vod.report && typeof value.vod.report === 'object' ? value.vod.report : null,
      checkpoint: normalizeVodCheckpoint(value.vod.checkpoint)
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

  recoverInterruptedVodAnalyses() {
    const data = this.read();
    let changed = false;
    for (const account of Object.values(data.accounts || {})) {
      for (const entry of Object.values(account || {})) {
        if (entry?.vod?.status !== 'analyzing') continue;
        entry.vod.status = 'failed';
        entry.vod.error = entry.vod.checkpoint?.completedSegments
          ? 'The previous full-match analysis was interrupted. Resume it from the saved checkpoint.'
          : 'The previous full-match analysis was interrupted. Start it again when ready.';
        entry.updatedAt = Date.now();
        changed = true;
      }
    }
    if (changed) this.write(data);
    return changed;
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

module.exports = { MAX_CHAT_MESSAGES, SenseiStore, normalizeEntry, normalizeVodCheckpoint };
