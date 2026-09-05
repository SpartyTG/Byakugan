"use strict";

const { leaksFromVod } = require("../src/main/sensei-brain/hook.cjs");

const a = leaksFromVod({
  findings: [
    { outcome: "negative", observation: "Died first on A main with no flash." },
    { outcome: "positive", observation: "Good trade after plant." }
  ]
});
if (!a.includes("first_death_attack") || !a.includes("util_unused_on_death")) {
  throw new Error("expected first death and unused util from VOD text");
}

const b = leaksFromVod({ findings: [{ outcome: "positive", observation: "Died first on A main with no flash." }] });
if (b.length) throw new Error("positive findings must not create leaks");

console.log("VOD A PASS", a.join(","));
console.log("VOD B PASS ignored positive");
console.log("VOD SMOKE PASS");
