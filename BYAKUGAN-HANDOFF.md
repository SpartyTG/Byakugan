# BYAKUGAN Source Handoff

This package is the canonical source for `v0.8.0-beta.101`.

## Verified baseline

- Previous canonical version: `v0.8.0-beta.100`
- Automated tests: `149 passed, 0 failed`
- Syntax validation: passed
- Repository: `https://github.com/SpartyTG/Byakugan`

## Latest completed change

Live Match now displays every available player's all-time peak rank with the
Episode and Act directly on the roster card instead of hiding the season in a
tooltip. Completed Match History hydrates the same peak metadata for every
scoreboard participant whose Riot MMR is available, using five concurrent
requests and the existing player-rank cache. Missing peak data is labeled
unavailable and never inferred. Pregame enemy concealment, Riot-hidden live
identities, and non-clickable live opponent profiles remain unchanged.

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

Install beta.101 on both PCs. During a core game, confirm every revealed player
card shows current rank, all-time peak, and the peak Episode/Act while hidden
enemy identities remain agent-only and non-clickable. Open several completed
matches and confirm both teams show match rank plus all-time peak and
Episode/Act. Then select **Adaptive Quality Test** in
Settings. Use `qwen3:8b` for Sensei text and `qwen3-vl:8b-instruct` for VOD
Vision. Run the same VOD that produced 498 exhaustive segments and record the
selected window count, ETA after the first completed window, total runtime, and
report usefulness. `ollama ps` previously confirmed 100% GPU execution on the
RX 6800 XT. Pause and resume once to verify the elapsed timer continues without
counting paused time, and navigate away to verify the global indicator remains.
Afterward, compare the adaptive report against the exhaustive report or saved
beta.98 progress. Choosing Adaptive will warn before replacing an existing
Exhaustive checkpoint.

## New-chat recovery

At the start of a new chat, inspect this file before changing code. Also locate
`BYAKUGAN-CURRENT-HANDOFF.md`, which is updated after every release with the
current archive filename, checksum, test count, GitHub status, and next action.
The user should only need to say **Continue BYAKUGAN**.
