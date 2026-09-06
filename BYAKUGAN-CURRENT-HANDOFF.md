# BYAKUGAN Current Handoff

## Canonical release

- Target: `v0.8.0-beta.125`
- Previous release: `v0.8.0-beta.124`
- Branch: `main`
- Repository: `https://github.com/SpartyTG/Byakugan`
- Local source of truth on Tyler's PC: `C:\Users\Tyler\Documents\GitHub\Byakugan`
- Verification: `180` automated tests, `10` Sensei Brain smoke checks, complete JavaScript syntax and Brain-pack JSON validation

The installed application changes only after `package.json`, the pushed Git tag,
and a green GitHub Actions release all match.

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

1. Copy the beta.125 source files into `C:\Users\Tyler\Documents\GitHub\Byakugan`.
2. In GitHub Desktop, commit and push `main`.
3. In the repository Command Prompt:

```bat
git tag v0.8.0-beta.125
git push origin v0.8.0-beta.125
```

4. Wait for **Publish BYAKUGAN Beta** to turn green.
5. In the installed app, use **Settings → Check for updates**.

## Manual verification

1. Regenerate until a local-model validation failure is encountered. Confirm BYAKUGAN unloads and freshly retries the text model without requiring an Ollama restart; a successful recovery remains Full Sensei.
2. Regenerate the same match twice and add existing VOD evidence. Confirm the mission does not reassign and the leak count does not grow for the same match.
3. On the clean laptop, run **Set up Sensei on this PC → Yes**. Confirm download progress, Ollama installation, `qwen3:8b` pull, settings persistence, and truthful readiness.
4. If VOD is selected, confirm the app clearly reports missing FFmpeg until the complete FFmpeg package is installed.
