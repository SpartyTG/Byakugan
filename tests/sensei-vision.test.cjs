'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SenseiStore, normalizeEntry } = require('../src/main/sensei-store.cjs');
const { buildContextPack, compactMatch, liteReport, parseStructuredJson, validateReport } = require('../src/main/services/sensei-service.cjs');
const { SettingsStore } = require('../src/main/settings-store.cjs');

function match(id, patch = {}) {
  return {
    id, result: 'DEFEAT', map: 'Ascent', playlist: 'Competitive', agent: 'Omen', agentRole: 'Controller', rankName: 'Ascendant 1',
    score: '10 – 13', kills: 14, deaths: 18, assists: 8, kd: .78, shots: { headshots: 10, bodyshots: 30, legshots: 2 },
    report: { openingKills: 1, openingDeaths: 4, rounds: [] }, ...patch
  };
}

test('Sensei Lite builds a strict evidence-backed report without unavailable fields', () => {
  const current = match('current');
  const history = [match('one', { result: 'VICTORY', kills: 20, deaths: 10, kd: 2 }), match('two', { map: 'Lotus', agent: 'Jett', kills: 12, deaths: 12, kd: 1 })];
  const card = compactMatch(current);
  assert.equal(card.matchId, 'current');
  assert.equal(card.acs, undefined);
  assert.equal(card.adr, undefined);
  const context = buildContextPack(current, history);
  assert.equal(context.overall.matches, 2);
  assert.equal(context.sameAgent.matches, 1);
  assert.equal(context.overall.deltas.kd, -.67);
  assert.equal(context.overall.deltas.kills, -2);
  const report = validateReport(liteReport(current, context));
  assert.equal(report.drills.length, 3);
  assert.equal(report.strengths.length <= 3, true);
  assert.match(report.weaknesses.join(' '), /18|4|14/);
  assert.match(report.focusRule, /first contact/i);
});

test('Sensei reports persist independently by player and match', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-sensei-'));
  try {
    const store = new SenseiStore(directory);
    store.save('player-a', 'match-a', { status: 'ready', tier: 'lite', report: liteReport(match('match-a'), buildContextPack(match('match-a'), [])) });
    store.save('player-a', 'match-b', { status: 'failed', error: 'model unavailable' });
    store.save('player-b', 'match-a', { status: 'analyzing' });
    assert.equal(new SenseiStore(directory).get('player-a', 'match-a').status, 'ready');
    assert.equal(new SenseiStore(directory).get('player-a', 'match-b').status, 'failed');
    assert.equal(new SenseiStore(directory).get('player-b', 'match-a').status, 'analyzing');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('interrupted analyses recover to a retryable failure without losing a saved VOD', () => {
  const interrupted = normalizeEntry({
    matchId: 'old-match', status: 'analyzing', updatedAt: Date.now() - 31 * 60 * 1_000,
    vod: { path: 'C:\\recordings\\match.mkv', name: 'match.mkv', size: 100, status: 'analyzing' }
  });
  assert.equal(interrupted.status, 'failed');
  assert.equal(interrupted.vod.status, 'failed');
  assert.match(interrupted.error, /interrupted/i);
  assert.equal(interrupted.vod.path, 'C:\\recordings\\match.mkv');
});

test('strict Sensei validation rejects a model report without three complete drills', () => {
  const report = liteReport(match('strict'), buildContextPack(match('strict'), []));
  report.drills.pop();
  assert.throws(() => validateReport(report), /exactly three runnable drills/i);
});

test('strict Sensei validation rejects repetitive drills and accepts harmless fenced JSON', () => {
  const report = liteReport(match('quality'), buildContextPack(match('quality'), []));
  const parsed = parseStructuredJson(`Here is the report:\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\``);
  assert.equal(validateReport(parsed).drills.length, 3);
  report.drills[1] = { ...report.drills[0] };
  assert.throws(() => validateReport(report), /three distinct drills/i);
});

test('Sensei verdicts stay specific and focus rules remain memorable', () => {
  const report = liteReport(match('concise'), buildContextPack(match('concise'), []));
  report.verdict = 'Generic result.';
  assert.throws(() => validateReport(report), /two or three/i);
  const next = liteReport(match('long-focus'), buildContextPack(match('long-focus'), []));
  next.focusRule = Array.from({ length: 25 }, () => 'word').join(' ');
  assert.throws(() => validateReport(next), /24 words/i);
});

test('Sensei settings are optional, allowlisted, and disabled by default', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-sensei-settings-'));
  try {
    const store = new SettingsStore(directory);
    assert.equal(store.get().senseiEnabled, false);
    assert.equal(store.get().senseiVodEnabled, false);
    const updated = store.update({ senseiEnabled: true, senseiTier: 'sensei', senseiModel: 'qwen2.5:7b', senseiVodEnabled: true, senseiVodModel: 'vision/model:latest', senseiOfferVodCleanup: true });
    assert.equal(updated.senseiTier, 'sensei');
    assert.equal(updated.senseiOfferVodCleanup, true);
    assert.equal(store.update({ senseiTier: 'cloud', senseiModel: '<script>' }).senseiTier, 'sensei');
    assert.equal(store.get().senseiModel, 'qwen2.5:7b');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Sensei is manual-only in IPC and the match panel exposes persisted reports and VOD cleanup', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.cjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/index.html'), 'utf8');
  assert.match(main, /ipcMain\.handle\('sensei:run'/);
  assert.doesNotMatch(main, /schedulePostMatchRefresh[\s\S]{0,500}senseiService\.analyze/);
  assert.match(main, /status: 'ready', error: '', report: null/);
  assert.match(main, /shell\.trashItem\(source\)/);
  assert.match(main, /ipcMain\.handle\('sensei:vod-cancel'/);
  assert.match(main, /sensei:vod-progress/);
  assert.match(main, /visionCapable/);
  assert.match(renderer, /Run Sensei Vision/);
  assert.match(renderer, /I’ve read it — remove VOD/);
  assert.match(renderer, /VOD ANALYSIS IN PROGRESS/);
  assert.match(renderer, /Cancel analysis/);
  assert.match(html, /Enable Sensei Vision/);
  assert.match(html, /No paid API and no live coaching/);
  assert.match(html, /Source Record plugin/);
  assert.match(html, /FFprobe/);
});

test('VOD Vision batches images, disables model thinking, and exposes actionable Ollama errors', () => {
  const service = fs.readFileSync(path.join(__dirname, '..', 'src/main/services/sensei-service.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src/main/preload.cjs'), 'utf8');
  assert.match(service, /const batchSize = 4/);
  assert.match(service, /think: false/);
  assert.match(service, /Ollama returned HTTP/);
  assert.match(service, /scale=640:-2/);
  assert.match(preload, /onSenseiVodProgress/);
  assert.match(preload, /cancelSenseiVod/);
});
