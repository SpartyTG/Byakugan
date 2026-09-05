"use strict";

/**
 * Sensei Brain v0 — data shapes only.
 * CommonJS, no Ollama, no disk writes, no changes to Lite.
 *
 * Existing Full/Lite report fields stay as they are in sensei-service.cjs:
 *   verdict, scorecard, strengths, weaknesses, drills, focusRule, citations
 *
 * Brain adds memory + curriculum objects. Do not replace the current report.
 */

const RANK_BANDS = Object.freeze({
  IRON_SILVER: "iron-silver",
  GOLD_PLAT: "gold-plat",
  DIAMOND_ASC: "diamond-asc",
  IMMORTAL_RADIANT: "immortal-radiant"
});

const LEAK_SLUGS = Object.freeze([
  "first_death_attack",
  "untraded_entry",
  "util_unused_on_death",
  "postplant_overpeek",
  "wrong_force_buy",
  "rifle_hs_below_band"
]);

const MISSION_STATUS = Object.freeze({
  PENDING: "pending",
  PASSED: "passed",
  FAILED: "failed",
  SKIPPED: "skipped",
  RESOLVED_BY_USER: "resolved_by_user",
  WRONG: "wrong"
});

const LEAK_STATUS = Object.freeze({
  ACTIVE: "active",
  IMPROVING: "improving",
  RESOLVED: "resolved",
  IGNORED_BY_USER: "ignored_by_user"
});

function isRankBand(value) {
  return Object.values(RANK_BANDS).includes(value);
}

function isLeakSlug(value) {
  return LEAK_SLUGS.includes(value);
}

function rankBandFromName(rankName) {
  const name = String(rankName || "").toLowerCase();
  if (/iron|bronze|silver/.test(name)) return RANK_BANDS.IRON_SILVER;
  if (/gold|platinum|plat/.test(name)) return RANK_BANDS.GOLD_PLAT;
  if (/diamond|ascendant/.test(name)) return RANK_BANDS.DIAMOND_ASC;
  if (/immortal|radiant/.test(name)) return RANK_BANDS.IMMORTAL_RADIANT;
  return RANK_BANDS.GOLD_PLAT;
}

module.exports = {
  RANK_BANDS,
  LEAK_SLUGS,
  MISSION_STATUS,
  LEAK_STATUS,
  isRankBand,
  isLeakSlug,
  rankBandFromName
};