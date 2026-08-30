# BYAKUGAN

BYAKUGAN is a clean-room Windows desktop companion for VALORANT. It is
designed as an editable foundation rather than a copy of another application's
source, brand, or proprietary assets.

## Included in version 0.8.0-beta.32

- Original desktop dashboard and navigation
- Live Riot Client connection with automatic migration from retired Demo Mode settings
- Riot Client lockfile discovery and validation
- Local Riot authentication and entitlement-token retrieval
- Player identity, region, friends, and decoded multi-title Riot presence retrieval
- Live friend activity for VALORANT menus, agent select, queue type, in-game score, and other Riot titles
- Riot Client-aligned social presence handling that ignores stale mobile League records while preserving active VALORANT records
- Resilient VALORANT friend activity parsing across Riot's nested, alternate-casing, party-owner, and score field variants
- Resolved competitive ranks, maps, agents, weapons, and equipped skin names
- Competitive-rank emblems on the profile, act peak, live roster, and match history
- All-time peak rank with the episode and act where that peak was recorded
- Background full-act hydration with honest **Partial Act** and verified **Act** scope labels
- Persistent per-account act cache that restores completed stats immediately after an app restart
- Incremental act refreshes that hydrate only newly played matches and prioritize detail loading
- Resumable 40-match act batches with progress saved after every batch and up to 20 concurrent detail requests
- Partial W/L, K/D, and headshot updates while older matches continue loading, without a blocking progress banner
- Timestamp-based competitive match-history fallback when Riot's rating feed stops at its first 20 records
- Riot-compatible 20-record history pagination that continues past the endpoint's first-page cap
- Fast full-act discovery with older RR enrichment removed from the critical stats-loading path
- Distinct Refresh Data and Reconnect Riot actions: soft snapshot refresh versus full lockfile, authentication, and connection reset
- Dedicated **Live Stream Vision** workspace for OBS and dual-PC production controls
- **Dual PC Streaming Mode** with separate **Gaming PC — Host** and **Streaming PC — Viewer** roles
- Token-protected private-LAN dashboard transfer with automatic reconnect and ETag-based change detection
- Remote player-profile inspection proxied through the gaming PC without transferring Riot credentials
- Full Act Journey milestones retained from competitive-rating updates even when an older match-detail call is temporarily unavailable
- Server performance profiles with matches, W/L, win rate, K/D, headshot rate, average kills, and RR by Riot game pod
- Click-to-inspect profiles for visible allies and party members, including available competitive stats and equipped skins
- Party-profile fallback through competitive update match IDs when Riot withholds a player's match-history index
- Player-profile fallback to locally observed shared competitive matches when Riot withholds all detailed history
- Current-act wins and current RR on inspected profiles when MMR is available but detailed match history remains private
- Background tracked dodge RR-loss total with normal match losses and identified AFK penalties excluded
- Strict inspection privacy: live opponents, Riot-incognito players, and hidden identities are never inspectable
- Party-aware identity handling: current party members remain named and inspectable even when their general in-game incognito setting is enabled
- Friend-aware identity handling: Riot friends remain named, ranked, and inspectable regardless of incognito setting or team assignment
- Match Autopsy with personal round-by-round impact timelines and PNG recap export
- Match Autopsy post-game rosters with agents, match ranks, K/D/A, ACS, privacy-preserved names, and visible-player profile links
- Act Journey RR visualization with rank and match milestones
- Evidence-based BYAKUGAN Insights with explicit sample sizes
- Personal challenges, current-session tracking, and post-match summaries
- OBS Browser Source overlay with Awakened Rank, horizontal, compact, and vertical stream layouts
- One-click live overlay preview window with a transparent-grid backdrop and the exact data/layout OBS receives
- Original Awakened Rank stream card with current and peak-rank emblems, larger peak text, RR, session W/L, and K/D
- Animated GIF-based Awakened Rank energy beam, horizontally flipped so its blast head faces right, that is empty at 0 RR and extends or retracts with the player's current 0–100 RR progress
- Independent animated-beam toggle that falls back to a clean static 0–100 RR bar
- Redesigned `560 × 190` Awakened Rank card with denser spacing and larger, stream-legible rank, peak, session, and match text
- Live background-opacity control from fully transparent at 0% to completely solid at 100%
- Awakened Rank footer with the agent/map block removed, a full left-aligned RR track, and session W/L plus K/D anchored at the lower-right
- Compact last-match RR and victory/defeat panel moved into the unused header space
- Current-RR marker positioned above the beam endpoint that slides left or right with the player's live 0–100 RR
- Automatic post-match snapshot refresh with Riot-history retries so session W/L, K/D, RR, and the overlay update even while BYAKUGAN is minimized
- Session-stat merging that prioritizes the newest detailed match over a temporarily stale completed-act cache
- Frameless lower-left agent presentation without the decorative diamond backdrop
- Live session W/L, K/D, RR movement, rank, and optional current agent/map on stream
- Recommended OBS Browser Source dimensions shown live for the selected overlay layout
- Independent live overlay switches for Riot name, W/L, K/D, current RR, peak rank, RR gain/loss, agent, and map
- Frameless agent artwork on the Awakened Rank overlay
- Token-protected overlay server with local-only mode, optional same-network streaming-PC mode, and no roster data
- Assisted Windows installer with desktop and Start menu shortcuts
- In-app beta update banner, release confirmation, download progress, automatic installation, and relaunch
- Mandatory launch-time update dialog: updates discovered at startup must be installed before using the app, while updates discovered during an existing session remain optional until restart
- Manual **Check now** control plus automatic checks after startup and every four hours
- Agent Lab and Map Lab with act-wide personal performance breakdowns
- Friend-only squad synergy derived from shared matches
- Selectable Friend Synergy profiles with tracked shared-match history and direct Match Autopsy access
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
- Match history with playlist filtering, playlist labels, and competitive-only RR gain/loss
- Social, loadout, agent-mastery, diagnostics, and settings screens
- Strict IPC boundary and remote-host allowlist
- Windows NSIS packaging configuration
- Automated unit tests for lockfile and region parsing

BYAKUGAN now runs exclusively from the local Riot Client on Windows. Riot Client
must be running for account and match data to populate; Demo Mode is not included
in production builds.

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
`release` folder. The resulting `BYAKUGAN-Setup-0.8.0-beta.32-x64.exe` installs
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
exact application version prefixed by `v`—for example `v0.8.0-beta.32`. Upload
the generated installer, its `.blockmap`, and `beta.yml` from `release/` to that
prerelease. Every subsequent release must increase the semantic version, for
example `0.8.0-beta.32`, before rebuilding and uploading all three artifacts.
The installed app reads `beta.yml` and ignores normal stable-channel releases.

The included GitHub Actions workflow automates the Windows build and GitHub
prerelease. After pushing source changes, create and push a tag matching the
version in `package.json`:

```bash
git tag v0.8.0-beta.32
git push origin v0.8.0-beta.32
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

1. Open **Stream Vision → OBS stream overlay** in BYAKUGAN.
2. Choose a layout and select **Preview overlay** to inspect the exact live output.
3. Choose exactly which fields are visible. Riot name, W/L, K/D, current RR, peak rank, RR gain/loss, agent, and map are independent switches. The animated RR energy beam can also be replaced with a static RR bar.
4. Turn on **Enable Browser Source**.
5. When OBS is on another computer, also turn on **Allow streaming PC**. Both PCs must be connected to the same private network. If Windows Firewall asks, allow BYAKUGAN on **Private networks** only.
6. Select **Copy OBS URL**.
7. BYAKUGAN displays the recommended width and height beneath the selected layout. In OBS, add **Sources → Browser**, paste the URL, and use the displayed size:
   - Awakened rank card: `560 × 190`
   - Horizontal bar: `1600 × 180`
   - Compact card: `560 × 240`
   - Vertical panel: `380 × 660`
8. Leave BYAKUGAN running on the gaming PC while streaming.

By default, the overlay listens only on `127.0.0.1:43871`. Streaming-PC mode
instead binds to an automatically detected private IPv4 address such as
`192.168.x.x`; it does not select a public IP address. Its private token is stored
in BYAKUGAN settings and can be regenerated at any time. The stream payload is
deliberately limited to the signed-in player's profile, current session totals,
and optional personal agent/map state. It never includes Riot credentials,
friends, teammate names, or enemy roster data.

## Architecture

```text
Renderer UI
    │ secure contextBridge
Electron main process
    ├── SettingsStore
    ├── local/private-network OBS overlay server
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

1. Continue live Riot-data testing on the target Windows PC.
2. Convert the BYAKUGAN eye artwork into signed Windows icon assets.
3. Continue normalizing real match-detail payloads into richer cards.
4. Add post-match overlay animations and configurable stream themes.
5. Add account-backed sync only after selecting a backend and privacy model.
