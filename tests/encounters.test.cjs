'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EncounterStore, recordFromDetail, recordFromLegacy, accountKeyFor } = require('../src/main/encounter-store.cjs');
const { RiotClientService, normalizeLivePlayers } = require('../src/main/services/riot-client.cjs');
const { OverlayServer } = require('../src/main/services/overlay-server.cjs');
const { RemoteViewerClient } = require('../src/main/services/remote-viewer-client.cjs');

const owner = 'owner-private-puuid';
const target = 'other-private-puuid';
const account = accountKeyFor(owner);
const metadata = { maps: new Map([['map', { name: 'Ascent' }]]), agents: new Map([['agent', { name: 'Omen' }]]), tiers: new Map() };
const player = (Subject, TeamID, hidden = false) => ({ Subject, TeamID, CharacterID: 'agent', PlayerIdentity: { Incognito: hidden },
  GameName: 'Unstored name', PlayerStats: { Kills: 20, Deaths: 10, Assists: 5 } });
function detail(id = 'old-match', relationship = 'with', queue = 'competitive', season = 'old-act') {
  return { MatchInfo: { MatchID: id, IsCompleted: true, MapID: 'map', SeasonID: season, QueueID: queue, GameStartMillis: 1_780_000_000_000 },
    Players: [player(owner, 'Blue'), player(target, relationship === 'with' ? 'Blue' : 'Red')],
    Teams: [{ TeamID: 'Blue', Won: true, RoundsWon: 13 }, { TeamID: 'Red', Won: false, RoundsWon: 7 }] };
}
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-encounters-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function service(directory = '') {
  const client = new RiotClientService({ cacheDirectory: directory });
  client.identity = { puuid: owner }; client.metadata = metadata;
  return client;
}
function roster(client, raw = [player(owner, 'Blue'), player(target, 'Red')], matchId = 'live-match', active = true) {
  const normalized = normalizeLivePlayers(raw, client.identity.puuid, metadata,
    { [owner]: 'Owner#TEST', [target]: 'Public name#TEST' });
  return client.decorateEncounterRoster(raw, normalized, matchId, active);
}

test('completed shared records preserve teammate/opponent perspective, draws, and non-Competitive queues', () => {
  const store = new EncounterStore();
  for (const [id, side, queue, act] of [['a', 'with', 'competitive', 'old-act'], ['b', 'against', 'swiftplay', 'new-act']]) {
    const record = recordFromDetail(detail(id, side, queue, act), owner, metadata);
    assert.equal(record.map, 'Ascent'); assert.equal(record.self.agent, 'Omen');
    assert.equal(record.result, 'VICTORY'); assert.equal(record.score, '13 – 7');
    store.remember(account, record);
  }
  const draw = detail('draw'); draw.Teams.forEach(team => { team.Won = false; team.RoundsWon = 14; });
  assert.equal(recordFromDetail(draw, owner, metadata).result, 'DRAW');
  const loss = detail('loss'); loss.Teams[0].Won = false; loss.Teams[1].Won = true;
  assert.equal(recordFromDetail(loss, owner, metadata).result, 'DEFEAT');
  const ffa = recordFromDetail(detail('ffa', 'against', 'deathmatch'), owner, metadata);
  assert.equal(ffa.result, 'COMPLETED'); assert.equal(ffa.score, '');
  assert.equal(ffa.players[0].relationship, 'same-match'); store.remember(account, ffa);
  const result = store.page(owner, target);
  assert.deepEqual([result.total, result.with, result.against, result.sameMatch], [3, 1, 1, 1]);
  assert.deepEqual(new Set(result.matches.map(row => row.seasonId)), new Set(['old-act', 'new-act']));
  assert.equal(result.matches[0].other.kills, 20);
});

test('active, foreign-account and malformed details cannot create shared history', () => {
  const incomplete = detail(); incomplete.MatchInfo.IsCompleted = false;
  const unknown = detail(); delete unknown.MatchInfo.IsCompleted; unknown.Teams = [];
  for (const candidate of [null, {}, incomplete, unknown, { ...detail(), Players: {} }, { ...detail(), Teams: {} }]) {
    assert.equal(recordFromDetail(candidate, owner, metadata), null);
  }
  assert.equal(recordFromDetail(detail(), 'absent-owner', metadata), null);
});

test('history persists across restarts and accounts without raw player IDs or names', t => {
  const directory = temporary(t);
  const store = new EncounterStore(directory);
  const record = recordFromDetail(detail(), owner, metadata);
  store.remember(account, record); assert.equal(store.remember(account, record), false);
  assert.equal(store.page(owner, target, { excludeMatchId: 'old-match' }).total, 0);
  const file = store.file(); store.flush();
  const contents = fs.readFileSync(file, 'utf8');
  for (const value of [owner, target, 'Unstored name']) assert.equal(contents.includes(value), false);
  assert.equal(new EncounterStore(directory).page(owner, target).total, 1);
  assert.equal(store.page('different-account', target).total, 0);
  assert.equal(store.page(owner, target).total, 1);
  const publicHistory = JSON.stringify(store.page(owner, target));
  assert.equal(publicHistory.includes(record.players[0].key), false);
  assert.equal(publicHistory.includes(target), false);
  assert.equal(fs.readFileSync(file, 'utf8'), contents);
});

test('legacy teammates are recovered once, with full rosters replacing partial records', () => {
  const store = new EncounterStore();
  const legacy = recordFromLegacy({ id: 'old-match', result: 'VICTORY', teammateIds: [target, target], map: 'Ascent' }, owner, 'old-act');
  assert.equal(legacy.players.length, 1);
  store.remember(account, legacy);
  assert.equal(store.page(owner, target).matches[0].other.kills, null);
  store.remember(account, recordFromDetail(detail(), owner, metadata));
  assert.equal(store.remember(account, legacy), false);
  assert.equal(store.page(owner, target).total, 1);
  assert.equal(store.page(owner, target).matches[0].other.kills, 20);
  assert.equal(store.page(owner, 'unrecorded-opponent').total, 0);
});

test('corrupt encounter files are reported and preserved', t => {
  const directory = temporary(t);
  const file = path.join(directory, `encounters-${account}.json`);
  fs.writeFileSync(file, '{broken');
  const store = new EncounterStore(directory);
  store.remember(account, recordFromDetail(detail(), owner, metadata)); store.flush();
  assert.match(store.page(owner, target).warning, /could not be read/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('both live teams get history while hidden, unresolved and pregame identities stay unavailable', () => {
  const client = service();
  client.encounterStore.remember(account, recordFromDetail(detail(), owner, metadata));
  for (const side of ['Blue', 'Red']) {
    const row = roster(client, [player(owner, 'Blue'), player(target, side)])[1];
    assert.ok(row.encounterId); assert.equal(row.encounters.total, 1);
    assert.equal(client.getPlayerEncounters({ encounterId: row.encounterId, matchId: 'live-match' }).with, 1);
  }
  const publicRow = roster(client)[1];
  const hidden = roster(client, [player(owner, 'Blue'), player(target, 'Red', true)])[1];
  assert.equal(hidden.encounterId, undefined); assert.equal(hidden.encounters.available, false);
  assert.throws(() => client.getPlayerEncounters({ encounterId: publicRow.encounterId, matchId: 'live-match' }), /private/);
  const unresolved = roster(client, [player(owner, 'Blue'), player('unknown-name', 'Red')])[1];
  assert.equal(unresolved.encounters.available, false);
  const pregame = roster(client, undefined, 'pregame', false)[1];
  assert.equal(pregame.encounterId, undefined); assert.equal(pregame.encounters, undefined);
  assert.equal(roster(client)[0].encounterId, undefined);
});

test('roster reorder keeps the correct player and old match/account handles cannot be reused', () => {
  const client = service();
  const first = roster(client)[1];
  const reordered = roster(client, [player(target, 'Red'), player(owner, 'Blue')])[0];
  assert.equal(first.encounterId, reordered.encounterId);
  assert.throws(() => client.getPlayerEncounters({ encounterId: first.encounterId, matchId: 'wrong' }), /roster/);
  for (const offset of [-1, '50', 1.5]) assert.throws(() => client.getPlayerEncounters({ encounterId: first.encounterId, matchId: 'live-match', offset }), /page/);
  roster(client, undefined, 'next-match');
  assert.throws(() => client.getPlayerEncounters({ encounterId: first.encounterId, matchId: 'live-match' }), /roster/);
  const current = roster(client)[1]; client.identity.puuid = 'different-account';
  assert.throws(() => client.getPlayerEncounters({ encounterId: current.encounterId, matchId: 'live-match' }), /roster/);
  client.disconnect(); assert.equal(client.encounterTargets.size, 0);
});

test('completed-detail collection reuses the existing request and ignores foreign or stale-account results', async () => {
  const client = service(); let calls = 0;
  client.safeRemote = async () => { calls++; return detail(); };
  await Promise.all([client.fetchMatchDetail('old-match'), client.fetchMatchDetail('old-match')]);
  assert.equal(calls, 1); assert.equal(client.encounterStore.page(owner, target).total, 1);
  client.safeRemote = async () => { const result = detail('foreign'); result.Players[0].Subject = 'someone-else'; return result; };
  await client.fetchMatchDetail('foreign'); assert.equal(client.encounterStore.records.size, 1);
  let resolve;
  client.safeRemote = () => new Promise(done => { resolve = done; });
  const pending = client.fetchMatchDetail('late'); client.identity = { puuid: 'different-account' }; resolve(detail('late'));
  await pending; assert.equal(client.encounterStore.records.size, 1);
});

test('background recovery uses a bounded batch and opening a profile makes no Riot requests', async () => {
  const client = service(); let calls = 0; let active = 0; let maximum = 0;
  client.actStatsCache = { data: { matches: Array.from({ length: 12 }, (_, i) => ({ id: `old-${i}`, result: 'VICTORY' })) } };
  client.safeRemote = async url => {
    calls++; maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    return detail(url.split('/').at(-1));
  };
  client.startEncounterBackfill(); client.startEncounterBackfill(); await client.encounterBackfillPromise;
  assert.equal(calls, 5); assert.equal(maximum, 2);
  const row = roster(client)[1];
  assert.equal(client.getPlayerEncounters({ encounterId: row.encounterId, matchId: 'live-match' }).total, 5);
  assert.equal(calls, 5);
  client.startEncounterBackfill(); await client.encounterBackfillPromise; assert.equal(calls, 10);
});

test('streaming PC receives, caches and pages shared history over the authenticated relay', async t => {
  const client = service();
  for (let i = 0; i < 55; i++) client.encounterStore.remember(account, recordFromDetail(detail(`saved-${i}`), owner, metadata));
  const live = { state: 'INGAME', matchId: 'live-match', players: roster(client) };
  const snapshot = { profile: { senseiAccountKey: account, activeSeasonId: 'new-act' }, connection: { status: 'connected' }, live };
  const token = 'b'.repeat(48);
  const settings = { remoteViewerEnabled: true, remoteViewerToken: token };
  const server = new OverlayServer({ port: 0, getSnapshot: () => snapshot, getSettings: () => settings,
    getPlayerEncounters: selection => client.getPlayerEncounters(selection) });
  const status = await server.start(); t.after(() => server.stop());
  const local = `http://127.0.0.1:${status.port}`;
  const fetchImpl = (url, init) => fetch(`${local}${new URL(url).pathname}`, init);
  const directory = temporary(t);
  const sourceUrl = `http://192.168.1.2:${status.port}/remote/${token}`;
  const viewer = new RemoteViewerClient({ sourceUrl, cacheDirectory: directory, fetchImpl });
  const received = (await viewer.requestSnapshot()).snapshot.live.players[1];
  assert.equal(received.encounters.total, 55); assert.equal(received.encounters.matches.length, 50);
  const selection = { encounterId: received.encounterId, matchId: live.matchId, offset: received.encounters.nextOffset };
  const page = await viewer.getPlayerEncounters(selection);
  assert.equal(page.matches.length, 5); assert.equal(page.nextOffset, null);
  assert.equal(new Set([...received.encounters.matches, ...page.matches].map(row => row.id)).size, 55);
  const restarted = new RemoteViewerClient({ sourceUrl, cacheDirectory: directory });
  assert.equal(restarted.restoreSnapshot().live.state, 'DISCONNECTED');
  assert.equal(restarted.lastSnapshot.live.players[1].encounters.total, 55);
  const denied = await fetch(`${local}/remote-encounters/${'a'.repeat(48)}`, { method: 'POST', body: JSON.stringify(selection) });
  assert.equal(denied.status, 404);
  assert.equal((await fetch(`${local}/remote-encounters/${token}`, { method: 'POST', body: JSON.stringify({ ...selection, encounterId: 'arbitrary-puuid' }) })).status, 500);
  settings.remoteViewerEnabled = false;
  await assert.rejects(viewer.getPlayerEncounters(selection), /Update the gaming PC/);
});
