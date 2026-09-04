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

## Sensei Vision

Sensei Vision is an optional, user-initiated post-match coaching workspace. It
never runs during a match, on page load, or across match history in bulk. A
completed match can be analyzed independently, and the resulting structured
report is saved locally under that player and match so reopening it does not
invoke the coach again.

- **Sensei Lite** is BYAKUGAN's built-in offline statistics coach. It has no
  model download, no per-use fee, and negligible resource impact.
- **Sensei** uses a model the user has installed in local Ollama for a deeper
  statistics debrief. No API key, cloud request, subscription, or per-use fee
  is required; the model temporarily consumes local CPU/GPU and memory only
  while the user asks it to run.
- **VOD Vision · Full Match** is a separate opt-in add-on. A user may attach a
  clean MP4, MKV, MOV, or WebM recording to a saved match report. The default
  Adaptive Quality Test scans the entire recording once per second, selects
  sustained-activity context windows plus periodic quiet-play audits, and then
  gives each 12-second window a deeper 16-frame review. This preserves temporal
  context while keeping each Ollama request at the image count already proven
  stable by the exhaustive pipeline. The original
  exhaustive four-second pipeline remains available as a slower comparison
  mode. BYAKUGAN removes generic HUD descriptions before they can enter the
  tactical report, reports full-scan and deep-review coverage separately, and
  checkpoints every completed review window so a paused overnight analysis can
  resume later.

Every report contains a match verdict, a five-part scorecard, up to three
strengths and weaknesses, exactly three runnable drills, one next-match focus
rule, and short statistical citations. Missing data is omitted rather than
invented. If a selected local text model cannot produce valid structured output
after automatic repair, BYAKUGAN visibly falls back to its deterministic Sensei
Lite report for that match. Connection, timeout, and missing-model failures
remain visible. The optional Ask Sensei field uses the saved report and same
match context; it does not start a new analysis.

For streamers, the recommended VOD workflow is OBS Source Record on the
streaming PC, recording only the capture-card gameplay source so the minimap is
not covered by webcam or overlay elements. Imported recordings remain in their
original location. After reading a visual report, the user may explicitly
confirm moving that exact recording to the Windows Recycle Bin; the written
report remains available. Temporary extracted images are removed after every
analysis attempt. Nothing is automatically deleted.

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

## Included in version 0.8.0-beta.112

- Completed match details now show confirmed queued groups with matching party badges whenever Riot supplies party membership
- BYAKUGAN privately remembers confirmed group membership from up to the latest 25 locally observed matches and can label matching players in a later live roster as **LIKELY PARTY A · DUO/TRIO/STACK**
- Likely party badges are explicitly presented as historical inference rather than current-match proof; first-time groups and players outside BYAKUGAN's locally observed history can remain unmarked
- Beta.111's unsuccessful per-player live membership probes were removed, eliminating repeated requests to a Riot endpoint that withheld other players' current parties
- Only opaque Riot participant identifiers grouped by completed match are stored locally; Riot party IDs never enter the history file or renderer, Agent Select opponent concealment remains unchanged, and unmarked players remain unknown rather than confirmed solo

- Ask Sensei drafts are stored per selected match and survive Riot-data, remote-host, model-status, and VOD-progress refreshes
- A focused Ask Sensei composer is no longer replaced by background report rendering, preserving typed text, keyboard focus, and cursor selection
- Sending a question clears the draft only after a successful response; failures preserve and refocus it, and a response from a previously selected match cannot overwrite the current workspace

- Missing Full Sensei citations are rebuilt deterministically from Riot's supplied K/D/A, K/D, ACS, ADR, headshot percentage, and opening-duel data instead of invalidating the entire model report
- A numberless unsupported weakness is omitted and replaced with a grounded statistical fallback when necessary, so the exact beta.108 citation failure remains **Full Sensei** without another model request
- Strong matches with no supported aggregate weakness now say so explicitly instead of treating the raw death total as evidence of a positioning problem

- Full Sensei's automatic repair retry now receives the authoritative match card, deterministic scorecard, metric bands, recent baselines, grounding rules, and safe drill patterns so Qwen can correct a rejected report without losing Full Sensei
- If both model attempts still fail, the visible fallback banner now includes the last concise validation reason instead of only saying the report was invalid

- Full Sensei scorecards now use a deterministic metric rubric instead of allowing the local language model to freely label supplied match statistics; a 1.20+ K/D, 240+ ACS, 25%+ headshot percentage, or positive opening-duel differential cannot be reversed into a LOW rating
- Sensei rejects reports that describe average/high K/D, ACS, ADR, or headshot values as low or poor, and it cannot infer poor survival, positioning, damage output, or accuracy from contradictory aggregate evidence
- Utility and economy remain **AVERAGE** unless direct ability-use or round-level economy evidence exists; total assists and deaths alone are not treated as proof of tactical quality
- Generated drills must use realistic short practice blocks and countable repetitions; extreme percentage goals and 100-round timers are rejected and automatically repaired or replaced by the grounded Lite report

- Live Match now assigns matching color-coded badges to confirmed queued groups—such as **YOUR PARTY · DUO**, **PARTY A · TRIO**, or **PARTY B · DUO**—while leaving solo and unconfirmed players unmarked; raw Riot party identifiers never reach the interface
- Players on the signed-in account's Riot block list now receive a red **BLOCKED** badge in Live Match without allowing the stored block-list name to reveal a hidden identity
- Hidden allied identities now use the same agent-only primary-label treatment as hidden opponents, so locked teammates display **Phoenix**, **Fade**, or their actual agent instead of leaving the main identity line blank; an unlocked hidden teammate displays **Selecting…**
- Agent Select now uses Riot's complete `AllyTeam.Players` collection so all random teammates appear even when those entries omit `TeamID`; the enemy roster remains fully concealed until the active core game begins
- Pregame teammate cards respect identity privacy, show public Riot IDs when available, and otherwise show only the locked agent; an unlocked or hovered selection remains **Selecting…** until Riot reports it as locked
- Pregame allies receive the same available current rank, all-time peak rank, Episode/Act, and account-level enrichment as party members without enabling any opponent lookup or pre-match scouting
- Live Match now shows the locked agent instead of the generic **Riot Player** placeholder whenever Riot marks a name as display-eligible but does not return the Riot ID; truly hidden opponents retain the separate **IDENTITY HIDDEN** state, and a public name can replace the agent automatically on a later refresh
- Party-member account levels resolved from the party or VALORANT presence payload now carry into the active core-game roster instead of being discarded when the app merges party membership, preventing lobby-visible levels from remaining stuck on **LVL SYNCING**
- Original desktop dashboard and navigation
- VOD Vision now grounds every review window to the one agent locked for the complete match; a changed agent portrait, ability bar, hands, or ability kit is classified as a spectated teammate and cannot be attributed to the reviewed player
- Competitive, Unrated, Swiftplay, and Premier analyses enforce one life per round unless the frames visibly confirm a Sage resurrection or the reviewed player is Clove using **Not Dead Yet**; ordinary same-round respawns are rejected
- Every detail window must classify player perspective and match phase before coaching; teammate spectating, Buy Phase, menus, round-end screens, uncertain perspectives, setup-only footage, and inactive windows return no findings
- The vision schema is limited to one candidate per window and now requires a confirmed self actor, separately visible decision and consequence, ordered-frame evidence, a specific alternative, and average-or-high confidence
- Semantic near-duplicate removal collapses overlapping windows, repeated-pattern cards require at least two separated and meaningfully similar observations, and vague one-off categories no longer become patterns
- Round labels are shown only when a numeric round is directly visible, and all VOD round labels are removed when their chronology moves backward or claims one round spans more than six minutes
- Visual limitations are restricted to real evidence constraints such as sampling, audio, occlusion, or invalid frames instead of repeating variations of “nothing tactical happened”
- Completed reports disclose accepted model candidates, rejected candidates, non-coachable windows, and spectator windows; reports from the earlier VOD engine display a regeneration notice
- Adaptive checkpoint version 5 and Exhaustive checkpoint version 3 prevent older, semantically incompatible findings from being resumed into the corrected truthfulness pipeline
- Visible all-time peak rank context on every revealed Live Match card, including the Episode and Act shown directly beneath the peak instead of only in a hover tooltip
- Completed Match History roster enrichment for every participant whose Riot MMR is available, showing all-time peak rank plus Episode and Act alongside that match's rank; unavailable values remain explicitly labeled rather than inferred
- Five-at-a-time peak-rank hydration with the existing short-lived player cache to keep the expanded Match History lookup bounded, including in Dual PC Streaming Mode snapshots
- Adaptive VOD requests capped at 16 ordered images per 12-second window after beta.99's 24-image requests repeatedly caused Ollama to disconnect on the test RX 6800 XT; increasing Ollama context length is not required
- Adaptive checkpoint versioning updated so an incompatible beta.99 scan checkpoint is safely replaced instead of being presented as resumable with the corrected frame rate
- A testable **Adaptive Quality Test** VOD mode that scans the full recording at low resolution, selects representative sustained-activity windows, adds global high-activity windows and periodic quiet-play audits, then performs higher-detail temporal review with the selected local vision model
- A selectable **Exhaustive** comparison mode that preserves the original consecutive four-second review pipeline and its compatible beta.98 checkpoints
- Honest adaptive reporting that separates 100% full-video scan coverage from the smaller percentage receiving deep vision-model review and explicitly warns that events between detail windows can be missed
- Mode-specific, resumable checkpoints and progress labels; switching modes clearly warns before replacing an incompatible saved checkpoint
- A 30-minute Ollama keep-alive so the selected text or vision model does not needlessly unload between local inference calls
- A dedicated **Sensei** navigation tab that explains each coaching tier, presents local readiness in context, and keeps report generation out of the general match-details modal
- A compact completed-match selector and saved coaching library inside Sensei, without duplicating the full Match History table
- A current **Next-match focus** card on Overview plus **Open in Sensei** routing from completed match details
- Optional manual **Sensei Vision** post-match coaching with disabled-by-default settings, independent per-match reports, strict structured output, saved-report reuse, recoverable failures, and no automatic or live execution
- **Sensei Lite** built into BYAKUGAN for evidence-based statistical coaching without a model download, cloud service, API key, subscription, or per-use fee
- Optional full **Sensei** through a user-installed local Ollama text model, including recent-overall, same-agent, and same-map baseline comparisons plus match-scoped Ask Sensei follow-ups
- Optional **VOD Vision · Full Match** through FFmpeg and a user-installed local vision-capable Ollama model, with clean OBS Source Record guidance, resource/readiness checks, temporary-frame cleanup, and explicit Recycle Bin removal that preserves the written report
- Dedicated green/red readiness cards for Ollama, the selected text model, the selected vision model and its advertised vision capability, FFmpeg, FFprobe, and available temporary storage
- Hard VOD-analysis gating that explains every missing prerequisite before confirmation, including the required full BYAKUGAN restart after changing the Windows PATH
- Continuous start-to-finish review in consecutive four-second sections at four ordered frames per second, producing roughly 7,200 chronologically ordered frames for a 30-minute match instead of the former 24-screenshot scan
- Immediate overnight-analysis progress with elapsed time, video timestamp, completed section count, rolling estimated time remaining, and a safe Pause action that never removes the original recording
- An analysis clock anchored to the persisted background job so navigating away from the match and returning does not reset the displayed elapsed time
- A persistent full-match ETA that remains visible through extracting, reviewing, and JSON-repair progress events instead of flashing briefly after each completed segment and returning to **Estimating remaining time**
- Accumulated active-analysis timing stored in VOD checkpoints, so **Pause safely** and Resume continue the elapsed timer without counting the time spent paused
- A persistent top-bar **VOD VISION RUNNING** indicator with segment progress, ETA, elapsed time, and one-click return to the analyzed match after navigating elsewhere in BYAKUGAN
- Per-section persistence and automatic interrupted-job recovery so completed work can resume after a pause, model failure, application close, or PC restart
- A Windows app-suspension blocker during analysis so an unattended overnight job can continue while the display turns off normally
- Tactical findings that require a visible decision, visible consequence, multi-frame evidence, and a specific adjustment or repeatable strength; generic webcam, HUD, weapon, health, and centered-crosshair descriptions are rejected
- Actionable Ollama failures that preserve the HTTP response detail and distinguish a stopped or memory-exhausted local service from invalid structured output
- Sensei structured-output repair with disabled model thinking, safe JSON-wrapper removal, one constrained retry, precomputed match-versus-baseline deltas, two-to-three-sentence verdict enforcement, concise focus rules, and three distinct Range/custom/Deathmatch drills
- Smaller-model compatibility that performs the repair pass in broadly supported Ollama JSON mode, includes the exact validation problem, and still applies BYAKUGAN's strict report validator before accepting the result
- A clearly labeled Sensei Lite fallback when the selected local text model returns unusable structured output twice, preventing a formatting mistake from discarding the completed match report while keeping connection and model-availability errors visible
- Vision-response compatibility for models that emit thinking tags, explanatory prefixes, fenced JSON, double-encoded objects, or trailing commas
- Lightweight JSON repair that sends only the failed candidate text—not the VOD frames—to the installed Sensei text model when available, with the vision model as an offline fallback
- Accurate first-batch progress that changes from model loading to **Reviewing frames 1–4** before inference begins and identifies any structured-output repair pass
- A deterministic local compatibility fallback that recovers completed summary and finding fields from usable malformed model output, validates them into BYAKUGAN's internal JSON report, and explicitly marks the result low-confidence instead of discarding the full analysis
- Local consolidation of validated four-frame reports, removing the final model-formatting request and its remaining JSON failure point while deduplicating observations and preserving timestamps
- Honest failure behavior for empty or unusable output: normalization never invents a finding, and the original recording remains untouched
- App-wide interface scaling at 100%, 125%, 150%, 175%, or 200%, applied immediately and persisted per computer without changing OBS Browser Source dimensions
- A proportionally accurate custom RR beam whose complete energy head stays anchored at the exact current-RR endpoint while its trailing beam expands or retracts smoothly
- A clearly labeled, independent **Show +/- RR on beam** control for the Between Games, In Game, and Post Match custom Reactive Vision canvases
- Live OBS transitions that honor BYAKUGAN's explicit Shift toggle instead of being silently disabled by an incorrect reduced-motion signal from OBS's embedded browser
- Independently scrollable page and navigation regions that keep every control accessible at increased interface scales
- One-click per-user Windows installation plus silent in-app updates that preserve the install scope and location, skip the repeated Setup wizard, and restart BYAKUGAN automatically
- Live Riot Client connection with automatic migration from retired Demo Mode settings
- Connector health now treats Riot's optional player-loadout `404` as unavailable cosmetic data instead of a failed core connection; authentication, match, rank, and relay failures remain visible
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
- Application-wide single-instance protection shared by the dashboard and Gaming PC Relay Mode, preventing duplicate hidden overlay servers from competing for port `43871`
- Actionable occupied-port recovery guidance that distinguishes a duplicate BYAKUGAN process from an OBS browser-cache problem
- Revised **Reactive Vision Dock** expanded state with BYAKUGAN branding and session W/L plus K/D on the left, current and all-time peak ranks stacked on the right, and duplicate fallback-rank artwork suppressed
- Larger **Reactive Vision Dock** in-match bar with a taller frame, enlarged current rank and emblem, clearer RR marker, and stream-legible session W/L plus K/D at webcam width
- Separate **Custom Overlay Builder** with a freeform high-resolution canvas, exact OBS Width and Height controls, drag placement, corner resizing, field visibility, text sizing, element opacity, alignment, text colors, canvas color, automatic saving, live preview, and one-click layout reset
- Repaired Custom Overlay Builder geometry with CSP-approved position and size styles, captured pointer dragging, out-of-canvas pointer recovery, and persistent drag/resize placement
- Continuous drag and resize feedback that keeps the selected component visibly attached to the pointer until it is dropped
- True visual Custom Overlay Builder components using live player data, rank/agent artwork, styled stat cards, BYAKUGAN branding, and the actual animated RR beam instead of placeholder option names
- Fourteen reusable custom live elements: BYAKUGAN branding, Riot name, current rank, current RR, all-time peak, session W/L, session K/D, session RR movement, last-match result, agent, map, Match Pulse, final score, and animated RR beam
- Independent custom-canvas width and height scaling with an exact-dimension preview readout
- Repeatable drag and resize interactions without rebuilding the selected element mid-pointer gesture
- Live text-size editing without the former preview-size cap
- Independent main, label, and detail text-size controls for custom components, including session headings, branding labels, peak-rank season text, and last-match details
- Independent **Show label** and **Show detail** controls for each applicable custom component on every Between Games, In Game, and Post Match canvas
- Optional embedded current RR on each custom Current Rank component, displayed as `41 / 100 RR` and backed by the same privacy-filtered OBS payload as the standalone RR element
- Rank-emblem layers that retain a visible fallback while loading the current and peak rank artwork
- Per-element reset controls that preserve every other custom placement and the selected element's visibility
- Optional three-state custom Reactive Vision mode: the original canvas becomes the independently editable **Between Games** overlay, with separate **In Game** and **Post Match** canvases beneath it; the editor grows vertically with all enabled canvas heights while OBS renders only the active state
- Independent Between Games, In Game, and Post Match canvas dimensions so any Reactive Vision state can be resized without changing the others; OBS uses the largest dimensions as a safe transparent envelope
- State-specific beam RR marker toggles, with the enabled RR label positioned immediately beyond the animated beam tip instead of covering its edge
- Beam-end markers now show signed last-match RR instead of duplicating current RR, using green for gains and red for losses
- OBS payload authorization now treats an enabled beam marker as a last-match RR consumer, preventing the live Browser Source from receiving `±0 RR` when its Last Match card is hidden
- Strict custom-layout validation clamps canvas and element geometry, rejects unknown fields and unsafe colors, and derives private data access only from the fields explicitly enabled in the custom design
- Reactive Vision preview comparison that simultaneously renders the live-data **Between Games** and **In Game** docks in one taller preview window
- Toggleable **Match Pulse** for Reactive Vision that appends an observed win/loss segment or dot after each live round, displays the current score, and leaves rounds completed before BYAKUGAN began observing as neutral rather than guessing their outcome
- Toggleable timed **Post Match Recap** with final result, score, RR gain/loss, current RR, session W/L and K/D, plus an independently editable custom Post Match canvas
- **BYAKUGAN Shift** transitions that preserve the outgoing overlay while it slides and softens, flash a violet eye with a teal chakra scan, and reveal the incoming Between Games, In Game, or Post Match canvas from the opposite direction
- Reduced-motion and instant-transition fallbacks that bypass the BYAKUGAN Shift without changing any overlay data or layout
- A dedicated **Preview transitions & beam** test sequence that safely simulates Between Games, In Game, Post Match, and RR gain/loss movement without changing live session history or the active OBS Browser Source
- Animation-preview controls that are available only for Reactive Vision layouts and automatically disable when BYAKUGAN Shift transitions are turned off
- Deterministic animation-preview playback that honors the explicit preview request even when Windows reduced-motion is enabled, with a slightly slower test-only sequence so every shift and beam movement is visible; normal OBS behavior still respects accessibility preferences
- Slower **BYAKUGAN Shift** timing with a longer eye-activation hold, while keeping the full state change close to one second during normal OBS use
- Optional **Transition audio cue**, disabled by default, using BYAKUGAN's bundled original cinematic eye-activation sound consistently in the preview and OBS
- Layered inward suction, eye snap, metallic rise, sub-bass impact, and supernatural resonance without copying or packaging audio from another property
- Preview-window autoplay support for the optional cue; OBS users can enable browser-source audio control to route the cue through the OBS mixer
- Smoother RR beam extension and retraction that eases from the previously displayed rating to the new 0–100 RR position instead of snapping
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
- Strict inspection privacy: live opponents, Riot-incognito players, and hidden identities are never inspectable, even when a public opponent's Riot name is visible
- Party-aware identity handling: current party members remain named and inspectable even when their general in-game incognito setting is enabled
- Friend-aware identity handling: Riot friends remain named and ranked regardless of incognito setting or team assignment; an opposing friend's profile stays non-clickable during the live match
- Match Autopsy with personal round-by-round impact timelines and PNG recap export
- Match Autopsy Tactical Replay with a completed-match engagement heat map, selectable round maps, kill/death markers, duel lines, timestamps, agent labels, and calibrated map callouts when Riot returns positional snapshots
- CSP-safe SVG tactical markers so every heat-map location renders at its calibrated position instead of collapsing into the map corner
- Ordered per-round engagement badges, event-list sequence numbers, and hover/focus details showing round, order, clock, opponent agent, result, and callout
- Private Riot match-clock compatibility across round-time, game-time, millisecond, and alternate-casing payload variants; match-relative fallback clocks are labeled rather than presented as round time
- Privacy-safe tactical events that identify hidden opponents only by agent and never retain or expose their Riot identity
- Post-match-only **IGL Review** with evidence-linked strengths, adjustment priorities, location clusters, opening-duel analysis, multikill conversion analysis, and round-specific coaching
- Match Autopsy post-game rosters with agents, match ranks, K/D/A, ACS, privacy-preserved names, and visible-player profile links
- Career-consistent completed-match identities: post-match rosters resolve every participant name Riot makes visible after the match, while live play resolves only public opponents after the core game begins
- Act Journey RR visualization with rank and match milestones
- Evidence-based BYAKUGAN Insights with explicit sample sizes
- Personal challenges, current-session tracking, and post-match summaries
- OBS Browser Source overlay with Awakened Rank, horizontal, compact, and vertical stream layouts
- Separate **Reactive Vision Dock** layout that stays fully awakened through menus, queue, Agent Select, and loading, then compresses only when Riot reports the active core game at the first buy phase
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
- Match-start enemy reveal boundary: every opponent card stays concealed throughout agent select and loading, then exposes the selected agent, current rank, peak rank, and public Riot name after Riot reports an active core game
- Active-match opponent rank hydration with five concurrent tier lookups when Riot's core-game roster reports zero for every enemy, while keeping the lookup path disabled throughout pregame
- Current and all-time peak ranks on every Live Match card, with peak episode/act context available on hover and the entire enemy rank block concealed until the core game begins
- Riot account levels on every revealed Live Match card, including the complete party and opponents after the core game begins, with party-payload and VALORANT lobby-presence recovery, five-second retry behavior for unresolved party levels, and **LVL SYNCING** instead of a misleading private label for queued party members
- Detailed match scores, K/D/A, K/D ratio, RR changes, and recent-game statistics
- Paginated current-act competitive W/L, K/D, and headshot statistics
- Live Match tab with map, ally/enemy rosters, agents, and competitive ranks
- Privacy-preserving player names: Riot-incognito names are never looked up or retained;
  public opponent names appear only after the active core game begins, independent of the signed-in player's **Use Generic Names** preference
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
`release` folder. The resulting `BYAKUGAN-Setup-0.8.0-beta.98-x64.exe` installs
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
exact application version prefixed by `v`—for example `v0.8.0-beta.112`. Upload
the generated installer, its `.blockmap`, and `beta.yml` from `release/` to that
prerelease. Every subsequent release must increase the semantic version, for
example `0.8.0-beta.112`, before rebuilding and uploading all three artifacts.
The installed app reads `beta.yml` and ignores normal stable-channel releases.

The included GitHub Actions workflow automates the Windows build and GitHub
prerelease. After pushing source changes, create and push a tag matching the
version in `package.json`:

```bash
git tag v0.8.0-beta.112
git push origin v0.8.0-beta.112
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
  every enemy card until the active core game begins, then displays only Riot IDs
  marked public by Riot while never exposing opponent stats, skins, or profiles. Current and peak competitive-rank
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
