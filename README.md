# BYAKUGAN

BYAKUGAN is a Windows desktop companion for VALORANT that helps players
understand their performance and improve over time. It combines player and act
statistics, match history, post-game tactical heat maps, evidence-based
insights, customizable stream overlays, and dual-PC support for creators who use
a gaming PC and streaming PC simultaneously.

## Read-only operating model

BYAKUGAN is read-only with respect to VALORANT, the Riot Client, and Riot
account or game state. It reads the Riot Client lockfile and queries available
Riot data endpoints, but it does **not** inject code or DLLs, access or alter
game memory, modify VALORANT or Riot Client files, install gameplay hooks or
drivers, automate player input, or send commands that change gameplay or the
player's Riot account. No BYAKUGAN file is injected into a VALORANT or Riot
Client process or installation directory.

BYAKUGAN writes only its own application data—such as settings, session-recovery
records, and local statistics caches—and its own installed updates. Keeping the
product external to the game and read-only is a permanent BYAKUGAN design
boundary for future features.

## Product vision

BYAKUGAN is designed to turn match data into clear, useful information for
players and streamers. Its analysis features focus on reflection and coaching
after gameplay, while its streaming tools make personal performance data easy
to present without interrupting the game.

## Creator, inspiration, and development disclosure

BYAKUGAN's creative direction, product design, original feature concepts,
visual direction, and release decisions are created and led by **Tyler Ganza
(A.K.A. Spartan)**.

Some companion-app conventions and feature ideas were inspired by the wider
VALORANT companion ecosystem, including **Valorant Tracker** and
**ValRadiant**. Credit goes to their teams for helping demonstrate the value of
accessible player statistics and streaming integrations. BYAKUGAN is an
independently directed project and is not affiliated with either product.

Approximately **99% of BYAKUGAN's implementation code has been written with AI
assistance**, primarily through **ChatGPT Work, Grok Build, and Claude**. Tyler
Ganza remains responsible for product requirements, creative decisions,
testing, review, release approval, and maintenance.

## Riot Games notice

BYAKUGAN isn't endorsed by Riot Games and doesn't reflect the views or opinions
of Riot Games or anyone officially involved in producing or managing Riot Games
properties. Riot Games, and all associated properties are trademarks or
registered trademarks of Riot Games, Inc.

## Included in version 0.8.0-beta.67

- Original desktop dashboard and navigation
- App-wide interface scaling at 100%, 125%, 150%, 175%, or 200%, applied immediately and persisted per computer without changing OBS Browser Source dimensions
- Independently scrollable page and navigation regions that keep every control accessible at increased interface scales
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
- Revised **Reactive Vision Dock** expanded state with BYAKUGAN branding and session W/L plus K/D on the left, current and all-time peak ranks stacked on the right, and duplicate fallback-rank artwork suppressed
- Larger **Reactive Vision Dock** in-match bar with a taller frame, enlarged current rank and emblem, clearer RR marker, and stream-legible session W/L plus K/D at webcam width
- Separate **Custom Overlay Builder** with a freeform high-resolution canvas, exact OBS Width and Height controls, drag placement, corner resizing, field visibility, text sizing, element opacity, alignment, text colors, canvas color, automatic saving, live preview, and one-click layout reset
- Repaired Custom Overlay Builder geometry with CSP-approved position and size styles, captured pointer dragging, out-of-canvas pointer recovery, and persistent drag/resize placement
- Continuous drag and resize feedback that keeps the selected component visibly attached to the pointer until it is dropped
- True visual Custom Overlay Builder components using live player data, rank/agent artwork, styled stat cards, BYAKUGAN branding, and the actual animated RR beam instead of placeholder option names
- Twelve reusable custom live elements: BYAKUGAN branding, Riot name, current rank, current RR, all-time peak, session W/L, session K/D, session RR movement, last-match result, agent, map, and animated RR beam
- Independent custom-canvas width and height scaling with an exact-dimension preview readout
- Repeatable drag and resize interactions without rebuilding the selected element mid-pointer gesture
- Live text-size editing without the former preview-size cap
- Independent main, label, and detail text-size controls for custom components, including session headings, branding labels, peak-rank season text, and last-match details
- Rank-emblem layers that retain a visible fallback while loading the current and peak rank artwork
- Per-element reset controls that preserve every other custom placement and the selected element's visibility
- Optional two-state custom Reactive Vision mode: the original canvas becomes the independently editable **Between Games** overlay, a second independently editable **In Game** canvas appears beneath it, and the editor grows vertically with both canvas heights while OBS automatically renders only the active state
- Independent Between Games and In Game canvas dimensions so either Reactive Vision state can be made smaller without changing the other; OBS uses the larger dimensions as a safe transparent envelope
- State-specific beam RR marker toggles, with the enabled RR label positioned immediately beyond the animated beam tip instead of covering its edge
- Beam-end markers now show signed last-match RR instead of duplicating current RR, using green for gains and red for losses
- OBS payload authorization now treats an enabled beam marker as a last-match RR consumer, preventing the live Browser Source from receiving `±0 RR` when its Last Match card is hidden
- Strict custom-layout validation clamps canvas and element geometry, rejects unknown fields and unsafe colors, and derives private data access only from the fields explicitly enabled in the custom design
- Reactive Vision preview comparison that simultaneously renders the live-data **Between Games** and **In Game** docks in one taller preview window
- Rebalanced Reactive Vision in-game dock with a larger RR beam and marker, larger session W/L and K/D, and slightly reduced rank-name text for clearer visual hierarchy at webcam width
- Reorganized Reactive Vision between-games dock with last-match result, RR movement, W/L, and K/D grouped in one enlarged summary; current RR placed beside Current Rank so the all-time peak row sits fully above the footer branding; substantially larger Session Performance labels and values; and unclipped in-game rank text that uses the available space instead of rendering an ellipsis
- Cleaner Reactive Vision in-game dock with the redundant header RR removed, W/L and K/D moved above the bar, and a full-width enlarged beam plus moving RR marker in the footer
- **Dual PC Streaming Mode** with separate **Gaming PC — Host** and **Streaming PC — Viewer** roles
- Toggleable **Gaming PC Relay Mode** that restarts into a tray-only, low-resource host without loading the dashboard renderer
- Full-speed Relay Mode collection with the same 5-second live polling, configured snapshot refresh, 40-match/20-concurrent act hydration, five-concurrent live-rank lookups, and post-match retry cadence as the full dashboard
- Relay tray controls for connection health, opening the full dashboard, refreshing data, reconnecting Riot, copying the streaming-PC URL, checking updates, disabling Relay Mode, and quitting
- Mandatory startup updates automatically reopen the full dashboard from Relay Mode so confirmation and installation cannot be missed
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
- Match Autopsy Tactical Replay with a completed-match engagement heat map, selectable round maps, kill/death markers, duel lines, timestamps, agent labels, and calibrated map callouts when Riot returns positional snapshots
- CSP-safe SVG tactical markers so every heat-map location renders at its calibrated position instead of collapsing into the map corner
- Ordered per-round engagement badges, event-list sequence numbers, and hover/focus details showing round, order, clock, opponent agent, result, and callout
- Private Riot match-clock compatibility across round-time, game-time, millisecond, and alternate-casing payload variants; match-relative fallback clocks are labeled rather than presented as round time
- Privacy-safe tactical events that identify hidden opponents only by agent and never retain or expose their Riot identity
- Post-match-only **IGL Review** with evidence-linked strengths, adjustment priorities, location clusters, opening-duel analysis, multikill conversion analysis, and round-specific coaching
- Match Autopsy post-game rosters with agents, match ranks, K/D/A, ACS, privacy-preserved names, and visible-player profile links
- Act Journey RR visualization with rank and match milestones
- Evidence-based BYAKUGAN Insights with explicit sample sizes
- Personal challenges, current-session tracking, and post-match summaries
- OBS Browser Source overlay with Awakened Rank, horizontal, compact, and vertical stream layouts
- Separate **Reactive Vision Dock** layout that stays fully awakened in menus, compresses during Agent Select and live matches, and expands inside a fixed transparent canvas when the match ends
- Post-match Reactive Vision sequence with a result-syncing state, completed-match detection, RR/result awakening pulse, and a 45-second safe fallback when Riot history is delayed
- Compact Reactive Vision state with current rank, RR beam, session W/L, and K/D while peak rank and last-match details collapse out of gameplay
- Reduced-motion support for Reactive Vision without changing the original Awakened Rank Card option
- One-click live overlay preview window with a transparent-grid backdrop and the exact data/layout OBS receives
- Original Awakened Rank stream card with current and peak-rank emblems, larger peak text, RR, session W/L, and K/D
- Animated GIF-based Awakened Rank energy beam, horizontally flipped so its blast head faces right, that is empty at 0 RR and extends or retracts with the player's current 0–100 RR progress
- Larger Awakened Rank beam with a taller footer, nearly doubled beam thickness, a stronger layered glow, and a more legible moving RR marker
- Fine-tuned Awakened Rank alignment with rank and peak text pulled toward the emblem, Last Match lowered slightly, and session W/L plus K/D shifted left
- Independent animated-beam toggle that falls back to a clean static 0–100 RR bar
- Reduced-width `480 × 190` Awakened Rank card that keeps the same height while making its information larger and more legible at stream scale
- Live background-opacity control from fully transparent at 0% to completely solid at 100%
- Awakened Rank footer with the agent/map block removed, a full left-aligned RR track, and session W/L plus K/D anchored at the lower-right
- Compact last-match RR and victory/defeat panel moved into the unused header space
- Current-RR marker positioned above the beam endpoint that slides left or right with the player's live 0–100 RR
- Automatic post-match snapshot refresh with Riot-history retries so session W/L, K/D, RR, and the overlay update even while BYAKUGAN is minimized
- Per-account current-session persistence that automatically restores W/L, K/D, RR movement, and included match IDs after an app restart or update within an 18-hour stream window
- Manual **Manage current session** recovery with recent-match checkboxes, duplicate-safe inclusion/removal, one-click latest-match recovery, and a separate **Start New Session** action that never deletes match history
- Dual-PC session recovery proxied securely through the existing private-network token so the streaming PC can repair the gaming PC session and update OBS immediately
- Session-stat merging that prioritizes the newest detailed match over a temporarily stale completed-act cache
- Active-match ID tracking so a game completed during the BYAKUGAN session counts toward W/L and K/D even when the app launched, reconnected, or restarted after that match had already begun
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
- Match-start enemy reveal boundary: every opponent card stays concealed throughout agent select and loading, then exposes only selected agent, current rank, and peak rank after Riot reports an active core game
- Active-match opponent rank hydration with five concurrent tier lookups when Riot's core-game roster reports zero for every enemy, while keeping the lookup path disabled throughout pregame
- Current and all-time peak ranks on every Live Match card, with peak episode/act context available on hover and the entire enemy rank block concealed until the core game begins
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
`release` folder. The resulting `BYAKUGAN-Setup-0.8.0-beta.67-x64.exe` installs
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
exact application version prefixed by `v`—for example `v0.8.0-beta.67`. Upload
the generated installer, its `.blockmap`, and `beta.yml` from `release/` to that
prerelease. Every subsequent release must increase the semantic version, for
example `0.8.0-beta.67`, before rebuilding and uploading all three artifacts.
The installed app reads `beta.yml` and ignores normal stable-channel releases.

The included GitHub Actions workflow automates the Windows build and GitHub
prerelease. After pushing source changes, create and push a tag matching the
version in `package.json`:

```bash
git tag v0.8.0-beta.67
git push origin v0.8.0-beta.67
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
   - Awakened rank card: `480 × 190`
   - Reactive Vision Dock: `480 × 190` fixed canvas; its visible card compresses automatically during play
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

## Gaming PC Relay Mode

1. On the gaming PC, open **Live Stream Vision → Dual PC Streaming Mode**.
2. Select **Gaming PC — Host**, then enable **Gaming PC Relay Mode**.
3. Confirm the restart. BYAKUGAN returns as a system-tray app without loading the dashboard window.
4. Right-click the tray icon and select **Copy Streaming PC URL**.
5. On the streaming PC, select **Streaming PC — Viewer**, paste that URL, and connect.

Relay Mode uses the same collection pipeline and timings as the full app. The
resource savings come from not creating the Electron dashboard renderer. Use
the tray menu to refresh, reconnect Riot, check for updates, or reopen the full
dashboard. Closing that dashboard returns the gaming PC to the tray-only relay;
select **Disable Relay Mode and restart** to restore normal startup permanently.

## Current-session recovery

BYAKUGAN saves the active session separately for each Riot account and resumes
it automatically after normal restarts and in-app updates. A saved session stays
eligible for automatic recovery for 18 hours from its most recent refresh.

To repair a session manually, select **Manage** on the Overview current-session
card or **Manage or recover session games** under Insights & Goals. Check every
recent match that belongs to the stream and select **Save Session**. The app
deduplicates the selected IDs, recalculates W/L, K/D, and RR, and republishes the
OBS overlay immediately. **Start New Session** clears only session totals; it
does not delete match history. The same controls work from the streaming-PC
viewer when both computers are running the same BYAKUGAN version.

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
- BYAKUGAN's VALORANT integration is read-only. It does not inject into game
  processes, inspect or alter game memory, modify Riot files, automate input,
  or issue gameplay-changing commands. Its file writes are confined to its own
  settings, recovery data, caches, and application updates.
- Riot's local/private endpoints are undocumented and can change. Keep the
  connector isolated and verify Riot's current policies before distribution.
- Riot prohibits opponent scouting before a match. BYAKUGAN therefore conceals
  every enemy card until the active core game begins and never looks up live
  enemy identities, stats, skins, or profiles. Current and peak competitive-rank
  summaries may be resolved only after the active core game begins, and only
  those rank summaries are retained.
- Feature availability elsewhere in the VALORANT ecosystem does not constitute
  Riot approval. Register BYAKUGAN and submit its complete user and data flows
  for Riot audit before public distribution.
- `BYAKUGAN_LOCKFILE_PATH` can override lockfile discovery for development.
  `COMPANION_LOCKFILE_PATH` remains supported for compatibility with older builds.

## Riot approval readiness

BYAKUGAN is currently a beta prototype and is not represented as an approved
Riot Games product. Before a public production release intended for official
approval, the project should:

1. Register the product and its current feature set through the Riot Developer
   Portal, then submit all material changes for audit.
2. Use Riot-supported data services wherever required and implement Riot Sign
   On (RSO) for player authorization when production access becomes available.
3. Require player opt-in before exposing identifiable player statistics to
   other users, and remove or disable any data flow Riot declines during review.
4. Publish an accessible privacy policy, terms of use, support contact, and data
   deletion process before collecting or sharing production user data.
5. Sign production installers and document the security boundaries used by the
   desktop app, overlays, and dual-PC connection.

## Suggested next milestones

1. Continue live Riot-data testing on the target Windows PC.
2. Convert the BYAKUGAN eye artwork into signed Windows icon assets.
3. Continue normalizing real match-detail payloads into richer cards.
4. Add post-match overlay animations and configurable stream themes.
5. Add account-backed sync only after selecting a backend and privacy model.
