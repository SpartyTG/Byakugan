'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SenseiBrainStore } = require('../src/main/sensei-brain/store.cjs');
const { SenseiStore } = require('../src/main/sensei-store.cjs');
const { senseiAccountKey } = require('../src/main/services/riot-client.cjs');
const { decideCurriculum } = require('../src/main/sensei-brain/curriculum.cjs');

test('Sensei uses a stable pseudonymous account key without exposing the Riot PUUID', () => {
  const puuid = 'f6c9496e-4d3a-5b2c-8123-private-riot-id';
  const key = senseiAccountKey(puuid);
  assert.match(key, /^riot-[a-f0-9]{32}$/);
  assert.doesNotMatch(key, new RegExp(puuid));
  assert.equal(senseiAccountKey(puuid), key);
  assert.notEqual(senseiAccountKey(`${puuid}-other`), key);
});

test('Sensei Brain counts each leak once per match, including regenerate and VOD reapply', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-brain-idempotent-'));
  try {
    const store = new SenseiBrainStore(directory);
    store.touchLeak('player', 'first_death_attack', 1, 'match-1');
    store.touchLeak('player', 'first_death_attack', 2, 'match-1');
    store.touchLeak('player', 'first_death_attack', 1, 'match-2');
    const leak = store.getLedger('player').first_death_attack;
    assert.equal(leak.timesSeen, 2);
    assert.deepEqual(leak.seenMatchIds, ['match-1', 'match-2']);
    assert.equal(leak.lastSeenMatchId, 'match-2');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Sensei Brain collects a baseline before labeling one ordinary match as a habit', () => {
  const first = decideCurriculum({
    accountId: 'player', rankBand: 'gold-plat',
    thisMatch: { matchId: 'match-1', leakSlugs: ['first_death_attack'], firstDeaths: 1 },
    lastMatches: [], openMission: null, blockedSlugs: []
  });
  assert.equal(first.primaryMission.slug, 'observe');

  const repeating = decideCurriculum({
    accountId: 'player', rankBand: 'gold-plat',
    thisMatch: { matchId: 'match-2', leakSlugs: ['first_death_attack'], firstDeaths: 1 },
    lastMatches: [{ matchId: 'match-1', leakSlugs: ['first_death_attack'] }],
    openMission: null, blockedSlugs: []
  });
  assert.equal(repeating.primaryMission.slug, 'first_death_attack');
});

test('Sensei account migration preserves reports, mission slug, cooldowns, and match memory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-brain-migrate-'));
  try {
    const reports = new SenseiStore(directory);
    const brain = new SenseiBrainStore(directory);
    reports.save('OldName#NA1', 'match-1', { status: 'failed', error: 'retry me' });
    brain.insertMatchMemory('OldName#NA1', { matchId: 'match-1', leakSlugs: ['first_death_attack'] });
    brain.touchLeak('OldName#NA1', 'first_death_attack', 1, 'match-1');
    brain.setMission('OldName#NA1', { slug: 'first_death_attack', title: 'Stop dying first on attack' });
    brain.closeMission('OldName#NA1', 'wrong', 'first_death_attack');

    assert.equal(reports.migrateAccount('OldName#NA1', 'riot-stable'), true);
    assert.equal(brain.migrateAccount('OldName#NA1', 'riot-stable'), true);
    assert.equal(reports.get('riot-stable', 'match-1').error, 'retry me');
    assert.equal(brain.getLastMatches('riot-stable', 8).length, 1);
    assert.equal(brain.getLedger('riot-stable').first_death_attack.timesSeen, 1);
    assert.deepEqual(brain.getBlockedSlugs('riot-stable'), ['first_death_attack']);
    assert.equal(reports.get('OldName#NA1', 'match-1'), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
