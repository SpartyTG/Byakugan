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
  return {
    overall: summarizeMatches(completed.slice(0, 10)),
    sameAgent: summarizeMatches(completed.filter((row) => row.agent === match.agent).slice(0, 5)),
    sameMap: summarizeMatches(completed.filter((row) => row.map === match.map).slice(0, 5))
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
  const versus = baseline ? ` Your ${kd.toFixed(2)} K/D was ${kd >= baseline.kd ? 'above' : 'below'} your recent ${Number(baseline.kd).toFixed(2)} baseline.` : '';
  const verdict = `${won ? 'You won' : card.result === 'DEFEAT' ? 'You lost' : 'You drew'} ${card.score || 'this match'} on ${card.map || 'the selected map'} with ${card.kills ?? 0}/${card.deaths ?? 0}/${card.assists ?? 0}.${versus}`;
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
  if (typeof value.verdict !== 'string' || !value.verdict.trim()) throw new Error('The local model report did not include a verdict.');
  if (!value.scorecard || SCORE_KEYS.some((key) => !SCORE_VALUES.has(value.scorecard[key]))) throw new Error('The local model returned an invalid scorecard.');
  for (const key of ['strengths', 'weaknesses', 'drills', 'citations']) if (!Array.isArray(value[key])) throw new Error(`The local model returned invalid ${key}.`);
  if (value.drills.length !== 3 || value.drills.some((drill) => !drill?.name || !drill?.setup || !drill?.success)) throw new Error('The local model report must include exactly three runnable drills.');
  if (typeof value.focusRule !== 'string' || !value.focusRule.trim()) throw new Error('The local model report did not include a focus rule.');
  return {
    verdict: value.verdict.trim().slice(0, 1_200), scorecard: Object.fromEntries(SCORE_KEYS.map((key) => [key, value.scorecard[key]])),
    strengths: value.strengths.slice(0, 3).map((item) => String(item).slice(0, 500)),
    weaknesses: value.weaknesses.slice(0, 3).map((item) => String(item).slice(0, 500)),
    drills: value.drills.slice(0, 3).map((drill) => ({ name: String(drill?.name || '').slice(0, 120), setup: String(drill?.setup || '').slice(0, 700), success: String(drill?.success || '').slice(0, 500) })),
    focusRule: value.focusRule.trim().slice(0, 500), citations: value.citations.slice(0, 12).map((item) => String(item).slice(0, 240))
  };
}

async function requestJson(url, options = {}, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Local model service returned HTTP ${response.status}.`);
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('The local model timed out. It may still be loading; try again.');
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
  return `You are SENSEI VISION, a direct VALORANT post-match coach. Analyze only the supplied completed match and the same player's summarized baselines. Never claim to have watched a VOD. Never invent missing values. Compare the match to the player's baseline first, then reasonable role expectations. Every weakness must quote a supplied number. Give exactly three drills runnable in Range, custom, or Deathmatch with an objective completion condition. Avoid generic advice and hype. Return only JSON matching the requested schema.\n\nMATCH CARD:\n${JSON.stringify(matchCard)}\n\nCONTEXT PACK:\n${JSON.stringify(contextPack)}`;
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

  async analyze({ match, matches, tier = 'lite', model = '' }) {
    const matchCard = compactMatch(match);
    const contextPack = buildContextPack(match, matches);
    if (!matchCard.matchId || !['VICTORY', 'DEFEAT', 'DRAW'].includes(matchCard.result)) throw new Error('Sensei Vision can only analyze a completed match.');
    if (tier === 'lite') return { report: validateReport(liteReport(match, contextPack)), matchCard, contextPack, model: 'BYAKUGAN Lite Engine' };
    if (!model) throw new Error('Choose an installed local Sensei model in Settings first.');
    const response = await requestJson(`${this.endpoint}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: modelPrompt(matchCard, contextPack), stream: false, format: strictSchema(), options: { temperature: .2, num_predict: 1_800 } })
    });
    let parsed;
    try { parsed = JSON.parse(response.response); } catch { throw new Error('The local model did not return valid JSON. Try Regenerate.'); }
    return { report: validateReport(parsed), matchCard, contextPack, model };
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
      body: JSON.stringify({ model, stream: false, options: { temperature: .25, num_predict: 450 }, prompt: `Answer one short follow-up about this completed VALORANT match. Use only the saved report and match card. Do not start a new analysis. If evidence is missing, say so.\nMATCH:${JSON.stringify(compactMatch(match))}\nREPORT:${JSON.stringify(report)}\nQUESTION:${clean}` })
    });
    return String(response.response || '').trim().slice(0, 2_000);
  }

  async analyzeVod({ match, statisticalReport, frameFiles, frameIntervalSeconds = 120, model = '' }) {
    if (!model) throw new Error('Choose an installed vision-capable Ollama model in Settings first.');
    const images = (frameFiles || []).slice(0, 24).map((file) => fs.readFileSync(file).toString('base64'));
    if (!images.length) throw new Error('No video frames were available for VOD analysis.');
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
    const prompt = `You are SENSEI VISION reviewing sampled frames from one completed VALORANT first-person recording. The frames are sequential samples, approximately ${frameIntervalSeconds} seconds apart, beginning at 0:00. Use only visible evidence. Do not infer hidden enemies, unheard communications, utility that is off-screen, or exact intent. A webcam or overlay may obstruct evidence; state that as a limitation. Give specific timestamped observations about visible crosshair placement, exposure, peeking, positioning, utility timing, rotations, trading opportunities, objective play, and repeated decisions. Do not repeat the statistical report unless visual evidence supports it. Return strict JSON.\nMATCH:${JSON.stringify(compactMatch(match))}\nSAVED STATS REPORT:${JSON.stringify(statisticalReport)}`;
    const response = await requestJson(`${this.endpoint}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, images, stream: false, format: schema, options: { temperature: .15, num_predict: 2_000 } })
    }, 20 * 60_000);
    let parsed;
    try { parsed = JSON.parse(response.response); } catch { throw new Error('The vision model did not return valid JSON.'); }
    if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.findings) || !Array.isArray(parsed.limitations)) throw new Error('The vision model returned an incomplete report.');
    return {
      summary: parsed.summary.trim().slice(0, 1_500),
      findings: parsed.findings.slice(0, 12).map((finding, index) => ({
        timestamp: String(finding?.timestamp || `${Math.floor(index * frameIntervalSeconds / 60)}:${String(Math.round(index * frameIntervalSeconds) % 60).padStart(2, '0')}`).slice(0, 20),
        round: Number.isFinite(Number(finding?.round)) ? Number(finding.round) : null,
        category: String(finding?.category || 'Decision').slice(0, 80),
        observation: String(finding?.observation || '').slice(0, 700), evidence: String(finding?.evidence || '').slice(0, 500)
      })),
      limitations: parsed.limitations.slice(0, 8).map((item) => String(item).slice(0, 400)),
      confidence: ['high', 'average', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      frameIntervalSeconds,
      framesReviewed: images.length
    };
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

function probeVodDuration(ffmpeg, source) {
  return new Promise((resolve, reject) => {
    execFile(ffprobeFor(ffmpeg), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', source], { windowsHide: true, timeout: 30_000 }, (error, stdout) => {
      const duration = Number(String(stdout || '').trim());
      if (error || !Number.isFinite(duration) || duration <= 0) return reject(new Error('FFprobe could not read the recording duration. Install FFmpeg with FFprobe and try again.'));
      resolve(duration);
    });
  });
}

async function extractVodFrames({ ffmpeg, source, outputDirectory, frameCount = 12 }) {
  const duration = await probeVodDuration(ffmpeg, source);
  const count = Math.max(4, Math.min(24, frameCount));
  const intervalSeconds = Math.max(1, duration / count);
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDirectory, { recursive: true });
    const target = path.join(outputDirectory, 'frame-%03d.jpg');
    const args = ['-hide_banner', '-loglevel', 'error', '-i', source, '-vf', `fps=${count}/${duration},scale=960:-2`, '-frames:v', String(count), '-q:v', '4', '-y', target];
    execFile(ffmpeg, args, { windowsHide: true, timeout: 20 * 60_000 }, (error) => {
      if (error) return reject(new Error(`Video frame extraction failed: ${error.message}`));
      const files = fs.readdirSync(outputDirectory).filter((name) => /^frame-\d+\.jpg$/.test(name)).sort().map((name) => path.join(outputDirectory, name));
      if (!files.length) return reject(new Error('No readable video frames were found.'));
      resolve({ files, duration, intervalSeconds });
    });
  });
}

module.exports = {
  SenseiService, buildContextPack, compactMatch, detectFfmpeg, extractVodFrames, probeVodDuration,
  headshotPercent, liteReport, strictSchema, summarizeMatches, validateReport
};
