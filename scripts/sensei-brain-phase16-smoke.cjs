"use strict";

const { buildLiteAsk, buildFullAskPrompt } = require("../src/main/sensei-brain/ask-prompt.cjs");

const lite = buildLiteAsk({
  mission: { title: "Stop dying first on attack" },
  report: { citations: ["2 FD", "8.5% HS"], focusRule: "x" }
});
if (!lite.includes("Stop dying first on attack") || !lite.includes("2 FD")) {
  throw new Error("lite ask missing mission or evidence");
}

const full = buildFullAskPrompt({
  question: "what should I do next game?",
  mission: { title: "Get rifle shots back to head height" },
  match: { map: "Lotus" },
  report: { focusRule: "head height" }
});
if (!full.includes("4 to 8 short sentences") || !full.includes("Get rifle shots back to head height")) {
  throw new Error("full ask prompt missing coach rules");
}

console.log("LITE", lite);
console.log("PHASE16 SMOKE PASS");
