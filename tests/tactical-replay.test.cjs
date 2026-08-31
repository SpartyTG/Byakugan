'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'services', 'riot-client.cjs'), 'utf8');

test('tactical markers use CSP-safe SVG coordinates instead of blocked inline positioning', () => {
  assert.match(html, /style-src 'self'/);
  assert.match(renderer, /class="tactical-event-surface"/);
  assert.match(renderer, /class="event-badge"/);
  assert.doesNotMatch(renderer, /class="(?:heat-pulse|event-marker)[^"]*" style=/);
});

test('tactical replay supports private Riot clocks, ordered events, and hover clarification', () => {
  assert.match(service, /RoundTime/);
  assert.match(service, /GameTime/);
  assert.match(service, /sequence: eventIndex \+ 1/);
  assert.match(renderer, /data-tactical-tooltip/);
  assert.match(renderer, /Event #/);
});
