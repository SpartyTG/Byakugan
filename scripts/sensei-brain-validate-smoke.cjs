"use strict";

const { decideCurriculum } = require("../src/main/sensei-brain/curriculum.cjs");
const { validateBrainReport, repairOrFallback } = require("../src/main/sensei-brain/validate.cjs");

const matchCard = { matchId: "m5", acs: 165, kd: 0.7, firstDeaths: 4, hsPercent: 18 };
const scorecard = { impact: "low", aim: "low", entry: "low", utility: "average", econ: "high" };
const curriculum = decideCurriculum({
  accountId: "p1",
  rankBand: "gold-plat",
  thisMatch: { matchId: "m5", leakSlugs: ["first_death_attack"], firstDeaths: 4, catastrophic: true },
  lastMatches: [
    { matchId: "m1", leakSlugs: ["first_death_attack"] },
    { matchId: "m2", leakSlugs: ["first_death_attack"] }
  ]
});

const good = {
  verdict: "ACS 165 and 4 first deaths on attack. The mission is stop dying first on attack.",
  scorecard,
  strengths: ["Econ stayed high."],
  weaknesses: ["4 first deaths with ACS 165."],
  drills: [
    { name: "Second contact rule", setup: "Wait for a teammate.", success: "Fewer first deaths." },
    { name: "Range peek timing", setup: "10 slow peeks.", success: "Crosshair ready before swing." },
    { name: "Deathmatch second contact", setup: "Do not wide swing first.", success: "Die first less often." }
  ],
  focusRule: "Stop dying first on attack.",
  citations: ["ACS 165", "first deaths 4"]
};

const goodResult = validateBrainReport(good, { matchCard, scorecard, curriculum });
if (!goodResult.ok) throw new Error(`good report failed: ${goodResult.errors.join(", ")}`);
console.log("GOOD PASS");

const lie = {
  ...good,
  verdict: "Your ACS was 400 and you stomped the lobby.",
  weaknesses: ["ACS 400 is a problem."]
};
const lieResult = validateBrainReport(lie, { matchCard, scorecard, curriculum });
if (lieResult.ok || !lieResult.errors.some((error) => error.includes("400"))) {
  throw new Error("ACS lie must be rejected");
}
console.log("LIE REJECT PASS", lieResult.errors.join(" | "));

const flipped = {
  ...good,
  scorecard: { ...scorecard, entry: "high" }
};
const flippedResult = validateBrainReport(flipped, { matchCard, scorecard, curriculum });
if (flippedResult.ok) throw new Error("flipped Lite scorecard must fail");
console.log("SCORECARD GUARD PASS");

const liteFallback = {
  verdict: "Lite fallback.",
  scorecard,
  strengths: ["Econ high."],
  weaknesses: ["4 first deaths."],
  drills: good.drills,
  focusRule: "Old generic rule.",
  citations: ["first deaths 4"]
};
const repaired = repairOrFallback(lie, { matchCard, scorecard, curriculum }, liteFallback);
if (repaired.source !== "lite-fallback") throw new Error(`expected lite-fallback, got ${repaired.source}`);
if (repaired.report.focusRule !== curriculum.primaryMission.title) {
  throw new Error("fallback must keep the mission title");
}
console.log("FALLBACK PASS", repaired.source);

console.log("VALIDATE SMOKE PASS");
