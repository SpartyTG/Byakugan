'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SessionStore, SESSION_RESUME_WINDOW_MS, normalizeSession } = require('../src/main/session-store.cjs');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.cjs'), 'utf8');
const riot = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'services', 'riot-client.cjs'), 'utf8');

test('per-account sessions survive restarts within the recovery window', () => {
  let now = 10_000;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-session-'));
  try {
    const store = new SessionStore(directory, { now: () => now });
    store.save('account-a', {
      startedAt: 5_000,
      startingRank: 'Ascendant 1',
      startingRR: 42,
      initialized: true,
      trackedMatchIds: ['match-1', 'match-1', 'match-2'],
      excludedMatchIds: ['match-3']
    });
    const restored = store.get('account-a');
    assert.equal(restored.startedAt, 5_000);
    assert.deepEqual(restored.trackedMatchIds, ['match-1', 'match-2']);
    assert.deepEqual(restored.excludedMatchIds, ['match-3']);
    assert.equal(store.get('account-b'), null);
    now += SESSION_RESUME_WINDOW_MS + 1;
    assert.equal(store.get('account-a'), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('session files reject malformed IDs and unsafe scalar values', () => {
  const normalized = normalizeSession({
    startedAt: 'bad', startingRank: 'A'.repeat(200), startingRR: '17', initialized: 'yes',
    trackedMatchIds: ['', 'valid', 'x'.repeat(101)], excludedMatchIds: 'not-an-array'
  }, 1234);
  assert.equal(normalized.startedAt, 1234);
  assert.equal(normalized.startingRank.length, 80);
  assert.equal(normalized.startingRR, 17);
  assert.equal(normalized.initialized, false);
  assert.deepEqual(normalized.trackedMatchIds, ['valid']);
  assert.deepEqual(normalized.excludedMatchIds, []);
});

test('session recovery is available locally and over Dual PC Streaming Mode', () => {
  assert.match(html, /id="sessionModal"/);
  assert.match(html, /Manage current session/);
  assert.match(renderer, /window\.companion\.updateSession/);
  assert.match(renderer, /data-manage-session/);
  assert.match(main, /ipcMain\.handle\('session:update'/);
  assert.match(main, /updateSession:\s*\(selection\)\s*=>\s*updateSessionDataSource/);
  assert.match(riot, /restorePersistedSession\(\)/);
  assert.match(riot, /excludedMatchIds/);
});
