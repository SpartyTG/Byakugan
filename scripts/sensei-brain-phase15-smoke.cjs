"use strict";

const { LEAK_SLUGS, isLeakSlug } = require("../src/main/sensei-brain/types.cjs");
const { getLeak } = require("../src/main/sensei-brain/packs/loader.cjs");
const { leaksFromVod } = require("../src/main/sensei-brain/hook.cjs");

const extra = ["dry_peek_repeat", "lurk_too_long", "retake_no_info", "operator_overpeek"];
for (const slug of extra) {
  if (!isLeakSlug(slug)) throw new Error("types missing " + slug);
  const leak = getLeak(slug);
  if (!leak.title || !leak.drillName) throw new Error("catalog incomplete " + slug);
}

const slugs = leaksFromVod({
  findings: [
    { outcome: "negative", observation: "Re-peeked the same angle dry after getting tagged." },
    { outcome: "negative", observation: "Still lurking when the site fight started." }
  ]
});
if (!slugs.includes("dry_peek_repeat") || !slugs.includes("lurk_too_long")) {
  throw new Error("VOD did not map new leaks: " + slugs.join(","));
}

console.log("CATALOG", LEAK_SLUGS.length, "slugs");
console.log("VOD MAP", slugs.join(","));
console.log("PHASE15 SMOKE PASS");
