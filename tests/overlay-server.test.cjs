'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { snapshot } = require('./fixtures/mock-data.cjs');
const {
  LOOPBACK_HOST,
  OverlayServer,
  buildOverlayPayload,
  findLanHost,
  isPrivateIpv4,
  rrBeamProgress,
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
    streamOverlayShowPeakRank: true,
    streamOverlayShowRrChange: true,
    streamOverlayAnimatedRrBeam: true,
    streamOverlayToken: token,
    ...patch
  };
}

test('overlay payload exposes only personal stream fields', () => {
  const payload = buildOverlayPayload(snapshot, settings());
  const serialized = JSON.stringify(payload);

  assert.equal(payload.player.name, 'PLAYER');
  assert.equal(payload.player.rank, 'Ascendant 2');
  assert.equal(payload.player.peakRank, 'Immortal 1');
  assert.equal(payload.player.peakEpisode, 'Episode 8');
  assert.equal(payload.player.peakAct, 'Act 2');
  assert.equal(payload.player.peakRankImage, '');
  assert.equal(payload.live.agent, 'Omen');
  assert.equal(payload.live.map, 'Ascent');
  assert.equal(payload.session.games, 3);
  assert.equal(payload.session.lastMatchRR, 19);
  assert.equal(payload.session.lastMatchResult, 'VICTORY');
  assert.equal(payload.session.beamProgress, 72);
  assert.equal(payload.preferences.animatedRrBeam, true);
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

test('RR energy beam follows current rank rating from empty to full', () => {
  assert.equal(rrBeamProgress(0), 0);
  assert.equal(rrBeamProgress(42), 42);
  assert.equal(rrBeamProgress(100), 100);
  assert.equal(rrBeamProgress(-20), 0);
  assert.equal(rrBeamProgress(250), 100);
});

test('overlay visibility settings are enforced in the server payload', () => {
  const payload = buildOverlayPayload(snapshot, settings({
    streamOverlayShowIdentity: true,
    streamOverlayShowWl: false,
    streamOverlayShowKd: false,
    streamOverlayShowAgent: false,
    streamOverlayShowMap: false,
    streamOverlayShowRR: false,
    streamOverlayShowPeakRank: false,
    streamOverlayShowRrChange: false,
    streamOverlayAnimatedRrBeam: false,
    streamOverlayLayout: 'vertical'
  }));

  assert.equal(payload.player.name, 'Nova');
  assert.equal(payload.player.rr, 0);
  assert.equal(payload.player.peakRank, '');
  assert.equal(payload.player.peakRankImage, '');
  assert.equal(payload.live.agent, '—');
  assert.equal(payload.live.map, '—');
  assert.equal(payload.session.games, 0);
  assert.equal(payload.session.kd, 0);
  assert.equal(payload.session.rrChange, 0);
  assert.equal(payload.session.beamProgress, 0);
  assert.equal(payload.session.lastMatchRR, 0);
  assert.equal(payload.preferences.showWl, false);
  assert.equal(payload.preferences.showKd, false);
  assert.equal(payload.preferences.showAgent, false);
  assert.equal(payload.preferences.showMap, false);
  assert.equal(payload.preferences.showRR, false);
  assert.equal(payload.preferences.showPeakRank, false);
  assert.equal(payload.preferences.showRrChange, false);
  assert.equal(payload.preferences.animatedRrBeam, false);
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

test('remote viewer endpoint exposes the dashboard snapshot with a separate token', async () => {
  const remoteToken = 'b'.repeat(48);
  const currentSettings = settings({ remoteViewerEnabled: true, remoteViewerToken: remoteToken });
  const server = new OverlayServer({
    getSnapshot: () => snapshot,
    getSettings: () => currentSettings,
    inspectPlayer: async (playerId) => ({ playerId, name: 'Visible Friend' }),
    assetDirectory: path.join(__dirname, '..', 'src', 'overlay'),
    port: 0
  });

  try {
    const status = await server.start();
    assert.equal(status.remoteEnabled, true);
    assert.match(status.remoteUrl, /\/remote\/b{48}$/);
    const endpoint = `http://127.0.0.1:${status.port}/remote/${remoteToken}`;
    const denied = await fetch(`${endpoint.slice(0, -1)}a`);
    assert.equal(denied.status, 404);

    const accepted = await fetch(endpoint);
    assert.equal(accepted.status, 200);
    const etag = accepted.headers.get('etag');
    const payload = await accepted.json();
    assert.equal(payload.version, 1);
    assert.equal(payload.snapshot.profile.gameName, snapshot.profile.gameName);
    assert.equal(payload.snapshot.friends.length, snapshot.friends.length);

    const unchanged = await fetch(endpoint, { headers: { 'If-None-Match': etag } });
    assert.equal(unchanged.status, 304);

    const inspected = await fetch(`http://127.0.0.1:${status.port}/remote-inspect/${remoteToken}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: 'friend-1' })
    });
    assert.equal(inspected.status, 200);
    assert.deepEqual((await inspected.json()).profile, { playerId: 'friend-1', name: 'Visible Friend' });
  } finally {
    await server.stop();
  }
});
