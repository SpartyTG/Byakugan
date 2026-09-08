# Beta.142 HenrikDev check checkpoint

Prepared source, not published. Manual Settings check uses ephemeral Authorization key on invoking PC and current snapshot name/tag/region. Gaming snapshot sends account/Act-bound SHA256 hashes of completed cached match IDs. Stored provider rows require matching account hash, Act and competitive mode; records deduplicate by ID. Report is summary only, no key, raw player UUID or match IDs. No import performed. Key field cleared immediately. Report file: henrik-history-check.json on invoking PC. Full verification passes, live HenrikDev response awaits user check. Stored round scores cannot distinguish all remakes; counts alone do not establish completeness.

# Beta.141 report transfer checkpoint

Prepared, not published. Act report now includes pseudonymous accountKey and seasonId. Snapshot includes matching report as actScanDiagnostics. Viewer writes matching report to act-scan-diagnostics.json and removes stale report when absent/mismatched. Gaming PC restores completed matching reports from disk. Legacy reports lack scope and need another scan. Streaming report may be running:true during collection; collect running:false report for final diagnosis. Full verify passes.

# Beta.140 viewer cache checkpoint

Prepared source, not published. Viewer receives cacheDirectory from Electron userData, saves whole snapshots under hashed host/account/Act identities, restores latest host snapshot immediately, and polls to reconnect. Offline UI shows last synced and suppresses stale live state. Gaming snapshots now include activeSeasonId. New regression test covers offline restart, host separation and fresh account/Act replacement. Existing gaming Act archive remains unchanged.

# Beta.139 gameplay scan update

Supersedes beta.138 package. Act scans may start in Agent Select or gameplay; index and detail concurrency are each two in all states. Existing 30-minute partial retry cooldown still applies. Includes beta.138 recovery fix and saved diagnostic report. Not yet published or verified against live Riot data.

# Beta.138 diagnostic checkpoint

Beta.138 is prepared locally, not published. Full current-Act recovery remains unresolved.
Uploaded schema-12 cache and archive are identical: 173 entries, 161 completed results, 12 RATING placeholders. Their saved coverage reports 131 wins and 261 games. These are observed values only, never constants or targets in code.
Recovered details previously lost to later cached placeholders; merge precedence now preserves recovery. Regression test covers restart persistence.
The new act-scan-diagnostics.json records redacted request paths, page sizes/cursors/date ranges, status codes, index stop reasons, coverage, and unresolved detail counts. It is written after a scan; existing partial-cache cooldown of 30 minutes still applies, and scans start only outside Agent Select and active play.
Do not claim a retention ceiling without the captured scan evidence. Next: release through Tyler's local main, verify green CI, update gaming PC, collect report after scan.

---

# BYAKUGAN Current Handoff

## Canonical release

- Target: `v0.8.0-beta.137`
- Previous release: `v0.8.0-beta.133`
- Branch: `main`
- Repository: `https://github.com/SpartyTG/Byakugan`
- Local source of truth on Tyler's PC: `C:\Users\Tyler\Documents\GitHub\Byakugan`
- Verification: `199` automated tests, `10` Sensei Brain smoke checks, complete JavaScript syntax and Brain-pack JSON validation

The installed application changes only after `package.json`, the pushed Git tag,
and a green GitHub Actions release all match.

## Beta.134 changes

### Fast Act-boundary pagination without a guessed game total

- Riot's seasonal `NumberOfWins` remains the authoritative completeness guard. Tyler's current value is 128 wins.
- Overview counts every indexed current-Act result and reads Wins, Losses, and Draws separately.
- General match history loads six supported 20-record pages concurrently and honors corrected short-page cursors. Riot's declared `Total` never stops the scan; pages continue until the previous-Act boundary or a truly empty response.
- Discovered details hydrate at concurrency 20 only while outside Agent Select and active matches, restoring fast menu loading without competing with live gameplay polling.
- Cache schema advances to 10, so older caches receive one clean reindex. Existing same-account, same-Act matches are still merged monotonically and remain protected by the archive.

## Beta.133 changes

### Classic fast and complete Act statistics

- Overview returns to one current-Act W/L, K/D, and headshot record. The beta.132 wins/games split and detailed-sample annotation are removed.
- Act indexes request broad ranges and follow Riot's response `BeginIndex`, `EndIndex`, and `Total`; sparse or shortened pages no longer make the scanner guess its cursor or stop prematurely.
- Match details hydrate only while outside Agent Select and active games, at the earlier concurrency of 20 for fast cold recovery.
- Once complete, the dataset loads from disk immediately and only newly completed matches are appended.
- Cache schema advances to version 9 so beta.132 receives one corrected reindex. The monotonic archive remains internal and invisible.
- Windows cache-file replacement falls back to an overwrite-safe copy and records any persistence failure in diagnostics instead of silently discarding the cache.

## Beta.132 changes

### Authoritative totals and permanent detail retention

- Riot's current-season MMR record is the completeness authority. Overview shows its exact win and game totals even when the local match-detail endpoints retain only a shorter window.
- Detailed W/L, K/D, headshot, maps, agents, and journey data remain labeled **Partial Act** whenever their discovered matches do not cover Riot's seasonal game and win totals.
- Empty history and competitive-update pages are treated as possible retention ceilings rather than proof that the Act boundary was reached.
- A completed but incomplete scan stops its loading state and reports its retained detail coverage; it retries on the existing cooldown without spinning indefinitely.
- Cache schema advances to version 8. A separate append-only `act-stats-archive.json` is merged with the working cache on load and before every write, preventing future short responses from deleting known same-account, same-Act match details.

## Beta.131 changes

### Authoritative full-Act recovery

- Full-Act discovery merges Riot's general match-history index with its independently paginated competitive-update index.
- A shortened general history response can no longer establish that the entire Act has been found.
- Pagination advances by the exact number of records Riot returned and continues through short pages until an empty page or previous-Act boundary.
- Cache schema advances to version 7. Schema-5 and schema-6 data remain visible but receive one authoritative reindex, allowing the incorrectly persisted 44/44 dataset to recover.
- Full-Act hydration is deferred during Agent Select and active matches, then resolves missing match details at concurrency four while the prior same-Act cache stays visible.
- Interrupted or unavailable sources remain labeled **Partial Act** and retry after 30 minutes instead of repeatedly loading every refresh cycle.

## Beta.130 changes

### In-app patch notes

- The update dialog has a dedicated **What's updated** section for readable, version-specific release information.
- GitHub Actions publishes the curated root `RELEASE_NOTES.md` body instead of a generic generated changelog.
- Older HTML and Markdown release descriptions are safely normalized into plain text before reaching the renderer.
- Source verification accepts Windows CRLF and Unix LF while requiring release notes to match the exact `package.json` version and contain at least one patch bullet, preventing a stale or empty updater summary from shipping.

## Beta.129 changes

### Monotonic full-Act history

- A complete same-Act cache stays visible while Riot publishes or hydrates a newer match; freshness starts background work but no longer hides trustworthy totals.
- Partial and interrupted current-Act scans always union with every previously cached match from that same Riot account and season.
- Progress totals include both newly discovered and carried matches without double-counting IDs.
- The act-cache schema advances to version 6. Version 5 data remains visible but triggers one authoritative background reindex so previously reduced caches can recover automatically.
- The reindex affects only the active Riot account and Act; a legitimate new Act never inherits the previous Act's totals.

## Beta.128 changes

### Riot Client-friendly request scheduling

- Live polling is serialized so a slow request can never overlap the next poll. Full refreshes are also single-flight across the dashboard, Relay Mode, and post-match recovery.
- Menus use a lightweight 15-second cadence. Agent Select and active matches retain the existing 5-second cadence.
- Failed live requests back off progressively to a maximum of 60 seconds instead of repeatedly pressuring an unavailable Riot service.
- The first post-match refresh waits 12 seconds for Riot Client to rebuild its lobby. Additional 24- and 45-second attempts occur only when Riot has not published the completed match.
- Completed-history peak lookup is limited to ten uncached players per refresh at concurrency two rather than requesting nearly every recent participant at once.
- Successful peak summaries persist locally for 24 hours per Riot account, eliminating the same cold-cache burst after an app restart.

## Beta.127 changes

### Stable profile snapshots

- A transient MMR, competitive-update, or account-XP request can no longer replace a resolved rank, RR, peak rank, account level, rank image, or profile accent with `Unrated`, zero, or an empty value.
- Stable resolved rank data is also used by session analytics and Stream Vision, closing the secondary path that could still make an overlay flicker.
- BYAKUGAN retains previous values only when their supporting Riot source failed. A successful response remains authoritative, including legitimate placement, Act-reset, and account changes.
- Cached career data is account-scoped and cannot carry across Riot accounts.

## Beta.126 changes

### Loadout recovery

- Personalization requests use the exact client version exposed by the running VALORANT session instead of relying only on third-party version metadata.
- Equipped loadout normalization accepts Riot's wrapped and alternate-casing payloads plus chroma, skin, and skin-level UUIDs.
- Metadata maps skin-level and chroma UUIDs to their correct names and artwork.
- Loadout distinguishes an empty Riot collection from an unavailable response and tells the user how to refresh it.

### Custom-only multistream overlays

- Custom Overlay Builder is the only selectable Stream Vision layout; the old preset selector and duplicate Visible Fields controls are removed.
- Existing preset visibility and Reactive Vision settings migrate into the Landscape custom design.
- Landscape and Portrait tabs save completely independent element placement, visibility, state canvases, and dimensions.
- Landscape keeps the user's existing custom design. Portrait begins with a vertical `540 × 960` design.
- The overlay server exposes distinct token-protected `profile=landscape` and `profile=portrait` Browser Source URLs and filters each payload using only that profile's enabled elements.
- Both URLs can remain connected and update simultaneously for Twitch/YouTube plus TikTok/Shorts multistreaming.
- Stream Vision includes a visible seven-step Dual PC Streaming Mode guide covering host, firewall, URL transfer, viewer verification, and OBS setup.

## Beta.125 changes

### Automatic fresh-model recovery

- Full Sensei still receives its normal generation and one grounded JSON repair attempt first.
- If both fail structured-output validation, BYAKUGAN sends Ollama an empty `keep_alive: 0` request for only the selected text model.
- BYAKUGAN then performs one fresh Full Sensei generation automatically.
- Ollama remains running, and the separately configured VOD model is not targeted.
- Sensei Lite appears only if the fresh generation also fails or the model cannot be reloaded.

## Beta.124 changes

### Deterministic drill-category repair

- A Full Sensei report no longer falls back solely because its three drills repeat or omit a required practice category.
- Valid model drills are retained first; only missing or duplicate Range, custom-game, and Deathmatch slots are filled from the grounded Lite support report.
- The one Brain-selected mission drill still becomes the first drill after category repair.
- Unsafe or incomplete drills continue to fail the existing safety validation.

## Beta.123 changes

### Verdict punctuation repair

- Full Sensei verdict normalization now recognizes standard and Unicode sentence endings.
- Each repaired sentence receives a validator-compatible terminal mark when the model omits punctuation.
- Decimal values such as `1.62 K/D` remain intact.
- A punctuation-free one-sentence model verdict receives one grounded Lite sentence and remains Full Sensei.

## Beta.122 changes

### Production Brain integration

- `sensei:run` plans one mission before model generation and passes the complete Brain context into `SenseiService.analyze`.
- Full Sensei now receives the selected mission, match memory, leak ledger, rank calibration, doctrine, and manual meta pack.
- The deterministic metric rubric remains authoritative.
- One ordinary leak remains a baseline observation; only a repeating or catastrophic leak can replace **Collect a baseline**.
- The focus rule is aligned to the selected mission.
- The mission drill becomes the first drill while the existing Range / custom-game / Deathmatch structure remains intact.
- Repairable mission drift is corrected locally. Unrepairable structured output still receives one Ollama repair attempt and then falls back safely to mission-aware Lite.

### Report reliability

- A one-sentence model verdict receives a grounded sentence from the deterministic Lite verdict.
- Verdicts longer than three sentences are trimmed to three.
- Decimal statistics such as `1.62 K/D` are not mistaken for sentence boundaries.
- Existing number, citation, metric-contradiction, and drill-safety guards remain in force.

### Stable, idempotent memory

- Riot data creates a stable SHA-256-derived account key for local Sensei storage; the raw PUUID is never placed in the renderer or Dual PC snapshot.
- Existing report and Brain entries migrate automatically from `GameName#Tag` to the stable key.
- Each leak counts once per match. Regenerate and VOD reapplication may improve evidence or severity without inflating `timesSeen`.
- Keep, Wrong, and Done retain their existing names, slug persistence, and cooldown behavior.

### Setup wizard

- Official Ollama downloads follow at most five redirects and only across allowlisted HTTPS release hosts.
- Redirects create a fresh final file stream, incomplete downloads use a `.download` file, and failed partial files are removed.
- The downloaded installer must have a Windows `MZ` executable header.
- Setup progress is sent to the renderer, controls are locked while setup runs, and overlapping pulls are rejected.
- The temporary installer is removed after execution.
- The readiness button now verifies Ollama and the configured text model. Optional VOD requirements are reported separately.
- FFmpeg remains a separately installed VOD dependency and is not downloaded without an explicit future consent flow.

### Release gate

`npm run verify` now runs:

1. Syntax checks for all JavaScript under `src`, `scripts`, and `tests`
2. JSON parsing for package metadata and every Brain pack
3. The complete Node test suite
4. Every Sensei Brain smoke script

GitHub Actions runs this full gate before building and publishing the installer.

## Preserved product boundaries

- Sensei remains opt-in and manual-only.
- No cloud model API is used.
- No live mid-round coaching is generated.
- BYAKUGAN never writes to VALORANT files.
- Meta changes remain manual in `src/main/sensei-brain/packs/meta.current.json`.
- Sensei and Ollama belong on the streaming PC in a dual-PC ranked setup.
- Streaming Viewer does not require a local Riot lockfile when Relay / Reconnect Host is configured.

## Tyler's release flow

1. Copy the beta.137 source files into `C:\Users\Tyler\Documents\GitHub\Byakugan`.
2. In GitHub Desktop, commit and push `main`.
3. In the repository Command Prompt:

```bat
git tag v0.8.0-beta.137
git push origin v0.8.0-beta.137
```

4. Wait for **Publish BYAKUGAN Beta** to turn green.
5. In the installed app, use **Settings → Check for updates**.

## Manual verification

1. From beta.134–136, use **Settings → Check for updates**. Confirm the dialog explains that beta.137 restores fast full-Act retrieval and separate draw counting.
2. Complete the update on both PCs and confirm BYAKUGAN closes, installs, and reopens normally.
3. Allow the one-time schema-12 reindex to finish in menus. Confirm Overview reads the signed-in user's complete current-Act **Win / Loss / Draw**, K/D, Headshot %, and current RR without stopping at Riot's declared history total.
4. When the scan completes, confirm the detailed record contains all 128 current-Act wins and is labeled **ACT**, not **PARTIAL ACT**.
5. Restart BYAKUGAN after the reindex. The complete Act cards should appear immediately from disk; after another match, only that new match should hydrate and append.
6. After a completed match, return to Play and switch away from and back to Competitive. Confirm Riot Client does not remain on `LOADING` and the party member's rank remains visible. Compare once with BYAKUGAN fully exited if Riot still reproduces it.
7. Confirm party/menu changes appear within 15 seconds, then enter Agent Select and verify Live Match continues updating about every 5 seconds.
8. Reopen recent Match History entries across several automatic refreshes. Peak ranks may fill progressively, but the app must remain responsive and already resolved peaks must survive a restart.
9. Leave BYAKUGAN and both Stream Vision Browser Sources open through several automatic refresh cycles. Confirm resolved rank, RR, peak rank, level, and rank art never flash to `Unrated`, zero, or blank during a transient Riot request failure.
10. With Riot Client and VALORANT open, select **Refresh Data** and confirm Loadout shows the signed-in account's equipped skins. If Riot withholds the collection, confirm the page shows the unavailable message rather than a false empty loadout.
11. Open Stream Vision and confirm only Custom Overlay Builder appears. Verify the duplicate Visible Fields section and preset selector are gone.
12. Customize Landscape, switch to Portrait, customize it differently, then switch back and confirm both designs persist independently.
13. Enable Browser Source, add the Landscape and Portrait URLs to separate OBS Browser Sources, and confirm both update simultaneously with their correct canvas and privacy settings.
14. Follow the in-app dual-PC guide on both computers and confirm the streaming PC displays **Gaming PC connected** before copying its OBS URLs.
15. Regenerate until a local-model validation failure is encountered. Confirm BYAKUGAN unloads and freshly retries the text model without requiring an Ollama restart; a successful recovery remains Full Sensei.
16. On the clean laptop, run **Set up Sensei on this PC → Yes**. Confirm download progress, Ollama installation, `qwen3:8b` pull, settings persistence, and truthful readiness.
