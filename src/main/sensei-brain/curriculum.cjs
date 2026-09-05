"use strict";

const { getLeak } = require("./packs/loader.cjs");
const { MISSION_STATUS } = require("./types.cjs");

const REPEAT_THRESHOLD = 2;
const LAST_N = 8;

function wordingFor(leak, rankBand) {
  if (rankBand === "immortal-radiant" || rankBand === "diamond-asc") {
    return leak.immortalWording;
  }
  return leak.silverWording;
}

function countLeak(matches, slug) {
  return matches.filter((row) => Array.isArray(row.leakSlugs) && row.leakSlugs.includes(slug)).length;
}

function isCatastrophic(thisMatch, slug) {
  if (!thisMatch || !Array.isArray(thisMatch.leakSlugs) || !thisMatch.leakSlugs.includes(slug)) {
    return false;
  }
  if (slug === "first_death_attack" && Number(thisMatch.firstDeaths) >= 3) return true;
  if (thisMatch.catastrophic === true) return true;
  return false;
}

function scoreLeak(slug, thisMatch, lastMatches) {
  const recent = countLeak(lastMatches, slug);
  const here = thisMatch && Array.isArray(thisMatch.leakSlugs) && thisMatch.leakSlugs.includes(slug) ? 1 : 0;
  const catastrophic = isCatastrophic(thisMatch, slug) ? 3 : 0;
  return {
    slug,
    recent,
    here,
    score: recent + here + catastrophic,
    qualifies: recent + here >= REPEAT_THRESHOLD || isCatastrophic(thisMatch, slug)
  };
}

function missionFromLeak(accountId, leak, rankBand, why, matchId) {
  return {
    id: `${leak.slug}-${matchId || "current"}`,
    accountId,
    slug: leak.slug,
    title: leak.title,
    why,
    drillName: leak.drillName,
    drillSetup: leak.drillSetup,
    successMetric: leak.successMetric,
    status: MISSION_STATUS.PENDING,
    assignedAfterMatchId: matchId || null,
    windowMatches: 5,
    wording: wordingFor(leak, rankBand)
  };
}

function decideCurriculum(input) {
  const accountId = String(input.accountId || "default");
  const rankBand = input.rankBand || "gold-plat";
  const thisMatch = input.thisMatch || { leakSlugs: [] };
  const lastMatches = Array.isArray(input.lastMatches) ? input.lastMatches.slice(-LAST_N) : [];
  const openMission = input.openMission || null;
  const praise = Array.isArray(thisMatch.praise) ? thisMatch.praise.slice(0, 3) : [];

  const slugs = new Set();
  for (const row of lastMatches) {
    for (const slug of row.leakSlugs || []) slugs.add(slug);
  }
  for (const slug of thisMatch.leakSlugs || []) slugs.add(slug);
  if (openMission && openMission.slug) slugs.add(openMission.slug);

  const scored = [...slugs].map((slug) => scoreLeak(slug, thisMatch, lastMatches));
  scored.sort((a, b) => b.score - a.score);

  const openStillTrue = Boolean(
    openMission &&
    openMission.status === MISSION_STATUS.PENDING &&
    scored.some((row) => row.slug === openMission.slug && (row.here === 1 || row.recent >= 1))
  );

  if (openStillTrue) {
    const leak = getLeak(openMission.slug);
    return {
      verdictOneLiner: `Mission stays: ${openMission.title}.`,
      primaryMission: {
        ...openMission,
        wording: wordingFor(leak, rankBand)
      },
      secondaryWatch: scored.find((row) => row.slug !== openMission.slug && row.score > 0)
        ? {
            slug: scored.find((row) => row.slug !== openMission.slug && row.score > 0).slug,
            title: getLeak(scored.find((row) => row.slug !== openMission.slug && row.score > 0).slug).title
          }
        : null,
      praise,
      doNotWorkOn: ["new agent", "crosshair color"],
      confidence: "high",
      keptOpenMission: true
    };
  }

  const primary = scored.find((row) => row.qualifies) || scored.find((row) => row.here === 1) || null;
  if (!primary) {
    return {
      verdictOneLiner: "No repeating leak yet. Keep the film simple and play your normal game.",
      primaryMission: {
        id: `observe-${thisMatch.matchId || "current"}`,
        accountId,
        slug: "observe",
        title: "Collect a baseline",
        why: "One match is not a habit.",
        drillName: "Play 3 more ranked games",
        drillSetup: "Do not change your agent or settings. Let Sensei see a pattern.",
        successMetric: "Three more matches logged.",
        status: MISSION_STATUS.PENDING,
        assignedAfterMatchId: thisMatch.matchId || null,
        windowMatches: 3,
        wording: "One match is data. It is not your identity yet."
      },
      secondaryWatch: null,
      praise,
      doNotWorkOn: ["new agent", "overhauling aim routine"],
      confidence: "low",
      keptOpenMission: false
    };
  }

  const leak = getLeak(primary.slug);
  const why = primary.qualifies
    ? `${leak.title} showed up in ${primary.recent + primary.here} of the last ${Math.max(lastMatches.length, 1)} lookbacks.`
    : `${leak.title} showed up in this match only. Treating it as a short watch, not an identity.`;

  const secondary = scored.find((row) => row.slug !== primary.slug && row.score > 0);

  return {
    verdictOneLiner: wordingFor(leak, rankBand),
    primaryMission: missionFromLeak(accountId, leak, rankBand, why, thisMatch.matchId),
    secondaryWatch: secondary ? { slug: secondary.slug, title: getLeak(secondary.slug).title } : null,
    praise,
    doNotWorkOn: ["new agent", "crosshair color"],
    confidence: primary.qualifies ? "high" : "low",
    keptOpenMission: false
  };
}

module.exports = {
  REPEAT_THRESHOLD,
  decideCurriculum,
  scoreLeak
};
