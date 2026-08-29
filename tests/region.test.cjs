'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRegion, shardForRegion, deriveRegion } = require('../src/main/services/region.cjs');
const { isAllowedRemoteHost } = require('../src/main/services/riot-client.cjs');

test('normalizes supported regions and maps shards', () => {
  assert.equal(normalizeRegion('NorthAmerica'), 'na');
  assert.equal(normalizeRegion('EU'), 'eu');
  assert.equal(shardForRegion('latam'), 'na');
  assert.equal(shardForRegion('kr'), 'kr');
});

test('derives deployment from nested external session arguments', () => {
  const result = deriveRegion({}, { valorant: { launchConfiguration: { arguments: ['-ares-deployment=eu'] } } });
  assert.deepEqual(result, { region: 'eu', shard: 'eu' });
});

test('remote request host allowlist does not accept suffix spoofing', () => {
  assert.equal(isAllowedRemoteHost('pd.na.a.pvp.net'), true);
  assert.equal(isAllowedRemoteHost('valorant-api.com'), true);
  assert.equal(isAllowedRemoteHost('a.pvp.net.attacker.example'), false);
  assert.equal(isAllowedRemoteHost('example.com'), false);
});
