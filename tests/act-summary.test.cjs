'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ActSummaryStore, normalizeSummary, prepareSummary } = require('../src/main/act-summary-store.cjs');
const { RemoteViewerClient } = require('../src/main/services/remote-viewer-client.cjs');
const { initializeImportPreview } = require('../src/main/import-preview-profile.cjs');

const profile = () => ({ gameName: 'Example Player', tagLine: 'TEST', senseiAccountKey: `riot-${'a'.repeat(32)}`,
  activeSeasonId: '00000000-0000-0000-0000-000000000001', activeActLabel: 'Example Act',
  wins: 2, losses: 1, draws: 0, kd: 0.8, headshot: 18, rr: 47, statsScope: 'PARTIAL ACT' });
const summary = () => ({ format: 'byakugan.act-summary', version: 1, source: 'tracker-screenshot',
  riotId: { gameName: 'Example Player', tagLine: 'TEST' }, act: { label: 'Example Act', seasonId: null }, queue: 'competitive', capturedAt: null,
  totals: { matches: 12, wins: 6, losses: 4, draws: null, kills: 150, deaths: 125, assists: 80, kd: 1.2, headshotPct: 23.4, winPct: 50 },
  agents: [{ label: 'Omen', matches: 12, kd: 1.2 }], notes: 'Personal screenshot.' });
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-summary-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('unclassified results stay unknown until draws are explicitly supplied', () => {
  assert.equal(normalizeSummary(summary()).totals.draws, null);
  const confirmed = summary(); confirmed.totals.draws = 2;
  assert.equal(normalizeSummary(confirmed).totals.draws, 2);
  assert.equal(normalizeSummary(confirmed).capturedAt, null);
});

test('summary input rejects non-Competitive modes, impossible totals and invalid numeric types', () => {
  for (const queue of ['unrated', 'swiftplay', 'deathmatch', 'all', 'Competitive']) {
    assert.throws(() => normalizeSummary({ ...summary(), queue }), /Competitive/);
  }
  for (const patch of [{ wins: 13 }, { draws: 3 }, { matches: -1 }, { deaths: '125' }, { kills: 2.5 },
    { headshotPct: 101 }, { headshotPct: NaN }, { kd: 1.8 }, { acs: Infinity }]) {
    assert.throws(() => normalizeSummary({ ...summary(), totals: { ...summary().totals, ...patch } }));
  }
  assert.throws(() => normalizeSummary({ ...summary(), capturedAt: 'yesterday' }), /date/);
  assert.throws(() => normalizeSummary({ ...summary(), agents: [{ label: 'Omen', matches: 13 }] }), /Agent matches/);
  assert.throws(() => normalizeSummary({ ...summary(), padding: 'x'.repeat(65_537) }), /too large/);
});

test('import verifies account, Act and explicit confirmation again when saving', t => {
  const store = new ActSummaryStore(temporary(t));
  const document = summary(); document.riotId = { gameName: ' example player ', tagLine: '#test' };
  const preview = prepareSummary(document, profile());
  assert.throws(() => store.import(preview, profile()), /Confirm/);
  assert.throws(() => store.import(preview, { ...profile(), tagLine: 'OTHER' }, true), /different Riot ID/);
  assert.throws(() => store.import(preview, { ...profile(), activeSeasonId: '00000000-0000-0000-0000-000000000002' }, true), /changed/);
  assert.throws(() => store.import(preview, { ...profile(), senseiAccountKey: `riot-${'b'.repeat(32)}` }, true), /changed/);
  assert.throws(() => store.import({ ...preview, digest: 'changed' }, profile(), true), /changed/);
  assert.throws(() => prepareSummary({ ...summary(), act: { label: 'Old Act', seasonId: '00000000-0000-0000-0000-000000000002' } }, profile()), /different Act/);
  assert.throws(() => prepareSummary(summary(), { ...profile(), activeSeasonId: null }), /Load your/);
  assert.equal(store.import(preview, profile(), true).summary.totals.matches, 12);
});

test('imports persist separately, replace rather than add, and cannot change collected analytics', t => {
  const directory = temporary(t);
  const cache = path.join(directory, 'act-stats-cache.json');
  fs.writeFileSync(cache, '{"existing":"untouched"}');
  const snapshot = { profile: profile(), matches: [{ id: 'existing', kills: 8 }], analytics: { session: { games: 1 } } };
  const original = structuredClone(snapshot);
  const store = new ActSummaryStore(directory);
  const preview = prepareSummary(summary(), snapshot.profile);
  const first = store.import(preview, profile(), true);
  assert.deepEqual(store.import(preview, profile(), true), first);
  const restarted = new ActSummaryStore(directory);
  assert.deepEqual(restarted.get(profile()), first);
  const decorated = restarted.decorate(snapshot);
  assert.deepEqual(decorated.profile, original.profile);
  assert.deepEqual(decorated.matches, original.matches);
  assert.deepEqual(decorated.analytics, original.analytics);
  assert.deepEqual(snapshot, original);
  assert.equal(fs.readFileSync(cache, 'utf8'), '{"existing":"untouched"}');
  const later = summary(); later.totals.matches = 13; later.totals.losses = 5;
  restarted.import(prepareSummary(later, profile()), profile(), true);
  assert.equal(restarted.get(profile()).summary.totals.matches, 13);
  assert.equal(restarted.get({ ...profile(), activeSeasonId: '00000000-0000-0000-0000-000000000002' }), null);
  assert.equal(restarted.get({ ...profile(), senseiAccountKey: `riot-${'b'.repeat(32)}` }), null);
  assert.equal(restarted.get({ ...profile(), gameName: 'Someone Else' }), null);
  restarted.remove(profile());
  assert.equal(new ActSummaryStore(directory).get(profile()), null);
  assert.equal(fs.readFileSync(cache, 'utf8'), '{"existing":"untouched"}');
});

test('normalization drops unrelated credentials and match records', t => {
  const document = { ...summary(), apiKey: 'do-not-save', records: [{ id: 'not-a-match-import' }] };
  const store = new ActSummaryStore(temporary(t));
  store.import(prepareSummary(document, profile()), profile(), true);
  const contents = fs.readFileSync(store.file, 'utf8');
  assert.equal(contents.includes('do-not-save'), false);
  assert.equal(contents.includes('not-a-match-import'), false);
});

test('a damaged store is not overwritten by a subsequent import', t => {
  const directory = temporary(t);
  const file = path.join(directory, 'act-summary-imports.json');
  fs.writeFileSync(file, '{broken');
  const store = new ActSummaryStore(directory);
  assert.throws(() => store.import(prepareSummary(summary(), profile()), profile(), true), /could not be read/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('streaming PC can use an older gaming-host snapshot and retain imports offline', async t => {
  const directory = temporary(t);
  const sourceUrl = `http://192.168.1.2:47653/remote/${'a'.repeat(48)}`;
  let online = true;
  const fetchImpl = async () => {
    if (!online) throw new Error('Host offline');
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ version: 1,
      snapshot: { profile: profile(), connection: { region: 'NA' }, matches: [{ id: 'collected' }] } }) };
  };
  const client = new RemoteViewerClient({ sourceUrl, cacheDirectory: directory, fetchImpl });
  const received = (await client.requestSnapshot()).snapshot;
  const store = new ActSummaryStore(directory);
  store.import(prepareSummary(summary(), received.profile), received.profile, true);
  online = false;
  const restored = new RemoteViewerClient({ sourceUrl, cacheDirectory: directory, fetchImpl }).restoreSnapshot();
  const next = new ActSummaryStore(directory).decorate(restored);
  assert.equal(next.connection.status, 'disconnected');
  assert.equal(next.importedActSummary.summary.totals.matches, 12);
  assert.equal(next.profile.wins, 2);
  assert.equal(next.matches[0].id, 'collected');
});

test('local preview copies viewer context once and never edits installed settings or cache', t => {
  const appData = temporary(t);
  const installed = path.join(appData, 'BYAKUGAN');
  fs.mkdirSync(installed);
  const sourceUrl = `http://192.168.1.2:47653/remote/${'c'.repeat(48)}`;
  const existingSettings = JSON.stringify({ pcRole: 'viewer', remoteSourceUrl: sourceUrl, launchAtStartup: true, streamOverlayEnabled: true, senseiModel: 'private' });
  fs.writeFileSync(path.join(installed, 'settings.json'), existingSettings);
  const original = new RemoteViewerClient({ sourceUrl, cacheDirectory: installed });
  original.saveSnapshot({ profile: profile(), connection: { region: 'NA' } });
  const originalCache = fs.readFileSync(original.cachePath(), 'utf8');
  const destination = path.join(appData, 'BYAKUGAN-Import-Preview');
  initializeImportPreview(appData, destination);
  const settings = JSON.parse(fs.readFileSync(path.join(destination, 'settings.json'), 'utf8'));
  assert.equal(settings.remoteSourceUrl, sourceUrl);
  assert.equal(settings.launchAtStartup, false);
  assert.equal(settings.streamOverlayEnabled, false);
  assert.equal(settings.senseiModel, undefined);
  assert.equal(new RemoteViewerClient({ sourceUrl, cacheDirectory: destination }).restoreSnapshot().profile.gameName, 'Example Player');
  assert.equal(fs.readFileSync(path.join(installed, 'settings.json'), 'utf8'), existingSettings);
  assert.equal(fs.readFileSync(original.cachePath(), 'utf8'), originalCache);
  const settingsPath = path.join(destination, 'settings.json');
  fs.writeFileSync(settingsPath, '{"pcRole":"gaming"}');
  initializeImportPreview(appData, destination);
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), '{"pcRole":"gaming"}');
});

test('local preview retains the gaming host connection and copies readable match caches only', t => {
  const appData = temporary(t);
  const installed = path.join(appData, 'BYAKUGAN'); fs.mkdirSync(installed);
  const token = 'd'.repeat(48);
  const originalSettings = JSON.stringify({ pcRole: 'gaming', remoteViewerEnabled: true, remoteViewerToken: token,
    gamingRelayMode: true, launchAtStartup: true, senseiModel: 'private' });
  fs.writeFileSync(path.join(installed, 'settings.json'), originalSettings);
  fs.writeFileSync(path.join(installed, 'act-stats-cache.json'), '{"version":12}');
  fs.writeFileSync(path.join(installed, 'act-stats-archive.json'), '{broken');
  fs.writeFileSync(path.join(installed, 'credentials.json'), '{"key":"private"}');
  const destination = path.join(appData, 'BYAKUGAN-Import-Preview');
  initializeImportPreview(appData, destination);
  const settings = JSON.parse(fs.readFileSync(path.join(destination, 'settings.json'), 'utf8'));
  assert.equal(settings.pcRole, 'gaming'); assert.equal(settings.remoteViewerEnabled, true);
  assert.equal(settings.remoteViewerToken, token); assert.equal(settings.launchAtStartup, false);
  assert.equal(settings.gamingRelayMode, false); assert.equal(settings.senseiModel, undefined);
  assert.equal(fs.readFileSync(path.join(destination, 'act-stats-cache.json'), 'utf8'), '{"version":12}');
  assert.equal(fs.existsSync(path.join(destination, 'act-stats-archive.json')), false);
  assert.equal(fs.existsSync(path.join(destination, 'credentials.json')), false);
  assert.equal(fs.readFileSync(path.join(installed, 'settings.json'), 'utf8'), originalSettings);
  assert.equal(fs.readFileSync(path.join(installed, 'act-stats-archive.json'), 'utf8'), '{broken');
});
