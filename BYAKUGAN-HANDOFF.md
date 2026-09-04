# BYAKUGAN Source Handoff

This package is the canonical source for `v0.8.0-beta.102`.

## Verified baseline

- Previous canonical version: `v0.8.0-beta.101`
- Automated tests: `153 passed, 0 failed`
- Syntax validation: passed
- Repository: `https://github.com/SpartyTG/Byakugan`

## Latest completed change

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

Install beta.102 on both PCs. The existing beta.101 VOD report should display an
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
