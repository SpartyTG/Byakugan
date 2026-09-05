"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { SenseiBrainStore } = require("../src/main/sensei-brain/store.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sensei-brain-"));
const store = new SenseiBrainStore(dir);
const accountId = "smoke-player";

store.upsertProfile(accountId, { currentRank: "Gold 2", rankBand: "gold-plat" });
store.insertMatchMemory(accountId, {
  matchId: "m1",
  map: "Ascent",
  agent: "Jett",
  result: "loss",
  leakSlugs: ["first_death_attack"]
});
store.touchLeak(accountId, "first_death_attack", 2, "m1");
store.insertMatchMemory(accountId, {
  matchId: "m2",
  map: "Bind",
  agent: "Jett",
  result: "loss",
  leakSlugs: ["first_death_attack"]
});
store.touchLeak(accountId, "first_death_attack", 3, "m2");
store.insertMatchMemory(accountId, {
  matchId: "m3",
  map: "Haven",
  agent: "Jett",
  result: "win",
  leakSlugs: ["first_death_attack"]
});
store.touchLeak(accountId, "first_death_attack", 2, "m3");
store.setMission(accountId, {
  id: "mission-1",
  slug: "first_death_attack",
  title: "Stop dying first on attack",
  why: "Showed up in 3 matches",
  drillName: "Second contact",
  drillSetup: "Do not take the first peek unless a teammate swings with you.",
  successMetric: "First death on attack in under 20% of attack rounds over the next 8.",
  windowMatches: 5
});

const ledger = store.getLedger(accountId);
const matches = store.getLastMatches(accountId, 8);
const mission = store.getOpenMission(accountId);
const leak = ledger.first_death_attack;

console.log("matches:", matches.length);
console.log("timesSeen:", leak && leak.timesSeen);
console.log("openMission:", mission && mission.title);
console.log("file:", store.filePath);

if (matches.length !== 3) {
  throw new Error("expected 3 matches");
}
if (!leak || leak.timesSeen !== 3) {
  throw new Error("expected first_death_attack timesSeen === 3");
}
if (!mission || mission.slug !== "first_death_attack") {
  throw new Error("expected open first_death_attack mission");
}

console.log("SMOKE PASS");