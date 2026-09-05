"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SenseiBrainStore } = require("../src/main/sensei-brain/store.cjs");
const { decideCurriculum } = require("../src/main/sensei-brain/curriculum.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sensei-phase13-"));
const store = new SenseiBrainStore(dir);
const accountId = "test#000";

store.setMission(accountId, {
  slug: "first_death_attack",
  title: "Stop dying first on attack",
  status: "pending"
});
store.closeMission(accountId, "wrong");
const blocked = store.getBlockedSlugs(accountId);
if (!blocked.includes("first_death_attack")) throw new Error("wrong mission was not blocked");
if (store.getOpenMission(accountId)) throw new Error("closed mission must not stay open");

const decided = decideCurriculum({
  accountId,
  rankBand: "gold-plat",
  thisMatch: { matchId: "m2", leakSlugs: ["first_death_attack"], firstDeaths: 2 },
  lastMatches: [],
  openMission: store.getOpenMission(accountId),
  blockedSlugs: blocked
});
if (decided.primaryMission && decided.primaryMission.slug === "first_death_attack") {
  throw new Error("blocked leak was assigned again");
}

console.log("A PASS blocked after wrong");
console.log("B PASS next mission", decided.primaryMission && decided.primaryMission.slug);
console.log("PHASE13 SMOKE PASS");
