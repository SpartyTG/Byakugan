'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TrackerSyncStore, trackerProfileUrl, parseTrackerPage } = require('../src/main/tracker-sync-store.cjs');

const seasonId = '00000000-0000-0000-0000-000000000001';
const profile = () => ({ gameName: 'Example Player', tagLine: 'TEST', senseiAccountKey: `riot-${'a'.repeat(32)}`,
  activeSeasonId: seasonId, activeActLabel: 'V25: ACT V', wins: 1, losses: 2, draws: 0, kd: 0.5, headshot: 10, rr: 47 });
const pageUrl = () => trackerProfileUrl(profile());
const pageText = () => `Example Player#TEST\nCompetitive\nV25: ACT V\nOverview\n42 Matches\nWins\n20\nLosses\n19\nK/D Ratio\n1.07\nHeadshot %\n24.5%`;

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-tracker-sync-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('Tracker profile link is account-bound to the current Competitive Act', () => {
  const url = new URL(pageUrl());
  assert.equal(url.origin, 'https://tracker.gg');
  assert.equal(decodeURIComponent(url.pathname), '/valorant/profile/riot/Example Player#TEST/overview');
  assert.equal(url.searchParams.get('playlist'), 'competitive');
  assert.equal(url.searchParams.get('season'), seasonId);
});

test('visible Tracker overview parses W/L/D, K/D and headshot percentage', () => {
  const summary = parseTrackerPage({ text: pageText(), url: pageUrl() }, profile());
  assert.deepEqual({ matches: summary.matches, wins: summary.wins, losses: summary.losses, draws: summary.draws,
    kd: summary.kd, headshot: summary.headshot }, { matches: 42, wins: 20, losses: 19, draws: 3, kd: 1.07, headshot: 24.5 });
});

test('visible Tracker cards accept Matches Played, Matches Won and Matches Lost labels', () => {
  const trackerCards = `Example Player#TEST\nCompetitive\nV25: ACT V\nOverview\n42\nMatches Played\n20\nMatches Won\n19\nMatches Lost\n1.07\nK/D Ratio\n24.5%\nHeadshot %`;
  const summary = parseTrackerPage({ text: trackerCards, url: pageUrl() }, profile());
  assert.deepEqual({ matches: summary.matches, wins: summary.wins, losses: summary.losses, draws: summary.draws },
    { matches: 42, wins: 20, losses: 19, draws: 3 });
});

test('Tracker sync rejects private, wrong-account, wrong-Act and incomplete pages', () => {
  assert.throws(() => parseTrackerPage({ text: 'This profile is private', url: pageUrl() }, profile()), /private/i);
  const wrongAccount = new URL(pageUrl()); wrongAccount.pathname = '/valorant/profile/riot/Someone%23Else/overview';
  assert.throws(() => parseTrackerPage({ text: pageText(), url: wrongAccount.href }, profile()), /does not match/);
  const wrongAct = new URL(pageUrl()); wrongAct.searchParams.set('season', '00000000-0000-0000-0000-000000000002');
  assert.throws(() => parseTrackerPage({ text: pageText(), url: wrongAct.href }, profile()), /current Competitive Act/);
  assert.throws(() => parseTrackerPage({ text: 'Wins\n10', url: pageUrl() }, profile()),
    /Missing visible fields: Matches Played, Matches Lost, K\/D Ratio, Headshot %/);
});

test('synced summaries persist per account and Act without changing Riot profile data', t => {
  const directory = temporary(t);
  const original = { profile: profile(), matches: [{ id: 'riot-match' }] };
  const summary = parseTrackerPage({ text: pageText(), url: pageUrl() }, original.profile);
  const store = new TrackerSyncStore(directory);
  store.save(summary, original.profile);
  const decorated = new TrackerSyncStore(directory).decorate(original);
  assert.equal(decorated.trackerSync.wins, 20);
  assert.equal(decorated.profile.wins, 1);
  assert.equal(decorated.matches[0].id, 'riot-match');
  assert.equal(store.get({ ...profile(), activeSeasonId: '00000000-0000-0000-0000-000000000002' }), null);
  store.remove(original.profile);
  assert.equal(new TrackerSyncStore(directory).get(original.profile), null);
});

test('invalid cached counts are ignored instead of replacing Riot data', t => {
  const directory = temporary(t);
  const contextKey = `${profile().senseiAccountKey}:${seasonId}:competitive`;
  fs.writeFileSync(path.join(directory, 'tracker-sync.json'), JSON.stringify({
    version: 1,
    entries: {
      [contextKey]: { matches: 1, wins: 2, losses: 0, draws: -1, kd: 1, headshot: 20,
        source: 'tracker-visible-profile', syncedAt: new Date().toISOString() }
    }
  }));
  assert.equal(new TrackerSyncStore(directory).get(profile()), null);
});

test('Settings labels Tracker sync as experimental and exposes only visible-page actions', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../src/main/preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../src/main/index.cjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
  assert.match(html, /Experimental Tracker Sync/);
  assert.match(html, /awaits Riot approval/);
  assert.match(html, /Sync visible stats/);
  assert.match(preload, /openTrackerSyncProfile/);
  assert.match(main, /executeJavaScript/);
  assert.doesNotMatch(main, /api\.tracker\.gg/);
  assert.doesNotMatch(renderer, /renderStats\(state\.snapshot\.profile\);/);
  assert.match(renderer, /trackerSyncError/);
});
