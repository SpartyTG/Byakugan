"use strict";

const fs = require("fs");
const path = require("path");

const PACK_DIR = __dirname;

const REQUIRED = Object.freeze({
  doctrine: "doctrine.core.v1.json",
  ranks: "ranks.calibration.v1.json",
  meta: "meta.current.json",
  leaks: "leaks.catalog.v1.json"
});

function loadPackFile(fileName) {
  const filePath = path.join(PACK_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sensei pack missing: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Sensei pack invalid JSON: ${filePath}`);
  }
  return parsed;
}

function loadAllPacks() {
  return {
    doctrine: loadPackFile(REQUIRED.doctrine),
    ranks: loadPackFile(REQUIRED.ranks),
    meta: loadPackFile(REQUIRED.meta),
    leaks: loadPackFile(REQUIRED.leaks)
  };
}

function getLeak(slug) {
  const catalog = loadPackFile(REQUIRED.leaks);
  const leak = catalog.leaks && catalog.leaks[slug];
  if (!leak) {
    throw new Error(`Sensei leak not in catalog: ${slug}`);
  }
  return leak;
}

module.exports = {
  PACK_DIR,
  REQUIRED,
  loadPackFile,
  loadAllPacks,
  getLeak
};
