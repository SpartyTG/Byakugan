# BYAKUGAN Source Handoff

This package is the canonical source for `v0.8.0-beta.96`.

## Verified baseline

- Previous canonical version: `v0.8.0-beta.95`
- Automated tests: `144 passed, 0 failed`
- Syntax validation: passed
- Repository: `https://github.com/SpartyTG/Byakugan`

## Latest completed change

Sensei's local-model repair pass now uses Ollama's broadly supported JSON mode
and supplies the exact validation problem. If both the original response and
repair remain unusable, the statistical report completes through a clearly
labeled Sensei Lite fallback rather than showing a failed panel. Connectivity,
timeout, and missing-model errors are not hidden by the fallback.

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

Publish beta.96 and rerun Sensei Vision on the match that previously failed.
Confirm it produces a Full Sensei report when the selected model's repaired JSON
passes validation, or a clearly labeled Sensei Lite fallback when it does not.
An 8B model should generally improve report quality and instruction-following,
but the 4B model must no longer leave the match report in a failed state solely
because of malformed structured output.

## New-chat recovery

At the start of a new chat, inspect this file before changing code. Also locate
`BYAKUGAN-CURRENT-HANDOFF.md`, which is updated after every release with the
current archive filename, checksum, test count, GitHub status, and next action.
The user should only need to say **Continue BYAKUGAN**.
