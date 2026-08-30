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
    const updated = store.update({
      dataMode: 'mock', privacyMode: true, streamOverlayLanEnabled: true, streamOverlayLayout: 'rank',
      pcRole: 'viewer', remoteViewerEnabled: true,
      remoteViewerToken: 'b'.repeat(48),
      remoteSourceUrl: `http://192.168.50.99:43871/remote/${'c'.repeat(48)}`,
      streamOverlayShowWl: false, streamOverlayShowKd: false, streamOverlayShowAgent: false,
      streamOverlayShowMap: false, streamOverlayShowPeakRank: false,
      streamOverlayShowRrChange: false, streamOverlayAnimatedRrBeam: false, unknown: 'ignored'
    });
    assert.equal(updated.dataMode, undefined);
    assert.equal(updated.privacyMode, true);
    assert.equal(updated.streamOverlayLanEnabled, true);
    assert.equal(updated.pcRole, 'viewer');
    assert.equal(updated.remoteViewerEnabled, true);
    assert.match(updated.remoteSourceUrl, /^http:\/\/192\.168\.50\.99/);
    assert.equal(updated.streamOverlayLayout, 'rank');
    assert.equal(updated.streamOverlayShowWl, false);
    assert.equal(updated.streamOverlayShowKd, false);
    assert.equal(updated.streamOverlayShowAgent, false);
    assert.equal(updated.streamOverlayShowMap, false);
    assert.equal(updated.streamOverlayShowPeakRank, false);
    assert.equal(updated.streamOverlayShowRrChange, false);
    assert.equal(updated.streamOverlayAnimatedRrBeam, false);
    assert.equal(updated.unknown, undefined);

    const restored = new SettingsStore(directory).get();
    assert.equal(restored.dataMode, undefined);
    assert.equal(restored.privacyMode, true);
    assert.equal(restored.streamOverlayLanEnabled, true);
    assert.equal(restored.streamOverlayLayout, 'rank');
    assert.equal(restored.streamOverlayShowAgent, false);
    assert.equal(restored.streamOverlayShowMap, false);
    assert.equal(restored.streamOverlayShowPeakRank, false);
    assert.equal(restored.streamOverlayAnimatedRrBeam, false);

    const rejected = store.update({
      dataMode: 'live', refreshSeconds: -1, privacyMode: 'yes', pcRole: 'relay',
      remoteSourceUrl: `http://203.0.113.8:43871/remote/${'d'.repeat(48)}`
    });
    assert.equal(rejected.dataMode, undefined);
    assert.equal(rejected.refreshSeconds, 30);
    assert.equal(rejected.privacyMode, true);
    assert.equal(rejected.pcRole, 'viewer');
    assert.match(rejected.remoteSourceUrl, /^http:\/\/192\.168\.50\.99/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SettingsStore migrates the combined legacy agent and map preference', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-settings-migration-'));
  try {
    fs.writeFileSync(path.join(directory, 'settings.json'), JSON.stringify({ dataMode: 'mock', streamOverlayShowAgentMap: false }));
    const restored = new SettingsStore(directory).get();
    assert.equal(restored.streamOverlayShowAgent, false);
    assert.equal(restored.streamOverlayShowMap, false);
    assert.equal(restored.streamOverlayShowAgentMap, undefined);
    assert.equal(restored.dataMode, undefined);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
