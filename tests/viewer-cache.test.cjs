'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RemoteViewerClient } = require('../src/main/services/remote-viewer-client.cjs');
test('viewer restores offline stats, isolates hosts and replaces account and Act snapshots', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-cache-'));
  const sourceUrl = `http://192.168.1.2:43871/remote/${'a'.repeat(48)}`;
  const options = { cacheDirectory: directory, sourceUrl, fetchImpl: async () => { throw new Error('offline'); } };
  const first = new RemoteViewerClient(options);
  first.saveSnapshot({ profile: { senseiAccountKey: 'a', activeSeasonId: 'act1', wins: 20 }, connection: {}, actScanDiagnostics: { version: 1, accountKey: 'a', seasonId: 'act1', running: false, requests: [{ status: 429 }] }, live: { state: 'INGAME' } });
  const next = new RemoteViewerClient(options);
  try {
    const restored = await next.connect();
    assert.equal(restored.profile.wins, 20);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'act-scan-diagnostics.json'))).requests[0].status, 429);
    assert.equal(restored.actScanDiagnostics.accountKey, 'a');
    assert.equal(restored.connection.status, 'disconnected');
    assert.ok(restored.connection.lastSyncedAt);
    assert.equal(restored.live.state, 'DISCONNECTED');
    assert.ok(next.pollTimer);
    const other = new RemoteViewerClient({ ...options, sourceUrl: sourceUrl.replace('192.168.1.2', '192.168.1.3') });
    assert.equal(other.restoreSnapshot(), null);
    next.fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => '' }, json: async () => ({ version: 1, snapshot: { profile: { senseiAccountKey: 'b', activeSeasonId: 'act2', wins: 1 }, connection: {}, live: {} } }) });
    const fresh = await next.requestSnapshot({ force: true });
    assert.equal(fresh.snapshot.profile.wins, 1);
    assert.equal(fs.existsSync(path.join(directory, 'act-scan-diagnostics.json')), false);
    const restarted = new RemoteViewerClient(options);
    assert.equal(restarted.restoreSnapshot().profile.senseiAccountKey, 'b');
    assert.equal(fs.readdirSync(directory).filter(f => f.endsWith('.json')).length, 3);
  } finally { next.disconnect(); fs.rmSync(directory, { recursive: true, force: true }); }
});
