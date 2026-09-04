'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { SenseiStore, normalizeEntry } = require('../src/main/sensei-store.cjs');
const {
  SenseiService, ADAPTIVE_VOD_ANALYSIS_VERSION, ADAPTIVE_VOD_FRAME_RATE, ADAPTIVE_VOD_MAX_FRAMES, ADAPTIVE_VOD_WINDOW_SECONDS,
  buildAdaptiveReviewWindows, buildContextPack, compactMatch, coveredWindowSeconds,
  finalizeFullVodReport, isUsefulVodFinding, liteReport, parseStructuredJson, parseVodActivityScan,
  senseiMetricRubric, validateFullVodSegment, validateGroundedReport, validateReport
} = require('../src/main/services/sensei-service.cjs');
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
    store.save('player-a', 'match-a', { status: 'ready', tier: 'lite', notice: 'Local model fallback was used.', report: liteReport(match('match-a'), buildContextPack(match('match-a'), [])) });
    store.save('player-a', 'match-b', { status: 'failed', error: 'model unavailable' });
    store.save('player-b', 'match-a', { status: 'analyzing' });
    assert.equal(new SenseiStore(directory).get('player-a', 'match-a').status, 'ready');
    assert.equal(new SenseiStore(directory).get('player-a', 'match-a').notice, 'Local model fallback was used.');
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
  const source = JSON.stringify(report).replace(/}$/, ',}');
  const parsed = parseStructuredJson(`<think>Draft object {not valid}</think>Here is the report:\n\`\`\`json\n${source}\n\`\`\``);
  assert.equal(validateReport(parsed).drills.length, 3);
  report.drills[1] = { ...report.drills[0] };
  assert.throws(() => validateReport(report), /three distinct drills/i);
});

test('Full Sensei repairs malformed model output with broadly compatible JSON mode', async () => {
  const payload = JSON.stringify(liteReport(match('structured-repair'), buildContextPack(match('structured-repair'), [])));
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ response: requests.length === 1 ? 'I analyzed the match, but forgot the JSON.' : payload }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new SenseiService({ endpoint: `http://127.0.0.1:${server.address().port}` });
    const result = await service.analyze({ match: match('structured-repair'), matches: [], tier: 'sensei', model: 'small-model:4b' });
    assert.equal(result.tier, 'sensei');
    assert.equal(result.model, 'small-model:4b');
    assert.equal(result.notice, '');
    assert.equal(requests.length, 2);
    assert.equal(typeof requests[0].format, 'object');
    assert.equal(requests[1].format, 'json');
    assert.match(requests[1].prompt, /validation problem/i);
    assert.match(requests[1].prompt, /GROUNDING CONTEXT/);
    assert.match(requests[1].prompt, /requiredScorecard/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Full Sensei safely falls back to an identified Lite report when JSON repair still fails', async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ response: 'This model refuses to return structured output.' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new SenseiService({ endpoint: `http://127.0.0.1:${server.address().port}` });
    const result = await service.analyze({ match: match('structured-fallback'), matches: [], tier: 'sensei', model: 'small-model:4b' });
    assert.equal(requests.length, 2);
    assert.equal(result.tier, 'lite');
    assert.equal(result.model, 'BYAKUGAN Lite Engine');
    assert.match(result.notice, /small-model:4b/);
    assert.match(result.notice, /Sensei Lite/);
    assert.equal(validateReport(result.report).drills.length, 3);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Sensei verdicts stay specific and focus rules remain memorable', () => {
  const report = liteReport(match('concise'), buildContextPack(match('concise'), []));
  report.verdict = 'Generic result.';
  assert.throws(() => validateReport(report), /two or three/i);
  const next = liteReport(match('long-focus'), buildContextPack(match('long-focus'), []));
  next.focusRule = Array.from({ length: 25 }, () => 'word').join(' ');
  assert.throws(() => validateReport(next), /24 words/i);
});

test('Sensei grounds a 21/13 Omen performance to the deterministic metric rubric', () => {
  const strong = match('strong-omen', {
    result: 'VICTORY', score: '13 – 9', kills: 21, deaths: 13, assists: 8, kd: 1.62,
    acs: 269, adr: 157.7, shots: { headshots: 34, bodyshots: 80, legshots: 4 },
    report: { openingKills: 3, openingDeaths: 1, rounds: [] }
  });
  const card = compactMatch(strong);
  assert.equal(card.hsPercent, 28.8);
  assert.deepEqual(senseiMetricRubric(card).scorecard, {
    impact: 'high', aim: 'high', entry: 'high', utility: 'average', econ: 'average'
  });
  const safe = liteReport(strong, buildContextPack(strong, []));
  assert.deepEqual(validateGroundedReport(safe, card).scorecard, {
    impact: 'high', aim: 'high', entry: 'high', utility: 'average', econ: 'average'
  });
});

test('Sensei rejects negative metric reversals and unrealistic drills from the reported Omen case', () => {
  const strong = match('strong-omen-invalid', {
    result: 'VICTORY', score: '13 – 9', kills: 21, deaths: 13, assists: 8, kd: 1.62,
    acs: 269, adr: 157.7, shots: { headshots: 34, bodyshots: 80, legshots: 4 },
    report: { openingKills: 3, openingDeaths: 1, rounds: [] }
  });
  const card = compactMatch(strong);
  const contradicted = liteReport(strong, buildContextPack(strong, []));
  contradicted.verdict = 'Your 21 kills and 269 ACS were high, but low ADR (157.7) and HS% (28.9) indicate poor damage output and shot accuracy. Your 13 deaths and 1.62 K/D suggest poor survival.';
  contradicted.weaknesses = [
    'Low ADR (157.7) and HS% (28.9) show poor damage output and accuracy.',
    'High deaths (13) and 1.62 K/D suggest poor survival and positioning.'
  ];
  assert.throws(() => validateGroundedReport(contradicted, card), /contradicts.*K\/D|contradicts.*ADR/i);

  const unrealistic = liteReport(strong, buildContextPack(strong, []));
  unrealistic.drills[0] = {
    name: 'Range Mechanics Drill', setup: 'Practice shooting from 10m to 30m for 100 rounds.',
    success: 'Achieve 80% headshot accuracy and 90% body shot accuracy within 100 rounds.'
  };
  assert.throws(() => validateReport(unrealistic), /realistic short practice blocks/i);
});

test('Full Sensei repair receives the exact rubric after reversing strong Omen metrics', async () => {
  const strong = match('strong-omen-repair', {
    result: 'VICTORY', score: '13 – 9', kills: 21, deaths: 13, assists: 10, kd: 1.62,
    acs: 269, adr: 157.7, shots: { headshots: 34, bodyshots: 80, legshots: 4 },
    report: { openingKills: 3, openingDeaths: 1, rounds: [] }
  });
  const context = buildContextPack(strong, []);
  const invalid = liteReport(strong, context);
  invalid.verdict = 'Your 21 kills and 269 ACS were high, but low ADR (157.7) and HS% (28.8) indicate poor damage output. Your 13 deaths and 1.62 K/D suggest poor survival.';
  invalid.weaknesses = ['Low ADR (157.7) and HS% (28.8) show poor damage output and accuracy.'];
  const repaired = liteReport(strong, context);
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ response: JSON.stringify(requests.length === 1 ? invalid : repaired) }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new SenseiService({ endpoint: `http://127.0.0.1:${server.address().port}` });
    const result = await service.analyze({ match: strong, matches: [], tier: 'sensei', model: 'qwen3:8b' });
    assert.equal(requests.length, 2);
    assert.equal(result.tier, 'sensei');
    assert.equal(result.notice, '');
    assert.deepEqual(result.report.scorecard, {
      impact: 'high', aim: 'high', entry: 'high', utility: 'average', econ: 'average'
    });
    assert.match(requests[1].prompt, /1\.62/);
    assert.match(requests[1].prompt, /requiredScorecard/);
    assert.match(requests[1].prompt, /poor survival/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Full Sensei deterministically repairs missing weakness numbers and evidence citations without falling back', async () => {
  const strong = match('strong-omen-evidence', {
    result: 'VICTORY', score: '13 – 9', kills: 21, deaths: 13, assists: 10, kd: 1.62,
    acs: 269, adr: 157.7, shots: { headshots: 34, bodyshots: 80, legshots: 4 },
    report: { openingKills: 3, openingDeaths: 1, rounds: [] }
  });
  const lite = liteReport(strong, buildContextPack(strong, []));
  const incompleteEvidence = {
    ...lite,
    weaknesses: ['Review whether late-round utility could have created more team value.'],
    citations: []
  };
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ response: JSON.stringify(incompleteEvidence) }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new SenseiService({ endpoint: `http://127.0.0.1:${server.address().port}` });
    const result = await service.analyze({ match: strong, matches: [], tier: 'sensei', model: 'qwen3:8b' });
    assert.equal(requests.length, 1);
    assert.equal(result.tier, 'sensei');
    assert.equal(result.notice, '');
    assert.match(result.report.weaknesses.join(' '), /no clear statistical weakness/i);
    assert.match(result.report.weaknesses.join(' '), /21\/13\/10/);
    assert.match(result.report.citations.join(' '), /1\.62 K\/D/);
    assert.match(result.report.citations.join(' '), /157\.7 ADR/);
    assert.match(result.report.citations.join(' '), /28\.8% HS/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Sensei settings are optional, allowlisted, and disabled by default', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-sensei-settings-'));
  try {
    const store = new SettingsStore(directory);
    assert.equal(store.get().senseiEnabled, false);
    assert.equal(store.get().senseiVodEnabled, false);
    assert.equal(store.get().senseiVodMode, 'adaptive');
    const updated = store.update({ senseiEnabled: true, senseiTier: 'sensei', senseiModel: 'qwen2.5:7b', senseiVodEnabled: true, senseiVodModel: 'vision/model:latest', senseiVodMode: 'exhaustive', senseiOfferVodCleanup: true });
    assert.equal(updated.senseiTier, 'sensei');
    assert.equal(updated.senseiVodMode, 'exhaustive');
    assert.equal(updated.senseiOfferVodCleanup, true);
    assert.equal(store.update({ senseiTier: 'cloud', senseiModel: '<script>', senseiVodMode: 'fastest' }).senseiTier, 'sensei');
    assert.equal(store.get().senseiVodMode, 'exhaustive');
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
  assert.match(main, /analysisStartedAt/);
  assert.match(main, /checkpointElapsedMs/);
  assert.match(main, /Date\.now\(\) - analysisStartedAt/);
  assert.match(main, /powerSaveBlocker\.start\('prevent-app-suspension'\)/);
  assert.match(main, /visionCapable/);
  assert.match(renderer, /Run Sensei Vision/);
  assert.match(renderer, /I’ve read it — remove VOD/);
  assert.match(renderer, /ADAPTIVE QUALITY TEST IN PROGRESS/);
  assert.match(renderer, /EXHAUSTIVE ANALYSIS IN PROGRESS/);
  assert.match(renderer, /Pause safely/);
  assert.match(renderer, /Resume full analysis/);
  assert.match(renderer, /LOCAL MODEL FALLBACK/);
  assert.match(renderer, /Number\(entry\.vod\.analysisStartedAt\)/);
  assert.match(renderer, /mergeSenseiVodProgress\(state\.senseiVodProgress, progress\)/);
  assert.match(renderer, /senseiVodActiveMatchId/);
  assert.match(renderer, /renderSenseiVodGlobal/);
  assert.match(renderer, /earlier VOD analysis engine/);
  assert.match(renderer, /fixed-agent, spectator, round, evidence, and duplication safeguards/);
  assert.match(renderer, /Accepted .* model candidates/);
  assert.match(html, /Enable Sensei Vision/);
  assert.match(html, /VOD VISION RUNNING/);
  assert.match(html, /No paid API and no live coaching/);
  assert.match(html, /Source Record plugin/);
  assert.match(html, /FFprobe/);
});

test('Sensei owns a dedicated coaching workspace without duplicating full match history', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/index.html'), 'utf8');
  assert.match(html, /data-view="sensei"/);
  assert.match(html, /id="view-sensei"/);
  assert.match(html, /POST-MATCH COACHING WORKSPACE/);
  assert.match(html, /id="senseiMatchPicker"/);
  assert.match(html, /id="senseiRecentReports"/);
  assert.match(html, /id="senseiWorkspacePanel"/);
  assert.match(html, /Adaptive Quality Test/);
  assert.match(html, /Exhaustive — slow comparison mode/);
  assert.match(html, /CURRENT COACHING FOCUS/);
  assert.match(renderer, /data-open-sensei-match/);
  assert.match(renderer, /Open in Sensei/);
  assert.match(renderer, /hydrateSenseiHub/);
  assert.match(renderer, /senseiVodActiveMatchId/);
});

test('adaptive VOD planning scans the full timeline and selects bounded activity plus quiet-audit windows', () => {
  const raw = 'frame:0 pts:0 pts_time:0\nlavfi.signalstats.YDIF=0\nframe:1 pts:1 pts_time:1\nlavfi.signalstats.YDIF=12.5\n';
  assert.deepEqual(parseVodActivityScan(raw), [{ seconds: 0, difference: 0 }, { seconds: 1, difference: 12.5 }]);
  const durationSeconds = 600;
  const samples = Array.from({ length: durationSeconds }, (_, seconds) => ({
    seconds,
    difference: seconds % 40 === 20 ? 16 : seconds % 13 < 4 ? 6 : .5
  }));
  const windows = buildAdaptiveReviewWindows(samples, durationSeconds);
  assert.equal(windows.length > 15, true);
  assert.equal(windows.length < durationSeconds / 4, true);
  assert.equal(windows.some((window) => window.kind === 'activity'), true);
  assert.equal(windows.some((window) => window.kind === 'supplemental'), true);
  assert.equal(windows.some((window) => window.kind === 'quiet-audit'), true);
  assert.equal(windows.every((window) => window.startSeconds >= 0 && window.startSeconds + window.durationSeconds <= durationSeconds + .1), true);
  assert.deepEqual(windows, windows.slice().sort((left, right) => left.startSeconds - right.startSeconds));
  assert.equal(coveredWindowSeconds(windows) > 0, true);
  assert.equal(coveredWindowSeconds(windows) < durationSeconds, true);
  assert.equal(Math.ceil(ADAPTIVE_VOD_FRAME_RATE * ADAPTIVE_VOD_WINDOW_SECONDS), ADAPTIVE_VOD_MAX_FRAMES);
  assert.equal(ADAPTIVE_VOD_MAX_FRAMES, 16);
});

test('adaptive full-match reports separate complete scan coverage from detailed model coverage', () => {
  const report = finalizeFullVodReport({
    version: ADAPTIVE_VOD_ANALYSIS_VERSION, mode: 'adaptive', durationSeconds: 600, scanFps: 1, scanSamples: 600,
    frameRate: ADAPTIVE_VOD_FRAME_RATE, totalSegments: 3, completedSegments: 3, framesReviewed: 48,
    windows: [
      { startSeconds: 10, durationSeconds: 12, kind: 'activity' },
      { startSeconds: 100, durationSeconds: 12, kind: 'supplemental' },
      { startSeconds: 300, durationSeconds: 12, kind: 'quiet-audit' }
    ],
    findings: [], limitations: []
  });
  assert.equal(report.mode, 'adaptive-full-match');
  assert.equal(report.coverage.scanPercent, 100);
  assert.equal(report.coverage.detailedSeconds, 36);
  assert.equal(report.coverage.detailedPercent, 6);
  assert.match(report.summary, /scanned 10:00 from beginning to end/i);
  assert.match(report.limitations.join(' '), /events between detail windows may be missed/i);
});

test('VOD Vision batches images, disables model thinking, and exposes actionable Ollama errors', () => {
  const service = fs.readFileSync(path.join(__dirname, '..', 'src/main/services/sensei-service.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src/main/preload.cjs'), 'utf8');
  assert.match(service, /const batchSize = 4/);
  assert.match(service, /think: false/);
  assert.match(service, /repairModel \|\| model/);
  assert.match(service, /Reviewing frames/);
  assert.match(service, /etaSeconds: estimatedEtaSeconds/);
  assert.match(service, /Ollama returned HTTP/);
  assert.match(service, /scale=640:-2/);
  assert.match(service, /locked .* for the entire match/i);
  assert.match(service, /teammate-spectating/);
  assert.match(service, /Return at most one finding/);
  assert.match(preload, /onSenseiVodProgress/);
  assert.match(preload, /cancelSenseiVod/);
});

test('VOD Vision repairs invalid vision JSON with the text model without resending frames', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-vod-repair-'));
  const frameFiles = Array.from({ length: 4 }, (_, index) => {
    const file = path.join(directory, `frame-${index}.jpg`);
    fs.writeFileSync(file, Buffer.from([0xff, 0xd8, index, 0xff, 0xd9]));
    return file;
  });
  const payload = JSON.stringify({
    summary: 'The sampled frames showed a repeatable positioning pattern.',
    findings: [{ timestamp: '0:05', category: 'Positioning', observation: 'The player was visible away from cover.', evidence: 'The frame showed open space on both sides.' }],
    limitations: ['Only sampled frames were reviewed.'], confidence: 'average'
  });
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ response: requests.length === 1 ? 'Here are the visual findings, but this is not JSON.' : payload }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const events = [];
    const service = new SenseiService({ endpoint: `http://127.0.0.1:${server.address().port}` });
    const report = await service.analyzeVod({
      match: match('vod-repair'), statisticalReport: liteReport(match('vod-repair'), buildContextPack(match('vod-repair'), [])),
      frameFiles, frameTimestamps: [5, 10, 15, 20], model: 'vision-model', repairModel: 'text-model', onProgress: (event) => events.push(event)
    });
    assert.equal(report.framesReviewed, 4);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].model, 'vision-model');
    assert.equal(requests[0].images.length, 4);
    assert.equal(requests[1].model, 'text-model');
    assert.equal(requests[1].images, undefined);
    assert.match(events.map((event) => event.message).join(' '), /Reviewing frames 1-4/);
    assert.match(events.map((event) => event.message).join(' '), /Repairing structured output/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('VOD Vision locally normalizes usable malformed output after model repair fails', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-vod-normalize-'));
  const frameFiles = Array.from({ length: 4 }, (_, index) => {
    const file = path.join(directory, `frame-${index}.jpg`);
    fs.writeFileSync(file, Buffer.from([0xff, 0xd8, index, 0xff, 0xd9]));
    return file;
  });
  const malformed = '"summary":"The player held an exposed angle in the sampled frames.","timestamp":"0:05","category":"Positioning","observation":"The player was visible away from cover.","evidence":"Open space was visible on both sides."';
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ response: '', thinking: malformed }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const service = new SenseiService({ endpoint: `http://127.0.0.1:${server.address().port}` });
    const report = await service.analyzeVod({
      match: match('vod-normalize'), statisticalReport: {}, frameFiles, frameTimestamps: [5, 10, 15, 20],
      model: 'vision-model', repairModel: 'text-model'
    });
    assert.equal(requests.length, 2);
    assert.equal(report.framesReviewed, 4);
    assert.equal(report.findings.length, 1);
    assert.equal(report.confidence, 'low');
    assert.match(report.limitations.join(' '), /unstructured output/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('full-match VOD validation rejects HUD filler and keeps actionable temporal coaching', () => {
  const segment = validateFullVodSegment({
    sceneType: 'gameplay', perspective: 'self', phase: 'live-round', activity: 'combat', roundNumberVisible: false,
    summary: 'One fight occurred.', limitations: [],
    findings: [
      {
        timestamp: '10:04', category: 'crosshair', outcome: 'neutral', confidence: 'low',
        actor: 'self', decisionVisible: false, consequenceVisible: false,
        decision: 'The crosshair remained visible.', consequence: 'No consequence was visible.',
        observation: 'The crosshair is centered on the screen while the player is holding a weapon.',
        evidence: 'The crosshair and health bar are visible in every supplied image.',
        coaching: 'Keep the crosshair centered while playing the game.'
      },
      {
        timestamp: '10:06', category: 'Positioning', outcome: 'negative', confidence: 'average',
        actor: 'self', decisionVisible: true, consequenceVisible: true,
        decision: 'The player widened before clearing the close-left corner.', consequence: 'The player became exposed to a second angle and took damage.',
        observation: 'The player widened into a second angle before clearing the close-left corner.',
        evidence: 'Across images 8–12, the left corner remained uncleared while the player moved into the open and then took damage.',
        coaching: 'Clear the close-left corner from cover before widening far enough to expose the second angle.'
      }
    ]
  }, { startSeconds: 600, endSeconds: 608, frameCount: 16, maxFindings: 2, playerAgent: 'Omen', queue: 'Competitive', roundCount: 23 });
  assert.equal(segment.findings.length, 1);
  assert.equal(segment.findings[0].timestamp, '10:06');
  assert.match(segment.findings[0].coaching, /clear the close-left/i);
  assert.equal(isUsefulVodFinding(segment.findings[0]), true);
});

test('full-match report proves complete chronological coverage and groups repeated problems', () => {
  const finding = {
    timestamp: '1:02', endTimestamp: '1:08', seconds: 62, round: 2, category: 'Positioning', outcome: 'negative',
    actor: 'self', decisionVisible: true, consequenceVisible: true,
    decision: 'The player immediately re-peeked the same lane after taking damage.',
    consequence: 'The unchanged re-peek exposed the player to the same opponent again.',
    observation: 'The player re-peeked the same exposed lane immediately after taking damage.',
    evidence: 'Ordered frames show damage, a retreat behind cover, and an immediate return to the unchanged lane.',
    coaching: 'After taking damage, break contact and re-peek from a different elevation or wait for teammate pressure.', confidence: 'average'
  };
  const report = finalizeFullVodReport({
    version: 3, mode: 'exhaustive', playerAgent: 'Omen', oneLifePerRound: true,
    durationSeconds: 1_800, frameRate: 4, totalSegments: 450, completedSegments: 450,
    framesReviewed: 7_200, invalidSegments: 0, findings: [finding, { ...finding, timestamp: '4:02', seconds: 242 }], limitations: []
  });
  assert.equal(report.mode, 'full-match');
  assert.equal(report.coverage.percent, 100);
  assert.equal(report.framesReviewed, 7_200);
  assert.equal(report.findings.length, 2);
  assert.equal(report.patterns[0].occurrences, 2);
  assert.match(report.summary, /beginning to end/i);
});

test('full-match truthfulness rejects teammate POV, non-live phases, vague inactivity, and impossible Competitive respawns', () => {
  const finding = {
    timestamp: '20:04', category: 'Positioning', outcome: 'negative', confidence: 'average', actor: 'self',
    decisionVisible: true, consequenceVisible: true,
    decision: 'The player widened away from cover before clearing the close angle.',
    consequence: 'The player became exposed to two angles and took damage.',
    observation: 'The player widened into a second angle before clearing the close-left corner.',
    evidence: 'Across ordered frames 4 through 12, the player leaves cover, exposes the second lane, and then takes damage.',
    coaching: 'Clear the close-left corner from cover before widening far enough to expose the second angle.'
  };
  const options = { startSeconds: 1_200, endSeconds: 1_212, frameCount: 16, playerAgent: 'Omen', queue: 'Competitive', roundCount: 23 };
  const base = { sceneType: 'gameplay', perspective: 'self', phase: 'live-round', activity: 'combat', roundNumberVisible: false, summary: 'One fight occurred.', findings: [finding], limitations: [] };
  assert.equal(validateFullVodSegment(base, options).findings.length, 1);
  assert.equal(validateFullVodSegment({ ...base, perspective: 'teammate-spectating', activity: 'spectating' }, options).findings.length, 0);
  assert.equal(validateFullVodSegment({ ...base, phase: 'buy-phase', activity: 'setup' }, options).findings.length, 0);
  assert.equal(validateFullVodSegment({ ...base, findings: [{ ...finding,
    category: 'Tactical inactivity', decision: 'No tactical decision is visible.', consequence: 'No visible consequence occurs.',
    observation: 'The player is simply spectating and does not make any visible tactical decision.',
    evidence: 'Across the ordered frames, the player is simply watching the round.', coaching: 'The player should actively make tactical decisions.'
  }] }, options).findings.length, 0);
  assert.equal(validateFullVodSegment({ ...base, findings: [{ ...finding,
    observation: 'Omen is killed and then respawns to re-engage in the same round.',
    evidence: 'Ordered frames show Omen die, then respawn and continue the same round.'
  }] }, options).findings.length, 0);
});

test('full-match truthfulness rejects the repetitive non-coaching language returned by the overnight test', () => {
  const base = {
    timestamp: '24:42', category: 'Positioning', outcome: 'negative', confidence: 'average', actor: 'self',
    decisionVisible: true, consequenceVisible: true, decision: 'The player remains in the current position.',
    consequence: 'No useful change is visible across the window.',
    evidence: 'Across the ordered frames, the same state remains visible.',
    coaching: 'The player should move to a different position before the next engagement.'
  };
  const context = { requireTruthFields: true, oneLifePerRound: true, playerAgent: 'Omen' };
  const rejected = [
    'The player is not making any tactical decisions during this window.',
    'The player is simply spectating and watching the round unfold.',
    'The player is in Buy Phase and does not engage in tactical activity.',
    'Planting the spike is a routine action and not a tactical adjustment.',
    'The player switches to Reyna after a teammate death.'
  ];
  for (const observation of rejected) assert.equal(isUsefulVodFinding({ ...base, observation }, context), false, observation);
});

test('full-match truthfulness keeps one supported event per window and never invents a round label', () => {
  const finding = {
    timestamp: '12:44', category: 'Positioning', outcome: 'negative', confidence: 'high', actor: 'self',
    decisionVisible: true, consequenceVisible: true,
    decision: 'The player cleared the exposed lane without cover.', consequence: 'The player took damage from the uncleared close angle.',
    observation: 'The player exposed the close and far angles at the same time.',
    evidence: 'Frames 3 through 10 show the player leave cover before the close angle fires and damage follows.',
    coaching: 'Clear the close angle from cover before exposing the far lane.'
  };
  const segment = validateFullVodSegment({
    sceneType: 'gameplay', perspective: 'self', phase: 'live-round', activity: 'combat', roundNumberVisible: false,
    summary: 'One engagement occurred.', findings: [finding, { ...finding, category: 'Movement' }], limitations: []
  }, { startSeconds: 764, endSeconds: 776, frameCount: 16, maxFindings: 3, playerAgent: 'Omen', queue: 'Competitive', roundCount: 23 });
  assert.equal(segment.findings.length, 1);
  assert.equal(segment.findings[0].round, null);
});

test('full-match report suppresses one-off patterns and clears contradictory round labels', () => {
  const finding = {
    endTimestamp: '1:12', category: 'Positioning', outcome: 'negative', confidence: 'average', actor: 'self',
    decisionVisible: true, consequenceVisible: true,
    decision: 'The player widened before clearing the close angle.', consequence: 'The player took damage from the second exposed angle.',
    observation: 'The player exposed two angles while clearing the lane.',
    evidence: 'Ordered frames show the player leave cover, expose the second lane, and then take damage.',
    coaching: 'Clear the close angle from cover before widening into the far lane.'
  };
  const report = finalizeFullVodReport({
    version: 5, mode: 'adaptive', playerAgent: 'Omen', oneLifePerRound: true, durationSeconds: 1_800,
    scanFps: 1, scanSamples: 1_800, frameRate: ADAPTIVE_VOD_FRAME_RATE, totalSegments: 2, completedSegments: 2,
    framesReviewed: 32, candidateFindings: 2, rejectedFindings: 0, windows: [
      { startSeconds: 60, durationSeconds: 12 }, { startSeconds: 900, durationSeconds: 12 }
    ], findings: [
      { ...finding, timestamp: '1:02', seconds: 62, round: 1 },
      { ...finding, timestamp: '15:02', seconds: 902, round: 1, category: 'Utility usage',
        decision: 'The player used utility before confirming an enemy position.', consequence: 'The utility expired without changing the visible engagement.',
        observation: 'The player used utility without a visible target or follow-up.', coaching: 'Confirm a target or teammate timing before committing the utility.' }
    ], limitations: ['Insufficient data to determine tactical intent.', 'Audio and communications were not analyzed.']
  });
  assert.equal(report.patterns.length, 0);
  assert.equal(report.findings.every((entry) => entry.round === null), true);
  assert.equal(report.limitations.length, 2);
  assert.match(report.limitations.join(' '), /audio and communications/i);
  assert.match(report.limitations.join(' '), /events between detail windows may be missed/i);
  assert.doesNotMatch(report.limitations.join(' '), /insufficient data to determine tactical intent/i);
});

test('full-match VOD checkpoints survive interruption and become resumable on startup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-vod-checkpoint-'));
  try {
    const store = new SenseiStore(directory);
    store.save('player', 'match', { vod: {
      path: 'C:\\recordings\\match.mkv', name: 'match.mkv', size: 100, status: 'analyzing',
      checkpoint: { version: 2, durationSeconds: 1_800, chunkSeconds: 4, frameRate: 4, totalSegments: 450, completedSegments: 47, framesReviewed: 752, elapsedMs: 654_321, findings: [] }
    } });
    assert.equal(store.recoverInterruptedVodAnalyses(), true);
    const recovered = store.get('player', 'match');
    assert.equal(recovered.vod.status, 'failed');
    assert.equal(recovered.vod.checkpoint.completedSegments, 47);
    assert.equal(recovered.vod.checkpoint.elapsedMs, 654_321);
    assert.match(recovered.vod.error, /resume/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('adaptive VOD checkpoints preserve their selected review plan', () => {
  const checkpoint = {
    version: ADAPTIVE_VOD_ANALYSIS_VERSION, mode: 'adaptive', durationSeconds: 1_800, chunkSeconds: 12, frameRate: ADAPTIVE_VOD_FRAME_RATE,
    scanFps: 1, scanSamples: 1_800, totalSegments: 2, completedSegments: 1,
    framesReviewed: 16, elapsedMs: 50_000, findings: [], limitations: [],
    windows: [
      { startSeconds: 12, durationSeconds: 12, kind: 'activity', activityScore: 10 },
      { startSeconds: 88, durationSeconds: 12, kind: 'quiet-audit', activityScore: .2 }
    ]
  };
  const entry = normalizeEntry({ matchId: 'adaptive', vod: { path: 'C:\\recordings\\adaptive.mkv', status: 'canceled', checkpoint } });
  assert.equal(entry.vod.checkpoint.version, ADAPTIVE_VOD_ANALYSIS_VERSION);
  assert.equal(entry.vod.checkpoint.mode, 'adaptive');
  assert.equal(entry.vod.checkpoint.scanSamples, 1_800);
  assert.equal(entry.vod.checkpoint.windows.length, 2);
  assert.equal(entry.vod.checkpoint.windows[1].kind, 'quiet-audit');
});

test('current Exhaustive checkpoints remain Exhaustive despite sharing version 3 with a legacy Adaptive checkpoint', () => {
  const entry = normalizeEntry({ matchId: 'exhaustive-v3', vod: { path: 'C:\\recordings\\exhaustive.mkv', status: 'canceled', checkpoint: {
    version: 3, mode: 'exhaustive', durationSeconds: 120, chunkSeconds: 4, frameRate: 4,
    totalSegments: 30, completedSegments: 2, framesReviewed: 32, findings: []
  } } });
  assert.equal(entry.vod.checkpoint.version, 3);
  assert.equal(entry.vod.checkpoint.mode, 'exhaustive');
  assert.deepEqual(entry.vod.checkpoint.windows, []);
});

test('active full-match analysis preserves its elapsed-clock origin across navigation', () => {
  const startedAt = Date.now() - 42_000;
  const entry = normalizeEntry({
    matchId: 'clock', updatedAt: Date.now(),
    vod: { path: 'C:\\recordings\\clock.mkv', status: 'analyzing', analysisStartedAt: startedAt }
  });
  assert.equal(entry.vod.analysisStartedAt, startedAt);
});
