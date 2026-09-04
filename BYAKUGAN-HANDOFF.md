# BYAKUGAN Source Handoff

This package is the canonical source for `v0.8.0-beta.98`.

## Verified baseline

- Previous canonical version: `v0.8.0-beta.96` (`v0.8.0-beta.97` was folded into this release before publication)
- Automated tests: `145 passed, 0 failed`
- Syntax validation: passed
- Repository: `https://github.com/SpartyTG/Byakugan`

## Latest completed change

Sensei now owns a dedicated navigation workspace with an explanation of Sensei
Lite, Full Sensei, and VOD Vision; a compact completed-match selector; a saved
coaching library; local readiness; and the complete report and VOD controls.
Match History remains the full statistical record and routes into Sensei instead
of duplicating coaching UI. Overview displays the current next-match focus.

The unreleased beta.97 VOD fixes are included here: the latest calculated ETA
survives extracting, reviewing, and repair events; Pause and Resume preserve
accumulated active-analysis time without counting the pause; and a persistent
top-bar, navigation, and Sensei-workspace indicator shows progress even after
leaving the report.

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

Publish beta.98 and run or resume a full-match VOD analysis. The display may say
`Estimating remaining time` while the first segment is processed; after the
first completed segment it must show an approximate ETA continuously. Pause and
resume once to confirm the elapsed timer continues from its saved value without
counting paused time. Navigate between Overview, Match History, and Sensei while
it runs; confirm the global indicator remains visible and opens the correct
Sensei workspace. Confirm completed match details use **Open in Sensei** and
Overview shows the selected report's next-match focus.

## New-chat recovery

At the start of a new chat, inspect this file before changing code. Also locate
`BYAKUGAN-CURRENT-HANDOFF.md`, which is updated after every release with the
current archive filename, checksum, test count, GitHub status, and next action.
The user should only need to say **Continue BYAKUGAN**.
