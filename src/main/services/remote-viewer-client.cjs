'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
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
  constructor({ sourceUrl = '', fetchImpl = globalThis.fetch, pollIntervalMs = 2500, cacheDirectory = '' } = {}) {
    super();
    this.sourceUrl = sourceUrl;
    this.cacheDirectory = cacheDirectory;
    this.fetchImpl = fetchImpl;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimer = null;
    this.lastSnapshot = null;
    this.etag = '';
    this.polling = false;
    this.failureNotified = false;
  }

  parsed() { return parseRemoteViewerUrl(this.sourceUrl); }

  cachePath() {
    this.parsed();
    const hostKey = createHash('sha256').update(this.sourceUrl).digest('hex');
    return this.cacheDirectory ? path.join(this.cacheDirectory, `viewer-${hostKey}.json`) : '';
  }

  saveSnapshot(snapshot) {
    snapshot.connection.lastSyncedAt = new Date().toISOString();
    try {
      const file = this.cachePath();
      if (!file) return;
      const account = snapshot.profile.senseiAccountKey;
      const act = snapshot.profile.activeSeasonId;
      // Whole snapshots are replaced, never merged across accounts or Acts.
      const key = createHash('sha256').update(JSON.stringify([account, act])).digest('hex');
      const payload = JSON.stringify({ version: 1, snapshot });
      fs.mkdirSync(this.cacheDirectory, { recursive: true });
      const report = snapshot.actScanDiagnostics;
      const reportFile = path.join(this.cacheDirectory, 'act-scan-diagnostics.json');
      if (report?.version === 1 && report.accountKey === account && report.seasonId === act) {
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      } else {
        fs.rmSync(reportFile, { force: true });
      }
      for (const target of [file.replace('.json', `-${key}.json`), file]) {
        fs.writeFileSync(`${target}.tmp`, payload);
        try { fs.renameSync(`${target}.tmp`, target); }
        catch (error) {
          if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
          fs.copyFileSync(`${target}.tmp`, target);
          fs.unlinkSync(`${target}.tmp`);
        }
      }
    } catch { this.emit('warning', 'Streaming PC cache could not be saved.'); }
  }

  cachedSnapshot() {
    if (!this.lastSnapshot) return null;
    const snapshot = structuredClone(this.lastSnapshot);
    snapshot.connection = { ...snapshot.connection, status: 'disconnected', source: 'remote', label: 'Saved gaming PC data' };
    snapshot.live = { state: 'DISCONNECTED' };
    snapshot.profile.actStatsLoading = false;
    return snapshot;
  }

  restoreSnapshot() {
    try {
      const file = this.cachePath();
      if (!file) return null;
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (stored.version !== 1 || !stored.snapshot?.profile || !stored.snapshot?.connection?.lastSyncedAt) return null;
      this.lastSnapshot = stored.snapshot;
      return this.cachedSnapshot();
    } catch { return null; }
  }

  async requestSnapshot({ force = false } = {}) {
    const { url } = this.parsed();
    const headers = {};
    if (!force && this.etag) headers['If-None-Match'] = this.etag;
    const response = await this.fetchImpl(url.href, {
      method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    if (response.status === 304 && this.lastSnapshot) {
      this.saveSnapshot(this.lastSnapshot);
      return { snapshot: this.lastSnapshot, changed: false };
    }
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
    this.saveSnapshot(snapshot);
    this.lastSnapshot = snapshot;
    this.failureNotified = false;
    return { snapshot, changed: true };
  }

  async connect() {
    const cached = this.restoreSnapshot();
    if (cached) {
      this.etag = '';
      this.startPolling();
      return cached;
    }
    try {
      const { snapshot } = await this.requestSnapshot({ force: true });
      return snapshot;
    } finally { this.startPolling(); }
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
          if (this.lastSnapshot) this.emit('snapshot', this.cachedSnapshot());
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

  async updateSession(selection = {}) {
    const { url, token } = this.parsed();
    const endpoint = new URL(`/remote-session/${token}`, url.origin);
    const response = await this.fetchImpl(endpoint.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedMatchIds: Array.isArray(selection.selectedMatchIds) ? selection.selectedMatchIds.slice(0, 20) : [],
        candidateMatchIds: Array.isArray(selection.candidateMatchIds) ? selection.candidateMatchIds.slice(0, 20) : [],
        reset: selection.reset === true
      }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(response.status === 404
      ? 'Session recovery is unavailable on the gaming PC. Update both computers to the same BYAKUGAN version.'
      : `Remote session recovery failed with HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.version !== 1 || !payload?.snapshot?.profile || !payload?.snapshot?.connection) {
      throw new Error('The gaming PC returned an incompatible session snapshot.');
    }
    const snapshot = payload.snapshot;
    snapshot.connection = {
      ...snapshot.connection,
      status: 'connected',
      label: 'Gaming PC connected',
      source: 'remote',
      remoteHost: url.hostname
    };
    this.saveSnapshot(snapshot);
    this.lastSnapshot = snapshot;
    this.etag = '';
    return snapshot;
  }
}

module.exports = { RemoteViewerClient, parseRemoteViewerUrl };
