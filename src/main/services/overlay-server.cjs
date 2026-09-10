'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {
  DEFAULT_CUSTOM_OVERLAY_PORTRAIT,
  normalizeCustomOverlay,
  customElementVisible
} = require('../custom-overlay.cjs');

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

function overlayProfile(value) {
  return String(value || '').toLowerCase() === 'portrait' ? 'portrait' : 'landscape';
}

function buildOverlayPayload(snapshot = {}, settings = {}, requestedProfile = 'landscape') {
  const profile = snapshot.profile || {};
  const session = snapshot.analytics?.session || {};
  const live = snapshot.live || {};
  const self = (live.players || []).find((player) => player?.isSelf)
    || (live.players || []).find((player) => player?.name === 'You') || {};
  const layout = 'custom';
  const outputProfile = overlayProfile(requestedProfile);
  const customOverlay = outputProfile === 'portrait'
    ? normalizeCustomOverlay(settings.streamOverlayCustomPortrait, DEFAULT_CUSTOM_OVERLAY_PORTRAIT)
    : normalizeCustomOverlay(settings.streamOverlayCustom);
  const customInGame = customOverlay.reactive
    && ['INGAME', 'CORE_GAME'].includes(String(live.state || '').toUpperCase());
  const customStateElements = customInGame ? customOverlay.inGameElements : customOverlay.elements;
  const customStateElement = (id) => customStateElements.find((element) => element.id === id);
  const customBeam = customStateElements.find((element) => element.id === 'rrBeam');
  const customRank = customStateElement('currentRank');
  const customPeak = customStateElement('peakRank');
  const customLastMatch = customStateElement('lastMatch');
  const showBeamLastMatchRr = Boolean(customBeam?.visible && customBeam.showMarker !== false);
  const showIdentity = customElementVisible(customOverlay, 'playerName', customInGame);
  const showWl = customElementVisible(customOverlay, 'sessionWL', customInGame);
  const showKd = customElementVisible(customOverlay, 'sessionKD', customInGame);
  const showAgent = customElementVisible(customOverlay, 'agent', customInGame);
  const showMap = customElementVisible(customOverlay, 'map', customInGame);
  const showRR = customElementVisible(customOverlay, 'currentRR', customInGame)
    || customElementVisible(customOverlay, 'rrBeam', customInGame)
    || Boolean(customRank?.visible && customRank.showCurrentRR);
  const showPeakRank = customElementVisible(customOverlay, 'peakRank', customInGame);
  const showPeakDetail = Boolean(customPeak?.visible && customPeak.showDetail !== false);
  const showLastMatch = Boolean(customLastMatch?.visible);
  const showMatchScore = customElementVisible(customOverlay, 'matchScore', customInGame);
  const showRrChange = customElementVisible(customOverlay, 'rrChange', customInGame)
    || Boolean(customLastMatch?.visible && customLastMatch.showDetail !== false)
    || showBeamLastMatchRr;
  const animatedRrBeam = settings.streamOverlayAnimatedRrBeam !== false;
  const smoothTransitions = settings.streamOverlaySmoothTransitions !== false;
  const transitionSound = settings.streamOverlayTransitionSound === true;
  const matchPulse = Boolean(settings.streamOverlayMatchPulse) && customOverlay.reactive && customElementVisible(customOverlay, 'matchPulse', true);
  const matchPulseStyle = settings.streamOverlayMatchPulseStyle === 'dots' ? 'dots' : 'segments';
  const postMatchRecap = settings.streamOverlayPostMatchRecap !== false;
  const postMatchRecapSeconds = Math.round(Math.max(3, Math.min(15, Number(settings.streamOverlayPostMatchRecapSeconds) || 7)));
  const recentMatch = (snapshot.matches || []).find((match) => ['VICTORY', 'DEFEAT', 'DRAW'].includes(match?.result)) || {};
  const sessionMatchIds = new Set((session.matchIds || []).map(String));
  const lastMatch = (snapshot.matches || []).find((match) => sessionMatchIds.has(String(match?.id || ''))
    && ['VICTORY', 'DEFEAT', 'DRAW'].includes(match?.result)) || {};
  const liveAgentAvailable = self.agent && !['—', 'Selecting…', 'Unknown agent'].includes(self.agent);
  const fallbackAgentAvailable = recentMatch.agent && recentMatch.agent !== '—';
  const overlayAgent = liveAgentAvailable ? self : fallbackAgentAvailable ? recentMatch : {};
  const agentLabel = liveAgentAvailable ? liveLabel(live.state) : fallbackAgentAvailable ? 'LAST PLAYED' : 'WAITING FOR AGENT';
  const recapElements = customOverlay.reactive ? customOverlay.postMatchElements : [];
  const recapElement = (id) => recapElements.find((element) => element.id === id);
  const recapVisible = (id) => recapElements.some((element) => element.id === id && element.visible);
  const recapBeam = recapElement('rrBeam');
  const recapRank = recapElement('currentRank');
  const recapPeak = recapElement('peakRank');
  const recapLastMatch = recapElement('lastMatch');
  const recapShowIdentity = recapVisible('playerName');
  const recapShowCurrentRank = recapVisible('currentRank');
  const recapShowWl = recapVisible('sessionWL');
  const recapShowKd = recapVisible('sessionKD');
  const recapShowRR = recapVisible('currentRR') || recapVisible('rrBeam') || Boolean(recapRank?.visible && recapRank.showCurrentRR);
  const recapShowPeak = recapVisible('peakRank');
  const recapShowPeakDetail = Boolean(recapPeak?.visible && recapPeak.showDetail !== false);
  const recapShowLastMatch = Boolean(recapLastMatch?.visible);
  const recapShowChange = recapVisible('rrChange')
    || Boolean(recapLastMatch?.visible && recapLastMatch.showDetail !== false)
    || Boolean(recapBeam?.visible && recapBeam.showMarker !== false);
  const recapShowAgent = recapVisible('agent');
  const recapShowMap = recapVisible('map');
  const recapShowScore = recapVisible('matchScore');
  const recapShowPulse = Boolean(settings.streamOverlayMatchPulse) && recapVisible('matchPulse');
  return {
    version: 1,
    profile: outputProfile,
    updatedAt: new Date().toISOString(),
    layout,
    customOverlay,
    preferences: {
      showIdentity, showWl, showKd, showAgent, showMap, showRR, showPeakRank, showRrChange, animatedRrBeam,
      smoothTransitions, transitionSound, matchPulse, matchPulseStyle, postMatchRecap, postMatchRecapSeconds
    },
    appearance: { backgroundOpacity: overlayBackgroundOpacity(settings.streamOverlayBackgroundOpacity) },
    player: {
      name: showIdentity ? cleanText(profile.gameName, 'PLAYER', 32) : 'PLAYER',
      rank: cleanText(profile.rank, 'Unrated', 40),
      rankImage: mediaUrl(profile.rankImage),
      rr: showRR && Number.isFinite(Number(profile.rr)) ? Number(profile.rr) : 0,
      peakRank: showPeakRank ? cleanText(profile.peakRank, 'Unrated', 40) : '',
      peakRankImage: showPeakRank ? mediaUrl(profile.peakRankImage) : '',
      peakEpisode: showPeakDetail ? cleanText(profile.peakEpisode, '', 32) : '',
      peakAct: showPeakDetail ? cleanText(profile.peakAct, '', 32) : ''
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
      lastMatchResult: showLastMatch ? cleanText(lastMatch.result, 'NO MATCH', 16) : 'NO MATCH',
      lastMatchScore: showMatchScore ? cleanText(lastMatch.score, '—', 20) : '—',
      startingRank: showRrChange ? cleanText(session.startingRank, 'Unrated', 40) : 'Unrated',
      currentRank: showRrChange ? cleanText(session.currentRank || profile.rank, 'Unrated', 40) : 'Unrated'
    },
    live: {
      state: cleanText(live.state, 'MENUS', 24).toUpperCase(),
      label: liveLabel(live.state),
      score: showMatchScore || matchPulse ? cleanText(live.score, '', 20) : '',
      roundPulse: matchPulse ? (live.roundPulse || []).map((round) => (
        ['WIN', 'LOSS'].includes(String(round).toUpperCase()) ? String(round).toUpperCase() : 'UNKNOWN'
      )).slice(-50) : [],
      roundPulseRevision: matchPulse ? Number(live.roundPulseRevision) || 0 : 0,
      agentLabel: showAgent ? agentLabel : '',
      queue: cleanText(live.queue, 'Not queued', 40),
      map: showMap ? cleanText(live.map, '—', 40) : '—',
      agent: showAgent ? cleanText(overlayAgent.agent, 'Waiting…', 40) : '—',
      agentImage: showAgent ? mediaUrl(overlayAgent.agentImage) : ''
    },
    recap: {
      player: {
        name: recapShowIdentity ? cleanText(profile.gameName, 'PLAYER', 32) : 'PLAYER',
        rank: recapShowCurrentRank ? cleanText(profile.rank, 'Unrated', 40) : 'Unrated',
        rankImage: recapShowCurrentRank ? mediaUrl(profile.rankImage) : '',
        rr: recapShowRR && Number.isFinite(Number(profile.rr)) ? Number(profile.rr) : 0,
        peakRank: recapShowPeak ? cleanText(profile.peakRank, 'Unrated', 40) : '',
        peakRankImage: recapShowPeak ? mediaUrl(profile.peakRankImage) : '',
        peakEpisode: recapShowPeakDetail ? cleanText(profile.peakEpisode, '', 32) : '',
        peakAct: recapShowPeakDetail ? cleanText(profile.peakAct, '', 32) : ''
      },
      session: {
        wins: recapShowWl ? Number(session.wins) || 0 : 0,
        losses: recapShowWl ? Number(session.losses) || 0 : 0,
        kd: recapShowKd && Number.isFinite(Number(session.kd)) ? Number(session.kd) : 0,
        rrChange: recapShowChange ? Number(session.rrChange) || 0 : 0,
        beamProgress: recapShowRR ? rrBeamProgress(profile.rr) : 0,
        lastMatchRR: recapShowChange ? Number(lastMatch.rr) || 0 : 0,
        lastMatchResult: recapShowLastMatch ? cleanText(lastMatch.result, 'NO MATCH', 16) : 'NO MATCH',
        lastMatchScore: recapShowScore ? cleanText(lastMatch.score, '—', 20) : '—'
      },
      live: {
        label: liveLabel(live.state),
        score: recapShowScore || recapShowPulse ? cleanText(live.score, '', 20) : '',
        roundPulse: recapShowPulse ? (live.roundPulse || []).map((round) => (
          ['WIN', 'LOSS'].includes(String(round).toUpperCase()) ? String(round).toUpperCase() : 'UNKNOWN'
        )).slice(-50) : [],
        map: recapShowMap ? cleanText(lastMatch.map || live.map, '—', 40) : '—',
        agent: recapShowAgent ? cleanText(lastMatch.agent || overlayAgent.agent, 'Waiting…', 40) : '—',
        agentImage: recapShowAgent ? mediaUrl(lastMatch.agentImage || overlayAgent.agentImage) : ''
      }
    }
  };
}

class OverlayServer {
  constructor({ getSnapshot, getSettings, getHost, inspectPlayer, getPlayerEncounters, updateSession, importHistory, assetDirectory, host = LOOPBACK_HOST, port = DEFAULT_PORT } = {}) {
    this.getSnapshot = getSnapshot || (() => ({}));
    this.getSettings = getSettings || (() => ({}));
    this.assetDirectory = assetDirectory || path.join(__dirname, '..', '..', 'overlay');
    this.host = host;
    this.getHost = getHost || (() => host);
    this.inspectPlayer = inspectPlayer || null;
    this.getPlayerEncounters = getPlayerEncounters || null;
    this.updateSession = updateSession || null;
    this.importHistory = importHistory || null;
    this.port = port;
    this.server = null;
    this.clients = new Map();
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
    const overlayBaseUrl = running && overlayEnabled && token
      ? `http://${this.host}:${port}/overlay/${encodeURIComponent(token)}` : '';
    return {
      enabled: overlayEnabled,
      remoteEnabled,
      running,
      port,
      host: running ? this.host : '',
      access: running && this.host !== LOOPBACK_HOST ? 'network' : 'local',
      url: overlayBaseUrl ? `${overlayBaseUrl}?profile=landscape` : '',
      landscapeUrl: overlayBaseUrl ? `${overlayBaseUrl}?profile=landscape` : '',
      portraitUrl: overlayBaseUrl ? `${overlayBaseUrl}?profile=portrait` : '',
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
        ? `Port ${this.port} is already in use. Close every duplicate BYAKUGAN or BYAKUGAN Relay process in Windows Task Manager, then reopen BYAKUGAN. Resetting the OBS browser cache cannot release this port.`
        : cleanText(error?.message, 'The overlay server could not start.', 160);
      this.server?.close();
      this.server = null;
      throw new Error(this.lastError);
    }

    this.heartbeat = setInterval(() => {
      for (const client of this.clients.keys()) client.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 15_000);
    this.heartbeat.unref?.();
    return this.status();
  }

  async stop() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const client of this.clients.keys()) client.end();
    this.clients.clear();
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(resolve));
  }

  publish() {
    for (const [client, profile] of this.clients) {
      const payload = buildOverlayPayload(this.getSnapshot(), this.getSettings(), profile);
      client.write(`event: session\ndata: ${JSON.stringify(payload)}\n\n`);
    }
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
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data: https://media.valorant-api.com; media-src 'self'; connect-src 'self'"
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

    if (request.method === 'POST' && url.pathname.startsWith('/remote-encounters/')) {
      const token = url.pathname.slice('/remote-encounters/'.length);
      if (!this.authorizeRemote(url, token) || !this.getPlayerEncounters) return this.notFound(response);
      const body = await this.readJson(request);
      return this.sendJson(response, { version: 1, history: await this.getPlayerEncounters({
        encounterId: String(body.encounterId || '').slice(0, 100),
        matchId: String(body.matchId || '').slice(0, 100), offset: body.offset ?? 0
      }) });
    }

    if (request.method === 'POST' && url.pathname.startsWith('/remote-inspect/')) {
      let token = '';
      try { token = decodeURIComponent(url.pathname.slice('/remote-inspect/'.length)); } catch { return this.notFound(response); }
      if (!this.authorizeRemote(url, token) || !this.inspectPlayer) return this.notFound(response);
      const body = await this.readJson(request);
      const playerId = String(body.playerId || '').trim();
      if (!playerId || playerId.length > 100) return this.notFound(response);
      return this.sendJson(response, { version: 1, profile: await this.inspectPlayer(playerId) });
    }

    if (request.method === 'POST' && url.pathname.startsWith('/remote-history/')) {
      let token = '';
      try { token = decodeURIComponent(url.pathname.slice('/remote-history/'.length)); } catch { return this.notFound(response); }
      if (!this.authorizeRemote(url, token) || !this.importHistory) return this.notFound(response);
      const body = await this.readJson(request, 2 * 1024 * 1024);
      if (!Array.isArray(body.records) || body.records.length > 3000) return this.notFound(response);
      const result = await this.importHistory({ accountKey: body.accountKey, seasonId: body.seasonId, records: body.records });
      return this.sendJson(response, { version: 1, ...result });
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
    if (url.pathname === '/byakugan-eye-activation.mp3') return this.sendFile(response, 'byakugan-eye-activation.mp3', 'audio/mpeg');

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
      response.end(JSON.stringify(buildOverlayPayload(
        this.getSnapshot(), this.getSettings(), overlayProfile(url.searchParams.get('profile'))
      )));
      return;
    }

    if (url.pathname === '/events') {
      if (!this.authorize(url)) return this.notFound(response);
      response.writeHead(200, {
        ...this.headers('text/event-stream; charset=utf-8'),
        Connection: 'keep-alive'
      });
      response.write('retry: 2000\n\n');
      const profile = overlayProfile(url.searchParams.get('profile'));
      this.clients.set(response, profile);
      request.on('close', () => this.clients.delete(response));
      const payload = buildOverlayPayload(this.getSnapshot(), this.getSettings(), profile);
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
  overlayProfile,
  rrBeamProgress,
  tokenMatches
};
