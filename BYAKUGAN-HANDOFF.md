# BYAKUGAN Source Handoff

This package is the canonical source for `v0.8.0-beta.95`.

## Verified baseline

- Previous canonical version: `v0.8.0-beta.94`
- Automated tests: `142 passed, 0 failed`
- Syntax validation: passed
- Repository: `https://github.com/SpartyTG/Byakugan`

## Latest completed change

Queued party-member account levels now use every level Riot exposes in the
party payload plus a VALORANT lobby-presence fallback. A zero or hidden display
placeholder no longer blocks a valid lobby level. Missing party levels retry
after five seconds and render as `LVL SYNCING` instead of `LVL PRIVATE`.

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

Publish beta.95 and queue with at least one party member. Confirm every level
visible in the VALORANT lobby appears in BYAKUGAN. If a value initially shows
`LVL SYNCING`, allow one refresh cycle and confirm it resolves.

## New-chat recovery

At the start of a new chat, inspect this file before changing code. Also locate
`BYAKUGAN-CURRENT-HANDOFF.md`, which is updated after every release with the
current archive filename, checksum, test count, GitHub status, and next action.
The user should only need to say **Continue BYAKUGAN**.

