'use strict';

const { EventEmitter } = require('node:events');
const { isPrivateIpv4 } = require('./overlay-server.cjs');

function parseRemoteViewerUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Paste the Remote Viewer URL copied from the gaming PC.'); }
  if (url.protocol !== 'http:' || !isPrivateIpv4(url.hostname)) {
    throw new Error('Remote Viewer only accepts a private-network BYAKUGAN address.');
  }
  const match = url.pathname.match(/^\/remote\/([a-f0-9]{48})$/);
  if (!match || url.username || url.password || url.search || url.hash) {
    throw new Error('The Remote Viewer URL is incomplete or invalid. Copy it again from the gaming PC.');
  }
  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('The Remote Viewer port is invalid.');
  return { url, token: match[1] };
}

class RemoteViewerClient extends EventEmitter {
  constructor({ sourceUrl = '', fetchImpl = globalThis.fetch, pollIntervalMs = 2500 } = {}) {
    super();
    this.sourceUrl = sourceUrl;
    this.fetchImpl = fetchImpl;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimer = null;
    this.lastSnapshot = null;
    this.etag = '';
    this.polling = false;
    this.failureNotified = false;
  }

  parsed() { return parseRemoteViewerUrl(this.sourceUrl); }

  async requestSnapshot({ force = false } = {}) {
    const { url } = this.parsed();
    const headers = {};
    if (!force && this.etag) headers['If-None-Match'] = this.etag;
    const response = await this.fetchImpl(url.href, {
      method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    if (response.status === 304 && this.lastSnapshot) return { snapshot: this.lastSnapshot, changed: false };
    if (!response.ok) throw new Error(response.status === 404
      ? 'The gaming PC rejected this connection. Re-copy the Remote Viewer URL.'
      : `The gaming PC returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.version !== 1 || !payload?.snapshot?.profile || !payload?.snapshot?.connection) {
      throw new Error('The gaming PC returned an incompatible BYAKUGAN snapshot.');
    }
    const snapshot = payload.snapshot;
    snapshot.connection = {
      ...snapshot.connection,
      status: 'connected',
      label: 'Gaming PC connected',
      source: 'remote',
      remoteHost: url.hostname
    };
    this.etag = response.headers.get('etag') || '';
    this.lastSnapshot = snapshot;
    this.failureNotified = false;
    return { snapshot, changed: true };
  }

  async connect() {
    const { snapshot } = await this.requestSnapshot({ force: true });
    this.startPolling();
    return snapshot;
  }

  async refresh() {
    const { snapshot } = await this.requestSnapshot({ force: true });
    return snapshot;
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      if (this.polling) return;
      this.polling = true;
      try {
        const result = await this.requestSnapshot();
        if (result.changed) {
          this.emit('snapshot', result.snapshot);
          this.emit('live-state', result.snapshot.live || {});
        }
      } catch (error) {
        this.etag = '';
        if (!this.failureNotified) {
          this.failureNotified = true;
          if (this.lastSnapshot) this.emit('snapshot', {
            ...this.lastSnapshot,
            connection: { ...this.lastSnapshot.connection, status: 'disconnected', source: 'remote' }
          });
          this.emit('warning', `Remote Viewer: ${error.message}`);
        }
      } finally {
        this.polling = false;
      }
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  disconnect() { this.stopPolling(); this.failureNotified = false; }

  async inspectPlayer(playerId) {
    const { url, token } = this.parsed();
    const endpoint = new URL(`/remote-inspect/${token}`, url.origin);
    const response = await this.fetchImpl(endpoint.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: String(playerId || '') }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(response.status === 404
      ? 'This player cannot be inspected from the gaming PC.'
      : `Remote player inspection failed with HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.version !== 1 || !payload?.profile) throw new Error('The gaming PC returned an incompatible player profile.');
    return payload.profile;
  }
}

module.exports = { RemoteViewerClient, parseRemoteViewerUrl };
