'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { snapshot } = require('../src/main/services/mock-data.cjs');
const {
  LOOPBACK_HOST,
  OverlayServer,
  buildOverlayPayload,
  findLanHost,
  isPrivateIpv4,
  tokenMatches
} = require('../src/main/services/overlay-server.cjs');

const token = 'a'.repeat(48);

function settings(patch = {}) {
  return {
    streamOverlayEnabled: true,
    streamOverlayLayout: 'horizontal',
    streamOverlayShowIdentity: false,
    streamOverlayShowWl: true,
    streamOverlayShowKd: true,
    streamOverlayShowAgent: true,
    streamOverlayShowMap: true,
    streamOverlayShowRR: true,
    streamOverlayShowRrChange: true,
    streamOverlayToken: token,
    ...patch
  };
}

test('overlay payload exposes only personal stream fields', () => {
  const payload = buildOverlayPayload(snapshot, settings());
  const serialized = JSON.stringify(payload);

  assert.equal(payload.player.name, 'PLAYER');
  assert.equal(payload.player.rank, 'Ascendant 2');
  assert.equal(payload.live.agent, 'Omen');
  assert.equal(payload.live.map, 'Ascent');
  assert.equal(payload.session.games, 3);
  assert.equal(payload.session.lastMatchRR, 19);
  assert.equal(payload.session.lastMatchResult, 'VICTORY');
  assert.equal(serialized.includes('PixelPilot'), false);
  assert.equal(serialized.includes('EchoBloom'), false);
  assert.equal(serialized.includes('Sova'), false);
  assert.equal(serialized.includes('demo-match-9f31'), false);
  assert.equal(serialized.includes('players'), false);
});

test('awakened rank layout is accepted for OBS', () => {
  const payload = buildOverlayPayload(snapshot, settings({ streamOverlayLayout: 'rank' }));
  assert.equal(payload.layout, 'rank');
});

test('overlay visibility settings are enforced in the server payload', () => {
  const payload = buildOverlayPayload(snapshot, settings({
    streamOverlayShowIdentity: true,
    streamOverlayShowWl: false,
    streamOverlayShowKd: false,
    streamOverlayShowAgent: false,
    streamOverlayShowMap: false,
    streamOverlayShowRR: false,
    streamOverlayShowRrChange: false,
    streamOverlayLayout: 'vertical'
  }));

  assert.equal(payload.player.name, 'Nova');
  assert.equal(payload.player.rr, 0);
  assert.equal(payload.live.agent, '—');
  assert.equal(payload.live.map, '—');
  assert.equal(payload.session.games, 0);
  assert.equal(payload.session.kd, 0);
  assert.equal(payload.session.rrChange, 0);
  assert.equal(payload.session.lastMatchRR, 0);
  assert.equal(payload.preferences.showWl, false);
  assert.equal(payload.preferences.showKd, false);
  assert.equal(payload.preferences.showAgent, false);
  assert.equal(payload.preferences.showMap, false);
  assert.equal(payload.preferences.showRR, false);
  assert.equal(payload.preferences.showRrChange, false);
  assert.equal(payload.layout, 'vertical');
});

test('overlay tokens use constant-shape validation', () => {
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches('b'.repeat(48), token), false);
  assert.equal(tokenMatches('', token), false);
  assert.equal(tokenMatches('short', token), false);
});

test('selects only private IPv4 addresses for streaming-PC mode', () => {
  assert.equal(isPrivateIpv4('192.168.1.20'), true);
  assert.equal(isPrivateIpv4('10.0.0.8'), true);
  assert.equal(isPrivateIpv4('172.20.4.2'), true);
  assert.equal(isPrivateIpv4('8.8.8.8'), false);
  assert.equal(findLanHost({
    VPN: [{ family: 'IPv4', address: '10.8.0.2', internal: false }],
    Ethernet: [{ family: 'IPv4', address: '192.168.1.45', internal: false }],
    Public: [{ family: 'IPv4', address: '203.0.113.5', internal: false }]
  }), '192.168.1.45');
});

test('overlay server defaults to loopback and rejects invalid URLs', async () => {
  const currentSettings = settings();
  const server = new OverlayServer({
    getSnapshot: () => snapshot,
    getSettings: () => currentSettings,
    assetDirectory: path.join(__dirname, '..', 'src', 'overlay'),
    port: 0
  });

  try {
    const status = await server.start();
    assert.equal(server.host, LOOPBACK_HOST);
    assert.equal(status.running, true);
    assert.equal(status.access, 'local');
    assert.equal(status.host, LOOPBACK_HOST);
    assert.match(status.url, /^http:\/\/127\.0\.0\.1:\d+\/overlay\//);

    const page = await fetch(status.url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.match(await page.text(), /BYAKUGAN Session Overlay/);

    const denied = await fetch(`http://127.0.0.1:${status.port}/snapshot?token=wrong`);
    assert.equal(denied.status, 404);

    const accepted = await fetch(`http://127.0.0.1:${status.port}/snapshot?token=${token}`);
    assert.equal(accepted.status, 200);
    const payload = await accepted.json();
    assert.equal(payload.player.name, 'PLAYER');
    assert.equal(JSON.stringify(payload).includes('PixelPilot'), false);
  } finally {
    await server.stop();
  }
});
