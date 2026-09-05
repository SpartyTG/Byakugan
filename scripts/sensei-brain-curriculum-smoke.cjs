"use strict";

const { decideCurriculum } = require("../src/main/sensei-brain/curriculum.cjs");
const { MISSION_STATUS } = require("../src/main/sensei-brain/types.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fixtureA = decideCurriculum({
  accountId: "p1",
  rankBand: "gold-plat",
  thisMatch: {
    matchId: "only-one",
    leakSlugs: ["first_death_attack"],
    firstDeaths: 1,
    praise: ["Eco was clean."]
  },
  lastMatches: [],
  openMission: null
});

assert(fixtureA.confidence === "low", "A should be low confidence");
assert(fixtureA.keptOpenMission === false, "A should not keep a mission");
assert(fixtureA.primaryMission.slug === "first_death_attack" || fixtureA.primaryMission.slug === "observe", "A should stay conservative");
console.log("A PASS", fixtureA.confidence, fixtureA.primaryMission.slug);

const history = ["m1", "m2", "m3", "m4"].map((matchId) => ({
  matchId,
  leakSlugs: ["first_death_attack"]
}));

const fixtureB = decideCurriculum({
  accountId: "p1",
  rankBand: "iron-silver",
  thisMatch: {
    matchId: "m5",
    leakSlugs: ["first_death_attack", "rifle_hs_below_band"],
    firstDeaths: 4,
    catastrophic: true
  },
  lastMatches: history,
  openMission: null
});

assert(fixtureB.primaryMission.slug === "first_death_attack", "B should lock first_death_attack");
assert(fixtureB.confidence === "high", "B should be high confidence");
assert(fixtureB.keptOpenMission === false, "B creates the mission");
assert(fixtureB.secondaryWatch && fixtureB.secondaryWatch.slug === "rifle_hs_below_band", "B watches HS as secondary");
console.log("B PASS", fixtureB.primaryMission.title);

const fixtureC = decideCurriculum({
  accountId: "p1",
  rankBand: "gold-plat",
  thisMatch: {
    matchId: "m6",
    leakSlugs: ["wrong_force_buy"],
    praise: ["Entry was cleaner."]
  },
  lastMatches: history,
  openMission: {
    id: "keep-me",
    accountId: "p1",
    slug: "first_death_attack",
    title: "Stop dying first on attack",
    status: MISSION_STATUS.PENDING
  }
});

assert(fixtureC.keptOpenMission === true, "C must keep the open mission");
assert(fixtureC.primaryMission.slug === "first_death_attack", "C must not switch identity");
assert(fixtureC.primaryMission.id === "keep-me", "C keeps the same mission id");
console.log("C PASS", fixtureC.verdictOneLiner);

console.log("CURRICULUM SMOKE PASS");
