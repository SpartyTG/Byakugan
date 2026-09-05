"use strict";

const { decideCurriculum } = require("../src/main/sensei-brain/curriculum.cjs");
const { assemblePrompt } = require("../src/main/sensei-brain/assemble-prompt.cjs");

const lastMatches = ["m1", "m2", "m3", "m4"].map((matchId) => ({
  matchId,
  map: "Ascent",
  agent: "Jett",
  result: "loss",
  leakSlugs: ["first_death_attack"]
}));

const curriculum = decideCurriculum({
  accountId: "p1",
  rankBand: "gold-plat",
  thisMatch: {
    matchId: "m5",
    map: "Ascent",
    agent: "Jett",
    leakSlugs: ["first_death_attack"],
    firstDeaths: 4,
    catastrophic: true,
    praise: ["Eco was clean."]
  },
  lastMatches,
  openMission: null
});

const assembled = assemblePrompt({
  rankBand: "gold-plat",
  thisMatch: { map: "Ascent", agent: "Jett" },
  matchCard: { matchId: "m5", acs: 165, kd: 0.7, firstDeaths: 4, hsPercent: 18 },
  scorecard: { impact: "low", aim: "low", entry: "low", utility: "average", econ: "high" },
  lastMatches,
  ledger: { first_death_attack: { slug: "first_death_attack", timesSeen: 5, status: "active" } },
  openMission: null,
  curriculum
});

if (!assembled.prompt.includes("first_death_attack")) {
  throw new Error("prompt missing mission slug");
}
if (!assembled.prompt.includes("13.05")) {
  throw new Error("prompt missing meta patch");
}
if (!assembled.prompt.includes("\"acs\":165")) {
  throw new Error("prompt missing match ACS");
}
if (assembled.prompt.includes("rifle_hs_below_band") && assembled.prompt.includes(JSON.stringify(require("../src/main/sensei-brain/packs/leaks.catalog.v1.json")))) {
  throw new Error("prompt dumped entire catalog");
}

console.log("mission:", curriculum.primaryMission.slug);
console.log("pack:", assembled.packs.metaPackId);
console.log("promptChars:", assembled.prompt.length);
console.log("PROMPT SMOKE PASS");
