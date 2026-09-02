'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const { snapshot } = require('./fixtures/mock-data.cjs');
const {
  LOOPBACK_HOST,
  OverlayServer,
  buildOverlayPayload,
  findLanHost,
  isPrivateIpv4,
  overlayBackgroundOpacity,
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
    streamOverlaySmoothTransitions: true,
    streamOverlayTransitionSound: false,
    streamOverlayMatchPulse: false,
    streamOverlayMatchPulseStyle: 'segments',
    streamOverlayPostMatchRecap: true,
    streamOverlayPostMatchRecapSeconds: 7,
    streamOverlayBackgroundOpacity: 35,
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
  assert.equal(payload.live.agentLabel, 'AGENT SELECT');
  assert.equal(payload.live.map, 'Ascent');
  assert.equal(payload.session.games, 3);
  assert.equal(payload.session.lastMatchRR, 19);
  assert.equal(payload.session.lastMatchResult, 'VICTORY');
  assert.equal(payload.session.beamProgress, 72);
  assert.equal(payload.preferences.animatedRrBeam, true);
  assert.equal(payload.preferences.smoothTransitions, true);
  assert.equal(payload.preferences.transitionSound, false);
  assert.equal(payload.preferences.postMatchRecap, true);
  assert.equal(payload.session.lastMatchScore, snapshot.matches[0].score);
  assert.equal(payload.appearance.backgroundOpacity, 35);
  assert.equal(serialized.includes('PixelPilot'), false);
  assert.equal(serialized.includes('EchoBloom'), false);
  assert.equal(serialized.includes('Sova'), false);
  assert.equal(serialized.includes('demo-match-9f31'), false);
  assert.equal(serialized.includes('players'), false);
});

test('overlay agent falls back to the last played agent while in menus', () => {
  const menuSnapshot = {
    ...snapshot,
    live: { state: 'MENUS', queue: 'Not queued', map: '—', players: [] }
  };
  const payload = buildOverlayPayload(menuSnapshot, settings());
  assert.equal(payload.live.agent, snapshot.matches[0].agent);
  assert.equal(payload.live.agentImage, snapshot.matches[0].agentImage);
  assert.equal(payload.live.agentLabel, 'LAST PLAYED');
});

test('last-match overlay result follows recovered session membership', () => {
  const newest = snapshot.matches[0];
  const excluded = buildOverlayPayload({
    ...snapshot,
    analytics: { ...snapshot.analytics, session: { ...snapshot.analytics.session, matchIds: [] } }
  }, settings());
  assert.equal(excluded.session.lastMatchResult, 'NO MATCH');
  assert.equal(excluded.session.lastMatchRR, 0);

  const included = buildOverlayPayload({
    ...snapshot,
    analytics: { ...snapshot.analytics, session: { ...snapshot.analytics.session, matchIds: [newest.id] } }
  }, settings());
  assert.equal(included.session.lastMatchResult, newest.result);
  assert.equal(included.session.lastMatchRR, newest.rr);
});

test('awakened rank layout is accepted for OBS', () => {
  const payload = buildOverlayPayload(snapshot, settings({ streamOverlayLayout: 'rank' }));
  assert.equal(payload.layout, 'rank');
});

test('Reactive Vision Dock is a separate accepted OBS layout', () => {
  const payload = buildOverlayPayload(snapshot, settings({ streamOverlayLayout: 'reactive' }));
  assert.equal(payload.layout, 'reactive');
  assert.equal(payload.session.lastMatchId, snapshot.matches[0].id);
});

test('Reactive Vision payload carries toggleable Match Pulse and recap settings', () => {
  const payload = buildOverlayPayload({
    ...snapshot,
    live: {
      ...snapshot.live,
      state: 'INGAME', score: '7–5',
      roundPulse: ['UNKNOWN', 'WIN', 'LOSS'], roundPulseRevision: 3
    }
  }, settings({
    streamOverlayLayout: 'reactive', streamOverlayMatchPulse: true,
    streamOverlayMatchPulseStyle: 'dots', streamOverlayPostMatchRecapSeconds: 10
  }));
  assert.equal(payload.preferences.matchPulse, true);
  assert.equal(payload.preferences.matchPulseStyle, 'dots');
  assert.equal(payload.preferences.postMatchRecap, true);
  assert.equal(payload.preferences.postMatchRecapSeconds, 10);
  assert.equal(payload.live.score, '7–5');
  assert.deepEqual(payload.live.roundPulse, ['UNKNOWN', 'WIN', 'LOSS']);
  assert.equal(payload.live.roundPulseRevision, 3);

  const hidden = buildOverlayPayload({ ...snapshot, live: { ...snapshot.live, roundPulse: ['WIN'] } }, settings());
  assert.deepEqual(hidden.live.roundPulse, []);
});

test('custom overlay derives privacy fields from its own element visibility', () => {
  const payload = buildOverlayPayload(snapshot, settings({
    streamOverlayLayout: 'custom',
    streamOverlayShowIdentity: false,
    streamOverlayShowAgent: false,
    streamOverlayCustom: {
      width: 1280,
      height: 420,
      backgroundColor: '#123456',
      elements: [
        { id: 'playerName', visible: true },
        { id: 'agent', visible: true },
        { id: 'map', visible: false },
        { id: 'sessionWL', visible: false },
        { id: 'sessionKD', visible: true },
        { id: 'rrBeam', visible: true }
      ]
    }
  }));
  assert.equal(payload.layout, 'custom');
  assert.equal(payload.customOverlay.width, 1280);
  assert.equal(payload.customOverlay.height, 420);
  assert.equal(payload.player.name, 'Nova');
  assert.equal(payload.live.agent, 'Omen');
  assert.equal(payload.live.map, '—');
  assert.equal(payload.session.games, 0);
  assert.equal(payload.session.kd, 1.4);
  assert.equal(payload.preferences.showIdentity, true);
});

test('custom Reactive Vision exposes fields from the canvas matching live state', () => {
  const payload = buildOverlayPayload({ ...snapshot, live: { ...snapshot.live, state: 'INGAME' } }, settings({
    streamOverlayLayout: 'custom',
    streamOverlayCustom: {
      reactive: true,
      elements: [
        { id: 'sessionWL', visible: false }, { id: 'sessionKD', visible: false },
        { id: 'currentRR', visible: false }, { id: 'peakRank', visible: true },
        { id: 'rrBeam', visible: false }
      ],
      inGameElements: [
        { id: 'sessionWL', visible: true }, { id: 'sessionKD', visible: true },
        { id: 'currentRR', visible: false }, { id: 'peakRank', visible: false },
        { id: 'rrChange', visible: false }, { id: 'lastMatch', visible: false },
        { id: 'rrBeam', visible: true }
      ]
    }
  }));
  assert.equal(payload.preferences.showWl, true);
  assert.equal(payload.preferences.showKd, true);
  assert.equal(payload.preferences.showRR, true);
  assert.equal(payload.preferences.showPeakRank, false);
  assert.equal(payload.preferences.showRrChange, true);
  assert.equal(payload.session.lastMatchRR, snapshot.matches[0].rr);
  assert.equal(payload.session.games, 3);

  const pregamePayload = buildOverlayPayload(snapshot, settings({
    streamOverlayLayout: 'custom',
    streamOverlayCustom: payload.customOverlay
  }));
  assert.equal(pregamePayload.preferences.showWl, false);
  assert.equal(pregamePayload.preferences.showKd, false);
  assert.equal(pregamePayload.preferences.showRR, false);
  assert.equal(pregamePayload.preferences.showPeakRank, true);
});

test('custom post-match recap receives only fields enabled on its own canvas', () => {
  const payload = buildOverlayPayload({
    ...snapshot,
    live: { ...snapshot.live, state: 'MENUS', score: '13–9', roundPulse: ['WIN', 'LOSS'] }
  }, settings({
    streamOverlayLayout: 'custom',
    streamOverlayMatchPulse: true,
    streamOverlayCustom: {
      reactive: true,
      postMatchElements: [
        { id: 'playerName', visible: false }, { id: 'currentRank', visible: false },
        { id: 'currentRR', visible: true }, { id: 'peakRank', visible: false },
        { id: 'sessionWL', visible: true }, { id: 'sessionKD', visible: false },
        { id: 'rrChange', visible: false }, { id: 'lastMatch', visible: true },
        { id: 'agent', visible: false }, { id: 'map', visible: false },
        { id: 'matchScore', visible: true }, { id: 'matchPulse', visible: true },
        { id: 'rrBeam', visible: true, showMarker: true }
      ]
    }
  }));

  assert.equal(payload.recap.player.name, 'PLAYER');
  assert.equal(payload.recap.player.rank, 'Unrated');
  assert.equal(payload.recap.player.rr, snapshot.profile.rr);
  assert.equal(payload.recap.player.peakRank, '');
  assert.equal(payload.recap.session.wins, snapshot.analytics.session.wins);
  assert.equal(payload.recap.session.kd, 0);
  assert.equal(payload.recap.session.lastMatchResult, snapshot.matches[0].result);
  assert.equal(payload.recap.session.lastMatchScore, snapshot.matches[0].score);
  assert.deepEqual(payload.recap.live.roundPulse, ['WIN', 'LOSS']);
  assert.equal(payload.recap.live.agent, '—');
  assert.equal(payload.recap.live.map, '—');
});

test('custom beam marker alone receives last-match RR while a hidden marker does not', () => {
  const visible = buildOverlayPayload(snapshot, settings({
    streamOverlayLayout: 'custom',
    streamOverlayCustom: {
      elements: [
        { id: 'rrChange', visible: false }, { id: 'lastMatch', visible: false },
        { id: 'rrBeam', visible: true, showMarker: true }
      ]
    }
  }));
  assert.equal(visible.preferences.showRrChange, true);
  assert.equal(visible.session.lastMatchRR, snapshot.matches[0].rr);

  const hidden = buildOverlayPayload(snapshot, settings({
    streamOverlayLayout: 'custom',
    streamOverlayCustom: {
      elements: [
        { id: 'rrChange', visible: false }, { id: 'lastMatch', visible: false },
        { id: 'rrBeam', visible: true, showMarker: false }
      ]
    }
  }));
  assert.equal(hidden.preferences.showRrChange, false);
  assert.equal(hidden.session.lastMatchRR, 0);
});

test('current-rank embedded RR authorizes RR without the standalone RR or beam', () => {
  const payload = buildOverlayPayload(snapshot, settings({
    streamOverlayLayout: 'custom',
    streamOverlayCustom: {
      elements: [
        { id: 'currentRank', visible: true, showCurrentRR: true },
        { id: 'currentRR', visible: false },
        { id: 'rrBeam', visible: false }
      ]
    }
  }));
  assert.equal(payload.preferences.showRR, true);
  assert.equal(payload.player.rr, snapshot.profile.rr);

  const hidden = buildOverlayPayload(snapshot, settings({
    streamOverlayLayout: 'custom',
    streamOverlayCustom: {
      elements: [
        { id: 'currentRank', visible: true, showCurrentRR: false },
        { id: 'currentRR', visible: false },
        { id: 'rrBeam', visible: false }
      ]
    }
  }));
  assert.equal(hidden.preferences.showRR, false);
  assert.equal(hidden.player.rr, 0);
});

test('RR energy beam follows current rank rating from empty to full', () => {
  assert.equal(rrBeamProgress(0), 0);
  assert.equal(rrBeamProgress(42), 42);
  assert.equal(rrBeamProgress(100), 100);
  assert.equal(rrBeamProgress(-20), 0);
  assert.equal(rrBeamProgress(250), 100);
});

test('overlay background opacity supports transparent through solid', () => {
  assert.equal(overlayBackgroundOpacity(0), 0);
  assert.equal(overlayBackgroundOpacity(70), 70);
  assert.equal(overlayBackgroundOpacity(100), 100);
  assert.equal(overlayBackgroundOpacity(-10), 0);
  assert.equal(overlayBackgroundOpacity(140), 100);
  assert.equal(overlayBackgroundOpacity(undefined), 70);
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
    assert.match(page.headers.get('content-security-policy'), /img-src 'self'/);
    assert.match(page.headers.get('content-security-policy'), /media-src 'self'/);
    const pageHtml = await page.text();
    assert.match(pageHtml, /BYAKUGAN Session Overlay/);
    assert.match(pageHtml, /rank-last-match-record[\s\S]*rr-track[\s\S]*rank-session-record/);
    assert.doesNotMatch(pageHtml, /last-match-summary/);
    assert.match(pageHtml, /current-rr-marker/);

    const beam = await fetch(`http://127.0.0.1:${status.port}/rr-energy-beam.gif`);
    assert.equal(beam.status, 200);
    assert.equal(beam.headers.get('content-type'), 'image/gif');
    assert.equal(Buffer.from(await beam.arrayBuffer()).subarray(0, 6).toString('ascii'), 'GIF89a');

    const activationSound = await fetch(`http://127.0.0.1:${status.port}/byakugan-eye-activation.mp3`);
    assert.equal(activationSound.status, 200);
    assert.equal(activationSound.headers.get('content-type'), 'audio/mpeg');
    assert.equal(Buffer.from(await activationSound.arrayBuffer()).subarray(0, 3).toString('ascii'), 'ID3');

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

test('occupied overlay port reports duplicate-process recovery instead of OBS cache advice', async () => {
  const blocker = http.createServer((_request, response) => response.end('occupied'));
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, LOOPBACK_HOST, resolve);
  });
  const port = blocker.address().port;
  const server = new OverlayServer({
    getSnapshot: () => snapshot,
    getSettings: () => settings(),
    assetDirectory: path.join(__dirname, '..', 'src', 'overlay'),
    port
  });

  try {
    await assert.rejects(
      () => server.start(),
      new RegExp(`Port ${port} is already in use[\\s\\S]*duplicate BYAKUGAN[\\s\\S]*OBS browser cache`, 'i')
    );
    assert.equal(server.status().running, false);
  } finally {
    await server.stop();
    await new Promise((resolve) => blocker.close(resolve));
  }
});

test('remote viewer endpoint exposes the dashboard snapshot with a separate token', async () => {
  const remoteToken = 'b'.repeat(48);
  const currentSettings = settings({ remoteViewerEnabled: true, remoteViewerToken: remoteToken });
  const server = new OverlayServer({
    getSnapshot: () => snapshot,
    getSettings: () => currentSettings,
    inspectPlayer: async (playerId) => ({ playerId, name: 'Visible Friend' }),
    updateSession: async ({ selectedMatchIds }) => ({ ...snapshot, recoveredMatchIds: selectedMatchIds }),
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

    const recovered = await fetch(`http://127.0.0.1:${status.port}/remote-session/${remoteToken}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedMatchIds: ['match-1'], candidateMatchIds: ['match-1', 'match-2'] })
    });
    assert.equal(recovered.status, 200);
    assert.deepEqual((await recovered.json()).snapshot.recoveredMatchIds, ['match-1']);
  } finally {
    await server.stop();
  }
});
