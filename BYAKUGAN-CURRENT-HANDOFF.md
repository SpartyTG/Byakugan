# BYAKUGAN Current Handoff

## Canonical release

- Target: `v0.8.0-beta.126`
- Previous release: `v0.8.0-beta.125`
- Branch: `main`
- Repository: `https://github.com/SpartyTG/Byakugan`
- Local source of truth on Tyler's PC: `C:\Users\Tyler\Documents\GitHub\Byakugan`
- Verification: `182` automated tests, `10` Sensei Brain smoke checks, complete JavaScript syntax and Brain-pack JSON validation

The installed application changes only after `package.json`, the pushed Git tag,
and a green GitHub Actions release all match.

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

1. Copy the beta.126 source files into `C:\Users\Tyler\Documents\GitHub\Byakugan`.
2. In GitHub Desktop, commit and push `main`.
3. In the repository Command Prompt:

```bat
git tag v0.8.0-beta.126
git push origin v0.8.0-beta.126
```

4. Wait for **Publish BYAKUGAN Beta** to turn green.
5. In the installed app, use **Settings → Check for updates**.

## Manual verification

1. With Riot Client and VALORANT open, select **Refresh Data** and confirm Loadout shows the signed-in account's equipped skins. If Riot withholds the collection, confirm the page shows the unavailable message rather than a false empty loadout.
2. Open Stream Vision and confirm only Custom Overlay Builder appears. Verify the duplicate Visible Fields section and preset selector are gone.
3. Customize Landscape, switch to Portrait, customize it differently, then switch back and confirm both designs persist independently.
4. Enable Browser Source, add the Landscape and Portrait URLs to separate OBS Browser Sources, and confirm both update simultaneously with their correct canvas and privacy settings.
5. Follow the in-app dual-PC guide on both computers and confirm the streaming PC displays **Gaming PC connected** before copying its OBS URLs.
6. Regenerate until a local-model validation failure is encountered. Confirm BYAKUGAN unloads and freshly retries the text model without requiring an Ollama restart; a successful recovery remains Full Sensei.
7. On the clean laptop, run **Set up Sensei on this PC → Yes**. Confirm download progress, Ollama installation, `qwen3:8b` pull, settings persistence, and truthful readiness.
