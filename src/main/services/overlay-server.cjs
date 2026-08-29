'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_PORT = 43871;

function createOverlayToken() {
  return crypto.randomBytes(24).toString('hex');
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

function buildOverlayPayload(snapshot = {}, settings = {}) {
  const profile = snapshot.profile || {};
  const session = snapshot.analytics?.session || {};
  const live = snapshot.live || {};
  const self = (live.players || []).find((player) => player?.isSelf) || {};
  const showIdentity = Boolean(settings.streamOverlayShowIdentity);
  const showAgentMap = settings.streamOverlayShowAgentMap !== false;
  const showRR = settings.streamOverlayShowRR !== false;
  const layout = ['horizontal', 'compact', 'vertical'].includes(settings.streamOverlayLayout)
    ? settings.streamOverlayLayout
    : 'horizontal';

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    layout,
    preferences: { showIdentity, showAgentMap, showRR },
    player: {
      name: showIdentity ? cleanText(profile.gameName, 'PLAYER', 32) : 'PLAYER',
      rank: cleanText(profile.rank, 'Unrated', 40),
      rankImage: mediaUrl(profile.rankImage),
      rr: Number.isFinite(Number(profile.rr)) ? Number(profile.rr) : 0
    },
    session: {
      games: Number(session.games) || 0,
      wins: Number(session.wins) || 0,
      losses: Number(session.losses) || 0,
      kd: Number.isFinite(Number(session.kd)) ? Number(session.kd) : 0,
      rrChange: Number(session.rrChange) || 0,
      startingRank: cleanText(session.startingRank, 'Unrated', 40),
      currentRank: cleanText(session.currentRank || profile.rank, 'Unrated', 40)
    },
    live: {
      state: cleanText(live.state, 'MENUS', 24).toUpperCase(),
      label: liveLabel(live.state),
      queue: cleanText(live.queue, 'Not queued', 40),
      map: showAgentMap ? cleanText(live.map, '—', 40) : '—',
      agent: showAgentMap ? cleanText(self.agent, '—', 40) : '—',
      agentImage: showAgentMap ? mediaUrl(self.agentImage) : ''
    }
  };
}

class OverlayServer {
  constructor({ getSnapshot, getSettings, assetDirectory, host = LOOPBACK_HOST, port = DEFAULT_PORT } = {}) {
    this.getSnapshot = getSnapshot || (() => ({}));
    this.getSettings = getSettings || (() => ({}));
    this.assetDirectory = assetDirectory || path.join(__dirname, '..', '..', 'overlay');
    this.host = host;
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
    return {
      enabled: Boolean(this.getSettings().streamOverlayEnabled),
      running,
      port,
      url: running && token ? `http://${this.host}:${port}/overlay/${encodeURIComponent(token)}` : '',
      error: this.lastError
    };
  }

  async start() {
    if (this.server?.listening) return this.status();
    this.lastError = '';
    this.server = http.createServer((request, response) => this.handle(request, response));
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

  headers(contentType) {
    return {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src data: https://media.valorant-api.com; connect-src 'self'"
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

  handle(request, response) {
    if (request.method !== 'GET') {
      response.writeHead(405, this.headers('text/plain; charset=utf-8'));
      response.end('Method not allowed.');
      return;
    }

    const url = new URL(request.url || '/', `http://${this.host}`);
    if (url.pathname === '/overlay.css') return this.sendFile(response, 'overlay.css', 'text/css; charset=utf-8');
    if (url.pathname === '/overlay.js') return this.sendFile(response, 'overlay.js', 'text/javascript; charset=utf-8');

    if (url.pathname.startsWith('/overlay/')) {
      let token = '';
      try { token = decodeURIComponent(url.pathname.slice('/overlay/'.length)); } catch { return this.notFound(response); }
      if (!this.authorize(url, token)) return this.notFound(response);
      return this.sendFile(response, 'index.html', 'text/html; charset=utf-8');
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
  createOverlayToken,
  tokenMatches
};
