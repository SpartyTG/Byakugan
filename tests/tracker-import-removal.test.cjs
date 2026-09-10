'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('manual Tracker summary import is absent from the shipped interface and process bridge', () => {
  const html = read('src/renderer/index.html');
  const renderer = read('src/renderer/app.js');
  const preload = read('src/main/preload.cjs');
  const main = read('src/main/index.cjs');

  for (const source of [html, renderer, preload, main]) {
    assert.doesNotMatch(source, /actSummary|act-summary|importedActSummary/);
  }
  assert.doesNotMatch(html, /Import your Tracker Act summary|Choose summary JSON/);
  assert.equal(fs.existsSync(path.join(root, 'src/main/act-summary-store.cjs')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/act-summary-ui.js')), false);
});

test('replacement does not restore JSON import or call Tracker private APIs', () => {
  const html = read('src/renderer/index.html');
  const main = read('src/main/index.cjs');
  assert.match(html, /Experimental Tracker Sync/);
  assert.doesNotMatch(html, /Choose summary JSON|Import your Tracker Act summary/);
  assert.doesNotMatch(main, /api\.tracker\.gg/);
});
