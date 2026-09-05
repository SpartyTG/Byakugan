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

function praiseFromReport(report) {
  return Array.isArray(report && report.strengths) ? report.strengths.slice(0, 3) : [];
}

function priorMatches(store, accountId, currentMatchId) {
  const current = String(currentMatchId || "");
  return store.getLastMatches(accountId, 8).filter((row) => String(row.matchId || "") !== current);
}

function buildCurriculum({ store, accountId, match, report, rankName }) {
  const leakSlugs = leaksFromMatch(match, report);
  const rankBand = rankBandFromName(rankName || match.rankName || "");
  const matchId = match.id || match.matchId;
  return decideCurriculum({
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
  });
}

function planSenseiBrain({ store, accountId, match, rankName }) {
  if (!store || !accountId || !match) {
    return { curriculum: null, leakSlugs: [], notice: "" };
  }
  const curriculum = buildCurriculum({ store, accountId, match, report: null, rankName });
  return {
    curriculum,
    leakSlugs: leaksFromMatch(match, null),
    notice: ""
  };
}

function applySenseiBrain({ store, accountId, match, report, rankName }) {
  if (!store || !accountId || !match) {
    return { curriculum: null, leakSlugs: [], notice: "" };
  }

  const leakSlugs = leaksFromMatch(match, report);
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
    vodUsed: false
  });
  for (const slug of leakSlugs) {
    store.touchLeak(accountId, slug, 1, match.id || match.matchId);
  }

  const curriculum = buildCurriculum({ store, accountId, match, report, rankName });

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

module.exports = {
  leaksFromMatch,
  planSenseiBrain,
  applySenseiBrain
};
