'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore } = require('../src/main/settings-store.cjs');

test('SettingsStore persists allowlisted, type-safe settings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-settings-'));
  try {
    const store = new SettingsStore(directory);
    const updated = store.update({ dataMode: 'live', privacyMode: true, streamOverlayLanEnabled: true, streamOverlayLayout: 'rank', unknown: 'ignored' });
    assert.equal(updated.dataMode, 'live');
    assert.equal(updated.privacyMode, true);
    assert.equal(updated.streamOverlayLanEnabled, true);
    assert.equal(updated.streamOverlayLayout, 'rank');
    assert.equal(updated.unknown, undefined);

    const restored = new SettingsStore(directory).get();
    assert.equal(restored.dataMode, 'live');
    assert.equal(restored.privacyMode, true);
    assert.equal(restored.streamOverlayLanEnabled, true);
    assert.equal(restored.streamOverlayLayout, 'rank');

    const rejected = store.update({ dataMode: 'invalid', refreshSeconds: -1, privacyMode: 'yes' });
    assert.equal(rejected.dataMode, 'live');
    assert.equal(rejected.refreshSeconds, 30);
    assert.equal(rejected.privacyMode, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
