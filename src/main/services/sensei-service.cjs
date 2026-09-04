'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

const SCORE_VALUES = new Set(['high', 'average', 'low']);
const SCORE_KEYS = ['impact', 'aim', 'entry', 'utility', 'econ'];
const FULL_VOD_ANALYSIS_VERSION = 2;
const FULL_VOD_CHUNK_SECONDS = 4;
const FULL_VOD_FRAME_RATE = 4;
const FULL_VOD_FRAME_WIDTH = 768;

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
  const source = String(raw || '').replace(/^\uFEFF/, '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(match[1].trim());
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) candidates.push(source.slice(start, index + 1));
    }
  }
  for (const candidate of candidates) {
    for (const version of [candidate, candidate.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        const parsed = JSON.parse(version);
        if (typeof parsed === 'string') return JSON.parse(parsed);
        return parsed;
      } catch {}
    }
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

async function generateStructured({ endpoint, model, repairModel = '', prompt, schema, images, timeoutMs = 120_000, signal = null, label = 'local model', validate = (value) => value, retries = 1, numPredict = 2_400, onRepair = () => {} }) {
  let lastError;
  let candidate = '';
  const candidates = [];
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw canceledError();
    try {
      if (attempt) onRepair(lastError);
      const repairPrompt = `Convert the candidate below into exactly one valid JSON object matching the supplied schema. Preserve only claims already present. Do not add commentary, markdown, or new facts. If a field is incomplete, use the smallest conservative value allowed by the schema. Correct this validation problem: ${lastError?.message || 'invalid JSON'}.\nSCHEMA:${JSON.stringify(schema)}\nCANDIDATE:${candidate.slice(0, 18_000)}`;
      const response = await requestJson(`${endpoint}/api/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: attempt ? repairModel || model : model,
          prompt: attempt ? repairPrompt : prompt,
          ...(!attempt && images?.length ? { images } : {}),
          stream: false,
          // JSON mode is more widely supported by smaller Ollama models than
          // applying a full schema for a second time. BYAKUGAN still validates
          // the repaired object against its strict report rules below.
          format: attempt ? 'json' : schema,
          think: false,
          options: { temperature: attempt ? 0 : .1, num_predict: attempt ? Math.max(1_200, numPredict) : numPredict }
        })
      }, timeoutMs, signal);
      const returned = [response.response, response.message?.content, response.output, response.thinking]
        .find((value) => value && (typeof value === 'object' || String(value).trim())) || '';
      candidate = typeof returned === 'object' && returned !== null ? JSON.stringify(returned) : String(returned || '').trim();
      if (candidate) candidates.push(candidate);
      return validate(parseStructuredJson(candidate, label));
    } catch (error) {
      if (error?.code === 'SENSEI_CANCELED' || /^Ollama returned HTTP/.test(error?.message || '') || /lost contact with Ollama|local model timed out/i.test(error?.message || '')) throw error;
      lastError = error;
    }
  }
  const error = new Error(`${lastError?.message || `The ${label} response was invalid`} Automatic JSON repair also failed.`);
  error.code = 'SENSEI_STRUCTURED_OUTPUT';
  error.candidates = candidates;
  throw error;
}

function vodSchema(maxFindings = 12) {
  return {
    type: 'object', required: ['summary', 'findings', 'limitations', 'confidence'],
    properties: {
      summary: { type: 'string' },
      findings: { type: 'array', maxItems: maxFindings, items: { type: 'object', required: ['timestamp', 'category', 'observation', 'evidence'], properties: {
        timestamp: { type: 'string' }, round: { type: 'integer' }, category: { type: 'string' }, observation: { type: 'string' }, evidence: { type: 'string' }
      } } },
      limitations: { type: 'array', maxItems: 8, items: { type: 'string' } }, confidence: { type: 'string', enum: ['high', 'average', 'low'] }
    }
  };
}

function validateVodReport(parsed, frameCount, frameIntervalSeconds) {
  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim() || !Array.isArray(parsed.findings) || !Array.isArray(parsed.limitations)) throw new Error('The vision model returned an incomplete report.');
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

function decodedFieldValues(source, field) {
  const values = [];
  const expression = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'gi');
  for (const match of String(source || '').matchAll(expression)) {
    try { values.push(JSON.parse(`"${match[1]}"`)); } catch { values.push(match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"')); }
  }
  return values.map((value) => String(value).trim()).filter(Boolean);
}

function normalizeVodCandidate(candidates, timestamps = [], frameIntervalSeconds = 120) {
  const sources = (Array.isArray(candidates) ? candidates : [candidates]).map(String).map((item) => item.trim()).filter(Boolean);
  if (!sources.length) return null;
  const source = sources.sort((a, b) => b.length - a.length)[0];
  const summaries = decodedFieldValues(source, 'summary');
  const observations = decodedFieldValues(source, 'observation');
  const evidence = decodedFieldValues(source, 'evidence');
  const categories = decodedFieldValues(source, 'category');
  const returnedTimestamps = decodedFieldValues(source, 'timestamp');
  const clean = source
    .replace(/<\/?think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/[{}\[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const summary = summaries[0] || (clean.length >= 30 ? clean.slice(0, 1_200) : '');
  if (!summary) return null;
  const findings = observations.slice(0, 4).map((observation, index) => ({
    timestamp: returnedTimestamps[index] || `${Math.floor((Number(timestamps[index]) || index * frameIntervalSeconds) / 60)}:${String(Math.round(Number(timestamps[index]) || index * frameIntervalSeconds) % 60).padStart(2, '0')}`,
    round: null,
    category: categories[index] || 'Visual observation',
    observation,
    evidence: evidence[index] || 'Recovered from the local vision model response.'
  }));
  return validateVodReport({
    summary,
    findings,
    limitations: ['The local model returned unstructured output; BYAKUGAN recovered its usable text locally.', 'Only sampled frames were reviewed.'],
    confidence: 'low'
  }, timestamps.length || 1, frameIntervalSeconds);
}

function consolidateVodReports(reports, frameCount, frameIntervalSeconds) {
  const findings = [];
  const seen = new Set();
  for (const report of reports) {
    for (const finding of report.findings || []) {
      const key = String(finding.observation || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      findings.push(finding);
    }
  }
  const limitations = [...new Set(reports.flatMap((report) => report.limitations || []).map(String))].slice(0, 8);
  const summaries = [...new Set(reports.map((report) => String(report.summary || '').trim()).filter(Boolean))];
  const normalized = reports.some((report) => (report.limitations || []).some((item) => /unstructured output/i.test(item)));
  const confidenceValues = reports.map((report) => report.confidence);
  const confidence = normalized || confidenceValues.includes('low') ? 'low' : confidenceValues.includes('average') ? 'average' : 'high';
  return validateVodReport({
    summary: `Across ${frameCount} sampled frames, the local vision model returned ${findings.length} distinct visual finding${findings.length === 1 ? '' : 's'}. ${summaries.slice(0, 3).join(' ')}`.slice(0, 1_500),
    findings: findings.slice(0, 12), limitations, confidence
  }, frameCount, frameIntervalSeconds);
}

function vodTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function fullVodSegmentSchema() {
  return {
    type: 'object', required: ['sceneType', 'activity', 'summary', 'findings', 'limitations'],
    properties: {
      sceneType: { type: 'string', enum: ['gameplay', 'menu', 'loading', 'round-transition', 'spectating', 'unknown'] },
      activity: { type: 'string', enum: ['none', 'setup', 'rotation', 'combat', 'objective', 'death', 'spectating'] },
      summary: { type: 'string' },
      findings: { type: 'array', maxItems: 2, items: { type: 'object', required: ['timestamp', 'category', 'outcome', 'observation', 'evidence', 'coaching', 'confidence'], properties: {
        timestamp: { type: 'string' }, round: { type: 'integer' }, category: { type: 'string' },
        outcome: { type: 'string', enum: ['positive', 'negative', 'neutral'] }, observation: { type: 'string' },
        evidence: { type: 'string' }, coaching: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'average', 'low'] }
      } } },
      limitations: { type: 'array', maxItems: 4, items: { type: 'string' } }
    }
  };
}

function isUsefulVodFinding(finding = {}) {
  const observation = String(finding.observation || '').trim();
  const evidence = String(finding.evidence || '').trim();
  const coaching = String(finding.coaching || '').trim();
  const category = String(finding.category || '').trim().toLowerCase();
  if (observation.length < 24 || evidence.length < 16 || coaching.length < 16) return false;
  if (['health', 'weapon', 'interface', 'webcam', 'overlay', 'hud'].includes(category)) return false;
  const combined = `${observation} ${evidence} ${coaching}`.toLowerCase();
  const filler = [
    /webcam (?:is |was )?(?:visible|present|shown|obstruct)/,
    /(?:health|health bar) (?:is |was )?(?:visible|shown|at \d+)/,
    /(?:holding|held|using) (?:a |the )?(?:green |purple |blue |red )?(?:weapon|gun|knife)/,
    /crosshair (?:is |was )?(?:visible|centered|at the center)/,
    /(?:buy phase|won|lost|spike defused) (?:screen|text|overlay) (?:is |was )?visible/,
    /first[- ]person (?:view|perspective) (?:is |was )?visible/
  ];
  return !filler.some((pattern) => pattern.test(combined));
}

function validateFullVodSegment(parsed, { startSeconds = 0, endSeconds = 0, frameCount = 0 } = {}) {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.findings) || !Array.isArray(parsed.limitations)) {
    throw new Error('The vision model returned an incomplete full-match segment.');
  }
  const allowedScenes = new Set(['gameplay', 'menu', 'loading', 'round-transition', 'spectating', 'unknown']);
  const allowedActivities = new Set(['none', 'setup', 'rotation', 'combat', 'objective', 'death', 'spectating']);
  const findings = parsed.findings.slice(0, 2).map((finding) => {
    const timestampText = String(finding?.timestamp || '').trim();
    const parts = timestampText.match(/^(\d+):([0-5]?\d)$/);
    const suppliedSeconds = parts ? Number(parts[1]) * 60 + Number(parts[2]) : startSeconds;
    const seconds = Math.max(startSeconds, Math.min(endSeconds || suppliedSeconds, suppliedSeconds));
    return {
      timestamp: vodTime(seconds), endTimestamp: vodTime(endSeconds), seconds,
      round: Number.isFinite(Number(finding?.round)) ? Number(finding.round) : null,
      category: String(finding?.category || 'Decision').trim().slice(0, 80),
      outcome: ['positive', 'negative', 'neutral'].includes(finding?.outcome) ? finding.outcome : 'neutral',
      observation: String(finding?.observation || '').trim().slice(0, 700),
      evidence: String(finding?.evidence || '').trim().slice(0, 500),
      coaching: String(finding?.coaching || '').trim().slice(0, 700),
      confidence: ['high', 'average', 'low'].includes(finding?.confidence) ? finding.confidence : 'low'
    };
  }).filter(isUsefulVodFinding);
  return {
    sceneType: allowedScenes.has(parsed.sceneType) ? parsed.sceneType : 'unknown',
    activity: allowedActivities.has(parsed.activity) ? parsed.activity : 'none',
    summary: String(parsed.summary || '').trim().slice(0, 700),
    findings,
    limitations: parsed.limitations.slice(0, 4).map((item) => String(item).trim().slice(0, 400)).filter(Boolean),
    framesReviewed: Math.max(0, Number(frameCount) || 0)
  };
}

function deduplicateFullVodFindings(findings = []) {
  const kept = [];
  for (const finding of findings.slice().sort((left, right) => Number(left.seconds) - Number(right.seconds))) {
    if (!isUsefulVodFinding(finding)) continue;
    const signature = `${finding.category} ${finding.observation}`.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, 180);
    const duplicate = kept.some((entry) => entry.signature === signature && Math.abs(entry.seconds - Number(finding.seconds)) < 20);
    if (!duplicate) kept.push({ ...finding, signature, seconds: Number(finding.seconds) || 0 });
  }
  return kept.map(({ signature, ...finding }) => finding).slice(0, 1_000);
}

function finalizeFullVodReport(checkpoint = {}) {
  const findings = deduplicateFullVodFindings(checkpoint.findings || []);
  const negative = findings.filter((finding) => finding.outcome === 'negative');
  const categoryCounts = new Map();
  for (const finding of negative) categoryCounts.set(finding.category, (categoryCounts.get(finding.category) || 0) + 1);
  const patterns = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, occurrences]) => {
    const examples = negative.filter((finding) => finding.category === category).slice(0, 2);
    return { category, occurrences, coaching: examples.map((finding) => finding.coaching).filter(Boolean).join(' ') };
  });
  const durationSeconds = Math.max(0, Number(checkpoint.durationSeconds) || 0);
  const totalSegments = Math.max(0, Number(checkpoint.totalSegments) || 0);
  const completedSegments = Math.max(0, Number(checkpoint.completedSegments) || 0);
  const invalidSegments = Math.max(0, Number(checkpoint.invalidSegments) || 0);
  const coverage = totalSegments ? Math.round((completedSegments / totalSegments) * 100) : 0;
  const summary = findings.length
    ? `Reviewed ${vodTime(durationSeconds)} from beginning to end across ${completedSegments} chronological segments and ${checkpoint.framesReviewed || 0} ordered frames. ${findings.length} coachable moment${findings.length === 1 ? '' : 's'} remained after removing HUD descriptions and unsupported observations.`
    : `Reviewed ${vodTime(durationSeconds)} from beginning to end across ${completedSegments} chronological segments and ${checkpoint.framesReviewed || 0} ordered frames. The local model did not return a defensible coachable moment, so BYAKUGAN did not manufacture advice.`;
  return {
    analysisVersion: FULL_VOD_ANALYSIS_VERSION,
    mode: 'full-match', summary, findings, patterns,
    confidence: invalidSegments > Math.max(2, totalSegments * .08) || !findings.length ? 'low' : 'average',
    coverage: { durationSeconds, totalSegments, completedSegments, percent: coverage, frameRate: checkpoint.frameRate || FULL_VOD_FRAME_RATE },
    framesReviewed: Math.max(0, Number(checkpoint.framesReviewed) || 0),
    limitations: [...new Set([
      ...(checkpoint.limitations || []),
      `Ordered visual frames were reviewed at ${checkpoint.frameRate || FULL_VOD_FRAME_RATE} FPS; actions shorter than the sampling interval may be missed.`,
      'Audio and communications were not analyzed.',
      ...(invalidSegments ? [`${invalidSegments} segment${invalidSegments === 1 ? '' : 's'} could not be converted into validated structured observations.`] : [])
    ])].slice(0, 12)
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
    if (tier === 'lite') return { report: validateReport(liteReport(match, contextPack)), matchCard, contextPack, model: 'BYAKUGAN Lite Engine', tier: 'lite', notice: '' };
    if (!model) throw new Error('Choose an installed local Sensei model in Settings first.');
    try {
      const report = await generateStructured({
        endpoint: this.endpoint, model, prompt: modelPrompt(matchCard, contextPack), schema: strictSchema(),
        label: 'local model', validate: validateReport, retries: 1
      });
      return { report, matchCard, contextPack, model, tier: 'sensei', notice: '' };
    } catch (error) {
      if (error?.code !== 'SENSEI_STRUCTURED_OUTPUT') throw error;
      return {
        report: validateReport(liteReport(match, contextPack)), matchCard, contextPack,
        model: 'BYAKUGAN Lite Engine', tier: 'lite',
        notice: `The selected local model (${model}) could not produce a valid report after automatic repair, so BYAKUGAN safely used Sensei Lite for this match.`
      };
    }
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

  async analyzeVod({ match, statisticalReport, frameFiles, frameTimestamps = [], frameIntervalSeconds = 120, model = '', repairModel = '', signal = null, onProgress = () => {} }) {
    if (!model) throw new Error('Choose an installed vision-capable Ollama model in Settings first.');
    const files = (frameFiles || []).slice(0, 24);
    if (!files.length) throw new Error('No video frames were available for VOD analysis.');
    const batchSchema = vodSchema(4);
    const batches = [];
    const batchSize = 4;
    for (let start = 0; start < files.length; start += batchSize) {
      if (signal?.aborted) throw canceledError();
      const batchFiles = files.slice(start, start + batchSize);
      const timestamps = batchFiles.map((_, index) => Number(frameTimestamps[start + index]) || (start + index) * frameIntervalSeconds);
      const labels = timestamps.map((seconds, index) => `Image ${index + 1} = ${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`).join(', ');
      const prompt = `Review only these ${batchFiles.length} sequential sampled frames from one completed VALORANT first-person VOD. ${labels}. Use only visible evidence. Never infer hidden enemies, unheard communications, off-screen utility, exact intent, or events between samples. A webcam or overlay may obstruct evidence; list it as a limitation. Return no more than four concise timestamped findings about visible crosshair placement, exposure, peeking, positioning, utility, rotations, trading opportunities, or objective play. Keep the summary to two sentences. Return strict JSON only.\nMATCH:${JSON.stringify(compactMatch(match))}`;
      onProgress({ phase: 'reviewing', current: start, total: files.length, message: `Reviewing frames ${start + 1}-${start + batchFiles.length}` });
      let report;
      try {
        report = await generateStructured({
          endpoint: this.endpoint, model, repairModel, prompt, schema: batchSchema,
          images: batchFiles.map((file) => fs.readFileSync(file).toString('base64')),
          timeoutMs: 20 * 60_000, signal, label: 'vision model', retries: 1, numPredict: 1_200,
          onRepair: () => onProgress({ phase: 'reviewing', current: start, total: files.length, message: `Repairing structured output for frames ${start + 1}-${start + batchFiles.length}` }),
          validate: (value) => validateVodReport(value, batchFiles.length, frameIntervalSeconds)
        });
      } catch (error) {
        report = normalizeVodCandidate(error?.candidates, timestamps, frameIntervalSeconds);
        if (!report) throw error;
        onProgress({ phase: 'reviewing', current: start, total: files.length, message: `Recovered usable output for frames ${start + 1}-${start + batchFiles.length}` });
      }
      batches.push(report);
      onProgress({ phase: 'reviewing', current: Math.min(start + batchFiles.length, files.length), total: files.length, message: `Reviewed ${Math.min(start + batchFiles.length, files.length)} of ${files.length} frames` });
    }
    onProgress({ phase: 'validating', current: files.length, total: files.length, message: 'Validating and consolidating visual findings' });
    return consolidateVodReports(batches, files.length, frameIntervalSeconds);
  }

  async analyzeFullVod({
    match, statisticalReport, source, ffmpeg, outputDirectory, checkpoint = null,
    model = '', repairModel = '', signal = null, onProgress = () => {}, onCheckpoint = () => {}
  }) {
    if (!model) throw new Error('Choose an installed vision-capable Ollama model in Settings first.');
    const durationSeconds = await probeVodDuration(ffmpeg, source, { signal });
    const chunkSeconds = FULL_VOD_CHUNK_SECONDS;
    const frameRate = FULL_VOD_FRAME_RATE;
    const totalSegments = Math.max(1, Math.ceil(durationSeconds / chunkSeconds));
    const canResume = checkpoint?.version === FULL_VOD_ANALYSIS_VERSION
      && Number(checkpoint.totalSegments) === totalSegments
      && Math.abs(Number(checkpoint.durationSeconds) - durationSeconds) < 2;
    const progress = canResume ? {
      ...checkpoint,
      findings: Array.isArray(checkpoint.findings) ? checkpoint.findings : [],
      limitations: Array.isArray(checkpoint.limitations) ? checkpoint.limitations : []
    } : {
      version: FULL_VOD_ANALYSIS_VERSION, durationSeconds, chunkSeconds, frameRate, totalSegments,
      completedSegments: 0, framesReviewed: 0, gameplaySegments: 0, actionSegments: 0, invalidSegments: 0,
      startedAt: Date.now(), updatedAt: Date.now(), findings: [], limitations: []
    };
    const accumulatedElapsedMs = Math.max(0, Number(progress.elapsedMs) || 0);
    const analysisStartedAt = Date.now();
    const resumedAt = Math.max(0, Number(progress.completedSegments) || 0);
    let estimatedEtaSeconds = 0;
    for (let index = resumedAt; index < totalSegments; index += 1) {
      if (signal?.aborted) throw canceledError();
      const startSeconds = index * chunkSeconds;
      const segmentDuration = Math.max(.1, Math.min(chunkSeconds, durationSeconds - startSeconds));
      const endSeconds = Math.min(durationSeconds, startSeconds + segmentDuration);
      const segmentDirectory = path.join(outputDirectory, `segment-${String(index + 1).padStart(5, '0')}`);
      let extraction;
      try {
        onProgress({ phase: 'full-analysis', stage: 'extracting', current: index, total: totalSegments, mediaSeconds: startSeconds, durationSeconds, etaSeconds: estimatedEtaSeconds, message: `Extracting ${vodTime(startSeconds)}–${vodTime(endSeconds)}` });
        extraction = await extractVodSegmentFrames({ ffmpeg, source, outputDirectory: segmentDirectory, startSeconds, durationSeconds: segmentDuration, frameRate, signal });
        onProgress({ phase: 'full-analysis', stage: 'reviewing', current: index, total: totalSegments, mediaSeconds: startSeconds, durationSeconds, etaSeconds: estimatedEtaSeconds, message: `Reviewing ${vodTime(startSeconds)}–${vodTime(endSeconds)}` });
        let report = null;
        try {
          const timestamps = extraction.files.map((_, frameIndex) => startSeconds + (frameIndex / frameRate));
          const labels = timestamps.map((seconds, frameIndex) => `Image ${frameIndex + 1}=${vodTime(seconds)}`).join(', ');
          const prompt = `You are reviewing ONE continuous ${segmentDuration.toFixed(1)}-second section from a complete VALORANT VOD. Images are chronological at ${frameRate} frames per second: ${labels}.

Decide whether this section contains a defensible tactical event. Compare changes across the ordered images; do not describe isolated screenshots. A useful finding must identify a visible player decision, its visible consequence, concrete evidence across frames, and a specific adjustment or repeatable strength. Return at most two findings.

NEVER create findings merely because the crosshair is centered, health/weapon/HUD is visible, a webcam or overlay exists, a Buy Phase/Won/Lost screen appears, or the player is standing/walking without a visible tactical consequence. Put obstructions in limitations. If there is no coachable evidence, return an empty findings array. Do not infer audio, communications, hidden enemies, intent, or activity between supplied frames. Return strict JSON only.

MATCH CARD:${JSON.stringify(compactMatch(match))}
SAVED STATISTICAL REPORT:${JSON.stringify({ verdict: statisticalReport?.verdict, strengths: statisticalReport?.strengths, weaknesses: statisticalReport?.weaknesses, focusRule: statisticalReport?.focusRule })}`;
          report = await generateStructured({
            endpoint: this.endpoint, model, repairModel, prompt, schema: fullVodSegmentSchema(),
            images: extraction.files.map((file) => fs.readFileSync(file).toString('base64')),
            timeoutMs: 20 * 60_000, signal, label: 'vision model', retries: 1, numPredict: 1_000,
            onRepair: () => onProgress({ phase: 'full-analysis', stage: 'repairing', current: index, total: totalSegments, mediaSeconds: startSeconds, durationSeconds, etaSeconds: estimatedEtaSeconds, message: `Repairing ${vodTime(startSeconds)}–${vodTime(endSeconds)}` }),
            validate: (value) => validateFullVodSegment(value, { startSeconds, endSeconds, frameCount: extraction.files.length })
          });
        } catch (error) {
          if (error?.code === 'SENSEI_CANCELED' || /^Ollama returned HTTP/.test(error?.message || '') || /lost contact with Ollama|local model timed out/i.test(error?.message || '')) throw error;
          progress.invalidSegments += 1;
          progress.limitations.push(`The segment at ${vodTime(startSeconds)} could not be normalized and was omitted.`);
          report = { sceneType: 'unknown', activity: 'none', findings: [], limitations: [], framesReviewed: extraction.files.length };
        }
        progress.completedSegments = index + 1;
        progress.framesReviewed += extraction.files.length;
        if (['gameplay', 'spectating'].includes(report.sceneType)) progress.gameplaySegments += 1;
        if (!['none', 'setup', 'spectating'].includes(report.activity) || report.findings.length) progress.actionSegments += 1;
        progress.findings.push(...report.findings);
        progress.findings = deduplicateFullVodFindings(progress.findings);
        progress.limitations = [...new Set([...progress.limitations, ...report.limitations])].slice(0, 20);
        progress.updatedAt = Date.now();
        progress.elapsedMs = accumulatedElapsedMs + (progress.updatedAt - analysisStartedAt);
        await onCheckpoint({ ...progress });
        const completedThisRun = progress.completedSegments - resumedAt;
        const averageMs = completedThisRun ? (Date.now() - analysisStartedAt) / completedThisRun : 0;
        estimatedEtaSeconds = Math.round((totalSegments - progress.completedSegments) * averageMs / 1_000);
        onProgress({
          phase: 'full-analysis', stage: 'complete-segment', current: progress.completedSegments, total: totalSegments,
          mediaSeconds: endSeconds, durationSeconds, etaSeconds: estimatedEtaSeconds, resumed: resumedAt > 0,
          message: `Reviewed ${vodTime(endSeconds)} of ${vodTime(durationSeconds)}`
        });
      } finally {
        try { fs.rmSync(segmentDirectory, { recursive: true, force: true }); } catch {}
      }
    }
    onProgress({ phase: 'validating', current: totalSegments, total: totalSegments, mediaSeconds: durationSeconds, durationSeconds, message: 'Building the full-match tactical report' });
    return finalizeFullVodReport(progress);
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

async function extractVodSegmentFrames({
  ffmpeg, source, outputDirectory, startSeconds = 0, durationSeconds = FULL_VOD_CHUNK_SECONDS,
  frameRate = FULL_VOD_FRAME_RATE, signal = null
}) {
  if (signal?.aborted) throw canceledError();
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pattern = path.join(outputDirectory, 'frame-%03d.jpg');
  const args = [
    '-hide_banner', '-loglevel', 'error', '-ss', Number(startSeconds).toFixed(3), '-i', source,
    '-t', Number(durationSeconds).toFixed(3), '-vf', `fps=${frameRate},scale=${FULL_VOD_FRAME_WIDTH}:-2`,
    '-q:v', '5', '-start_number', '1', '-y', pattern
  ];
  await extractFrame(ffmpeg, args, signal);
  const files = fs.readdirSync(outputDirectory)
    .filter((name) => /^frame-\d+\.jpg$/i.test(name))
    .sort()
    .map((name) => path.join(outputDirectory, name));
  if (!files.length) throw new Error(`No readable video frames were found near ${vodTime(startSeconds)}.`);
  return { files, startSeconds, durationSeconds, frameRate };
}

module.exports = {
  FULL_VOD_ANALYSIS_VERSION, FULL_VOD_CHUNK_SECONDS, FULL_VOD_FRAME_RATE,
  SenseiService, buildContextPack, compactMatch, detectFfmpeg, detectFfprobe, extractVodFrames, extractVodSegmentFrames, finalizeFullVodReport,
  headshotPercent, isUsefulVodFinding, liteReport, parseStructuredJson, probeVodDuration, strictSchema, summarizeMatches,
  validateFullVodSegment, validateReport, validateVodReport, vodTime
};
