'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UI_SCALE_OPTIONS, normalizeUiScale, uiScaleFactor } = require('../src/main/ui-scale.cjs');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.cjs'), 'utf8');

test('UI scale accepts only the five supported Windows-style percentages', () => {
  assert.deepEqual(UI_SCALE_OPTIONS, [100, 125, 150, 175, 200]);
  assert.equal(normalizeUiScale(150), 150);
  assert.equal(normalizeUiScale(130), 100);
  assert.equal(normalizeUiScale('200'), 200);
  assert.equal(uiScaleFactor(175), 1.75);
});

test('Settings exposes every scale and applies it only to the main app window', () => {
  for (const scale of UI_SCALE_OPTIONS) assert.match(html, new RegExp(`<option value="${scale}"`));
  assert.match(main, /mainWindow\.webContents\.setZoomFactor\(factor\)/);
  assert.match(main, /setTitleBarOverlay/);
  assert.doesNotMatch(main, /overlayPreviewWindow\.webContents\.setZoomFactor/);
});
