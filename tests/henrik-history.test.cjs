'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { checkHenrikHistory } = require('../src/main/services/henrik-history.cjs');
const hash = v => createHash('sha256').update(v).digest('hex');
const accountKey = `riot-${hash('self').slice(0,32)}`;
const profile = { gameName: 'Name With Spaces', tagLine: 'TAG', activeSeasonId: 'act', senseiAccountKey: accountKey,
  historyCheckContext: { accountKey, seasonId: 'act', matchHashes: [hash('known')] } };
const row = id => ({ meta: { id, season: { id: 'act' }, mode: 'Competitive', started_at: '2026-08-30T00:00:00Z' },
  stats: { puuid: 'self', team: 'Blue', kills: 20, deaths: 10, shots: { head: 5, body: 10, leg: 5 } }, teams: { blue: 13, red: 9 } });
test('history check scopes, deduplicates and compares validated records without disclosing the key', async () => {
  const otherAct = row('old'); otherAct.meta.season.id = 'old';
  const otherPlayer = row('other'); otherPlayer.stats.puuid = 'other';
  const result = await checkHenrikHistory({ key: 'secret-key', profile, region: 'NA', fetchImpl: async (url, options) => {
    assert.ok(url.includes('Name%20With%20Spaces'));
    assert.ok(!url.includes('secret-key'));
    assert.equal(options.headers.Authorization, 'secret-key');
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ status: 200, results: { total: 5 }, data: [row('known'), row('new'), row('new'), otherAct, otherPlayer] }) };
  } });
  assert.equal(result.matches, 2); assert.equal(result.missing, 1); assert.equal(result.invalid, 1);
  assert.equal(result.kd, 2); assert.equal(result.headshot, 25);
  assert.ok(!JSON.stringify(result).includes('secret-key'));
});
test('history check hides provider errors and rejects stale context', async () => {
  await assert.rejects(checkHenrikHistory({ key: 'secret', profile, region: 'na', fetchImpl: async () => { throw new Error('secret'); } }), /could not be reached/);
  await assert.rejects(checkHenrikHistory({ key: 'secret', profile: { ...profile, activeSeasonId: 'new' }, region: 'na' }), /updated gaming PC/);
  await assert.rejects(checkHenrikHistory({ key: 'secret', profile, region: 'na', fetchImpl: async () => ({ ok: false, status: 429 }) }), /rate limit/);
});
