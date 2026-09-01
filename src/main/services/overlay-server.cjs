'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { normalizeCustomOverlay, customElementVisible } = require('../custom-overlay.cjs');

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_PORT = 43871;

function isPrivateIpv4(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

function findLanHost(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces || {})) {
    for (const entry of addresses || []) {
      const family = typeof entry.family === 'string' ? entry.family : entry.family === 4 ? 'IPv4' : '';
      if (family !== 'IPv4' || entry.internal || !isPrivateIpv4(entry.address)) continue;
      const priority = entry.address.startsWith('192.168.') ? 0
        : entry.address.startsWith('10.') ? 1
          : entry.address.startsWith('172.') ? 2 : 3;
      candidates.push({ address: entry.address, name, priority });
    }
  }
  candidates.sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
  return candidates[0]?.address || '';
}

function createOverlayToken() {
  return crypto.randomBytes(24).toString('hex');
}

function buildRemotePayload(snapshot = {}) {
  return {
    version: 1,
    snapshot: JSON.parse(JSON.stringify(snapshot || {}))
  };
}

function tokenMatches(provided, expected) {
  const left = Buffer.from(String(provided || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function mediaUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'media.valorant-api.com' ? url.href : '';
  } catch {
    return '';
  }
}

function cleanText(value, fallback = '—', maximum = 80) {
  const result = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum);
  return result || fallback;
}

function liveLabel(value) {
  const state = String(value || '').toUpperCase();
  return {
    MENUS: 'IN MENUS', IDLE: 'IN MENUS', PREGAME: 'AGENT SELECT',
    INGAME: 'IN MATCH', CORE_GAME: 'IN MATCH'
  }[state] || 'CONNECTING';
}

function rrBeamProgress(value) {
  const rr = Number(value) || 0;
  return Math.round(Math.max(0, Math.min(100, rr)));
}

function overlayBackgroundOpacity(value) {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.round(Math.max(0, Math.min(100, opacity))) : 70;
}

function buildOverlayPayload(snapshot = {}, settings = {}) {
  const profile = snapshot.profile || {};
  const session = snapshot.analytics?.session || {};
  const live = snapshot.live || {};
  const self = (live.players || []).find((player) => player?.isSelf)
    || (live.players || []).find((player) => player?.name === 'You') || {};
  const layout = ['rank', 'reactive', 'custom', 'horizontal', 'compact', 'vertical'].includes(settings.streamOverlayLayout)
    ? settings.streamOverlayLayout
    : 'horizontal';
  const customOverlay = normalizeCustomOverlay(settings.streamOverlayCustom);
  const custom = layout === 'custom';
  const customInGame = custom && customOverlay.reactive
    && ['PREGAME', 'INGAME', 'CORE_GAME'].includes(String(live.state || '').toUpperCase());
  const showIdentity = custom ? customElementVisible(customOverlay, 'playerName', customInGame) : Boolean(settings.streamOverlayShowIdentity);
  const showWl = custom ? customElementVisible(customOverlay, 'sessionWL', customInGame) : settings.streamOverlayShowWl !== false;
  const showKd = custom ? customElementVisible(customOverlay, 'sessionKD', customInGame) : settings.streamOverlayShowKd !== false;
  const showAgent = custom ? customElementVisible(customOverlay, 'agent', customInGame) : settings.streamOverlayShowAgent !== false;
  const showMap = custom ? customElementVisible(customOverlay, 'map', customInGame) : settings.streamOverlayShowMap !== false;
  const showRR = custom
    ? customElementVisible(customOverlay, 'currentRR', customInGame) || customElementVisible(customOverlay, 'rrBeam', customInGame)
    : settings.streamOverlayShowRR !== false;
  const showPeakRank = custom ? customElementVisible(customOverlay, 'peakRank', customInGame) : settings.streamOverlayShowPeakRank !== false;
  const showRrChange = custom
    ? customElementVisible(customOverlay, 'rrChange', customInGame) || customElementVisible(customOverlay, 'lastMatch', customInGame)
    : settings.streamOverlayShowRrChange !== false;
  const animatedRrBeam = settings.streamOverlayAnimatedRrBeam !== false;
  const recentMatch = (snapshot.matches || []).find((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match?.result)) || {};
  const sessionMatchIds = new Set((session.matchIds || []).map(String));
  const lastMatch = (snapshot.matches || []).find((match) => sessionMatchIds.has(String(match?.id || ''))
    && ['VICTORY', 'DEFEAT', 'DRAW'].includes(match?.result)) || {};
  const liveAgentAvailable = self.agent && !['—', 'Selecting…', 'Unknown agent'].includes(self.agent);
  const fallbackAgentAvailable = recentMatch.agent && recentMatch.agent !== '—';
  const overlayAgent = liveAgentAvailable ? self : fallbackAgentAvailable ? recentMatch : {};
  const agentLabel = liveAgentAvailable ? liveLabel(live.state) : fallbackAgentAvailable ? 'LAST PLAYED' : 'WAITING FOR AGENT';
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    layout,
    customOverlay,
    preferences: { showIdentity, showWl, showKd, showAgent, showMap, showRR, showPeakRank, showRrChange, animatedRrBeam },
    appearance: { backgroundOpacity: overlayBackgroundOpacity(settings.streamOverlayBackgroundOpacity) },
    player: {
      name: showIdentity ? cleanText(profile.gameName, 'PLAYER', 32) : 'PLAYER',
      rank: cleanText(profile.rank, 'Unrated', 40),
      rankImage: mediaUrl(profile.rankImage),
      rr: showRR && Number.isFinite(Number(profile.rr)) ? Number(profile.rr) : 0,
      peakRank: showPeakRank ? cleanText(profile.peakRank, 'Unrated', 40) : '',
      peakRankImage: showPeakRank ? mediaUrl(profile.peakRankImage) : '',
      peakEpisode: showPeakRank ? cleanText(profile.peakEpisode, '', 32) : '',
      peakAct: showPeakRank ? cleanText(profile.peakAct, '', 32) : ''
    },
    session: {
      games: showWl ? Number(session.games) || 0 : 0,
      wins: showWl ? Number(session.wins) || 0 : 0,
      losses: showWl ? Number(session.losses) || 0 : 0,
      kd: showKd && Number.isFinite(Number(session.kd)) ? Number(session.kd) : 0,
      rrChange: showRrChange ? Number(session.rrChange) || 0 : 0,
      beamProgress: showRR ? rrBeamProgress(profile.rr) : 0,
      lastMatchId: cleanText(lastMatch.id, '', 100),
      lastMatchRR: showRrChange ? Number(lastMatch.rr) || 0 : 0,
      lastMatchResult: showRrChange ? cleanText(lastMatch.result, 'NO MATCH', 16) : 'NO MATCH',
      startingRank: showRrChange ? cleanText(session.startingRank, 'Unrated', 40) : 'Unrated',
      currentRank: showRrChange ? cleanText(session.currentRank || profile.rank, 'Unrated', 40) : 'Unrated'
    },
    live: {
      state: cleanText(live.state, 'MENUS', 24).toUpperCase(),
      label: liveLabel(live.state),
      agentLabel: showAgent ? agentLabel : '',
      queue: cleanText(live.queue, 'Not queued', 40),
      map: showMap ? cleanText(live.map, '—', 40) : '—',
      agent: showAgent ? cleanText(overlayAgent.agent, 'Waiting…', 40) : '—',
      agentImage: showAgent ? mediaUrl(overlayAgent.agentImage) : ''
    }
  };
}

class OverlayServer {
  constructor({ getSnapshot, getSettings, getHost, inspectPlayer, updateSession, assetDirectory, host = LOOPBACK_HOST, port = DEFAULT_PORT } = {}) {
    this.getSnapshot = getSnapshot || (() => ({}));
    this.getSettings = getSettings || (() => ({}));
    this.assetDirectory = assetDirectory || path.join(__dirname, '..', '..', 'overlay');
    this.host = host;
    this.getHost = getHost || (() => host);
    this.inspectPlayer = inspectPlayer || null;
    this.updateSession = updateSession || null;
    this.port = port;
    this.server = null;
    this.clients = new Set();
    this.heartbeat = null;
    this.lastError = '';
  }

  status() {
    const address = this.server?.address();
    const running = Boolean(this.server?.listening && address);
    const port = running && typeof address === 'object' ? address.port : this.port;
    const token = this.getSettings().streamOverlayToken || '';
    const remoteToken = this.getSettings().remoteViewerToken || '';
    const overlayEnabled = Boolean(this.getSettings().streamOverlayEnabled);
    const remoteEnabled = Boolean(this.getSettings().remoteViewerEnabled);
    return {
      enabled: overlayEnabled,
      remoteEnabled,
      running,
      port,
      host: running ? this.host : '',
      access: running && this.host !== LOOPBACK_HOST ? 'network' : 'local',
      url: running && overlayEnabled && token ? `http://${this.host}:${port}/overlay/${encodeURIComponent(token)}` : '',
      remoteUrl: running && remoteEnabled && remoteToken ? `http://${this.host}:${port}/remote/${encodeURIComponent(remoteToken)}` : '',
      error: this.lastError
    };
  }

  async start() {
    const desiredHost = cleanText(this.getHost(), '', 64);
    if (!desiredHost) {
      this.lastError = 'No private local-network IPv4 address was found. Connect this PC to your home network and try again.';
      throw new Error(this.lastError);
    }
    if (this.server?.listening && desiredHost === this.host) return this.status();
    if (this.server?.listening) await this.stop();
    this.host = desiredHost;
    this.lastError = '';
    this.server = http.createServer((request, response) => {
      Promise.resolve(this.handle(request, response)).catch(() => {
        if (!response.headersSent) response.writeHead(500, this.headers('application/json; charset=utf-8'));
        if (!response.writableEnded) response.end(JSON.stringify({ error: 'Remote request failed.' }));
      });
    });
    this.server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));

    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => { this.server?.off('listening', onListening); reject(error); };
        const onListening = () => { this.server?.off('error', onError); resolve(); };
        this.server.once('error', onError);
        this.server.once('listening', onListening);
        this.server.listen(this.port, this.host);
      });
    } catch (error) {
      this.lastError = error?.code === 'EADDRINUSE'
        ? `Port ${this.port} is already in use.`
        : cleanText(error?.message, 'The overlay server could not start.', 160);
      this.server?.close();
      this.server = null;
      throw new Error(this.lastError);
    }

    this.heartbeat = setInterval(() => {
      for (const client of this.clients) client.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 15_000);
    this.heartbeat.unref?.();
    return this.status();
  }

  async stop() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const client of this.clients) client.end();
    this.clients.clear();
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(resolve));
  }

  publish() {
    const payload = `event: session\ndata: ${JSON.stringify(buildOverlayPayload(this.getSnapshot(), this.getSettings()))}\n\n`;
    for (const client of this.clients) client.write(payload);
  }

  authorize(url, pathToken = '') {
    const provided = pathToken || url.searchParams.get('token') || '';
    return tokenMatches(provided, this.getSettings().streamOverlayToken);
  }

  authorizeRemote(url, pathToken = '') {
    const provided = pathToken || url.searchParams.get('token') || '';
    return Boolean(this.getSettings().remoteViewerEnabled)
      && tokenMatches(provided, this.getSettings().remoteViewerToken);
  }

  sendJson(response, value, request = null) {
    const body = JSON.stringify(value);
    const etag = `"${crypto.createHash('sha256').update(body).digest('hex')}"`;
    if (request?.headers?.['if-none-match'] === etag) {
      response.writeHead(304, { 'Cache-Control': 'no-store, max-age=0', ETag: etag });
      response.end();
      return;
    }
    response.writeHead(200, { ...this.headers('application/json; charset=utf-8'), ETag: etag });
    response.end(body);
  }

  async readJson(request, maximumBytes = 4096) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maximumBytes) throw new Error('Request too large.');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }

  headers(contentType) {
    return {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data: https://media.valorant-api.com; connect-src 'self'"
    };
  }

  sendFile(response, filename, contentType) {
    try {
      const body = fs.readFileSync(path.join(this.assetDirectory, filename));
      response.writeHead(200, this.headers(contentType));
      response.end(body);
    } catch {
      response.writeHead(500, this.headers('text/plain; charset=utf-8'));
      response.end('Overlay asset unavailable.');
    }
  }

  async handle(request, response) {
    const url = new URL(request.url || '/', `http://${this.host}`);

    if (request.method === 'POST' && url.pathname.startsWith('/remote-inspect/')) {
      let token = '';
      try { token = decodeURIComponent(url.pathname.slice('/remote-inspect/'.length)); } catch { return this.notFound(response); }
      if (!this.authorizeRemote(url, token) || !this.inspectPlayer) return this.notFound(response);
      const body = await this.readJson(request);
      const playerId = String(body.playerId || '').trim();
      if (!playerId || playerId.length > 100) return this.notFound(response);
      return this.sendJson(response, { version: 1, profile: await this.inspectPlayer(playerId) });
    }

    if (request.method === 'POST' && url.pathname.startsWith('/remote-session/')) {
      let token = '';
      try { token = decodeURIComponent(url.pathname.slice('/remote-session/'.length)); } catch { return this.notFound(response); }
      if (!this.authorizeRemote(url, token) || !this.updateSession) return this.notFound(response);
      const body = await this.readJson(request);
      const selectedMatchIds = Array.isArray(body.selectedMatchIds) ? body.selectedMatchIds.slice(0, 20) : [];
      const candidateMatchIds = Array.isArray(body.candidateMatchIds) ? body.candidateMatchIds.slice(0, 20) : [];
      const snapshot = await this.updateSession({
        selectedMatchIds,
        candidateMatchIds,
        reset: body.reset === true
      });
      return this.sendJson(response, buildRemotePayload(snapshot));
    }

    if (request.method !== 'GET') {
      response.writeHead(405, this.headers('text/plain; charset=utf-8'));
      response.end('Method not allowed.');
      return;
    }

    if (url.pathname === '/overlay.css') return this.sendFile(response, 'overlay.css', 'text/css; charset=utf-8');
    if (url.pathname === '/overlay.js') return this.sendFile(response, 'overlay.js', 'text/javascript; charset=utf-8');
    if (url.pathname === '/rr-energy-beam.gif') return this.sendFile(response, 'rr-energy-beam.gif', 'image/gif');

    if (url.pathname.startsWith('/overlay/')) {
      let token = '';
      try { token = decodeURIComponent(url.pathname.slice('/overlay/'.length)); } catch { return this.notFound(response); }
      if (!this.authorize(url, token)) return this.notFound(response);
      return this.sendFile(response, 'index.html', 'text/html; charset=utf-8');
    }

    if (url.pathname.startsWith('/remote/')) {
      let token = '';
      try { token = decodeURIComponent(url.pathname.slice('/remote/'.length)); } catch { return this.notFound(response); }
      if (!this.authorizeRemote(url, token)) return this.notFound(response);
      return this.sendJson(response, buildRemotePayload(this.getSnapshot()), request);
    }

    if (url.pathname === '/snapshot') {
      if (!this.authorize(url)) return this.notFound(response);
      response.writeHead(200, this.headers('application/json; charset=utf-8'));
      response.end(JSON.stringify(buildOverlayPayload(this.getSnapshot(), this.getSettings())));
      return;
    }

    if (url.pathname === '/events') {
      if (!this.authorize(url)) return this.notFound(response);
      response.writeHead(200, {
        ...this.headers('text/event-stream; charset=utf-8'),
        Connection: 'keep-alive'
      });
      response.write('retry: 2000\n\n');
      this.clients.add(response);
      request.on('close', () => this.clients.delete(response));
      const payload = buildOverlayPayload(this.getSnapshot(), this.getSettings());
      response.write(`event: session\ndata: ${JSON.stringify(payload)}\n\n`);
      return;
    }

    this.notFound(response);
  }

  notFound(response) {
    response.writeHead(404, this.headers('text/plain; charset=utf-8'));
    response.end('Not found.');
  }
}

module.exports = {
  DEFAULT_PORT,
  LOOPBACK_HOST,
  OverlayServer,
  buildOverlayPayload,
  buildRemotePayload,
  createOverlayToken,
  findLanHost,
  isPrivateIpv4,
  overlayBackgroundOpacity,
  rrBeamProgress,
  tokenMatches
};
