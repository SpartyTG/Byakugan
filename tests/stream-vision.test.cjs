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
  assert.match(streamView, /remote-viewer-card/);
  assert.match(streamView, /stream-overlay-card/);
  assert.doesNotMatch(settingsView, /remote-viewer-card|stream-overlay-card/);
  assert.doesNotMatch(html, /Two-PC mode/);
});

test('Awakened Rank recommends the reduced-width OBS canvas', () => {
  assert.match(app, /rank:\s*\{\s*width:\s*480,\s*height:\s*190\s*\}/);
});

test('Reactive Vision Dock is offered separately on the same fixed OBS canvas', () => {
  assert.match(html, /<option value="rank">Awakened rank card<\/option><option value="reactive">Reactive Vision Dock<\/option>/);
  assert.match(app, /reactive:\s*\{\s*width:\s*480,\s*height:\s*190\s*\}/);
  assert.match(app, /The dock animates inside this fixed canvas/);
  assert.match(html, /id="streamOverlaySmoothTransitions"/);
  assert.match(html, /id="streamOverlayTransitionSound"/);
  assert.match(html, /id="previewOverlayTransitions"/);
  assert.match(app, /previewOverlay\(\{ animation: true \}\)/);
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
});

test('Live Match and completed rosters visibly include peak Episode and Act context', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8');
  assert.match(renderer, /player\.peakEpisode, player\.peakAct/);
  assert.match(renderer, /EPISODE \/ ACT UNAVAILABLE/);
  assert.match(renderer, /PEAK UNAVAILABLE/);
  assert.match(renderer, /history-player-rank/);
  assert.match(renderer, /live-rank/);
});

test('Custom Overlay Builder exposes freeform dimensions, placement, sizing, and visibility', () => {
  assert.match(html, /<option value="custom">Custom Overlay Builder<\/option>/);
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
