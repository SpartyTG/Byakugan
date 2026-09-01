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
  assert.match(styles, /\.layout-reactive\.reactive-compact\s*\{\s*height:\s*130px/);
  assert.match(styles, /\.layout-reactive\s*\{[\s\S]*height:\s*170px/);
});

test('compact Reactive Vision Dock remains legible at webcam width', () => {
  assert.match(styles, /\.layout-reactive\.reactive-compact \.player-copy strong[^}]*font-size:\s*21px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.player-copy em[^}]*display:\s*none/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.reactive-menu-session strong[^}]*font-size:\s*16px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.reactive-session-kd strong[^}]*font-size:\s*14px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.rank-session-record[^}]*display:\s*none/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.current-rr-marker strong[^}]*font-size:\s*14px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.rr-energy-beam[^}]*top:\s*24px/);
});

test('Reactive Vision preview simultaneously shows between-games and in-game docks', () => {
  assert.match(script, /function renderReactivePreviewComparison/);
  assert.match(script, /BETWEEN GAMES/);
  assert.match(script, /IN GAME/);
  assert.match(script, /cloneNode\(true\)/);
  assert.match(styles, /\.reactive-preview-comparison/);
  assert.match(main, /reactive:\s*\[620,\s*490\]/);
});

test('Reactive Vision Dock expands, waits for post-match data, then awakens', () => {
  assert.match(script, /matchJustEnded/);
  assert.match(script, /reactivePostMatchPending/);
  assert.match(script, /matchKey !== lastMatchKey/);
  assert.match(script, /reactive-awakening/);
  assert.match(styles, /SYNCING RESULT/);
  assert.match(styles, /@keyframes reactive-awaken/);
});

test('Reactive Vision Dock supports reduced motion', () => {
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /\.layout-reactive, \.layout-reactive \*/);
});

test('Awakened Rank remains a separate untouched layout selector', () => {
  assert.match(styles, /\/\* Awakened Rank/);
  assert.match(styles, /\.layout-rank\s*\{/);
  assert.match(styles, /\/\* Reactive Vision Dock/);
  assert.doesNotMatch(styles, /\.layout-rank\.reactive-compact/);
});

test('expanded Reactive Vision Dock groups last match with session and vertically stacks equal ranks', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'index.html'), 'utf8');
  assert.match(html, /class="reactive-menu-left"/);
  assert.match(html, /id="reactiveSessionRecord"/);
  assert.match(html, /id="reactiveSessionKd"/);
  assert.match(html, /id="reactiveLastMatchRR"/);
  assert.match(html, /id="reactiveLastMatchResult"/);
  assert.match(html, /class="reactive-current-rank"/);
  assert.match(html, /class="reactive-peak-rank"/);
  assert.match(styles, /grid-template-columns:\s*43% 57%/);
  assert.match(styles, /\.layout-reactive \.reactive-menu-ranks[^}]*grid-template-rows:\s*1fr 1fr/);
  assert.match(styles, /\.layout-reactive \.reactive-peak-rank[^}]*border-top:/);
  assert.match(styles, /\.layout-reactive \.reactive-rank-emblem[^}]*width:\s*40px[^}]*height:\s*40px/);
  assert.match(styles, /\.layout-reactive \.reactive-peak-copy strong[^}]*font-size:\s*15px/);
  assert.match(styles, /\.layout-reactive:not\(\.reactive-compact\) > \.brand-block[^}]*bottom:\s*7px/);
  assert.match(styles, /\.layout-reactive:not\(\.reactive-compact\) \.player-block > \.rank-emblem/);
  assert.match(styles, /\.layout-reactive \.rank-emblem \[hidden\][\s\S]*display:\s*none !important/);
  assert.match(script, /#reactiveSessionRecord/);
  assert.match(script, /#reactiveLastMatchRR/);
  assert.match(script, /#reactivePlayerPeakRank/);
});
