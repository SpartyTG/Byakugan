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
      pcRole: 'viewer', gamingRelayMode: true, remoteViewerEnabled: true,
      remoteViewerToken: 'b'.repeat(48),
      remoteSourceUrl: `http://192.168.50.99:43871/remote/${'c'.repeat(48)}`,
      streamOverlayShowWl: false, streamOverlayShowKd: false, streamOverlayShowAgent: false,
      streamOverlayShowMap: false, streamOverlayShowPeakRank: false,
      streamOverlayShowRrChange: false, streamOverlayAnimatedRrBeam: false,
      streamOverlaySmoothTransitions: false, streamOverlayTransitionSound: true, streamOverlayMatchPulse: true,
      streamOverlayMatchPulseStyle: 'dots', streamOverlayPostMatchRecap: false,
      streamOverlayPostMatchRecapSeconds: 10,
      streamOverlayBackgroundOpacity: 0, uiScale: 175, unknown: 'ignored'
    });
    assert.equal(updated.dataMode, undefined);
    assert.equal(updated.privacyMode, true);
    assert.equal(updated.streamOverlayLanEnabled, true);
    assert.equal(updated.pcRole, 'viewer');
    assert.equal(updated.gamingRelayMode, true);
    assert.equal(updated.remoteViewerEnabled, true);
    assert.match(updated.remoteSourceUrl, /^http:\/\/192\.168\.50\.99/);
    assert.equal(updated.streamOverlayLayout, 'custom');
    assert.equal(updated.streamOverlayShowWl, undefined);
    assert.equal(updated.streamOverlayShowKd, undefined);
    assert.equal(updated.streamOverlayShowAgent, undefined);
    assert.equal(updated.streamOverlayShowMap, undefined);
    assert.equal(updated.streamOverlayShowPeakRank, undefined);
    assert.equal(updated.streamOverlayShowRrChange, undefined);
    assert.equal(updated.streamOverlayAnimatedRrBeam, false);
    assert.equal(updated.streamOverlaySmoothTransitions, false);
    assert.equal(updated.streamOverlayTransitionSound, true);
    assert.equal(updated.streamOverlayMatchPulse, true);
    assert.equal(updated.streamOverlayMatchPulseStyle, 'dots');
    assert.equal(updated.streamOverlayPostMatchRecap, false);
    assert.equal(updated.streamOverlayPostMatchRecapSeconds, 10);
    assert.equal(updated.streamOverlayBackgroundOpacity, 0);
    assert.equal(updated.uiScale, 175);
    assert.equal(updated.unknown, undefined);

    const restored = new SettingsStore(directory).get();
    assert.equal(restored.dataMode, undefined);
    assert.equal(restored.privacyMode, true);
    assert.equal(restored.streamOverlayLanEnabled, true);
    assert.equal(restored.gamingRelayMode, true);
    assert.equal(restored.streamOverlayLayout, 'custom');
    assert.equal(restored.streamOverlayShowAgent, undefined);
    assert.equal(restored.streamOverlayShowMap, undefined);
    assert.equal(restored.streamOverlayShowPeakRank, undefined);
    assert.equal(restored.streamOverlayAnimatedRrBeam, false);
    assert.equal(restored.streamOverlayTransitionSound, true);
    assert.equal(restored.streamOverlayMatchPulse, true);
    assert.equal(restored.streamOverlayMatchPulseStyle, 'dots');
    assert.equal(restored.streamOverlayPostMatchRecapSeconds, 10);
    assert.equal(restored.streamOverlayBackgroundOpacity, 0);
    assert.equal(restored.uiScale, 175);

    const rejected = store.update({
      dataMode: 'live', refreshSeconds: -1, privacyMode: 'yes', pcRole: 'relay', streamOverlayBackgroundOpacity: 101, uiScale: 130,
      streamOverlayMatchPulseStyle: 'triangles', streamOverlayPostMatchRecapSeconds: 30,
      remoteSourceUrl: `http://203.0.113.8:43871/remote/${'d'.repeat(48)}`
    });
    assert.equal(rejected.dataMode, undefined);
    assert.equal(rejected.refreshSeconds, 30);
    assert.equal(rejected.privacyMode, true);
    assert.equal(rejected.pcRole, 'viewer');
    assert.equal(rejected.streamOverlayBackgroundOpacity, 0);
    assert.equal(rejected.uiScale, 175);
    assert.equal(rejected.streamOverlayMatchPulseStyle, 'dots');
    assert.equal(rejected.streamOverlayPostMatchRecapSeconds, 10);
    assert.match(rejected.remoteSourceUrl, /^http:\/\/192\.168\.50\.99/);

    const legacyPreset = store.update({ streamOverlayLayout: 'reactive' });
    assert.equal(legacyPreset.streamOverlayLayout, 'custom');

    const custom = store.update({
      streamOverlayLayout: 'custom',
      streamOverlayCustom: {
        width: 5000, height: 20, inGameWidth: 200, inGameHeight: 5000, backgroundColor: 'red',
        elements: [{ id: 'playerName', visible: true, x: -50, y: 200, width: 200, height: 1, fontSize: 500, opacity: 0, align: 'sideways', color: 'javascript:red' }]
      }
    });
    assert.equal(custom.streamOverlayLayout, 'custom');
    assert.equal(custom.streamOverlayCustom.width, 1920);
    assert.equal(custom.streamOverlayCustom.height, 120);
    assert.equal(custom.streamOverlayCustom.inGameWidth, 320);
    assert.equal(custom.streamOverlayCustom.inGameHeight, 1080);
    assert.equal(custom.streamOverlayCustom.backgroundColor, '#0b0d1d');
    assert.equal(custom.streamOverlayCustom.elements.length, 14);
    assert.equal(custom.streamOverlayCustom.inGameElements.length, 14);
    assert.equal(custom.streamOverlayCustom.postMatchElements.length, 14);
    assert.equal(custom.streamOverlayCustom.reactive, false);
    const customName = custom.streamOverlayCustom.elements.find((element) => element.id === 'playerName');
    assert.equal(customName.visible, true);
    assert.equal(customName.x, 0);
    assert.equal(customName.fontSize, 96);
    assert.equal(customName.opacity, 10);
    assert.equal(customName.align, 'left');
    assert.equal(customName.color, '#c9bcff');
    assert.equal(custom.streamOverlayCustom.elements.some((element) => element.id === 'reactiveDock'), false);

    const portrait = store.update({
      streamOverlayCustomPortrait: {
        width: 600, height: 1000,
        elements: [{ id: 'playerName', visible: true, x: 10, y: 12 }]
      }
    });
    assert.equal(portrait.streamOverlayCustomPortrait.width, 600);
    assert.equal(portrait.streamOverlayCustomPortrait.height, 1000);
    assert.equal(portrait.streamOverlayCustomPortrait.elements.find((element) => element.id === 'playerName').visible, true);
    assert.equal(portrait.streamOverlayCustom.width, 1920);
    const restoredProfiles = new SettingsStore(directory).get();
    assert.equal(restoredProfiles.streamOverlayCustom.width, 1920);
    assert.equal(restoredProfiles.streamOverlayCustomPortrait.width, 600);
    assert.equal(restoredProfiles.streamOverlayCustomPortrait.height, 1000);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SettingsStore migrates legacy preset visibility into the custom builder', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-settings-migration-'));
  try {
    fs.writeFileSync(path.join(directory, 'settings.json'), JSON.stringify({
      dataMode: 'mock', streamOverlayLayout: 'reactive', streamOverlayShowAgentMap: false,
      streamOverlayShowIdentity: true, streamOverlayShowWl: false
    }));
    const restored = new SettingsStore(directory).get();
    assert.equal(restored.streamOverlayLayout, 'custom');
    assert.equal(restored.streamOverlayCustom.reactive, true);
    for (const elements of [
      restored.streamOverlayCustom.elements,
      restored.streamOverlayCustom.inGameElements,
      restored.streamOverlayCustom.postMatchElements
    ]) {
      assert.equal(elements.find((element) => element.id === 'agent').visible, false);
      assert.equal(elements.find((element) => element.id === 'map').visible, false);
      assert.equal(elements.find((element) => element.id === 'playerName').visible, true);
      assert.equal(elements.find((element) => element.id === 'sessionWL').visible, false);
    }
    assert.equal(restored.streamOverlayShowAgent, undefined);
    assert.equal(restored.streamOverlayShowMap, undefined);
    assert.equal(restored.streamOverlayShowAgentMap, undefined);
    assert.equal(restored.dataMode, undefined);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
