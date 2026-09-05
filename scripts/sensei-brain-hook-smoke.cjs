"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { SenseiBrainStore } = require("../src/main/sensei-brain/store.cjs");
const { applySenseiBrain } = require("../src/main/sensei-brain/hook.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sensei-brain-hook-"));
const store = new SenseiBrainStore(dir);
const accountId = "Smoke#NA1";

function match(id, openingDeaths) {
  return {
    id,
    map: "Ascent",
    agent: "Jett",
    result: "DEFEAT",
    rankName: "Gold 2",
    report: { openingKills: 1, openingDeaths }
  };
}

const report = {
  scorecard: { impact: "low", aim: "average", entry: "low", utility: "average", econ: "high" },
  strengths: ["Econ stayed high."]
};

applySenseiBrain({ store, accountId, match: match("m1", 4), report, rankName: "Gold 2" });
applySenseiBrain({ store, accountId, match: match("m2", 3), report, rankName: "Gold 2" });
const second = applySenseiBrain({ store, accountId, match: match("m3", 2), report, rankName: "Gold 2" });

const ledger = store.getLedger(accountId);
if (!ledger.first_death_attack || ledger.first_death_attack.timesSeen !== 3) {
  throw new Error("expected first_death_attack timesSeen 3");
}
if (!second.curriculum || second.curriculum.primaryMission.slug !== "first_death_attack") {
  throw new Error("expected locked first_death_attack mission");
}
if (!store.getOpenMission(accountId)) {
  throw new Error("expected open mission after three matches");
}

console.log("timesSeen:", ledger.first_death_attack.timesSeen);
console.log("mission:", second.curriculum.primaryMission.title);
console.log("kept:", second.curriculum.keptOpenMission);
console.log("HOOK SMOKE PASS");
