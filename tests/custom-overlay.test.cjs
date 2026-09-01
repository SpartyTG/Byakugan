'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { CUSTOM_ELEMENT_TYPES, normalizeCustomOverlay } = require('../src/main/custom-overlay.cjs');

const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'index.html'), 'utf8');
const overlayScript = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'overlay.js'), 'utf8');
const overlayStyles = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay', 'overlay.css'), 'utf8');

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
