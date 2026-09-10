# Shared match history

During an active match, public players on both teams show how many saved matches
you played with or against them. Click or keyboard-activate their roster row to
open their profile. Expand a match for its date, mode, map, result, score, and each
player's agent and K/D/A. Results are from your perspective. Existing teammate
profile details remain accessible through **More player details**.

The gaming PC records completed match rosters already read by BYAKUGAN, including
non-Competitive queues. History survives Act changes and restarts. Deathmatch
participants are labeled **Same match** because they are not teammates. A missing
record means **No shared matches saved**, not that the players have never met.
Tracker summary imports contain no participant rosters and cannot fill this list.

For existing installs, known teammate relationships can be recovered from the Act
cache immediately. Full rosters are recovered from up to five cached match IDs per
refresh, with two concurrent requests, through the existing detail collector.
Unavailable older details remain missing. Opening a shared profile reads saved
records and makes no additional Riot requests.

The private gaming-to-streaming connection includes counts and the latest 50
shared matches per visible live player in its cached snapshot. Additional pages
are requested from the gaming PC using its existing connection token. Update both
PCs for this feature. A disconnected viewer shows saved general stats, not a stale
live roster.

## Identity and storage

History is stored separately per owner in `encounters-riot-<account hash>.json`.
Participant identifiers are hashed with the owner and names are not stored in the
encounter file. The current public roster supplies display names. Private or
unresolved identities have no encounter handle; their history cannot be requested.
Handles are bound to the current account and live match, remain attached to the
same player when roster order changes, and expire when that context changes.

The current live match is excluded. Completed matches are deduplicated by match ID.
A full roster replaces a partial legacy record. Writes use a temporary file and
rename; unreadable existing files are preserved and produce a warning.

## Regular beta.145 update

The feature ships in the normal **BYAKUGAN** app. Update both PCs through the
existing beta updater after the tagged Windows build succeeds. The installer is
`BYAKUGAN-Setup-0.8.0-beta.145-x64.exe`. Existing installed settings, caches, overlay
configuration, and host/viewer roles continue to be used. No setup in a separate
profile is required.

The release tag `v0.8.0-beta.145` runs the existing Windows workflow, including
source tests, `npm run release:win`, and executable integrity checks. It publishes
the installer, blockmap, and `beta.yml` only after those steps succeed. Pushing a
main-branch commit alone does not publish a release.

HenrikDev controls have been removed from Settings; existing imported match records
remain available. Earlier development previews use their own profile and are not
the regular application's update source.
