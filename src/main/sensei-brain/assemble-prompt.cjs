"use strict";

const { loadAllPacks, getLeak } = require("./packs/loader.cjs");

const EXISTING_REPORT_SCHEMA = {
  type: "object",
  required: ["verdict", "scorecard", "strengths", "weaknesses", "drills", "focusRule", "citations"],
  properties: {
    verdict: { type: "string" },
    scorecard: {
      type: "object",
      required: ["impact", "aim", "entry", "utility", "econ"]
    },
    strengths: { type: "array", maxItems: 3 },
    weaknesses: { type: "array", maxItems: 3 },
    drills: { type: "array", minItems: 3, maxItems: 3 },
    focusRule: { type: "string" },
    citations: { type: "array" }
  }
};

function clip(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function memorySummary(lastMatches, ledger, openMission) {
  return {
    lastMatches: (lastMatches || []).slice(-8).map((row) => ({
      matchId: row.matchId,
      map: row.map,
      agent: row.agent,
      result: row.result,
      leakSlugs: row.leakSlugs || []
    })),
    topLeaks: Object.values(ledger || {})
      .sort((a, b) => (b.timesSeen || 0) - (a.timesSeen || 0))
      .slice(0, 3)
      .map((row) => ({ slug: row.slug, timesSeen: row.timesSeen, status: row.status })),
    openMission: openMission
      ? { id: openMission.id, slug: openMission.slug, title: openMission.title, status: openMission.status }
      : null
  };
}

function packExcerpt(rankBand, agent, map) {
  const packs = loadAllPacks();
  const band = packs.ranks.bands[rankBand] || packs.ranks.bands["gold-plat"];
  return {
    doctrine: packs.doctrine.principles.slice(0, 8),
    forbidden: packs.doctrine.forbidden,
    rankBand,
    rankEmphasize: band.emphasize,
    rankAvoid: band.avoid,
    metaPackId: packs.meta.packId,
    gamePatch: packs.meta.gamePatch,
    metaNotes: packs.meta.changelogForCoach,
    doNotSay: packs.meta.doNotSay,
    agent: agent || null,
    map: map || null
  };
}

function assemblePrompt(input) {
  const curriculum = input.curriculum;
  if (!curriculum || !curriculum.primaryMission) {
    throw new Error("assemblePrompt requires curriculum.primaryMission");
  }

  const leak = curriculum.primaryMission.slug && curriculum.primaryMission.slug !== "observe"
    ? getLeak(curriculum.primaryMission.slug)
    : null;

  const packs = packExcerpt(
    input.rankBand || "gold-plat",
    input.thisMatch && input.thisMatch.agent,
    input.thisMatch && input.thisMatch.map
  );

  const memory = memorySummary(input.lastMatches, input.ledger, input.openMission);

  const prompt = [
    "You are SENSEI VISION, BYAKUGAN's local VALORANT post-match coach.",
    "Calm, precise, dry, respectful. No copyrighted-character persona.",
    "You are the speaker, not the judge. Copy the supplied scorecard exactly.",
    "Never invent, recalculate, or reverse supplied numbers.",
    "Never claim to have watched a VOD unless VOD observations are supplied.",
    "Never use patch or ability facts that are not in META NOTES.",
    "The primary mission is already chosen. Do not replace it.",
    "Write a verdict in exactly 2-3 sentences.",
    "Every weakness must quote a supplied number.",
    "Return exactly three drills: one Range, one custom-game, one Deathmatch.",
    "The first drill must be the curriculum drill. The other two must support the same mission, not a new identity.",
    "focusRule must be 24 words or fewer and must state the primary mission.",
    "Return only JSON matching the existing Sensei report schema.",
    "",
    "PRIMARY MISSION:",
    JSON.stringify({
      id: curriculum.primaryMission.id,
      slug: curriculum.primaryMission.slug,
      title: curriculum.primaryMission.title,
      why: curriculum.primaryMission.why,
      drillName: curriculum.primaryMission.drillName,
      drillSetup: curriculum.primaryMission.drillSetup,
      successMetric: curriculum.primaryMission.successMetric,
      wording: curriculum.primaryMission.wording,
      keptOpenMission: curriculum.keptOpenMission,
      confidence: curriculum.confidence
    }),
    "",
    "CATALOG DRILL:",
    leak ? JSON.stringify({ name: leak.drillName, setup: leak.drillSetup, success: leak.successMetric }) : "none",
    "",
    "PACK EXCERPT:",
    JSON.stringify(packs),
    "",
    "PLAYER MEMORY:",
    JSON.stringify(memory),
    "",
    "THIS MATCH CARD:",
    JSON.stringify(input.matchCard || input.thisMatch || {}),
    "",
    "LITE SCORECARD:",
    JSON.stringify(input.scorecard || {}),
    "",
    "CURRICULUM PRAISE:",
    JSON.stringify(curriculum.praise || []),
    "",
    "REPORT SCHEMA KEYS:",
    JSON.stringify(EXISTING_REPORT_SCHEMA.required)
  ].join("\n");

  return {
    prompt: clip(prompt, 24000),
    packs,
    memory,
    schema: EXISTING_REPORT_SCHEMA
  };
}

module.exports = {
  EXISTING_REPORT_SCHEMA,
  assemblePrompt,
  memorySummary,
  packExcerpt
};
