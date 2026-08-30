'use strict';

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function completed(matches) {
  return (matches || []).filter((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result));
}

function summarize(matches) {
  const rows = completed(matches);
  const totals = rows.reduce((sum, match) => {
    sum.kills += Number(match.kills) || 0;
    sum.deaths += Number(match.deaths) || 0;
    sum.assists += Number(match.assists) || 0;
    sum.rr += Number(match.rr) || 0;
    sum.headshots += Number(match.shots?.headshots) || 0;
    sum.bodyshots += Number(match.shots?.bodyshots) || 0;
    sum.legshots += Number(match.shots?.legshots) || 0;
    if (match.result === 'VICTORY') sum.wins += 1;
    if (match.result === 'DEFEAT') sum.losses += 1;
    if (match.result === 'DRAW') sum.draws += 1;
    return sum;
  }, { kills: 0, deaths: 0, assists: 0, rr: 0, headshots: 0, bodyshots: 0, legshots: 0, wins: 0, losses: 0, draws: 0 });
  const shots = totals.headshots + totals.bodyshots + totals.legshots;
  return {
    games: rows.length,
    wins: totals.wins,
    losses: totals.losses,
    draws: totals.draws,
    winRate: rows.length ? round((totals.wins / rows.length) * 100) : 0,
    kills: totals.kills,
    deaths: totals.deaths,
    assists: totals.assists,
    kd: totals.deaths ? round(totals.kills / totals.deaths, 2) : totals.kills,
    headshot: shots ? round((totals.headshots / shots) * 100) : 0,
    averageKills: rows.length ? round(totals.kills / rows.length) : 0,
    rr: totals.rr
  };
}

function groupStats(matches, keySelector, metadataSelector = () => ({})) {
  const groups = new Map();
  for (const match of completed(matches)) {
    const key = keySelector(match);
    if (!key || key === '—' || String(key).startsWith('Unknown')) continue;
    const group = groups.get(key) || { key, matches: [], ...metadataSelector(match) };
    group.matches.push(match);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    id: group.key,
    name: group.key,
    ...group,
    ...summarize(group.matches),
    matches: undefined
  })).sort((a, b) => b.games - a.games || b.winRate - a.winRate);
}

function buildJourney(matches, tiers = new Map()) {
  return (matches || []).filter((match) => Number(match.startedAt) > 0 && Number(match.tierAfter || match.competitiveTier || 0) > 0)
    .slice().sort((a, b) => a.startedAt - b.startedAt).map((match, index) => {
    const tierNumber = Number(match.tierAfter || match.competitiveTier || 0);
    const tier = tiers.get(tierNumber) || { name: match.rankName || 'Unrated', image: match.rankImage || '' };
    return {
      index: index + 1,
      matchId: match.id,
      timestamp: match.startedAt,
      rr: Number(match.rrAfter) || 0,
      rrChange: Number(match.rr) || 0,
      tier: tierNumber,
      rank: tier.name,
      rankImage: tier.image || '',
      result: ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result) ? match.result : 'RATING',
      map: match.map || 'Competitive match',
      agent: match.agent || 'Details loading'
    };
  });
}

function recentStreak(matches) {
  const rows = completed(matches);
  if (!rows.length || rows[0].result === 'DRAW') return { result: 'DRAW', count: 0 };
  const result = rows[0].result;
  let count = 0;
  for (const match of rows) {
    if (match.result !== result) break;
    count += 1;
  }
  return { result, count };
}

function buildInsights(matches, maps, agents) {
  const insights = [];
  const overall = summarize(matches);
  const qualifiedMap = maps.filter((map) => map.games >= 3).sort((a, b) => b.winRate - a.winRate)[0];
  if (qualifiedMap) insights.push({
    icon: 'MAP', tone: 'positive', title: `${qualifiedMap.name} is your strongest map`,
    body: `${qualifiedMap.winRate}% win rate across ${qualifiedMap.games} matches with a ${qualifiedMap.kd} K/D.`
  });
  const qualifiedAgent = agents.filter((agent) => agent.games >= 3).sort((a, b) => b.winRate - a.winRate || b.kd - a.kd)[0];
  if (qualifiedAgent) insights.push({
    icon: 'AGENT', tone: 'violet', title: `${qualifiedAgent.name} produces your best results`,
    body: `${qualifiedAgent.winRate}% win rate and ${qualifiedAgent.kd} K/D over ${qualifiedAgent.games} matches.`
  });
  if (matches.length >= 10) {
    const latest = summarize(matches.slice(0, 5));
    const previous = summarize(matches.slice(5, 10));
    const difference = round(latest.kd - previous.kd, 2);
    insights.push({
      icon: 'TREND', tone: difference >= 0 ? 'positive' : 'warning',
      title: difference >= 0 ? 'Your recent form is improving' : 'Your recent K/D has cooled off',
      body: `Last five K/D: ${latest.kd}. Previous five: ${previous.kd}. Change: ${difference > 0 ? '+' : ''}${difference}.`
    });
  }
  const openings = matches.reduce((sum, match) => {
    sum.kills += Number(match.report?.openingKills) || 0;
    sum.deaths += Number(match.report?.openingDeaths) || 0;
    return sum;
  }, { kills: 0, deaths: 0 });
  if (openings.kills + openings.deaths >= 5) insights.push({
    icon: 'OPENING', tone: openings.kills >= openings.deaths ? 'positive' : 'warning',
    title: openings.kills >= openings.deaths ? 'You create opening advantages' : 'Opening duels are costing rounds',
    body: `${openings.kills} opening kills versus ${openings.deaths} opening deaths this act.`
  });
  const streak = recentStreak(matches);
  if (streak.count >= 2) insights.push({
    icon: 'FORM', tone: streak.result === 'VICTORY' ? 'positive' : 'warning',
    title: `${streak.count}-${streak.result === 'VICTORY' ? 'game win' : 'game loss'} streak`,
    body: streak.result === 'VICTORY' ? 'Momentum is positive—protect the habits producing it.' : 'Consider a short reset before the next competitive queue.'
  });
  if (!insights.length) insights.push({ icon: 'ACT', tone: 'violet', title: 'Build your act profile', body: `BYAKUGAN has ${overall.games} competitive ${overall.games === 1 ? 'match' : 'matches'} to analyze so far.` });
  return insights.slice(0, 5);
}

function buildChallenges(matches, maps) {
  const stats = summarize(matches);
  const openings = matches.reduce((sum, match) => {
    sum.kills += Number(match.report?.openingKills) || 0;
    sum.deaths += Number(match.report?.openingDeaths) || 0;
    return sum;
  }, { kills: 0, deaths: 0 });
  const challenges = [];
  challenges.push({
    id: 'kd', title: 'Positive impact', description: 'Finish the next five matches at or above a 1.0 K/D.',
    current: Math.min(100, round((stats.kd / 1) * 100)), target: '1.0 K/D', tone: stats.kd >= 1 ? 'complete' : 'active'
  });
  challenges.push({
    id: 'headshot', title: 'Precision cycle', description: 'Raise your act headshot percentage toward 25%.',
    current: Math.min(100, round((stats.headshot / 25) * 100)), target: '25% HS', tone: stats.headshot >= 25 ? 'complete' : 'active'
  });
  if (openings.kills + openings.deaths) challenges.push({
    id: 'openings', title: 'First-contact discipline', description: 'Create at least as many opening kills as opening deaths.',
    current: Math.min(100, round((openings.kills / Math.max(1, openings.deaths)) * 100)), target: `${openings.kills}/${openings.deaths}`, tone: openings.kills >= openings.deaths ? 'complete' : 'warning'
  });
  const weakMap = maps.filter((map) => map.games >= 3 && map.winRate < 50).sort((a, b) => a.winRate - b.winRate)[0];
  if (weakMap) challenges.push({
    id: `map-${weakMap.id}`, title: `${weakMap.name} recovery`, description: `Win two of your next three competitive matches on ${weakMap.name}.`,
    current: Math.min(100, weakMap.winRate * 2), target: '2 of 3', tone: 'warning'
  });
  return challenges.slice(0, 4);
}

function buildSynergy(matches, friends) {
  const friendById = new Map((friends || []).map((friend) => [friend.id, friend]));
  const groups = new Map();
  for (const match of completed(matches)) {
    for (const id of match.teammateIds || []) {
      const friend = friendById.get(id);
      if (!friend) continue;
      const current = groups.get(id) || { id, name: friend.name, tag: friend.tag, matches: [] };
      current.matches.push(match);
      groups.set(id, current);
    }
  }
  return [...groups.values()].map((group) => ({
    id: group.id,
    name: group.name,
    tag: group.tag,
    ...summarize(group.matches),
    matchIds: group.matches.map((match) => match.id).filter(Boolean)
  }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate).slice(0, 8);
}

function buildSession(matches, session = {}) {
  const start = Number(session.startedAt) || Date.now();
  const trackedMatchIds = new Set((session.trackedMatchIds || []).map(String));
  const rows = completed(matches).filter((match) =>
    Number(match.startedAt) >= start || trackedMatchIds.has(String(match.id || ''))
  );
  const stats = summarize(rows);
  return {
    startedAt: start,
    startingRank: session.startingRank || '',
    startingRR: Number(session.startingRR) || 0,
    currentRank: session.currentRank || '',
    currentRR: Number(session.currentRR) || 0,
    matchIds: rows.map((match) => match.id).filter(Boolean),
    rrChange: stats.rr,
    ...stats,
    bestMatch: rows.slice().sort((a, b) => (b.kd || 0) - (a.kd || 0))[0]?.id || ''
  };
}

function buildActAnalytics(matches, { tiers = new Map(), friends = [], session = {} } = {}) {
  const maps = groupStats(matches, (match) => match.map, (match) => ({ image: match.mapImage || '', topAgent: match.agent }));
  const agents = groupStats(matches, (match) => match.agent, (match) => ({ image: match.agentImage || '', role: match.agentRole || 'Agent', color: match.agentColor || '#7b67f6' }));
  const servers = groupStats(matches, (match) => match.server, (match) => ({ region: match.serverRegion || '', serverId: match.serverId || '' }));
  const summary = summarize(matches);
  for (const agent of agents) agent.mastery = summary.games ? Math.round((agent.games / summary.games) * 100) : 0;
  return {
    summary,
    journey: buildJourney(matches, tiers),
    maps,
    agents,
    servers,
    insights: buildInsights(matches, maps, agents),
    challenges: buildChallenges(matches, maps),
    synergy: buildSynergy(matches, friends),
    session: buildSession(matches, session)
  };
}

module.exports = {
  summarize,
  groupStats,
  buildJourney,
  buildInsights,
  buildChallenges,
  buildSynergy,
  buildSession,
  buildActAnalytics
};
