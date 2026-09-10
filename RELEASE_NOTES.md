# BYAKUGAN v0.8.0-beta.150

## What's updated

- Limits Played before counts and shared-match profiles to Competitive matches only.
- Excludes Unrated, Swiftplay, Spike Rush, Deathmatch, Team Deathmatch, and other queues from newly collected encounter history.
- Automatically hides non-Competitive encounters previously saved by beta.145 while preserving valid Competitive history across Acts and restarts.
- Keeps teammate/opponent counts, match recaps, identity privacy, and gaming-to-streaming PC transfer unchanged.
- Removes the manual Tracker Act-summary JSON importer, its Settings controls, and its separate Overview card.
- Leaves any previously saved `act-summary-imports.json` file untouched instead of deleting user data during the update.
- Adds an explicitly experimental Tracker bridge for early testers while BYAKUGAN awaits supported Riot access.
- Opens the connected Riot account's public Tracker page in a visible local window scoped to the current Competitive Act; BYAKUGAN never calls Tracker's blocked private API.
- Imports only the visible Matches, Wins, Losses, K/D Ratio, and Headshot %, derives draws from the verified result total, and caches the result per Riot account and Act.
- Shows Tracker-synced W/L/D, K/D, and headshot percentage on Overview with an experimental source label while keeping Riot RR and BYAKUGAN's underlying match cache unchanged.
- Supports removing the cached Tracker summary at any time and immediately returning to BYAKUGAN's collected Riot stats.
- Overwrites legacy manual-import files with inert compatibility stubs so copying the full source over an existing repository cannot accidentally retain the removed importer or fail Windows CI.
- Recognizes Tracker's visible Matches Played, Matches Won, and Matches Lost card labels in either label-first or value-first order.
- Reports the exact missing Tracker field and removes Electron IPC boilerplate from sync errors.
- Updates the existing BYAKUGAN installation through the normal beta updater while preserving settings, caches, overlay configuration, and dual-PC roles.
