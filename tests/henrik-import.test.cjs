'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { RiotClientService } = require('../src/main/services/riot-client.cjs');
const { RemoteViewerClient } = require('../src/main/services/remote-viewer-client.cjs');
const { OverlayServer } = require('../src/main/services/overlay-server.cjs');
const { normalizeHenrikMatch } = require('../src/main/services/henrik-history.cjs');
const accountKey = `riot-${createHash('sha256').update('self').digest('hex').slice(0,32)}`;
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const row = (n, blue = 13, red = 9) => ({ meta: { id: id(n), mode: 'Competitive', season: { id: 'act' }, started_at: '2026-08-20T00:00:00Z' }, stats: { puuid: 'self', team: 'Blue', kills: 20, deaths: 10, assists: 5, shots: { head: 5, body: 10, leg: 5 } }, teams: { blue, red } });
test('import preserves Riot detail, replaces placeholders, deduplicates and persists across restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'henrik-import-'));
  const service = new RiotClientService({ cacheDirectory: directory });
  service.identity = { puuid: 'self' };
  service.fetchActiveSeasonId = async () => 'act';
  service.lastSnapshot = { profile: { actRecordWins: 1, actRecordGames: 3 } };
  const riotMatch = { id: id(1), result: 'VICTORY', kills: 10, deaths: 5, startedAt: 100, shots: { headshots: 1, bodyshots: 3, legshots: 0 } };
  service.persistActStats({ seasonId: 'act', newestMatchId: id(1), data: { complete: false, stats: {}, matches: [riotMatch, { id: id(3), result: 'RATING', hasRating: true, rr: 0, rrAfter: 42 }] } });
  try {
    const selection = { accountKey, seasonId: 'act', records: [row(1), row(2,9,13), row(3,14,14), row(2,9,13)] };
    const result = await service.importHistory(selection);
    assert.equal(result.imported, 2);
    assert.equal(result.stats.games, 3);
    assert.equal(result.stats.kd, 2);
    assert.equal(result.coverage.complete, true);
    assert.deepEqual(service.actStatsCache.data.matches.find(m => m.id === id(1)), riotMatch);
    assert.equal(service.actStatsCache.data.matches.find(m => m.id === id(3)).rrAfter, 42);
    assert.equal((await service.importHistory(selection)).imported, 0);
    const restarted = new RiotClientService({ cacheDirectory: directory });
    restarted.identity = { puuid: 'self' };
    const cache = restarted.loadPersistedActStats('act');
    assert.equal(cache.data.stats.games, 3);
    assert.equal(cache.data.stats.draws, 1);
    await assert.rejects(service.importHistory({ ...selection, accountKey: 'wrong' }), /Account or Act changed/);
    service.lastSnapshot.profile.actRecordGames = 4;
    assert.equal((await service.importHistory(selection)).coverage.complete, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('import rejects malformed records, early tied exits, and wrong Acts', () => {
  const context = { accountKey, seasonId: 'act' };
  assert.equal(normalizeHenrikMatch(row(1,1,1), context), null);
  const bad = row(1); bad.stats.kills = '20';
  assert.equal(normalizeHenrikMatch(bad, context), null);
  assert.equal(normalizeHenrikMatch(row(1), { ...context, seasonId: 'other' }), null);
  assert.equal(normalizeHenrikMatch(row(1), context).rr, null);
});
test('streaming import uses authenticated relay and publishes the returned snapshot', async () => {
  const token = 'a'.repeat(48);
  const selection = { accountKey, seasonId: 'act', records: [row(1)] };
  const server = new OverlayServer({ port: 0,
    getSettings: () => ({ remoteViewerEnabled: true, remoteViewerToken: token }),
    importHistory: async value => {
      assert.deepEqual(value, selection);
      return { summary: { imported: 1 }, snapshot: { connection: { region: 'NA' }, profile: { wins: 1 } } };
    }
  });
  try {
    const status = await server.start();
    const denied = await fetch(`http://127.0.0.1:${status.port}/remote-history/${'b'.repeat(48)}`, { method: 'POST', body: JSON.stringify(selection) });
    assert.equal(denied.status, 404);
    const client = new RemoteViewerClient({ sourceUrl: `http://192.168.1.2:${status.port}/remote/${token}`,
      fetchImpl: (url, options) => fetch(url.replace('192.168.1.2','127.0.0.1'), options) });
    let received;
    client.on('snapshot', value => { received = value; });
    const result = await client.importHistory(selection);
    assert.equal(result.imported, 1);
    assert.equal(received.profile.wins, 1);
    assert.equal(received.connection.source, 'remote');
  } finally { await server.stop(); }
});
