# Personal Tracker summary import

Settings offers an optional **Choose summary JSON** action. The user previews the
numbers, verifies their Riot ID and current Act, then explicitly saves. The saved
snapshot appears separately in Overview and can be exported or removed.

This first version supports **Competitive only**. Unrated, Swiftplay, Deathmatch,
and combined-queue summaries are rejected. Imports contain aggregate totals and
optional agent rows, not individual matches. Missing draws remain unknown; only
explicitly supplied draws are recorded as draws. Unknown capture times stay unknown.

The main process validates finite numeric values, integer counts, result totals,
K/D against supplied kills/deaths, file size, account identity, and Act binding.
It rechecks the preview's account, Act, and digest at save time. An absent Act ID
requires explicit confirmation that the labeled Act is the current one. An
explicitly different Act ID is rejected. Imported data does not change Riot caches,
current RR, coaching, match lists, charts, or aggregate ratios from collected matches.

Imports are stored in `act-summary-imports.json`, scoped by the connected account's
pseudonymous key, Act ID, and queue. Duplicate imports are idempotent. A replacement
replaces the previous summary instead of adding totals. The import is saved on the
PC where the user imports it. The streaming viewer can import using a cached host
snapshot, including a beta.144 host; importing does not send a new command to the host.
This feature does not yet synchronize imported summaries back to the gaming PC.

## File format

This is a BYAKUGAN interchange format, not an official Tracker export format. Stats
can be transcribed from the user's own screenshots. This feature does not scrape
Tracker, use a Tracker API, or require a Riot or HenrikDev API key.

```json
{
  "format": "byakugan.act-summary",
  "version": 1,
  "source": "tracker-screenshot",
  "riotId": { "gameName": "Example Player", "tagLine": "TEST" },
  "act": { "label": "Example Act", "seasonId": null },
  "queue": "competitive",
  "capturedAt": null,
  "totals": {
    "matches": 12, "wins": 6, "losses": 4, "draws": 2,
    "kills": 150, "deaths": 125, "assists": 80,
    "kd": 1.2, "headshotPct": 23.4, "winPct": 50
  }
}
```

Optional totals include `adr`, `acs`, `kastPct`, `ddaPerRound`, `kad`,
`killsPerRound`, `firstBloods`, `flawlessRounds`, `aces`, and `playtimeHours`.
Optional `agents` rows include a displayed `label`, integer `matches`, and any of
`playtimeHours`, `winPct`, `kd`, `adr`, `acs`, `ddaPerRound`, `headshotPct`.
Optional `notes` preserves source qualifications. Ratios are never combined with
later matches without the underlying records and denominators.

## Regular app release

Beta.145 includes this importer in the normal BYAKUGAN Settings page. The release
uses `npm run release:win`, the existing installer identity, and the beta update
feed. Existing installed settings and caches remain in the regular app profile.

## Optional development preview tooling

Run `npm ci`, `npm run verify`, then `node scripts/build-import-preview.cjs`.
The Windows x64 folder is written under `.local-build/import-preview/win-unpacked`.
The preview has its own app identity and `%APPDATA%\BYAKUGAN-Import-Preview` profile,
with the update feed disabled. On first launch it copies the installed PC role and
LAN connection. Viewer profiles also copy the latest saved snapshot; gaming profiles
copy readable match caches for shared-match history. It does not write to the
installed profile. Existing preview settings are preserved. This separate tooling
is not used to build the normal beta.145 update.

The personal sample JSON is a separate user artifact, never part of shipped source
or hardcoded defaults. No public beta version, release feed, or website is changed
by creating a local preview.

### import.2 packaging repair

The import.1 executable was truncated by the packaging resource editor: the
original Electron executable was 244,440,576 bytes; the packaged file was
238,551,040 bytes while still referencing sections ending at 244,440,576.
Windows rejected that file before any application code ran.

The preview now uses Electron's documented `resources/app` layout with `asar: false`
and executable resource editing disabled. It keeps the prebuilt Windows runtime
intact. See [Electron application packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution).
The preview build and release artifact checks now inspect PE headers, section
bounds, entry-point backing, certificate bounds and the application architecture.
These checks detect the observed truncation; they do not claim a native Windows
launch has been tested.
