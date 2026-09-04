# BYAKUGAN Source Handoff

This package is the canonical source for `v0.8.0-beta.108`.

## Verified baseline

- Previous canonical version: `v0.8.0-beta.107`
- Automated tests: `162 passed, 0 failed`
- Syntax validation: passed
- Repository: `https://github.com/SpartyTG/Byakugan`

## Latest completed change

Beta.108 fixes the remaining local-model fallback exposed by the first
beta.107 test. The metric guard correctly rejected Qwen's contradictory report,
but its generic repair prompt contained only the rejected candidate and schema,
so the second attempt still could not reliably reconstruct a grounded report.
The repair retry now receives the authoritative match card, required scorecard,
metric bands, recent baselines, grounding rules, and safe drill patterns. A
regression test rejects the original 1.62 K/D reversal, repairs it on the second
model response, and preserves the **Full Sensei** tier. If both attempts still
fail, the fallback banner now includes the last concise validation reason.

## Previous completed changes

Beta.107 prevents Full Sensei from reversing strong supplied statistics into
negative coaching. Scorecard ratings are now computed by BYAKUGAN's
deterministic metric rubric rather than delegated to the language model. A
1.20+ K/D, 240+ ACS, 25%+ headshot percentage, and positive opening-duel
differential are high signals; ADR above 120 through 159.9 is not low. Aggregate
assists and death totals do not establish utility timing, positioning,
survival quality, or economy decisions, so utility and econ remain average
without direct evidence.

The grounded-report validator rejects verdicts and weaknesses that call
average/high K/D, ACS, ADR, or headshot figures low, poor, weak, or inaccurate.
It specifically covers the observed 21/13 Omen report with 1.62 K/D, 269 ACS,
157.7 ADR, 28.8% headshots, and a 3-1 opening-duel record. The corrected
scorecard is high impact, high aim, high entry, average utility, and average
econ. Reports that still contradict the rubric are automatically repaired; if
repair fails, BYAKUGAN uses its clearly labeled grounded Lite report.

Drill validation also rejects the observed extreme 80-90% outcome targets and
100-round timers. Full Sensei is instructed to use short practice blocks and
countable repetitions instead of invented high-pressure simulations.

Beta.106 adds two relationship signals to Live Match. Confirmed queued groups
receive matching color-coded labels such as **YOUR PARTY · DUO**,
**PARTY A · TRIO**, and **PARTY B · DUO**. Solo players and players for whom
Riot does not provide a party identifier remain unmarked rather than being
guessed. Riot's raw party identifiers are reduced to temporary display groups
inside the backend and never reach the renderer. Pregame opponents remain
fully concealed, so enemy party groups can appear only after the active core
game begins and only when Riot includes that relationship in the live roster.

The local Riot block list is also loaded with the social roster. Any live
player whose PUUID appears on that list receives a red **BLOCKED** badge. The
relationship marker does not override name privacy: a blocked incognito player
remains agent-only, and BYAKUGAN never substitutes the stored block-list name.

Beta.105 corrects the hidden-allied identity presentation exposed by the first
real beta.104 Agent Select test and confirmed again after the core game began.
The full five-player allied roster, ranks, peaks, levels, and enemy concealment
worked, but random teammates using hidden names produced a blank primary label
because agent-only rendering was restricted to hidden enemies. Agent-only
rendering now applies to every genuinely hidden identity: locked allies show
their agent as the primary label, while unlocked hidden allies show
**Selecting…**. Party members and Riot friends remain named, public players
remain named, and the active enemy privacy boundary is unchanged.

Beta.104 makes Agent Select show the complete allied roster, including random
teammates outside the user's party. Riot supplies that roster through
`AllyTeam.Players`, whose entries commonly omit `TeamID`; the previous generic
pregame filter could not prove those entries were allies and retained only the
signed-in player and known party members. The source collection is now marked
as explicitly ally-scoped before filtering, while `EnemyTeam` is never merged
and every opponent remains concealed until the active core game begins.

Public teammate Riot IDs display when Riot returns them. Hidden or unresolved
identities display the agent only, and a hovered or selected character remains
**Selecting…** until `CharacterSelectionState` is actually locked. Pregame
allies receive available current rank, all-time peak rank with Episode/Act, and
account-level enrichment. Visible allied profiles remain inspectable; hidden
identities do not become inspectable.

Beta.103 fixes two Live Match fallbacks found during a real Competitive test.
When Riot marks an identity as eligible but its name lookup returns no Riot ID,
the card now shows the locked agent with **RIOT NAME UNAVAILABLE** instead of the
generic **Riot Player** placeholder. A later successful lookup automatically
restores the public Riot ID. Genuinely incognito opponents remain agent-only and
retain the distinct **IDENTITY HIDDEN** label.

Party account levels resolved from the party or VALORANT presence payload are
now merged into the active core-game roster. Previously the live merge copied
only `BYAKUGANPartyMember`, discarded the already-resolved lobby level, and then
left the card on **LVL SYNCING** when the separate account-XP enrichment was
unavailable. Valid core-game levels still take precedence, while a hidden zero
cannot overwrite a real lobby-visible level.

Beta.102 replaces VOD Vision's prompt-only coaching safeguards with enforced
truthfulness validation after the completed 33:09 Adaptive test produced 39
largely unusable findings. The test repeatedly treated Buy Phase, round-end,
standing still, and spectating as coaching; described the locked Omen player as
switching to Reyna; invented an ordinary same-round respawn; assigned most of
the match to Round 1; emitted several contradictory cards at one timestamp; and
called one-off categories repeated patterns.

Every review window now classifies player perspective and match phase before a
finding can survive. The MATCH CARD agent is fixed for the full match. A changed
agent viewpoint becomes teammate spectating and returns no coaching. Standard
one-life queues reject an ordinary respawn unless the frames visibly establish
a Sage resurrection or the reviewed player is Clove using Not Dead Yet. Buy
Phase, menus, round-end screens, spectator views, uncertain perspectives,
setup-only footage, and inactivity are non-coachable.

The segment schema permits one candidate and requires a confirmed self actor,
separately visible decision and consequence, ordered-frame evidence, a specific
adjustment or repeatable strength, and average-or-high confidence. Code-level
filters reject the exact non-coaching phrases returned by the overnight test.
Overlapping windows use semantic near-duplicate removal. Repeated patterns need
at least two separated and meaningfully similar negative events. Round labels
require a directly visible number and are removed from the complete report if
chronology moves backward or one claimed round spans more than six minutes.
Limitations are restricted to real evidence constraints, and report metadata
discloses accepted candidates, rejected candidates, non-coachable windows, and
spectator windows. Older completed reports show a regeneration notice.

Adaptive checkpoint version 5 and Exhaustive checkpoint version 3 prevent old
findings from resuming into the new validation rules. Pause/resume, ETA,
navigation indicators, original-file retention, and separate mode checkpoints
remain intact.

Beta.101 added all-time peak rank plus Episode and Act to revealed Live Match
cards and completed Match History rosters while preserving pregame concealment,
Riot-hidden identities, and non-clickable live opponent profiles.

Beta.100 corrected the **Adaptive Quality Test** introduced in beta.99. It first scans the
entire recording at one low-resolution frame per second, selects representative
sustained-activity windows, supplements them with additional global activity
windows and periodic quiet-play audits, and then gives each selected 12-second
window a detailed 16-frame review with the configured vision model. This keeps
the full 12-second temporal context but returns each request to the image count
already proven stable by the Exhaustive pipeline. Increasing Ollama above 32k
context is not recommended because it increases VRAM use.
For a 33:12 recording, the deterministic planner selected about 71 detailed
windows instead of the old 498 model calls. Actual runtime and report quality
must be measured on the user's RX 6800 XT and `qwen3-vl:8b-instruct`.

The original exhaustive four-second/four-FPS pipeline remains selectable for a
quality comparison and can resume compatible beta.98 checkpoints. Adaptive and
Exhaustive have separate checkpoint versions; the UI warns before replacing an
incompatible checkpoint. Reports label the full-video scan separately from
deep-review coverage and disclose that events between selected windows may be
missed. Ollama models remain loaded for 30 minutes between requests.

## Preserved identity boundaries

- The user's **Use Generic Names** setting does not suppress public names in
  BYAKUGAN.
- Party members remain named and inspectable.
- Pregame opponents remain concealed.
- Public opponent names may appear only after the active core game begins.
- Riot-hidden opponents remain agent-only.
- Live opponent profiles remain non-clickable.
- Completed-match names follow Riot's Career-visible scoreboard lookup.

## Next verification

Install beta.108 on both PCs. First rerun Full Sensei on the same completed
Omen match that previously produced the 21/13 report. Confirm 1.62 K/D is not
called low or poor, 157.7 ADR is not called low, 28.8% headshots are not called
poor accuracy, and 3 first kills against 1 first death produce high entry. The
scorecard should read **HIGH impact**, **HIGH aim**, **HIGH entry**, **AVERAGE
utility**, and **AVERAGE econ**. Drills must not use 100-round timers or extreme
accuracy, kill-rate, or survival-rate targets.

Then queue with at least one friend and confirm every
member of the known party receives the same **YOUR PARTY** badge and correct
duo/trio/stack size while solo teammates remain unmarked. If Riot supplies
party identifiers for another allied or enemy premade, confirm its members
share a second matching label and color. Enemy grouping must remain completely
concealed until the active core game begins.

If a previously blocked account appears in the same active match, confirm that
card shows **BLOCKED**. A hidden blocked player must still show only their agent
and **IDENTITY HIDDEN**; the block-list name must never appear as a privacy
fallback.

During Agent Select, confirm the allied side shows
all five teammates rather than only known party members. A public random
teammate should show their Riot ID; a hidden or unresolved teammate should show
their locked agent; and every unlocked teammate should remain **Selecting…**.
Confirm current rank, peak rank, Episode/Act, and available account level load
for the allied cards. The enemy side must remain five concealed placeholders
with no names, agents, ranks, peaks, or levels until the active match begins.

After the core-game transition, hidden allies must continue to show their agent
as the primary identity instead of a blank line. In the first beta.104 live
test, enemy identities resolved correctly but all five enemy ranks initially
showed **UNRANKED / PEAK —**. Determine whether they populate within 30–60
seconds. If they remain unresolved, treat that as a separate opponent-rank
hydration issue rather than part of this label fix.

In Live Match, confirm the previously unresolved
Fade-style card shows its agent rather than **Riot Player**. If Riot returns the
public name later, confirm the card changes to that Riot ID. Hidden opponents
must continue to show only their agent with **IDENTITY HIDDEN**. Confirm every
queued party member whose level is visible in the Riot lobby now shows the same
number in BYAKUGAN instead of remaining on **LVL SYNCING**.

The existing beta.101 VOD report should display an
earlier-engine notice. Regenerate the same 33:09 Competitive Omen recording in
Adaptive mode with `qwen3:8b` for text and `qwen3-vl:8b-instruct` for vision.
The replacement report must not attribute Reyna's spectated POV to Omen, invent
ordinary respawns, coach Buy Phase/spectator/round-end footage, create multiple
cards from one window, show unsupported round numbers, or call a one-off item a
repeated pattern. It is acceptable—and preferable—for the report to return few
or zero moments when the available frames do not prove a decision and visible
consequence. Record the accepted/rejected candidate counts and compare every
retained finding against the source timestamp.

During a core game, also confirm every revealed player
card shows current rank, all-time peak, and the peak Episode/Act while hidden
enemy identities remain agent-only and non-clickable. Open several completed
matches and confirm both teams show match rank plus all-time peak and
Episode/Act. `ollama ps` previously confirmed 100% GPU execution on the RX 6800
XT. Pause and resume once to verify the elapsed timer continues without counting
paused time, and navigate away to verify the global indicator remains.

## New-chat recovery

At the start of a new chat, inspect this file before changing code. Also locate
`BYAKUGAN-CURRENT-HANDOFF.md`, which is updated after every release with the
current archive filename, checksum, test count, GitHub status, and next action.
The user should only need to say **Continue BYAKUGAN**.
