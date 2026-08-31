'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { snapshot } = require('./fixtures/mock-data.cjs');
const { RemoteViewerClient, parseRemoteViewerUrl } = require('../src/main/services/remote-viewer-client.cjs');

const token = 'c'.repeat(48);
const sourceUrl = `http://192.168.50.99:43871/remote/${token}`;

test('remote viewer URLs are restricted to tokenized private-network hosts', () => {
  const parsed = parseRemoteViewerUrl(sourceUrl);
  assert.equal(parsed.url.hostname, '192.168.50.99');
  assert.equal(parsed.token, token);
  assert.throws(() => parseRemoteViewerUrl(`http://203.0.113.8:43871/remote/${token}`), /private-network/);
  assert.throws(() => parseRemoteViewerUrl('http://192.168.50.99:43871/remote/short'), /incomplete or invalid/);
  assert.throws(() => parseRemoteViewerUrl(`https://192.168.50.99:43871/remote/${token}`), /private-network/);
});

test('remote viewer connects, labels the source, and proxies profile inspection', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'POST' && url.includes('/remote-session/')) {
      return new Response(JSON.stringify({ version: 1, snapshot }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (options.method === 'POST') {
      return new Response(JSON.stringify({ version: 1, profile: { playerId: 'friend-1', name: 'Visible Friend' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ version: 1, snapshot }), {
      status: 200, headers: { 'Content-Type': 'application/json', ETag: '"snapshot-1"' }
    });
  };
  const client = new RemoteViewerClient({ sourceUrl, fetchImpl, pollIntervalMs: 60_000 });
  try {
    const connected = await client.connect();
    assert.equal(connected.connection.source, 'remote');
    assert.equal(connected.connection.label, 'Gaming PC connected');
    assert.equal(connected.connection.remoteHost, '192.168.50.99');
    const profile = await client.inspectPlayer('friend-1');
    assert.deepEqual(profile, { playerId: 'friend-1', name: 'Visible Friend' });
    assert.match(calls[1].url, new RegExp(`/remote-inspect/${token}$`));
    const recovered = await client.updateSession({ selectedMatchIds: ['match-1'], candidateMatchIds: ['match-1'] });
    assert.equal(recovered.connection.source, 'remote');
    assert.match(calls[2].url, new RegExp(`/remote-session/${token}$`));
  } finally {
    client.disconnect();
  }
});
