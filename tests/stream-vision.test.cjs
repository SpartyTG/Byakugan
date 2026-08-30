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
