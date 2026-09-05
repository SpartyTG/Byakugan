"use strict";

const { decideCurriculum } = require("./curriculum.cjs");
const { rankBandFromName, isLeakSlug } = require("./types.cjs");

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function leaksFromMatch(match, report) {
  const slugs = new Set();
  const firstKills = number(match && match.report && match.report.openingKills);
  const firstDeaths = number(match && match.report && match.report.openingDeaths);
  const hs = number(match && (match.hsPercent != null ? match.hsPercent : match.headshotPercent));
  const scorecard = report && report.scorecard ? report.scorecard : {};

  if (firstDeaths > firstKills || scorecard.entry === "low") slugs.add("first_death_attack");
  if (scorecard.aim === "low" || (hs > 0 && hs < 18)) slugs.add("rifle_hs_below_band");
  if (scorecard.econ === "low") slugs.add("wrong_force_buy");
  if (scorecard.utility === "low") slugs.add("util_unused_on_death");

  return [...slugs].filter(isLeakSlug);
}

function findingText(finding) {
  return [
    finding && finding.category,
    finding && finding.observation,
    finding && finding.decision,
    finding && finding.consequence,
    finding && finding.coaching,
    finding && finding.evidence
  ].filter(Boolean).join(" ").toLowerCase();
}

function leaksFromVod(vodReport) {
  const slugs = new Set();
  const findings = [
    ...((vodReport && Array.isArray(vodReport.findings)) ? vodReport.findings : []),
    ...((vodReport && vodReport.report && Array.isArray(vodReport.report.findings)) ? vodReport.report.findings : [])
  ];
  for (const finding of findings) {
    if (finding && finding.outcome === "positive") continue;
    const text = findingText(finding);
    if (!text) continue;
    if (/(died first|first death|first contact|first peek|opening duel|peeked first|first to die)/.test(text)) slugs.add("first_death_attack");
    if (/(untraded|no trade|not traded|isolated swing|swung alone)/.test(text)) slugs.add("untraded_entry");
    if (/(no flash|no smoke|unused util|util unused|died with util|utility still)/.test(text)) slugs.add("util_unused_on_death");
    if (/(post[- ]?plant|after plant|spike down|overpeek.*plant|planted.*peek)/.test(text)) slugs.add("postplant_overpeek");
    if (/(force buy|forced full|should have saved|bad buy)/.test(text)) slugs.add("wrong_force_buy");
    if (/(missed first bullet|sprayed|low headshot|hs%|crosshair off)/.test(text)) slugs.add("rifle_hs_below_band");
  }
  return [...slugs].filter(isLeakSlug);
}

function praiseFromReport(report) {
  return Array.isArray(report && report.strengths) ? report.strengths.slice(0, 3) : [];
}

function priorMatches(store, accountId, currentMatchId) {
  const current = String(currentMatchId || "");
  return store.getLastMatches(accountId, 8).filter((row) => String(row.matchId || "") !== current);
}

function buildCurriculum({ store, accountId, match, report, rankName, extraLeaks }) {
  const leakSlugs = [...new Set([
    ...leaksFromMatch(match, report),
    ...(Array.isArray(extraLeaks) ? extraLeaks : [])
  ])].filter(isLeakSlug);
  const rankBand = rankBandFromName(rankName || match.rankName || "");
  const matchId = match.id || match.matchId;
  return {
    leakSlugs,
    curriculum: decideCurriculum({
      accountId,
      rankBand,
      thisMatch: {
        matchId,
        map: match.map,
        agent: match.agent,
        leakSlugs,
        firstDeaths: number(match && match.report && match.report.openingDeaths),
        praise: praiseFromReport(report)
      },
      lastMatches: priorMatches(store, accountId, matchId),
      openMission: store.getOpenMission(accountId)
    })
  };
}

function planSenseiBrain({ store, accountId, match, rankName }) {
  if (!store || !accountId || !match) {
    return { curriculum: null, leakSlugs: [], notice: "" };
  }
  const built = buildCurriculum({ store, accountId, match, report: null, rankName });
  return { curriculum: built.curriculum, leakSlugs: built.leakSlugs, notice: "" };
}

function applySenseiBrain({ store, accountId, match, report, rankName, extraLeaks }) {
  if (!store || !accountId || !match) {
    return { curriculum: null, leakSlugs: [], notice: "" };
  }

  const built = buildCurriculum({ store, accountId, match, report, rankName, extraLeaks });
  const leakSlugs = built.leakSlugs;
  const curriculum = built.curriculum;
  const rankBand = rankBandFromName(rankName || match.rankName || "");

  store.upsertProfile(accountId, {
    currentRank: rankName || match.rankName || "",
    rankBand
  });
  store.insertMatchMemory(accountId, {
    matchId: match.id || match.matchId,
    map: match.map,
    agent: match.agent,
    result: match.result,
    liteScorecard: report && report.scorecard ? report.scorecard : {},
    leakSlugs,
    vodUsed: Boolean(extraLeaks && extraLeaks.length)
  });
  for (const slug of leakSlugs) {
    store.touchLeak(accountId, slug, 1, match.id || match.matchId);
  }

  if (curriculum.primaryMission && curriculum.primaryMission.slug !== "observe") {
    if (!curriculum.keptOpenMission) {
      store.setMission(accountId, curriculum.primaryMission);
    }
  }

  return {
    curriculum,
    leakSlugs,
    notice: curriculum.keptOpenMission
      ? `Sensei mission stays: ${curriculum.primaryMission.title}`
      : `Sensei mission: ${curriculum.primaryMission.title}`
  };
}

function applySenseiVod({ store, accountId, match, report, vodReport, rankName }) {
  const extraLeaks = leaksFromVod(vodReport);
  const brain = applySenseiBrain({ store, accountId, match, report, rankName, extraLeaks });
  return {
    ...brain,
    vodLeaks: extraLeaks,
    notice: extraLeaks.length
      ? `VOD confirmed: ${extraLeaks.join(", ")}`
      : (brain.notice || "")
  };
}

module.exports = {
  leaksFromMatch,
  leaksFromVod,
  planSenseiBrain,
  applySenseiBrain,
  applySenseiVod
};
