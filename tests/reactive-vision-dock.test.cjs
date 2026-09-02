'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'overlay.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'overlay.css'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.cjs'), 'utf8');

test('Reactive Vision Dock stays expanded through agent select and compacts at the active core game', () => {
  assert.match(script, /\['INGAME', 'CORE_GAME'\]/);
  assert.doesNotMatch(script, /\['PREGAME', 'INGAME', 'CORE_GAME'\]/);
  assert.match(script, /reactive-compact/);
  assert.match(styles, /\.layout-reactive\.reactive-compact\s*\{\s*height:\s*148px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact\.hide-match-pulse\s*\{\s*height:\s*130px/);
  assert.match(styles, /\.layout-reactive\s*\{[\s\S]*height:\s*170px/);
});

test('compact Reactive Vision Dock remains legible at webcam width', () => {
  assert.match(styles, /\.layout-reactive\.reactive-compact \.player-copy strong[^}]*font-size:\s*21px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.player-copy strong[^}]*overflow:\s*visible[^}]*text-overflow:\s*clip/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.player-copy em[^}]*display:\s*none/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.reactive-menu-panel[^}]*right:\s*26px[^}]*width:\s*190px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.reactive-menu-session > small[^}]*font-size:\s*9px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.reactive-menu-session b[^}]*font-size:\s*9px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.reactive-menu-session strong[^}]*font-size:\s*22px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.reactive-session-kd strong[^}]*font-size:\s*20px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.rank-session-record[^}]*display:\s*none/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.current-rr-marker strong[^}]*font-size:\s*14px/);
  assert.match(styles, /\.layout-reactive\.reactive-compact \.rr-energy-beam[^}]*top:\s*24px/);
  assert.match(styles, /@media \(max-width:\s*420px\)[\s\S]*\.layout-reactive\.reactive-compact \.reactive-menu-panel[^}]*right:\s*8px[^}]*width:\s*176px/);
  assert.match(styles, /@media \(max-width:\s*420px\)[\s\S]*\.layout-reactive\.reactive-compact \.player-block[^}]*padding-right:\s*184px/);
  assert.match(styles, /@media \(max-width:\s*420px\)[\s\S]*\.layout-reactive\.reactive-compact \.player-copy strong[^}]*font-size:\s*18px/);
  assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.layout-horizontal\.layout-reactive[^}]*grid-template-columns:\s*minmax\(0,1fr\) 112px/);
});

test('Reactive Vision preview simultaneously shows between-games, in-game, and optional post-match docks', () => {
  assert.match(script, /function renderReactivePreviewComparison/);
  assert.match(script, /BETWEEN GAMES/);
  assert.match(script, /IN GAME/);
  assert.match(script, /POST MATCH/);
  assert.match(script, /preferences\.postMatchRecap === false/);
  assert.match(script, /cloneNode\(true\)/);
  assert.match(styles, /\.reactive-preview-comparison/);
  assert.match(main, /reactive:\s*animationPreview \? \[620, 300\] : \[620, overlaySettings\.streamOverlayPostMatchRecap === false \? 490 : 700\]/);
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
  assert.match(styles, /body:not\(\.transition-preview-mode\) \.layout-reactive, body:not\(\.transition-preview-mode\) \.layout-reactive \*/);
});

test('BYAKUGAN Shift preserves an outgoing frame and animates the incoming state', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'index.html'), 'utf8');
  assert.match(html, /id="byakuganShiftEffect"/);
  assert.match(script, /function captureVisionGhost/);
  assert.match(script, /cloneNode\(true\)/);
  assert.match(script, /function runByakuganShift/);
  assert.match(script, /captured\.ghost\.animate/);
  assert.match(script, /activeShiftAnimation = overlay\.animate/);
  assert.match(script, /renderedVisionState !== anticipatedState/);
  assert.match(script, /preferences\.smoothTransitions !== false/);
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(script, /if \(latestOverlayData\) render\(latestOverlayData\)/);
  assert.match(script, /overlay\.classList\.remove\(\.\.\.OVERLAY_LAYOUT_CLASSES\)/);
  assert.doesNotMatch(script, /overlay\.className = `overlay layout-/);
  assert.match(styles, /BYAKUGAN Shift/);
  assert.match(styles, /\.byakugan-shift-effect\.active/);
  assert.match(styles, /@keyframes byakugan-shift-eye/);
  assert.match(styles, /@keyframes byakugan-shift-scan/);
});

test('BYAKUGAN Shift has a longer eye hold and optional original audio cue', () => {
  assert.match(script, /function playByakuganShiftSound/);
  assert.match(script, /preferences\.transitionSound !== true/);
  assert.match(script, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(script, /createOscillator/);
  assert.match(script, /createBufferSource/);
  assert.match(script, /playByakuganShiftSound\(latestOverlayData\?\.preferences\)/);
  assert.match(script, /transitionPreviewMode \? 1_450 : 1_000/);
  assert.match(styles, /animation:\s*byakugan-shift-eye 1\.03s/);
  assert.match(styles, /76% \{ opacity:\s*1/);
  assert.match(main, /autoplay-policy', 'no-user-gesture-required/);
});

test('Reactive Vision can safely preview the complete transition and RR beam sequence', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.cjs'), 'utf8');
  assert.match(renderer, /function syncTransitionPreviewControl/);
  assert.match(renderer, /previewOverlay\(\{ animation: true \}\)/);
  assert.match(preload, /previewOverlay: \(options = \{\}\)/);
  assert.match(main, /const animationPreview = options\?\.animation === true/);
  assert.match(main, /previewUrl\.searchParams\.set\('animation', '1'\)/);
  assert.match(script, /const transitionPreviewMode = previewMode && previewParameters\.get\('animation'\) === '1'/);
  assert.match(script, /function startTransitionPreview/);
  assert.match(script, /showTransitionPreviewState\('between'/);
  assert.match(script, /showTransitionPreviewState\('ingame'/);
  assert.match(script, /showTransitionPreviewState\('postmatch'/);
  assert.match(script, /Preview data only — OBS is unchanged/);
  assert.match(script, /const reduceMotion = !transitionPreviewMode && window\.matchMedia/);
  assert.match(script, /transitionPreviewMode \? 1_450 : 1_000/);
  assert.match(styles, /\.transition-preview-badge/);
  assert.match(styles, /body:not\(\.transition-preview-mode\) \.byakugan-shift-effect/);
  assert.match(styles, /\.transition-preview-mode \.byakugan-shift-effect\.active/);
});

test('Reactive Vision Match Pulse and post-match recap are animated, optional states', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'index.html'), 'utf8');
  assert.match(html, /id="reactiveRoundPulse"/);
  assert.match(html, /id="reactiveLiveScore"/);
  assert.match(html, /class="reactive-postmatch-recap"/);
  assert.match(html, /id="reactiveRecapResult"/);
  assert.match(script, /function renderMatchPulse/);
  assert.match(script, /preferences\.matchPulse/);
  assert.match(script, /reactiveRecapActive/);
  assert.match(script, /preferences\.postMatchRecapSeconds/);
  assert.match(styles, /\.layout-reactive\.reactive-compact:not\(\.hide-match-pulse\) \.reactive-match-pulse/);
  assert.match(styles, /\.layout-reactive\.reactive-recap-active/);
  assert.match(styles, /--recap-beam-progress/);
  assert.match(styles, /\.layout-reactive\.motion-instant/);
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
  assert.match(styles, /\.layout-reactive \.reactive-menu-session > small[^}]*font-size:\s*9px/);
  assert.match(styles, /\.layout-reactive \.reactive-menu-session b[^}]*font-size:\s*9px/);
  assert.match(styles, /\.layout-reactive \.reactive-menu-session strong[^}]*font-size:\s*18px/);
  assert.match(styles, /\.layout-reactive \.reactive-menu-ranks[^}]*grid-template-rows:\s*auto auto[^}]*align-content:\s*start/);
  assert.match(styles, /\.layout-reactive \.reactive-menu-ranks[^}]*transform:\s*translate\(-7px,-4px\)/);
  assert.match(styles, /\.layout-reactive \.reactive-current-rank \.reactive-rank-copy[^}]*grid-template-columns:\s*max-content auto/);
  assert.match(styles, /\.layout-reactive \.reactive-rank-copy em[^}]*grid-column:\s*2[^}]*grid-row:\s*2/);
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
