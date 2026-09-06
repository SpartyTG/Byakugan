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

function drillMode(drill) {
  const text = `${drill && drill.name || ""} ${drill && drill.setup || ""}`.toLowerCase();
  if (/\b(range|bots?)\b/.test(text)) return "range";
  if (/\b(deathmatch|dm)\b/.test(text)) return "deathmatch";
  if (/\bcustom(?: game)?\b/.test(text)) return "custom";
  return "";
}

function missionDrill(mission) {
  const rangeMission = mission.slug === "rifle_hs_below_band";
  return {
    name: String(mission.drillName || mission.title || "Primary mission"),
    setup: `${rangeMission ? "Range" : "Custom game"}: ${mission.drillSetup || mission.wording || mission.title}`,
    success: String(mission.successMetric || "Complete the mission block before the next review.")
  };
}

function missionFocusRule(mission) {
  if (!mission) return "";
  if (mission.slug === "observe") return "Play your normal game and collect three more ranked matches before changing your routine.";
  return String(mission.title || mission.wording || "Keep the selected mission").replace(/[.!?]+$/, "");
}

function normalizeMissionReport(report, context = {}) {
  const mission = context.curriculum && context.curriculum.primaryMission;
  if (!report || !mission) return report;
  const next = {
    ...report,
    scorecard: context.scorecard ? { ...context.scorecard } : report.scorecard,
    focusRule: missionFocusRule(mission)
  };
  if (mission.slug === "observe") return next;

  const primary = missionDrill(mission);
  const primaryMode = drillMode(primary);
  const candidates = [
    ...(Array.isArray(report.drills) ? report.drills : []),
    ...(Array.isArray(context.supportReport?.drills) ? context.supportReport.drills : [])
  ];
  const selected = [primary];
  for (const mode of ["range", "custom", "deathmatch"].filter((value) => value !== primaryMode)) {
    const candidate = candidates.find((drill) => drillMode(drill) === mode
      && !selected.some((chosen) => String(chosen.name || "").trim().toLowerCase() === String(drill?.name || "").trim().toLowerCase()));
    if (candidate) selected.push(candidate);
  }
  next.drills = selected.length === 3 ? selected : report.drills;
  return next;
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
      if (!focus.includes(slug) && !focus.includes(title.toLowerCase())) {
        errors.push("focusRule does not keep the curriculum mission");
      }
      const firstDrill = report.drills && report.drills[0];
      const requiredName = String(curriculum.primaryMission.drillName || "").trim().toLowerCase();
      if (!firstDrill || (requiredName && String(firstDrill.name || "").trim().toLowerCase() !== requiredName)) {
        errors.push("first drill does not train the curriculum mission");
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
  const prepared = normalizeMissionReport(report, context);
  const first = validateBrainReport(prepared, context);
  if (first.ok) return { report: prepared, source: prepared === report ? "model" : "repaired", errors: [] };

  const stripped = { ...prepared };
  if (first.errors.includes("always/never used without a repeating leak")) {
    stripped.verdict = String(stripped.verdict || "").replace(/\b(always|never)\b/gi, "often");
    stripped.weaknesses = (stripped.weaknesses || []).map((line) => line.replace(/\b(always|never)\b/gi, "often"));
  }
  const second = validateBrainReport(stripped, context);
  if (second.ok) return { report: stripped, source: "repaired", errors: first.errors };

  if (liteReport) {
    const mission = context.curriculum && context.curriculum.primaryMission;
    const fallback = normalizeMissionReport({
      ...liteReport,
      focusRule: mission && mission.title ? mission.title : liteReport.focusRule
    }, { ...context, supportReport: liteReport });
    return { report: fallback, source: "lite-fallback", errors: first.errors.concat(second.errors) };
  }

  return { report: null, source: "rejected", errors: first.errors.concat(second.errors) };
}

module.exports = {
  drillMode,
  missionFocusRule,
  normalizeMissionReport,
  validateBrainReport,
  repairOrFallback
};
