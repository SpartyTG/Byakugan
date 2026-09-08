'use strict';
const { createHash } = require('node:crypto');
const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
async function checkHenrikHistory({ key, profile, region, fetchImpl = globalThis.fetch }) {
  if (typeof key !== 'string' || !key.trim() || key.length > 2048 || /[\r\n]/.test(key)) throw new Error('Enter a valid HenrikDev API key.');
  const context = profile?.historyCheckContext;
  if (!profile?.gameName || !profile?.tagLine || !profile?.activeSeasonId || !context
    || context.accountKey !== profile.senseiAccountKey || context.seasonId !== profile.activeSeasonId) {
    throw new Error('Connect to the updated gaming PC first so the account, Act and cached match list are available.');
  }
  const affinity = String(region || '').toLowerCase();
  if (!['na', 'eu', 'ap', 'kr', 'latam', 'br'].includes(affinity)) throw new Error('The connected account region is unavailable.');
  const known = new Set(context.matchHashes || []);
  const seen = new Set();
  let pages = 0, matches = 0, missing = 0, invalid = 0, wins = 0, losses = 0, draws = 0;
  let kills = 0, deaths = 0, head = 0, body = 0, leg = 0;
  let exhausted = false;
  const dates = [];
  for (let page = 1; page <= 30; page += 1) {
    const url = new URL(`https://api.henrikdev.xyz/valorant/v1/stored-matches/${affinity}/${encodeURIComponent(profile.gameName)}/${encodeURIComponent(profile.tagLine)}`);
    url.search = new URLSearchParams({ mode: 'competitive', size: '100', page: String(page) }).toString();
    let response;
    try {
      response = await fetchImpl(url.href, { headers: { Authorization: key.trim() }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    } catch { throw new Error('HenrikDev could not be reached. Retry the check later.'); }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? 'HenrikDev rejected the key or account access.' : response.status === 429
        ? 'HenrikDev rate limit reached. Retry later.' : `HenrikDev returned HTTP ${Number(response.status) || 0}.`);
    let payload;
    try { payload = await response.json(); } catch { throw new Error('HenrikDev returned an unreadable response.'); }
    if (payload?.status !== 200 || !Array.isArray(payload.data)) throw new Error('HenrikDev returned an unexpected response.');
    pages += 1;
    for (const row of payload.data) {
      if (row.meta?.season?.id !== context.seasonId || String(row.meta?.mode).toLowerCase() !== 'competitive') continue;
      if (!row.meta?.id || seen.has(row.meta.id)) continue;
      seen.add(row.meta.id);
      const stats = row.stats || {};
      if (`riot-${digest(stats.puuid).slice(0, 32)}` !== context.accountKey) { invalid += 1; continue; }
      const team = String(stats.team || '').toLowerCase();
      const values = [stats.kills, stats.deaths, stats.shots?.head, stats.shots?.body, stats.shots?.leg, row.teams?.red, row.teams?.blue];
      if (!['red', 'blue'].includes(team) || !values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) { invalid += 1; continue; }
      matches += 1;
      if (!known.has(digest(row.meta.id))) missing += 1;
      const ours = row.teams[team], theirs = row.teams[team === 'red' ? 'blue' : 'red'];
      if (ours > theirs) wins += 1; else if (ours < theirs) losses += 1; else draws += 1;
      kills += stats.kills; deaths += stats.deaths;
      head += stats.shots.head; body += stats.shots.body; leg += stats.shots.leg;
      const date = Date.parse(row.meta.started_at); if (Number.isFinite(date)) dates.push(date);
    }
    if (!payload.data.length || (Number.isFinite(payload.results?.total) && page * 100 >= payload.results.total)) { exhausted = true; break; }
  }
  return { version: 1, checkedAt: new Date().toISOString(), pages, exhausted, matches, missing, invalid,
    wins, losses, draws, kd: deaths ? Math.round(kills / deaths * 100) / 100 : null,
    headshot: head + body + leg ? Math.round(head / (head + body + leg) * 1000) / 10 : null,
    oldest: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    expectedWins: profile.actRecordWins ?? null, expectedGames: profile.actRecordGames ?? null,
    note: 'Stored provider sample only. No matches imported. Round-score results may include remakes; completeness is not established by counts alone.' };
}
module.exports = { checkHenrikHistory };
