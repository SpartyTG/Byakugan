"use strict";

function buildLiteAsk({ mission, report }) {
  const title = mission && mission.title ? mission.title : (report && report.focusRule) || "the current lesson";
  const evidence = Array.isArray(report && report.citations) ? report.citations.filter(Boolean).slice(0, 3).join("; ") : "";
  return evidence
    ? `Stay on this mission: ${title}. Evidence from this match: ${evidence}.`
    : `Stay on this mission: ${title}.`;
}

function buildFullAskPrompt({ question, report, match, mission }) {
  return [
    "You are this player's local VALORANT coach.",
    "Answer in 4 to 8 short sentences.",
    "Talk like a coach who already watched this match and already assigned one mission.",
    "Restate the open mission in plain words.",
    "Give exactly one next-game action that supports that mission.",
    "Use only the saved report, match card, and open mission.",
    "Do not invent stats, rounds, or utility that are not in the report.",
    "Do not assign a new primary lesson unless the player says the current mission is wrong.",
    "If the report cannot answer the question, say you cannot see that.",
    "Reply in plain English sentences only. Never return JSON, keys, braces, or code fences.",
    "",
    "OPEN MISSION:",
    JSON.stringify(mission || null),
    "MATCH:",
    JSON.stringify(match || null),
    "REPORT:",
    JSON.stringify(report || null),
    "QUESTION:",
    String(question || "")
  ].join("\n");
}



function formatAskResponse(raw, mission) {
  const text = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const title = parsed.mission || parsed.title || (mission && mission.title) || "";
      const action = parsed.action || parsed.drill || parsed.next || "";
      const why = parsed.why || parsed.reason || "";
      return [title ? `Stay on this mission: ${title}.` : "", why, action].filter(Boolean).join(" ").trim();
    }
  } catch {}
  return text;
}

module.exports = { buildLiteAsk, buildFullAskPrompt, formatAskResponse };

