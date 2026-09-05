"use strict";

const { loadAllPacks } = require("./packs/loader.cjs");

const REQUIRED_FIELDS = ["verdict", "scorecard", "strengths", "weaknesses", "drills", "focusRule", "citations"];
const SCORE_KEYS = ["impact", "aim", "entry", "utility", "econ"];
const SCORE_VALUES = ["high", "average", "low", "unavailable"];

function asText(report) {
  const chunks = [
    report.verdict,
    report.focusRule,
    ...(report.strengths || []),
    ...(report.weaknesses || []),
    ...((report.drills || []).flatMap((drill) => [drill.name, drill.setup, drill.success])),
    ...(report.citations || [])
  ];
  return chunks.filter(Boolean).join(" ").toLowerCase();
}

function extractNumbers(text) {
  const matches = String(text).match(/\d+(?:\.\d+)?/g) || [];
  return matches.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function allowedNumbers(matchCard, scorecard) {
  const values = new Set();
  const visit = (item) => {
    if (typeof item === "number" && Number.isFinite(item)) values.add(item);
    if (typeof item === "string" && /^\d+(?:\.\d+)?$/.test(item)) values.add(Number(item));
    if (item && typeof item === "object") {
      for (const value of Object.values(item)) visit(value);
    }
  };
  visit(matchCard || {});
  visit(scorecard || {});
  [0, 1, 2, 3, 5, 8, 10, 12, 15, 20, 24].forEach((value) => values.add(value));
  return values;
}

function numberAllowed(value, allowed) {
  if (allowed.has(value)) return true;
  for (const item of allowed) {
    if (Math.abs(item - value) < 0.05) return true;
  }
  return false;
}

function validateBrainReport(report, context = {}) {
  const errors = [];
  if (!report || typeof report !== "object") {
    return { ok: false, errors: ["report missing"] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (report[field] == null) errors.push(`missing ${field}`);
  }

  if (report.scorecard) {
    for (const key of SCORE_KEYS) {
      if (!SCORE_VALUES.includes(report.scorecard[key])) {
        errors.push(`bad scorecard.${key}`);
      }
    }
    if (context.scorecard) {
      for (const key of SCORE_KEYS) {
        if (context.scorecard[key] && report.scorecard[key] !== context.scorecard[key]) {
          errors.push(`scorecard.${key} does not match Lite`);
        }
      }
    }
  }

  if (!Array.isArray(report.drills) || report.drills.length !== 3) {
    errors.push("drills must be exactly 3");
  }

  const curriculum = context.curriculum;
  const text = asText(report);
  if (curriculum && curriculum.primaryMission) {
    const title = String(curriculum.primaryMission.title || "").toLowerCase();
    const slug = String(curriculum.primaryMission.slug || "").replace(/_/g, " ");
    const focus = String(report.focusRule || "").toLowerCase();
    if (curriculum.primaryMission.slug !== "observe") {
      if (!focus.includes(slug) && !focus.includes(title.toLowerCase()) && !text.includes(title)) {
        errors.push("focusRule does not keep the curriculum mission");
      }
    }
  }

  const allowed = allowedNumbers(context.matchCard, context.scorecard);
  const proseNumbers = extractNumbers(`${report.verdict} ${(report.weaknesses || []).join(" ")} ${(report.citations || []).join(" ")}`);
  for (const value of proseNumbers) {
    if (value >= 50 && !numberAllowed(value, allowed)) {
      errors.push(`invented number ${value}`);
    }
  }

  const packs = loadAllPacks();
  for (const phrase of packs.meta.doNotSay || []) {
    if (text.includes(String(phrase).toLowerCase())) {
      errors.push(`forbidden meta phrase: ${phrase}`);
    }
  }

  if (/\balways\b|\bnever\b/.test(text)) {
    const ledger = context.ledger || {};
    const slug = curriculum && curriculum.primaryMission ? curriculum.primaryMission.slug : null;
    const seen = slug && ledger[slug] ? Number(ledger[slug].timesSeen) : 0;
    if (seen < 3) errors.push("always/never used without a repeating leak");
  }

  return { ok: errors.length === 0, errors };
}

function repairOrFallback(report, context, liteReport) {
  const first = validateBrainReport(report, context);
  if (first.ok) return { report, source: "model", errors: [] };

  const stripped = { ...report };
  if (first.errors.includes("always/never used without a repeating leak")) {
    stripped.verdict = String(stripped.verdict || "").replace(/\b(always|never)\b/gi, "often");
    stripped.weaknesses = (stripped.weaknesses || []).map((line) => line.replace(/\b(always|never)\b/gi, "often"));
  }
  const second = validateBrainReport(stripped, context);
  if (second.ok) return { report: stripped, source: "repaired", errors: first.errors };

  if (liteReport) {
    const mission = context.curriculum && context.curriculum.primaryMission;
    const fallback = {
      ...liteReport,
      focusRule: mission && mission.title ? mission.title : liteReport.focusRule
    };
    return { report: fallback, source: "lite-fallback", errors: first.errors.concat(second.errors) };
  }

  return { report: null, source: "rejected", errors: first.errors.concat(second.errors) };
}

module.exports = {
  validateBrainReport,
  repairOrFallback
};
