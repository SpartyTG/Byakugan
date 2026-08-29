# BYAKUGAN

BYAKUGAN is a clean-room Windows desktop companion for VALORANT. It is
designed as an editable foundation rather than a copy of another application's
source, brand, or proprietary assets.

## Included in version 0.8.0-beta.5

- Original desktop dashboard and navigation
- Live/mock mode switch
- Riot Client lockfile discovery and validation
- Local Riot authentication and entitlement-token retrieval
- Player identity, region, friends, and presence retrieval
- Resolved competitive ranks, maps, agents, weapons, and equipped skin names
- Competitive-rank emblems on the profile, act peak, live roster, and match history
- All-time peak rank with the episode and act where that peak was recorded
- Background full-act hydration with a clear loading state instead of a misleading partial-act label
- Full Act Journey milestones retained from competitive-rating updates even when an older match-detail call is temporarily unavailable
- Server performance profiles with matches, W/L, win rate, K/D, headshot rate, average kills, and RR by Riot game pod
- Click-to-inspect profiles for visible allies and party members, including available competitive stats and equipped skins
- Strict inspection privacy: live opponents, Riot-incognito players, and hidden identities are never inspectable
- Party-aware identity handling: current party members remain named and inspectable even when their general in-game incognito setting is enabled
- Match Autopsy with personal round-by-round impact timelines and PNG recap export
- Act Journey RR visualization with rank and match milestones
- Evidence-based BYAKUGAN Insights with explicit sample sizes
- Personal challenges, current-session tracking, and post-match summaries
- OBS Browser Source overlay with horizontal, compact, and vertical stream layouts
- Live session W/L, K/D, RR movement, rank, and optional current agent/map on stream
- Loopback-only overlay server with a private, regenerable URL and no roster data
- Assisted Windows installer with desktop and Start menu shortcuts
- In-app beta update banner, release confirmation, download progress, automatic installation, and relaunch
- Mandatory launch-time update dialog: updates discovered at startup must be installed before using the app, while updates discovered during an existing session remain optional until restart
- Manual **Check now** control plus automatic checks after startup and every four hours
- Agent Lab and Map Lab with act-wide personal performance breakdowns
- Friend-only squad synergy derived from shared matches
- Awakened Eye visual system with stronger hierarchy, artwork, motion, and depth
- Enemy privacy boundary: live opponents expose only selected agent and competitive rank
- Detailed match scores, K/D/A, K/D ratio, RR changes, and recent-game statistics
- Paginated current-act competitive W/L, K/D, and headshot statistics
- Live Match tab with map, ally/enemy rosters, agents, and competitive ranks
- Privacy-preserving player names: Riot-incognito ally names are never looked up or retained;
  live enemy names are never requested or displayed
- Cached roster-rank fallback when the live match payload omits competitive tiers
- Regional profile, account XP, competitive data, loadout, and match-history calls
- Live menu/pregame/in-game state polling
- Match history, social, loadout, agent-mastery, diagnostics, and settings screens
- Strict IPC boundary and remote-host allowlist
- Windows NSIS packaging configuration
- Automated unit tests for lockfile and region parsing

The app starts in **Demo mode**, so the complete interface can be developed on
any computer. Switch to **Live Riot Client** in Settings on a Windows computer
with Riot Client running.

## Development

Requirements: Node.js 24+ and npm.

```bash
npm install
npm test
npm start
```

Build a Windows installer:

```bash
npm run dist:win
```

On Windows, `Build-Beta-Installer.cmd` can be double-clicked instead. It installs
the build dependencies, runs the tests, creates the installer, and opens the
`release` folder. The resulting `BYAKUGAN-Setup-0.8.0-beta.5-x64.exe` installs
BYAKUGAN like a normal application; PowerShell and npm are not needed to run the
installed program.

## Beta updates

BYAKUGAN uses the NSIS update flow from `electron-updater`. Installed builds
check for updates shortly after startup and every four hours. An available update
is never downloaded without approval:

1. BYAKUGAN displays an **Update available** banner.
2. The user reviews the target version and release notes.
3. Selecting **Download and restart** confirms the update.
4. BYAKUGAN displays download progress, installs the verified artifact, and
   relaunches automatically.

BYAKUGAN's beta update source is the public
[`SpartyTG/Byakugan`](https://github.com/SpartyTG/Byakugan) GitHub Releases
repository. Every installer produced from this source is update-enabled:

```bash
npm run release:win
```

The double-click `Build-Beta-Installer.cmd` runs the same feed-enabled build
without requiring command-line input. It does not ask for or embed a GitHub
token.

In the selected public GitHub repository, create a prerelease tagged with the
exact application version prefixed by `v`—for example `v0.8.0-beta.5`. Upload
the generated installer, its `.blockmap`, and `beta.yml` from `release/` to that
prerelease. Every subsequent release must increase the semantic version, for
example `0.8.0-beta.6`, before rebuilding and uploading all three artifacts.
The installed app reads `beta.yml` and ignores normal stable-channel releases.

The included GitHub Actions workflow automates the Windows build and GitHub
prerelease. After pushing source changes, create and push a tag matching the
version in `package.json`:

```bash
git tag v0.8.0-beta.5
git push origin v0.8.0-beta.5
```

GitHub then runs the test suite, builds the NSIS installer, and publishes the
installer, blockmap, and `beta.yml`. Feed-enabled installed builds detect the
new prerelease and offer **Download and restart** inside BYAKUGAN.

An older installer built without the GitHub feed cannot discover this release.
Install `0.8.0-beta.2` manually once as the update-enabled bootstrap; updates
after that can be applied entirely in the program.

### Signing before wider testing

This internal beta currently allows unsigned NSIS updates. Windows may display
a SmartScreen warning, and update authenticity relies on the HTTPS host plus the
SHA-512 hashes in the generated manifest. Before distributing BYAKUGAN beyond a
small trusted test group, obtain a Windows Authenticode certificate, enable
signature verification, and keep the certificate identity consistent across
releases.

## OBS Browser Source

1. Open **Settings → OBS stream overlay** in BYAKUGAN.
2. Turn on **Enable Browser Source** and choose a layout.
3. Select **Copy OBS URL**.
4. In OBS, add **Sources → Browser**, paste the URL, and use one of these sizes:
   - Horizontal bar: `1600 × 180`
   - Compact card: `560 × 240`
   - Vertical panel: `380 × 660`
5. Leave BYAKUGAN running while streaming.

The overlay listens only on `127.0.0.1:43871`. Its private token is stored in
BYAKUGAN settings and can be regenerated at any time. The stream payload is
deliberately limited to the signed-in player's profile, current session totals,
and optional personal agent/map state. It never includes Riot credentials,
friends, teammate names, or enemy roster data.

## Architecture

```text
Renderer UI
    │ secure contextBridge
Electron main process
    ├── SettingsStore
    ├── MockService
    ├── loopback OBS overlay server
    └── RiotClientService
          ├── Riot lockfile / localhost API
          ├── access + entitlement tokens
          └── allowlisted regional Riot services
```

## Safety and maintenance notes

- Riot credentials remain in the main process and are never exposed to the UI.
- Update feed access and installation remain in the main process; the renderer
  receives status only and can request only check or confirmed download actions.
- TLS verification is relaxed only for Riot's self-signed localhost endpoint.
- Remote requests are restricted to known Riot and metadata hosts.
- The initial implementation is read-only. Automated agent locking and other
  game-changing writes are intentionally not enabled.
- Riot's local/private endpoints are undocumented and can change. Keep the
  connector isolated and verify Riot's current policies before distribution.
- Riot prohibits opponent scouting before a match. BYAKUGAN therefore never
  looks up live enemy identities, missing enemy ranks, stats, skins, or profiles.
- `BYAKUGAN_LOCKFILE_PATH` can override lockfile discovery for development.
  `COMPANION_LOCKFILE_PATH` remains supported for compatibility with older builds.

## Suggested next milestones

1. Test live mode on the target Windows PC.
2. Convert the BYAKUGAN eye artwork into signed Windows icon assets.
3. Normalize real match-detail payloads into the richer demo cards.
4. Add post-match overlay animations and configurable stream themes.
5. Add account-backed sync only after selecting a backend and privacy model.
