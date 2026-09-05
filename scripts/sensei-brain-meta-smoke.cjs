"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadAllPacks } = require("../src/main/sensei-brain/packs/loader.cjs");

const packs = loadAllPacks();
const meta = packs.meta;
if (!meta || !meta.gamePatch) throw new Error("meta.current.json missing gamePatch");
if (!Array.isArray(meta.changelogForCoach) || meta.changelogForCoach.length < 1) {
  throw new Error("changelogForCoach must have at least one line");
}
if (!Array.isArray(meta.doNotSay)) throw new Error("doNotSay must be an array");

const archive = path.join(__dirname, "..", "src", "main", "sensei-brain", "packs", "meta.v26-act4-13.05.json");
if (!fs.existsSync(archive)) throw new Error("archive copy missing");

console.log("META", meta.packId, meta.gamePatch, meta.act);
console.log("NOTES", meta.changelogForCoach.length);
console.log("META SMOKE PASS");
