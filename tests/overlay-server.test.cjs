'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { snapshot } = require('../src/main/services/mock-data.cjs');
const {
  LOOPBACK_HOST,
  OverlayServer,
  buildOverlayPayload,
  tokenMatches
} = require('../src/main/services/overlay-server.cjs');

const token = 'a'.repeat(48);

function settings(patch = {}) {
  return {
    streamOverlayEnabled: true,
    streamOverlayLayout: 'horizontal',
    streamOverlayShowIdentity: false,
    streamOverlayShowAgentMap: true,
    streamOverlayShowRR: true,
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
    streamOverlayShowAgentMap: false,
    streamOverlayShowRR: false,
    streamOverlayLayout: 'vertical'
  }));

  assert.equal(payload.player.name, 'Nova');
  assert.equal(payload.live.agent, '—');
  assert.equal(payload.live.map, '—');
  assert.equal(payload.preferences.showRR, false);
  assert.equal(payload.layout, 'vertical');
});

test('overlay tokens use constant-shape validation', () => {
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches('b'.repeat(48), token), false);
  assert.equal(tokenMatches('', token), false);
  assert.equal(tokenMatches('short', token), false);
});

test('overlay server is loopback-only and rejects invalid URLs', async () => {
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
