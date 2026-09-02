'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

const SCORE_VALUES = new Set(['high', 'average', 'low']);
const SCORE_KEYS = ['impact', 'aim', 'entry', 'utility', 'econ'];

function number(value, digits = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function headshotPercent(match) {
  const shots = match?.shots || {};
  const total = (Number(shots.headshots) || 0) + (Number(shots.bodyshots) || 0) + (Number(shots.legshots) || 0);
  return total ? number(((Number(shots.headshots) || 0) / total) * 100) : null;
}

function matchAcs(match) {
  const own = (match?.roster || []).find((player) => player.isSelf);
  return number(match?.acs ?? own?.acs, 0);
}

function compactMatch(match = {}) {
  const card = {
    matchId: String(match.id || ''), map: match.map, queue: match.playlist || match.queueId,
    result: match.result, score: match.score, agent: match.agent, role: match.agentRole, rank: match.rankName,
    kills: number(match.kills, 0), deaths: number(match.deaths, 0), assists: number(match.assists, 0),
    kd: number(match.kd, 2), acs: matchAcs(match), adr: number(match.adr), hsPercent: headshotPercent(match),
    firstKills: number(match.report?.openingKills, 0), firstDeaths: number(match.report?.openingDeaths, 0),
    plants: number(match.plants, 0), defuses: number(match.defuses, 0), econRating: number(match.econRating),
    roundTimeline: (match.report?.rounds || []).slice(0, 40).map((round) => ({
      round: round.round, side: round.side || undefined, result: round.result,
      kills: number(round.kills, 0), deaths: number(round.deaths, 0), damage: number(round.damage, 0),
      opening: round.opening || undefined, buyType: round.buyType || undefined,
      events: (round.events || []).slice(0, 10).map((event) => ({
        type: event.type, time: event.time || undefined, opponentAgent: event.opponentAgent,
        callout: event.callout || undefined, opening: Boolean(event.opening), sequence: event.sequence
      }))
    }))
  };
  return Object.fromEntries(Object.entries(card).filter(([, value]) => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length)));
}

function summarizeMatches(matches = []) {
  const rows = matches.filter((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match?.result));
  if (!rows.length) return null;
  const average = (selector, digits = 1) => number(rows.reduce((total, row) => total + (Number(selector(row)) || 0), 0) / rows.length, digits);
  const kills = rows.reduce((total, row) => total + (Number(row.kills) || 0), 0);
  const deaths = rows.reduce((total, row) => total + (Number(row.deaths) || 0), 0);
  return {
    matches: rows.length,
    wins: rows.filter((row) => row.result === 'VICTORY').length,
    losses: rows.filter((row) => row.result === 'DEFEAT').length,
    winRate: number((rows.filter((row) => row.result === 'VICTORY').length / rows.length) * 100),
    kd: deaths ? number(kills / deaths, 2) : kills,
    averageKills: average((row) => row.kills), averageDeaths: average((row) => row.deaths),
    averageAssists: average((row) => row.assists), averageAcs: average((row) => matchAcs(row)),
    averageHsPercent: average((row) => headshotPercent(row)),
    averageFirstKills: average((row) => row.report?.openingKills),
    averageFirstDeaths: average((row) => row.report?.openingDeaths)
  };
}

function buildContextPack(match, matches = []) {
  const completed = matches.filter((row) => row?.id !== match?.id && ['VICTORY', 'DEFEAT', 'DRAW'].includes(row?.result));
  const card = compactMatch(match);
  const withDeltas = (summary) => {
    if (!summary) return null;
    const delta = (current, baseline, digits = 1) => Number.isFinite(Number(current)) && Number.isFinite(Number(baseline))
      ? number(Number(current) - Number(baseline), digits)
      : null;
    return {
      ...summary,
      deltas: Object.fromEntries(Object.entries({
        kills: delta(card.kills, summary.averageKills),
        deaths: delta(card.deaths, summary.averageDeaths),
        assists: delta(card.assists, summary.averageAssists),
        kd: delta(card.kd, summary.kd, 2),
        acs: delta(card.acs, summary.averageAcs, 0),
        hsPercent: delta(card.hsPercent, summary.averageHsPercent),
        firstKills: delta(card.firstKills, summary.averageFirstKills),
        firstDeaths: delta(card.firstDeaths, summary.averageFirstDeaths)
      }).filter(([, value]) => value !== null))
    };
  };
  return {
    overall: withDeltas(summarizeMatches(completed.slice(0, 10))),
    sameAgent: withDeltas(summarizeMatches(completed.filter((row) => row.agent === match.agent).slice(0, 5))),
    sameMap: withDeltas(summarizeMatches(completed.filter((row) => row.map === match.map).slice(0, 5)))
  };
}

function scoreLevel(value, high, low, inverse = false) {
  if (!Number.isFinite(Number(value))) return 'average';
  if (inverse) return value <= high ? 'high' : value >= low ? 'low' : 'average';
  return value >= high ? 'high' : value <= low ? 'low' : 'average';
}

function liteReport(match, context) {
  const card = compactMatch(match);
  const baseline = context.overall;
  const kd = Number(card.kd) || 0;
  const hs = card.hsPercent;
  const openingDelta = (Number(card.firstKills) || 0) - (Number(card.firstDeaths) || 0);
  const won = card.result === 'VICTORY';
  const versus = baseline
    ? `Your ${kd.toFixed(2)} K/D was ${kd >= baseline.kd ? 'above' : 'below'} your recent ${Number(baseline.kd).toFixed(2)} baseline.`
    : 'No recent baseline was available, so this verdict uses only this match’s supplied statistics.';
  const verdict = `${won ? 'You won' : card.result === 'DEFEAT' ? 'You lost' : 'You drew'} ${card.score || 'this match'} on ${card.map || 'the selected map'} with ${card.kills ?? 0}/${card.deaths ?? 0}/${card.assists ?? 0}. ${versus}`;
  const strengths = [];
  const weaknesses = [];
  if (kd >= 1.2) strengths.push(`${kd.toFixed(2)} K/D provided reliable fight value.`);
  if (openingDelta > 0) strengths.push(`${card.firstKills} first kills against ${card.firstDeaths} first deaths created early advantages.`);
  if (Number.isFinite(hs) && hs >= 25) strengths.push(`${hs}% headshots showed disciplined first-bullet placement.`);
  if (won) strengths.push(`Your team converted the match into a ${card.score || 'win'}.`);
  if (kd < 1) weaknesses.push(`${card.deaths ?? 0} deaths against ${card.kills ?? 0} kills limited repeatable round impact.`);
  if (openingDelta < 0) weaknesses.push(`${card.firstDeaths} first deaths against ${card.firstKills} first kills put the team behind early.`);
  if (Number.isFinite(hs) && hs < 18) weaknesses.push(`${hs}% headshots suggests first-bullet placement was inconsistent in this match.`);
  if (!won) weaknesses.push(`The ${card.score || 'loss'} was not converted; review the first decision after each advantage.`);
  if (!strengths.length) strengths.push(`${card.assists ?? 0} assists were your clearest measurable contribution.`);
  if (!weaknesses.length) weaknesses.push(`${card.deaths ?? 0} deaths are the best review points for checking trade distance and cover.`);
  return {
    verdict,
    scorecard: {
      impact: scoreLevel(kd, 1.25, .85), aim: Number.isFinite(hs) ? scoreLevel(hs, 25, 17) : 'average',
      entry: scoreLevel(openingDelta, 1, -1), utility: scoreLevel(Number(card.assists) || 0, 8, 3),
      econ: 'average'
    },
    strengths: strengths.slice(0, 3), weaknesses: weaknesses.slice(0, 3),
    drills: [
      { name: 'First-Bullet Ladder', setup: 'Range: eliminate 50 stationary bots with single taps, then 50 with two-bullet bursts. Reset after every miss.', success: 'Finish both sets with at least 80 clean first-shot hits.' },
      { name: 'Trade-Distance DM', setup: 'Deathmatch: take every fight from cover and move after each elimination. Do not re-peek the same line immediately.', success: 'Complete one DM with fewer than five repeated-angle deaths.' },
      { name: 'Opening-Life Review', setup: `Custom on ${card.map || 'this map'}: rehearse two safe first-contact routes for ${card.agent || 'your agent'} on each side.`, success: 'Each route has cover, an exit, and a teammate trade path you can name before moving.' }
    ],
    focusRule: openingDelta < 0 ? 'Do not take first contact unless you have cover and a teammate close enough to trade.' : 'After gaining an advantage, reposition before taking the next fight.',
    citations: [`${card.kills ?? 0}/${card.deaths ?? 0}/${card.assists ?? 0} K/D/A`, `${card.firstKills ?? 0} FK and ${card.firstDeaths ?? 0} FD`, ...(Number.isFinite(hs) ? [`${hs}% HS`] : []), ...(baseline ? [`Recent baseline: ${baseline.kd} K/D across ${baseline.matches} matches`] : [])]
  };
}

function validateReport(value) {
  if (!value || typeof value !== 'object') throw new Error('The local model returned an empty report.');
  const verdict = typeof value.verdict === 'string' ? value.verdict.trim() : '';
  const verdictSentences = (verdict.match(/[.!?](?:\s|$)/g) || []).length;
  if (!verdict || verdictSentences < 2 || verdictSentences > 3) throw new Error('The local model verdict must contain two or three specific sentences.');
  if (!value.scorecard || SCORE_KEYS.some((key) => !SCORE_VALUES.has(value.scorecard[key]))) throw new Error('The local model returned an invalid scorecard.');
  for (const key of ['strengths', 'weaknesses', 'drills', 'citations']) if (!Array.isArray(value[key])) throw new Error(`The local model returned invalid ${key}.`);
  if (!value.citations.length || value.weaknesses.some((item) => !/\d/.test(String(item)))) throw new Error('Every weakness must cite a supplied number and the report must include evidence citations.');
  if (value.drills.length !== 3 || value.drills.some((drill) => !drill?.name || !drill?.setup || !drill?.success)) throw new Error('The local model report must include exactly three runnable drills.');
  const normalizedDrills = value.drills.map((drill) => `${drill.name} ${drill.setup}`.toLowerCase());
  if (new Set(value.drills.map((drill) => String(drill.name).trim().toLowerCase())).size !== 3
      || new Set(value.drills.map((drill) => String(drill.setup).trim().toLowerCase())).size !== 3
      || new Set(value.drills.map((drill) => String(drill.success).trim().toLowerCase())).size !== 3
      || !normalizedDrills.some((drill) => /\brange\b/.test(drill))
      || !normalizedDrills.some((drill) => /\b(custom|custom game)\b/.test(drill))
      || !normalizedDrills.some((drill) => /\b(deathmatch|dm)\b/.test(drill))) {
    throw new Error('The local model must return three distinct drills: one Range, one custom, and one Deathmatch drill.');
  }
  const focusRule = typeof value.focusRule === 'string' ? value.focusRule.trim() : '';
  if (!focusRule) throw new Error('The local model report did not include a focus rule.');
  if (focusRule.split(/\s+/).length > 24 || (focusRule.match(/[.!?]/g) || []).length > 1) throw new Error('The local model focus rule must be one concise rule of 24 words or fewer.');
  return {
    verdict: verdict.slice(0, 1_200), scorecard: Object.fromEntries(SCORE_KEYS.map((key) => [key, value.scorecard[key]])),
    strengths: value.strengths.slice(0, 3).map((item) => String(item).slice(0, 500)),
    weaknesses: value.weaknesses.slice(0, 3).map((item) => String(item).slice(0, 500)),
    drills: value.drills.slice(0, 3).map((drill) => ({ name: String(drill?.name || '').slice(0, 120), setup: String(drill?.setup || '').slice(0, 700), success: String(drill?.success || '').slice(0, 500) })),
    focusRule: focusRule.slice(0, 500), citations: value.citations.slice(0, 12).map((item) => String(item).slice(0, 240))
  };
}

function parseStructuredJson(raw, label = 'local model') {
  const source = String(raw || '').trim();
  const candidates = [source, source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')];
  const first = source.indexOf('{');
  const last = source.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {}
  }
  throw new Error(`The ${label} did not return valid structured JSON.`);
}

function canceledError() {
  const error = new Error('VOD analysis was canceled. The original recording was not changed.');
  error.code = 'SENSEI_CANCELED';
  return error;
}

async function requestJson(url, options = {}, timeoutMs = 120_000, externalSignal = null) {
  const timeoutController = new AbortController();
  const signal = externalSignal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([timeoutController.signal, externalSignal])
    : timeoutController.signal;
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  try {
    if (externalSignal?.aborted) throw canceledError();
    const response = await fetch(url, { ...options, signal });
    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let detail = raw;
      try { detail = JSON.parse(raw)?.error || raw; } catch {}
      detail = String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 600);
      throw new Error(`Ollama returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
    }
    return response.json();
  } catch (error) {
    if (externalSignal?.aborted || error?.code === 'SENSEI_CANCELED') throw canceledError();
    if (error?.name === 'AbortError') throw new Error('The local model timed out. It may still be loading; try again.');
    if (error?.message === 'fetch failed' || error?.cause?.code === 'ECONNREFUSED') throw new Error('BYAKUGAN lost contact with Ollama. The local model service may have stopped or run out of memory; restart Ollama and try again.');
    throw error;
  } finally { clearTimeout(timer); }
}

function strictSchema() {
  return {
    type: 'object', required: ['verdict', 'scorecard', 'strengths', 'weaknesses', 'drills', 'focusRule', 'citations'],
    properties: {
      verdict: { type: 'string' }, scorecard: { type: 'object', required: SCORE_KEYS, properties: Object.fromEntries(SCORE_KEYS.map((key) => [key, { type: 'string', enum: [...SCORE_VALUES] }])) },
      strengths: { type: 'array', maxItems: 3, items: { type: 'string' } }, weaknesses: { type: 'array', maxItems: 3, items: { type: 'string' } },
      drills: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', required: ['name', 'setup', 'success'], properties: { name: { type: 'string' }, setup: { type: 'string' }, success: { type: 'string' } } } },
      focusRule: { type: 'string' }, citations: { type: 'array', items: { type: 'string' } }
    }
  };
}

function modelPrompt(matchCard, contextPack) {
  return `You are SENSEI VISION, a direct VALORANT post-match coach. Analyze only the supplied completed match and the same player's summarized baselines. Never claim to have watched a VOD. Never invent, recalculate, or reverse supplied values. The context already includes match-minus-baseline deltas: positive means the match value was higher. Compare the match to the player's overall baseline first, then agent/map baselines and reasonable role expectations. Write a specific verdict in exactly 2-3 sentences. Every weakness must quote a supplied number. Return exactly three genuinely different drills: one Range mechanics drill, one custom-game utility/positioning drill, and one Deathmatch gunfight-habit drill. Each drill needs an objective completion condition. The next-match focus must be one memorable rule of 24 words or fewer. Avoid generic advice and hype. Return only JSON matching the requested schema.\n\nMATCH CARD:\n${JSON.stringify(matchCard)}\n\nCONTEXT PACK:\n${JSON.stringify(contextPack)}`;
}

async function generateStructured({ endpoint, model, prompt, schema, images, timeoutMs = 120_000, signal = null, label = 'local model', validate = (value) => value, retries = 1 }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw canceledError();
    try {
      const response = await requestJson(`${endpoint}/api/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: attempt
            ? `${prompt}\n\nCORRECTION: Your previous response failed validation: ${lastError.message}. Return only one complete JSON object that follows the schema exactly.`
            : prompt,
          ...(images?.length ? { images } : {}),
          stream: false,
          format: schema,
          think: false,
          options: { temperature: attempt ? .05 : .15, num_predict: 2_000 }
        })
      }, timeoutMs, signal);
      return validate(parseStructuredJson(response.response, label));
    } catch (error) {
      if (error?.code === 'SENSEI_CANCELED' || /^Ollama returned HTTP/.test(error?.message || '')) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function validateVodReport(parsed, frameCount, frameIntervalSeconds) {
  if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.findings) || !Array.isArray(parsed.limitations)) throw new Error('The vision model returned an incomplete report.');
  return {
    summary: parsed.summary.trim().slice(0, 1_500),
    findings: parsed.findings.slice(0, 12).map((finding, index) => ({
      timestamp: String(finding?.timestamp || `${Math.floor(index * frameIntervalSeconds / 60)}:${String(Math.round(index * frameIntervalSeconds) % 60).padStart(2, '0')}`).slice(0, 20),
      round: Number.isFinite(Number(finding?.round)) ? Number(finding.round) : null,
      category: String(finding?.category || 'Decision').slice(0, 80),
      observation: String(finding?.observation || '').slice(0, 700), evidence: String(finding?.evidence || '').slice(0, 500)
    })).filter((finding) => finding.observation),
    limitations: parsed.limitations.slice(0, 8).map((item) => String(item).slice(0, 400)),
    confidence: ['high', 'average', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
    frameIntervalSeconds,
    framesReviewed: frameCount
  };
}

class SenseiService {
  constructor({ endpoint = 'http://127.0.0.1:11434' } = {}) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async health() {
    const memoryGb = number(os.totalmem() / 1024 ** 3, 1);
    let models = [];
    let connected = false;
    let error = '';
    try {
      const response = await requestJson(`${this.endpoint}/api/tags`, {}, 3_000);
      models = (response.models || []).map((model) => ({ name: model.name || model.model, size: Number(model.size) || 0 })).filter((model) => model.name);
      connected = true;
    } catch (cause) { error = 'Ollama is not running. Sensei Lite remains available.'; }
    return { connected, models, error, memoryGb, cpuCores: os.cpus().length, platform: process.platform };
  }

  async modelInfo(model = '') {
    const name = String(model || '').trim();
    if (!name) return { name: '', installed: false, capabilities: [], visionCapable: false, error: 'No model selected.' };
    try {
      const response = await requestJson(`${this.endpoint}/api/show`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name, verbose: false })
      }, 8_000);
      const capabilities = Array.isArray(response.capabilities) ? response.capabilities.map(String) : [];
      return { name, installed: true, capabilities, visionCapable: capabilities.includes('vision'), error: '' };
    } catch (error) {
      return { name, installed: false, capabilities: [], visionCapable: false, error: error.message || 'Model could not be inspected.' };
    }
  }

  async analyze({ match, matches, tier = 'lite', model = '' }) {
    const matchCard = compactMatch(match);
    const contextPack = buildContextPack(match, matches);
    if (!matchCard.matchId || !['VICTORY', 'DEFEAT', 'DRAW'].includes(matchCard.result)) throw new Error('Sensei Vision can only analyze a completed match.');
    if (tier === 'lite') return { report: validateReport(liteReport(match, contextPack)), matchCard, contextPack, model: 'BYAKUGAN Lite Engine' };
    if (!model) throw new Error('Choose an installed local Sensei model in Settings first.');
    const report = await generateStructured({
      endpoint: this.endpoint, model, prompt: modelPrompt(matchCard, contextPack), schema: strictSchema(),
      label: 'local model', validate: validateReport, retries: 1
    });
    return { report, matchCard, contextPack, model };
  }

  async ask({ question, report, match, model = '', tier = 'lite' }) {
    const clean = String(question || '').trim().slice(0, 1_000);
    if (!clean) throw new Error('Enter a question for Sensei.');
    if (tier === 'lite') {
      return `Use the saved report's focus rule: ${report.focusRule} The strongest evidence for this match is ${report.citations.slice(0, 3).join('; ')}.`;
    }
    if (!model) throw new Error('The local Sensei model is not configured.');
    const response = await requestJson(`${this.endpoint}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: false, think: false, options: { temperature: .25, num_predict: 450 }, prompt: `Answer one short follow-up about this completed VALORANT match. Use only the saved report and match card. Do not start a new analysis. If evidence is missing, say so.\nMATCH:${JSON.stringify(compactMatch(match))}\nREPORT:${JSON.stringify(report)}\nQUESTION:${clean}` })
    });
    return String(response.response || '').trim().slice(0, 2_000);
  }

  async analyzeVod({ match, statisticalReport, frameFiles, frameTimestamps = [], frameIntervalSeconds = 120, model = '', signal = null, onProgress = () => {} }) {
    if (!model) throw new Error('Choose an installed vision-capable Ollama model in Settings first.');
    const files = (frameFiles || []).slice(0, 24);
    if (!files.length) throw new Error('No video frames were available for VOD analysis.');
    const schema = {
      type: 'object', required: ['summary', 'findings', 'limitations', 'confidence'],
      properties: {
        summary: { type: 'string' },
        findings: { type: 'array', maxItems: 12, items: { type: 'object', required: ['timestamp', 'category', 'observation', 'evidence'], properties: {
          timestamp: { type: 'string' }, round: { type: 'integer' }, category: { type: 'string' }, observation: { type: 'string' }, evidence: { type: 'string' }
        } } },
        limitations: { type: 'array', maxItems: 8, items: { type: 'string' } }, confidence: { type: 'string', enum: ['high', 'average', 'low'] }
      }
    };
    const batches = [];
    const batchSize = 4;
    for (let start = 0; start < files.length; start += batchSize) {
      if (signal?.aborted) throw canceledError();
      const batchFiles = files.slice(start, start + batchSize);
      const timestamps = batchFiles.map((_, index) => Number(frameTimestamps[start + index]) || (start + index) * frameIntervalSeconds);
      const labels = timestamps.map((seconds, index) => `Image ${index + 1} = ${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`).join(', ');
      const prompt = `Review only these ${batchFiles.length} sequential sampled frames from one completed VALORANT first-person VOD. ${labels}. Use only visible evidence. Never infer hidden enemies, unheard communications, off-screen utility, exact intent, or events between samples. A webcam or overlay may obstruct evidence; list it as a limitation. Return concise timestamped observations about visible crosshair placement, exposure, peeking, positioning, utility, rotations, trading opportunities, or objective play. Return strict JSON.\nMATCH:${JSON.stringify(compactMatch(match))}`;
      const report = await generateStructured({
        endpoint: this.endpoint, model, prompt, schema,
        images: batchFiles.map((file) => fs.readFileSync(file).toString('base64')),
        timeoutMs: 20 * 60_000, signal, label: 'vision model', retries: 1,
        validate: (value) => validateVodReport(value, batchFiles.length, frameIntervalSeconds)
      });
      batches.push(report);
      onProgress({ phase: 'reviewing', current: Math.min(start + batchFiles.length, files.length), total: files.length, message: `Reviewed ${Math.min(start + batchFiles.length, files.length)} of ${files.length} frames` });
    }
    onProgress({ phase: 'validating', current: files.length, total: files.length, message: 'Consolidating visual findings' });
    const consolidationPrompt = `Consolidate these sampled-frame observations into one conservative VALORANT VOD report. Use only supplied visual findings. Remove duplicates and contradictions. Do not claim continuous video review or invent events between frames. Keep the most actionable findings and preserve their timestamps. The statistical report is supporting context only. Return strict JSON.\nMATCH:${JSON.stringify(compactMatch(match))}\nSAVED STATS REPORT:${JSON.stringify(statisticalReport)}\nFRAME BATCH REPORTS:${JSON.stringify(batches)}`;
    return generateStructured({
      endpoint: this.endpoint, model, prompt: consolidationPrompt, schema,
      timeoutMs: 20 * 60_000, signal, label: 'vision model', retries: 1,
      validate: (value) => validateVodReport(value, files.length, frameIntervalSeconds)
    });
  }
}

function executableWorks(command) {
  try { execFileSync(command, ['-version'], { stdio: 'ignore', windowsHide: true, timeout: 3_000 }); return true; } catch { return false; }
}

function detectFfmpeg() {
  const override = String(process.env.BYAKUGAN_FFMPEG_PATH || '').trim();
  if (override && executableWorks(override)) return override;
  return executableWorks('ffmpeg') ? 'ffmpeg' : '';
}

function ffprobeFor(ffmpeg) {
  if (!ffmpeg || ffmpeg === 'ffmpeg') return 'ffprobe';
  const extension = path.extname(ffmpeg);
  return path.join(path.dirname(ffmpeg), `ffprobe${extension}`);
}

function detectFfprobe(ffmpeg = detectFfmpeg()) {
  const candidate = ffprobeFor(ffmpeg);
  if (candidate && executableWorks(candidate)) return candidate;
  return executableWorks('ffprobe') ? 'ffprobe' : '';
}

function probeVodDuration(ffmpeg, source, { signal = null } = {}) {
  return new Promise((resolve, reject) => {
    execFile(ffprobeFor(ffmpeg), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', source], { windowsHide: true, timeout: 30_000, ...(signal ? { signal } : {}) }, (error, stdout) => {
      const duration = Number(String(stdout || '').trim());
      if (signal?.aborted || error?.code === 'ABORT_ERR') return reject(canceledError());
      if (error || !Number.isFinite(duration) || duration <= 0) return reject(new Error('FFprobe could not read the recording duration. Install FFmpeg with FFprobe and try again.'));
      resolve(duration);
    });
  });
}

function extractFrame(ffmpeg, args, signal) {
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, args, { windowsHide: true, timeout: 90_000, ...(signal ? { signal } : {}) }, (error) => {
      if (signal?.aborted || error?.code === 'ABORT_ERR') return reject(canceledError());
      if (error) return reject(new Error(`Video frame extraction failed: ${error.message}`));
      resolve();
    });
  });
}

async function extractVodFrames({ ffmpeg, source, outputDirectory, frameCount = 12, signal = null, onProgress = () => {} }) {
  const duration = await probeVodDuration(ffmpeg, source, { signal });
  const count = Math.max(4, Math.min(24, frameCount));
  const intervalSeconds = Math.max(1, duration / count);
  const timestamps = Array.from({ length: count }, (_, index) => Math.max(0, Math.min(duration - .1, duration * ((index + .5) / count))));
  const files = [];
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (let index = 0; index < timestamps.length; index += 1) {
    if (signal?.aborted) throw canceledError();
    const target = path.join(outputDirectory, `frame-${String(index + 1).padStart(3, '0')}.jpg`);
    const args = ['-hide_banner', '-loglevel', 'error', '-ss', timestamps[index].toFixed(3), '-i', source, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '5', '-y', target];
    await extractFrame(ffmpeg, args, signal);
    if (fs.existsSync(target)) files.push(target);
    onProgress({ phase: 'extracting', current: index + 1, total: count, message: `Extracted frame ${index + 1} of ${count}` });
  }
  if (!files.length) throw new Error('No readable video frames were found.');
  return { files, duration, intervalSeconds, timestamps };
}

module.exports = {
  SenseiService, buildContextPack, compactMatch, detectFfmpeg, detectFfprobe, extractVodFrames, probeVodDuration,
  headshotPercent, liteReport, parseStructuredJson, strictSchema, summarizeMatches, validateReport, validateVodReport
};
