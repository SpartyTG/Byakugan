'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { CUSTOM_ELEMENT_TYPES, normalizeCustomOverlay } = require('../src/main/custom-overlay.cjs');

const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'index.html'), 'utf8');
const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'overlay.js'), 'utf8');
const overlayStyles = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'overlay.css'), 'utf8');
const rendererHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const rendererScript = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const rendererStyles = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');

test('custom overlay schema always returns the complete allowlisted element set', () => {
  const normalized = normalizeCustomOverlay({ elements: [{ id: 'branding', visible: false }, { id: 'evil', visible: true }] });
  assert.deepEqual(normalized.elements.map((element) => element.id), [...CUSTOM_ELEMENT_TYPES]);
  assert.equal(normalized.elements.find((element) => element.id === 'branding').visible, false);
  assert.equal(normalized.elements.some((element) => element.id === 'evil'), false);
});

test('custom OBS renderer uses validated layout data and safe DOM construction', () => {
  assert.match(overlayHtml, /id="customOverlayCanvas"/);
  assert.match(overlayScript, /function renderCustomOverlay/);
  assert.match(overlayScript, /document\.createElement/);
  assert.doesNotMatch(overlayScript, /customOverlayCanvas[^\n]*innerHTML/);
  assert.match(overlayStyles, /\.layout-custom/);
  assert.match(overlayStyles, /body\.custom-layout\s*\{\s*padding:\s*0/);
  assert.match(overlayStyles, /\.custom-overlay-item/);
  assert.match(overlayStyles, /--custom-beam-progress/);
});

test('custom editor permits validated geometry and supports captured pointer dragging', () => {
  assert.match(rendererHtml, /style-src-attr 'unsafe-inline'/);
  assert.match(rendererScript, /style="left:\$\{element\.x\}%/);
  assert.match(rendererScript, /setPointerCapture/);
  assert.match(rendererScript, /pointercancel/);
  assert.match(rendererScript, /element\.x = Math\.max\(0, Math\.min\(100 - element\.width/);
  assert.match(rendererScript, /element\.y = Math\.max\(0, Math\.min\(100 - element\.height/);
});

test('custom editor renders visual components instead of text placeholders', () => {
  assert.doesNotMatch(rendererScript, /CUSTOM_OVERLAY_SAMPLES/);
  assert.match(rendererScript, /function customOverlayEditorMarkup/);
  assert.match(rendererScript, /custom-editor-eye/);
  assert.match(rendererScript, /\.\.\/overlay\/rr-energy-beam\.gif/);
  assert.match(rendererStyles, /\.custom-editor-beam-fill/);
  assert.match(rendererStyles, /--custom-editor-beam-progress/);
  assert.match(rendererStyles, /\.custom-editor-icon/);
});

test('custom editor independently scales canvas axes and applies uncapped text sizing', () => {
  assert.match(rendererScript, /canvas\.style\.width = `\$\{Math\.round\(dimensions\.width \* scale\)\}px`/);
  assert.match(rendererScript, /canvas\.style\.height = `\$\{Math\.round\(dimensions\.height \* scale\)\}px`/);
  assert.doesNotMatch(rendererScript, /availableHeight\s*=\s*Math\.max\([^\n]*stage\.clientHeight/);
  assert.match(rendererScript, /--custom-font-size:\$\{Math\.max\(3,element\.fontSize \* scale\)\}px/);
  assert.doesNotMatch(rendererScript, /Math\.min\(18,element\.fontSize/);
  assert.match(rendererStyles, /font-size:\s*var\(--custom-font-size/);
});

test('every custom component can be reset without resetting the full layout', () => {
  assert.match(rendererScript, /function resetCustomElement\(id\)/);
  assert.match(rendererScript, /data-custom-reset=/);
  assert.match(rendererHtml, /id="resetSelectedCustomElement"/);
  assert.match(rendererScript, /Object\.assign\(element,[^\n]*\{ visible \}\)/);
});

test('rank components keep a visible emblem layer and load the actual rank image above it', () => {
  assert.match(rendererScript, /custom-editor-icon-shell/);
  assert.match(rendererScript, /custom-editor-icon-fallback/);
  assert.match(overlayScript, /custom-icon-shell/);
  assert.match(overlayScript, /custom-icon-image/);
  assert.match(overlayStyles, /\.custom-overlay-item \.custom-icon-image/);
});

test('custom Reactive Vision turns the base canvas into between-games and adds an in-game canvas below', () => {
  assert.equal(CUSTOM_ELEMENT_TYPES.includes('reactiveDock'), false);
  assert.match(rendererScript, /data-custom-reactive-visible/);
  assert.match(rendererHtml, /id="customEditorCanvas"[^>]*data-custom-canvas-state="between"/);
  assert.match(rendererHtml, /id="customEditorCanvasInGame"[^>]*data-custom-canvas-state="ingame"/);
  assert.match(rendererScript, /function customElementsForState/);
  assert.match(rendererScript, /renderCustomEditorCanvas\(betweenCanvas, config\.elements/);
  assert.match(rendererScript, /renderCustomEditorCanvas\(inGameCanvas, config\.inGameElements/);
  assert.match(rendererScript, /Math\.max\(config\.width, config\.inGameWidth/);
  assert.match(rendererScript, /In game \$\{config\.inGameWidth\} × \$\{config\.inGameHeight\}/);
  assert.match(overlayScript, /const elements = compact \? config\.inGameElements : config\.elements/);
  assert.doesNotMatch(overlayScript, /element\.id === 'reactiveDock'/);
});

test('beta.60 and beta.61 Reactive Vision settings migrate into two-canvas mode', () => {
  const migrated = normalizeCustomOverlay({ elements: [
    { id: 'reactiveBetween', visible: true, x: 24, y: 3.8, width: 94, height: 42 },
    { id: 'reactiveInGame', visible: true, x: 3, y: 55, width: 94, height: 36 }
  ] });
  assert.equal(migrated.reactive, true);
  assert.equal(migrated.elements.length, CUSTOM_ELEMENT_TYPES.length);
  assert.equal(migrated.inGameElements.length, CUSTOM_ELEMENT_TYPES.length);
  assert.equal(migrated.elements.some((element) => element.id === 'reactiveBetween'), false);
  assert.equal(migrated.elements.some((element) => element.id === 'reactiveInGame'), false);

  const beta61 = normalizeCustomOverlay({ elements: [{ id: 'reactiveDock', visible: true }] });
  assert.equal(beta61.reactive, true);
  assert.equal(beta61.inGameWidth, beta61.width);
  assert.equal(beta61.inGameHeight, beta61.height);
  assert.equal(beta61.elements.some((element) => element.id === 'reactiveDock'), false);
});

test('Reactive Vision canvas dimensions and beam RR markers are independent by state', () => {
  const normalized = normalizeCustomOverlay({
    reactive: true,
    width: 1200,
    height: 420,
    inGameWidth: 640,
    inGameHeight: 220,
    elements: [{ id: 'rrBeam', showMarker: true }],
    inGameElements: [{ id: 'rrBeam', showMarker: false }]
  });
  assert.equal(normalized.width, 1200);
  assert.equal(normalized.height, 420);
  assert.equal(normalized.inGameWidth, 640);
  assert.equal(normalized.inGameHeight, 220);
  assert.equal(normalized.elements.find((element) => element.id === 'rrBeam').showMarker, true);
  assert.equal(normalized.inGameElements.find((element) => element.id === 'rrBeam').showMarker, false);
  assert.match(rendererHtml, /id="customOverlayInGameWidth"/);
  assert.match(rendererHtml, /id="customOverlayInGameHeight"/);
  assert.match(rendererHtml, /id="customOverlayShowBeamRR"/);
  assert.match(overlayScript, /if \(element\.showMarker !== false\)/);
  assert.match(overlayStyles, /calc\(var\(--custom-beam-progress,0%\) \+ \.25em\)/);
});
