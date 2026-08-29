'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLockfile, getLockfilePath } = require('../src/main/services/riot-lockfile.cjs');

test('parseLockfile returns validated Riot connection data', () => {
  assert.deepEqual(parseLockfile('Riot Client:1234:61542:secret:https\n'), {
    name: 'Riot Client', pid: 1234, port: 61542, password: 'secret', protocol: 'https'
  });
});

test('parseLockfile rejects malformed and dangerous values', () => {
  assert.throws(() => parseLockfile('broken'), /unexpected format/);
  assert.throws(() => parseLockfile('Riot:1:70000:secret:https'), /port is invalid/);
  assert.throws(() => parseLockfile('Riot:1:1234:secret:file'), /protocol is invalid/);
});

test('getLockfilePath supports an explicit development override', () => {
  const result = getLockfilePath({ COMPANION_LOCKFILE_PATH: './fixture/lockfile' }, 'linux');
  assert.match(result, /fixture[\\/]lockfile$/);
});

test('getLockfilePath supports the BYAKUGAN development override', () => {
  const result = getLockfilePath({ BYAKUGAN_LOCKFILE_PATH: './fixture/byakugan-lockfile' }, 'linux');
  assert.match(result, /fixture[\\/]byakugan-lockfile$/);
});
