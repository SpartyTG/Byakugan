'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

test('Live Stream Vision owns the overlay and dual-PC controls', () => {
  assert.match(html, /data-view="stream"[^>]*>.*Stream Vision/s);
  const streamStart = html.indexOf('id="view-stream"');
  const settingsStart = html.indexOf('id="view-settings"');
  assert.ok(streamStart > 0 && settingsStart > streamStart);

  const streamView = html.slice(streamStart, settingsStart);
  const settingsView = html.slice(settingsStart);
  assert.match(streamView, /Dual PC Streaming Mode/);
  assert.match(streamView, /STEP-BY-STEP SETUP/);
  assert.match(streamView, /Gaming PC — Host/);
  assert.match(streamView, /Allow Remote Viewer/);
  assert.match(streamView, /Copy connection URL/);
  assert.match(streamView, /Streaming PC — Viewer/);
  assert.match(streamView, /Gaming PC connected/);
  assert.match(streamView, /OBS on streaming PC/);
  assert.match(streamView, /remote-viewer-card/);
  assert.match(streamView, /stream-overlay-card/);
  assert.doesNotMatch(settingsView, /remote-viewer-card|stream-overlay-card/);
  assert.doesNotMatch(html, /Two-PC mode/);
});

test('Custom Overlay Builder is the only Stream Vision layout and owns visibility', () => {
  assert.doesNotMatch(html, /id="streamOverlayLayout"/);
  assert.doesNotMatch(html, /Awakened rank card|Horizontal bar|Compact card|Vertical panel/);
  assert.doesNotMatch(html, /VISIBLE FIELDS/);
  assert.doesNotMatch(html, /id="streamOverlayShow(?:Identity|Wl|Kd|Agent|Map|RR|PeakRank|RrChange)"/);
  assert.match(html, /<section class="custom-overlay-builder" id="customOverlayBuilder">/);
  assert.match(html, /data-overlay-profile="landscape"/);
  assert.match(html, /data-overlay-profile="portrait"/);
  assert.match(html, /Twitch · YouTube · 16:9 scenes/);
  assert.match(html, /TikTok · Shorts · 9:16 scenes/);
  assert.match(html, /id="copyOverlayUrl"[^>]*>Copy Landscape URL/);
  assert.match(html, /id="copyPortraitOverlayUrl"[^>]*>Copy Portrait URL/);
  assert.match(app, /activeCustomOverlayKey/);
  assert.match(app, /streamOverlayCustomPortrait/);
  assert.match(html, /id="streamOverlaySmoothTransitions"/);
  assert.match(html, /id="streamOverlayTransitionSound"/);
  assert.match(html, /id="previewOverlayTransitions"/);
  assert.match(app, /previewOverlay\(\{ animation: true, profile: state\.customOverlayProfile \}\)/);
  assert.match(html, /id="streamOverlayMatchPulse"/);
  assert.match(html, /id="streamOverlayPostMatchRecap"/);
  assert.match(html, /id="streamOverlayPostMatchRecapSeconds"/);
});

test('Live Match renders an account-level badge for every revealed roster card', () => {
  assert.match(app, /player\.partyMember \? 'LVL SYNCING'/);
  assert.match(app, /levelIsHidden \? 'LVL HIDDEN' : 'LVL PRIVATE'/);
  assert.match(app, /class="live-player-level/);
  assert.match(app, /Level, agent, and ranks reveal after the match begins/);
  assert.match(app, /const hiddenIdentity = Boolean\(player\.hidden\)/);
  assert.match(app, /const agentOnly = hiddenIdentity \|\| unresolvedIdentity/);
  assert.match(app, /const unresolvedIdentity = Boolean/);
  assert.match(app, /RIOT NAME UNAVAILABLE/);
  assert.doesNotMatch(app, /escapeHtml\(player\.name \|\| 'Riot Player'\)/);
  assert.match(app, /IDENTITY HIDDEN/);
  assert.match(app, /class="live-party-badge party-tone-/);
  assert.match(app, /These players queued together/);
  assert.match(app, /Inferred from/);
  assert.match(app, /not guaranteed/);
  assert.match(app, /class="live-blocked-badge"/);
  assert.match(app, /You previously blocked this Riot account/);
});

test('Live Match and completed rosters visibly include peak Episode and Act context', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8');
  assert.match(renderer, /player\.peakEpisode, player\.peakAct/);
  assert.match(renderer, /EPISODE \/ ACT UNAVAILABLE/);
  assert.match(renderer, /PEAK UNAVAILABLE/);
  assert.match(renderer, /history-player-rank/);
  assert.match(renderer, /live-rank/);
});

test('completed Match History roster displays every available account level', () => {
  assert.match(app, /class="history-player-level"/);
  assert.match(app, /const levelLabel = hasLevel \? `LVL/);
  assert.match(app, /: 'LVL PRIVATE'/);
});

test('Loadout distinguishes an empty Riot collection from an unavailable response', () => {
  assert.match(app, /const status = state\.snapshot\?\.loadoutStatus/);
  assert.match(app, /Riot returned an empty equipped collection/);
  assert.match(app, /Riot did not return your equipped collection/);
  assert.match(app, /Keep Riot Client and VALORANT open, then select Refresh Data/);
});

test('routine snapshots stay silent and act completion notifies only after real hydration', () => {
  const snapshotHandler = app.match(/window\.companion\.onSnapshot\(\(snapshot\) => \{[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.doesNotMatch(snapshotHandler, /toast\(/);
  assert.match(app, /const wasLoading = state\.actStatsHydrationActive/);
  assert.match(app, /if \(wasLoading && !isLoading\)/);
  assert.match(app, /finished refreshing your current-act competitive history/);
});

test('Overview reads every indexed result as wins, losses, and draws', () => {
  assert.match(app, /\['WINS \/ LOSSES \/ DRAWS'/);
  assert.match(app, /profile\.draws/);
  assert.match(app, /DETAILED MATCHES/);
});

test('Custom Overlay Builder exposes freeform dimensions, placement, sizing, and visibility', () => {
  assert.match(html, /<strong>Custom Overlay Builder<\/strong>/);
  assert.match(html, /id="customOverlayWidth"/);
  assert.match(html, /id="customOverlayHeight"/);
  assert.match(html, /id="customOverlayInGameWidth"/);
  assert.match(html, /id="customOverlayInGameHeight"/);
  assert.match(html, /id="customOverlayPostMatchWidth"/);
  assert.match(html, /id="customOverlayPostMatchHeight"/);
  assert.match(html, /id="customOverlayShowBeamRR"/);
  assert.match(html, /id="customEditorCanvas"/);
  assert.match(html, /id="customEditorCanvasInGame"/);
  assert.match(html, /id="customEditorCanvasPostMatch"/);
  assert.match(html, /id="customElementPalette"/);
  assert.match(html, /id="customElementX"/);
  assert.match(html, /id="customElementFontSize"/);
  assert.match(html, /id="customElementColor"/);
  assert.match(html, /id="customOverlayAnimatedRrBeam"/);
  assert.match(html, /id="resetSelectedCustomElement"/);
  assert.match(app, /beginCustomElementDrag/);
  assert.match(app, /persistCustomOverlay/);
  assert.match(app, /Reactive Vision Mode/);
  assert.match(app, /config\.inGameElements/);
  assert.match(app, /config\.postMatchElements/);
});
