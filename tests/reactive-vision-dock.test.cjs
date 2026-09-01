'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'overlay.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'overlay.css'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.cjs'), 'utf8');

test('Reactive Vision Dock compacts for agent select and live games', () => {
  assert.match(script, /\['PREGAME', 'INGAME', 'CORE_GAME'\]/);
  assert.match(script, /reactive-compact/);
  assert.match(styles, /\.layout-reactive\.reactive-compact\s*\{\s*height:\s*88px/);
  assert.match(styles, /\.layout-reactive\s*\{[\s\S]*height:\s*170px/);
});

test('Reactive Vision Dock expands, waits for post-match data, then awakens', () => {
  assert.match(script, /matchJustEnded/);
  assert.match(script, /reactivePostMatchPending/);
  assert.match(script, /matchKey !== lastMatchKey/);
  assert.match(script, /reactive-awakening/);
  assert.match(styles, /SYNCING RESULT/);
  assert.match(styles, /@keyframes reactive-awaken/);
});

test('Reactive Vision Dock keeps OBS dimensions fixed and supports reduced motion', () => {
  assert.match(main, /reactive:\s*\[590,\s*270\]/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /\.layout-reactive, \.layout-reactive \*/);
});

test('Awakened Rank remains a separate untouched layout selector', () => {
  assert.match(styles, /\/\* Awakened Rank/);
  assert.match(styles, /\.layout-rank\s*\{/);
  assert.match(styles, /\/\* Reactive Vision Dock/);
  assert.doesNotMatch(styles, /\.layout-rank\.reactive-compact/);
});
