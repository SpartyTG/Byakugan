'use strict';

const state = {
  snapshot: null,
  settings: null,
  currentView: 'dashboard',
  matchFilter: 'ALL',
  matchPlaylist: 'ALL',
  refreshTimer: null,
  busy: false,
  openMatchId: '',
  autopsyRound: 'ALL',
  openPlayerId: '',
  selectedSynergyFriendId: '',
  customOverlaySelectedId: 'branding',
  customOverlayCanvasState: 'between',
  overlayStatus: null,
  remoteStatus: null,
  updateStatus: null,
  senseiStatus: null,
  senseiBusy: false,
  senseiEntry: null,
  senseiSelectedMatchId: '',
  senseiReportsByMatch: {},
  senseiVodProgress: null,
  senseiVodStartedAt: 0,
  senseiVodTimer: null,
  senseiVodRequestActive: false,
  senseiVodActiveMatchId: ''
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const text = (selector, value) => { const element = $(selector); if (element) element.textContent = String(value ?? '—'); };
const SENSEI_VOD_CHECKPOINT_VERSIONS = Object.freeze({ adaptive: 5, exhaustive: 3 });
const OVERLAY_DIMENSIONS = Object.freeze({
  rank: { width: 480, height: 190 },
  reactive: { width: 480, height: 190 },
  custom: { width: 960, height: 360 },
  horizontal: { width: 1600, height: 180 },
  compact: { width: 560, height: 240 },
  vertical: { width: 380, height: 660 }
});
const CUSTOM_OVERLAY_LABELS = Object.freeze({
  branding: 'BYAKUGAN branding', playerName: 'Riot name', currentRank: 'Current rank', currentRR: 'Current RR',
  peakRank: 'Peak rank', sessionWL: 'Session W/L', sessionKD: 'Session K/D', rrChange: 'Session RR change',
  lastMatch: 'Last match', agent: 'Agent', map: 'Map', matchPulse: 'Match Pulse', matchScore: 'Final score', rrBeam: 'Animated RR beam'
});
const DEFAULT_CUSTOM_OVERLAY = Object.freeze({
  width: 960, height: 360, inGameWidth: 960, inGameHeight: 360, postMatchWidth: 960, postMatchHeight: 360, backgroundColor: '#0b0d1d',
  elements: [
    ['branding',true,3,5,27,18,28,100,'left','#ffffff'], ['playerName',false,3,27,25,12,24,100,'left','#c9bcff'],
    ['currentRank',true,58,5,39,25,34,100,'left','#ffffff'], ['currentRR',true,78,31,18,11,22,100,'right','#c9bcff'],
    ['peakRank',true,58,44,39,17,20,100,'left','#eeeaff'], ['sessionWL',true,3,48,22,14,25,100,'left','#ffffff'],
    ['sessionKD',true,27,48,18,14,25,100,'left','#ffffff'], ['rrChange',false,78,65,18,12,22,100,'right','#38e6c1'],
    ['lastMatch',true,58,65,38,13,20,100,'right','#ffffff'], ['agent',false,3,65,20,27,20,100,'left','#ffffff'],
    ['map',false,25,69,20,16,22,100,'left','#ffffff'], ['matchPulse',false,3,66,44,11,16,100,'left','#ffffff'],
    ['matchScore',false,46,66,18,11,22,100,'center','#ffffff'], ['rrBeam',true,3,82,94,13,16,100,'left','#70dfff',true]
  ].map(([id,visible,x,y,width,height,fontSize,opacity,align,color,showMarker]) => ({ id,visible,x,y,width,height,fontSize,labelFontSize:Math.max(6,Math.round(fontSize*.38)),detailFontSize:Math.max(6,Math.round(fontSize*.42)),showLabel:true,showDetail:true,opacity,align,color,...(id === 'rrBeam' ? { showMarker: showMarker !== false } : {}),...(id === 'currentRank' ? { showCurrentRR:false } : {}) })),
  reactive: false,
  inGameElements: [
    ['branding',false,3,5,24,18,24,100,'left','#ffffff'], ['playerName',false,3,27,25,12,22,100,'left','#c9bcff'],
    ['currentRank',true,3,7,51,28,30,100,'left','#ffffff'], ['currentRR',false,78,31,18,11,22,100,'right','#c9bcff'],
    ['peakRank',false,58,44,39,17,20,100,'left','#eeeaff'], ['sessionWL',true,58,8,22,22,24,100,'center','#ffffff'],
    ['sessionKD',true,81,8,16,22,24,100,'center','#ffffff'], ['rrChange',false,78,65,18,12,22,100,'right','#38e6c1'],
    ['lastMatch',false,58,65,38,13,20,100,'right','#ffffff'], ['agent',false,3,65,20,27,20,100,'left','#ffffff'],
    ['map',false,25,69,20,16,22,100,'left','#ffffff'], ['matchPulse',false,3,39,94,12,16,100,'left','#ffffff'],
    ['matchScore',false,46,66,18,11,22,100,'center','#ffffff'], ['rrBeam',true,3,58,94,28,20,100,'left','#70dfff',true]
  ].map(([id,visible,x,y,width,height,fontSize,opacity,align,color,showMarker]) => ({ id,visible,x,y,width,height,fontSize,labelFontSize:Math.max(6,Math.round(fontSize*.38)),detailFontSize:Math.max(6,Math.round(fontSize*.42)),showLabel:true,showDetail:true,opacity,align,color,...(id === 'rrBeam' ? { showMarker: showMarker !== false } : {}),...(id === 'currentRank' ? { showCurrentRR:false } : {}) })),
  postMatchElements: [
    ['branding',true,3,5,27,18,28,100,'left','#ffffff'], ['playerName',false,3,27,25,12,24,100,'left','#c9bcff'],
    ['currentRank',true,61,5,36,20,28,100,'left','#ffffff'], ['currentRR',true,79,27,18,10,20,100,'right','#c9bcff'],
    ['peakRank',false,61,40,36,16,19,100,'left','#eeeaff'], ['sessionWL',true,3,40,24,16,26,100,'left','#ffffff'],
    ['sessionKD',true,29,40,19,16,26,100,'left','#ffffff'], ['rrChange',false,50,40,18,14,24,100,'center','#38e6c1'],
    ['lastMatch',true,33,5,26,22,31,100,'center','#ffffff'], ['agent',false,3,62,20,27,20,100,'left','#ffffff'],
    ['map',false,25,65,20,16,22,100,'left','#ffffff'], ['matchPulse',false,3,62,44,11,16,100,'left','#ffffff'],
    ['matchScore',true,50,40,18,14,24,100,'center','#ffffff'], ['rrBeam',true,3,76,94,18,20,100,'left','#70dfff',true]
  ].map(([id,visible,x,y,width,height,fontSize,opacity,align,color,showMarker]) => ({ id,visible,x,y,width,height,fontSize,labelFontSize:Math.max(6,Math.round(fontSize*.38)),detailFontSize:Math.max(6,Math.round(fontSize*.42)),showLabel:true,showDetail:true,opacity,align,color,...(id === 'rrBeam' ? { showMarker: showMarker !== false } : {}),...(id === 'currentRank' ? { showCurrentRR:false } : {}) }))
});
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const safeImage = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'media.valorant-api.com' ? escapeHtml(url.href) : '';
  } catch { return ''; }
};

function toast(title, message, kind = '') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  $('#toastStack').append(node);
  setTimeout(() => node.remove(), 4800);
}

function setLoading(show, message = 'Loading…') {
  $('#loadingOverlay').classList.toggle('hidden', !show);
  text('#loadingText', message);
}

function formatState(value) {
  const states = { MENUS: 'IN MENUS', PREGAME: 'AGENT SELECT', INGAME: 'IN MATCH', CORE_GAME: 'IN MATCH' };
  return states[String(value || '').toUpperCase()] || String(value || 'Unknown').replaceAll('_', ' ');
}

function formatElapsed(milliseconds) {
  const total = Math.max(0, Math.floor(Number(milliseconds || 0) / 1_000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatEta(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return 'Estimating remaining time…';
  const hours = Math.floor(total / 3600);
  const minutes = Math.ceil((total % 3600) / 60);
  return hours ? `Approximately ${hours}h ${minutes}m remaining` : `Approximately ${Math.max(1, minutes)}m remaining`;
}

function mergeSenseiVodProgress(previous, next) {
  const latest = next && typeof next === 'object' ? next : {};
  const latestEta = Math.max(0, Number(latest.etaSeconds) || 0);
  const previousEta = Math.max(0, Number(previous?.etaSeconds) || 0);
  if (latestEta > 0 || previousEta <= 0 || ['complete', 'failed', 'canceled'].includes(latest.phase)) return { ...latest };
  return { ...latest, etaSeconds: previousEta };
}

function renderSenseiVodGlobal() {
  const indicator = $('#senseiVodGlobal');
  if (!indicator) return;
  const progress = state.senseiVodProgress;
  const active = Boolean(state.senseiVodActiveMatchId && progress && !['complete', 'failed', 'canceled'].includes(progress.phase));
  indicator.hidden = !active;
  const navBadge = $('#senseiNavBadge');
  if (navBadge) navBadge.hidden = !active;
  const hubCard = $('#senseiHubActive');
  if (hubCard) hubCard.hidden = !active;
  if (!active) return;
  const completed = Math.max(0, Number(progress.current) || 0);
  const total = Math.max(0, Number(progress.total) || 0);
  const count = progress.phase === 'adaptive-scan'
    ? `Scanning ${formatElapsed((Number(progress.mediaSeconds) || 0) * 1_000)} / ${formatElapsed((Number(progress.durationSeconds) || 0) * 1_000)}`
    : total ? `${completed} / ${total} ${progress.mode === 'adaptive' ? 'review windows' : 'segments'}` : 'Preparing analysis';
  const detail = `${count} • ${formatEta(progress.etaSeconds)}`;
  const elapsed = formatElapsed(Date.now() - (state.senseiVodStartedAt || Date.now()));
  const match = findMatchById(state.senseiVodActiveMatchId);
  text('#senseiVodGlobalDetail', detail);
  text('#senseiVodGlobalElapsed', elapsed);
  text('#senseiHubActiveTitle', match ? `${match.map || 'Match'} • ${match.agent || 'Agent unavailable'}` : 'Reviewing match');
  text('#senseiHubActiveDetail', `${progress.message || 'Reviewing chronological frames'} • ${detail}`);
  text('#senseiHubActiveElapsed', elapsed);
}

function senseiProgressPercent(progress = {}) {
  const ratio = Number(progress.total) > 0 ? Math.max(0, Math.min(1, Number(progress.current) / Number(progress.total))) : 0;
  if (progress.phase === 'adaptive-scan') return Math.max(2, Math.round(ratio * 12));
  if (progress.phase === 'full-analysis') return progress.mode === 'adaptive' ? 12 + Math.round(ratio * 84) : Math.max(1, Math.round(ratio * 96));
  if (progress.phase === 'extracting') return Math.round(ratio * 35);
  if (progress.phase === 'loading-model') return 38;
  if (progress.phase === 'reviewing') return 40 + Math.round(ratio * 50);
  if (progress.phase === 'validating') return 97;
  if (progress.phase === 'saving') return 99;
  if (progress.phase === 'complete') return 100;
  return 4;
}

function updateSenseiVodElapsed() {
  const element = $('#senseiVodElapsed');
  if (element && state.senseiVodStartedAt) element.textContent = formatElapsed(Date.now() - state.senseiVodStartedAt);
  renderSenseiVodGlobal();
}

function startSenseiVodTimer() {
  clearInterval(state.senseiVodTimer);
  state.senseiVodStartedAt ||= Date.now();
  updateSenseiVodElapsed();
  state.senseiVodTimer = setInterval(updateSenseiVodElapsed, 1_000);
}

function stopSenseiVodTimer() {
  clearInterval(state.senseiVodTimer);
  state.senseiVodTimer = null;
}

function initials(name) {
  return String(name || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function setConnection(connection) {
  const connected = connection?.status === 'connected';
  const remote = connection?.source === 'remote' || state.settings?.pcRole === 'viewer';
  $('#statusPill').classList.toggle('disconnected', !connected);
  $('#miniDot').classList.toggle('error', !connected);
  text('#statusText', connected ? connection.label : remote ? 'Gaming PC disconnected' : 'Disconnected');
  text('#statusSubtext', connected ? (remote ? `${connection.remoteHost || 'LAN'} • Remote` : `${connection.region} • Live`) : remote ? 'Remote Viewer unavailable' : 'Riot Client unavailable');
  text('#miniStatus', connected ? connection.label : remote ? 'Gaming PC disconnected' : 'Disconnected');
  text('#miniRegion', connected ? (remote ? `${connection.remoteHost || 'LAN'} host` : `${connection.region} region`) : 'Retry connection');
  text('#connectButton', remote ? 'Reconnect Host' : connected ? 'Reconnect Riot' : 'Connect Riot');
}

function renderStats(profile) {
  const scope = profile.statsScope || 'ACT';
  const values = [
    ['WIN / LOSS', `${profile.wins} / ${profile.losses}`, scope],
    ['K/D RATIO', profile.kd, scope],
    ['HEADSHOT %', `${profile.headshot}${typeof profile.headshot === 'number' ? '%' : ''}`, scope],
    ['RANK RATING', `${profile.rr} RR`, 'CURRENT'],
    [
      'DODGE RR LOST',
      `−${Number(profile.dodgeRrLost) || 0} RR`,
      profile.dodgeStatsLoading
        ? 'LOADING HISTORY'
        : `${Number(profile.dodgeCount) || 0} DODGE${Number(profile.dodgeCount) === 1 ? '' : 'S'} • ${profile.dodgeStatsScope || 'TRACKED'}`,
      'penalty'
    ]
  ];
  $('#statsGrid').innerHTML = values.map(([label, value, note, tone = '']) => `<article class="stat-card ${tone}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><em>${escapeHtml(note)}</em></article>`).join('');
}

function matchRow(match, compact = false, full = false) {
  const defeat = match.result === 'DEFEAT';
  const rr = Number(match.rr) || 0;
  const playlist = match.playlist || 'Unknown Playlist';
  const competitive = match.isCompetitive === true || String(match.queueId || '').toLowerCase() === 'competitive';
  const hasRating = competitive && (match.hasRating === true || (match.hasRating === undefined && match.rr !== null && match.rr !== undefined));
  const rating = hasRating ? `${rr > 0 ? '+' : rr < 0 ? '−' : '±'}${Math.abs(rr)} RR` : competitive ? 'RR pending' : '—';
  const rankImage = safeImage(match.rankImage);
  if (!full) {
    return `<div class="match-row ${defeat ? 'defeat' : ''}" data-match-id="${escapeHtml(match.id)}">
      <span class="match-stripe"></span><span class="result"><strong>${escapeHtml(match.result)}</strong><small>${escapeHtml(playlist)}</small></span>
      <span class="match-map">${safeImage(match.agentImage) ? `<img src="${safeImage(match.agentImage)}" alt="">` : ''}<span><strong>${escapeHtml(match.map)}</strong><small>${escapeHtml(match.agent)}</small></span></span>
      <span class="score">${escapeHtml(match.score)}</span><span class="kda">${escapeHtml(match.kills)} / ${escapeHtml(match.deaths)} / ${escapeHtml(match.assists)}</span>
      <span class="rr-change ${rr < 0 ? 'negative' : ''} ${hasRating ? '' : 'unrated'}">${escapeHtml(rating)}</span>
    </div>`;
  }
  return `<div class="match-row ${defeat ? 'defeat' : ''} ${compact ? 'compact' : ''}" data-match-id="${escapeHtml(match.id)}">
    <span class="result"><strong>${escapeHtml(match.result)}</strong><small>${escapeHtml(playlist)}</small></span>
    <span class="match-map">${safeImage(match.agentImage) ? `<img src="${safeImage(match.agentImage)}" alt="">` : ''}<span><strong>${escapeHtml(match.map)}</strong><small>${escapeHtml(match.agent)}</small></span></span>
    <span class="score">${escapeHtml(match.score)}</span>
    <span class="kda">${escapeHtml(match.kills)} / ${escapeHtml(match.deaths)} / ${escapeHtml(match.assists)}</span>
    <span>${escapeHtml(match.kd)}</span>
    <span class="match-rating">${competitive && rankImage ? `<img src="${rankImage}" alt="${escapeHtml(match.rankName || 'Competitive rank')}">` : ''}<span class="rr-change ${rr < 0 ? 'negative' : ''} ${hasRating ? '' : 'unrated'}">${escapeHtml(rating)}</span></span>
    <span class="match-time">${escapeHtml(match.ago)}</span>
  </div>`;
}

function friendRow(friend) {
  const activity = friend.score || (friend.state === 'ingame' ? 'LIVE' : friend.state === 'pregame' ? 'SELECT' : friend.state === 'offline' ? 'OFFLINE' : friend.state === 'away' ? 'AWAY' : 'ONLINE');
  return `<div class="friend-row">
    <div class="friend-avatar">${escapeHtml(initials(friend.name))}<i class="${escapeHtml(friend.state)}"></i></div>
    <div class="friend-name"><strong>${escapeHtml(friend.name)} <em>#${escapeHtml(friend.tag)}</em></strong><small>${escapeHtml(friend.status)}</small></div>
    <span class="friend-activity ${escapeHtml(friend.state)}"><small>${escapeHtml(friend.game || 'RIOT')}</small><strong>${escapeHtml(activity)}</strong></span>
  </div>`;
}

function renderMatches() {
  const matches = state.snapshot?.matches || [];
  $('#dashboardMatches').innerHTML = matches.slice(0, 4).map((match) => matchRow(match)).join('') || '<div class="empty-state">No recent matches returned.</div>';
  const playlistSelect = $('#matchPlaylistFilter');
  const playlists = new Map([
    ['competitive', 'Competitive'], ['unrated', 'Unrated'], ['swiftplay', 'Swiftplay'],
    ['spikerush', 'Spike Rush'], ['deathmatch', 'Deathmatch'], ['hurm', 'Team Deathmatch'],
    ['ggteam', 'Escalation'], ['onefa', 'Replication'], ['premier', 'Premier'], ['custom', 'Custom Game']
  ]);
  for (const match of matches) playlists.set(String(match.queueId || match.playlist || 'unknown').toLowerCase(), match.playlist || 'Unknown Playlist');
  const preferred = ['competitive', 'unrated', 'swiftplay', 'spikerush', 'deathmatch', 'hurm', 'premier'];
  const playlistRows = [...playlists].sort((left, right) => {
    const leftIndex = preferred.indexOf(left[0]);
    const rightIndex = preferred.indexOf(right[0]);
    if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    return left[1].localeCompare(right[1]);
  });
  playlistSelect.innerHTML = `<option value="ALL">All playlists</option>${playlistRows.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('')}`;
  if (!playlists.has(state.matchPlaylist)) state.matchPlaylist = 'ALL';
  playlistSelect.value = state.matchPlaylist;
  const byResult = state.matchFilter === 'ALL' ? matches : matches.filter((match) => match.result === state.matchFilter);
  const filtered = state.matchPlaylist === 'ALL' ? byResult : byResult.filter((match) => String(match.queueId || match.playlist || 'unknown').toLowerCase() === state.matchPlaylist);
  $('#fullMatchList').innerHTML = filtered.map((match) => matchRow(match, state.settings?.compactMatches, true)).join('') || '<div class="empty-state">No matches in this filter.</div>';
  const selectedPlaylist = state.matchPlaylist === 'ALL' ? 'all playlists' : playlists.get(state.matchPlaylist) || 'playlist';
  text('#matchSummary', `${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'} • ${selectedPlaylist}`);
}

function renderFriends() {
  const friends = state.snapshot?.friends || [];
  const priority = { ingame: 0, pregame: 1, online: 2, other: 3, away: 4, offline: 5 };
  const ordered = [...friends].sort((left, right) => (priority[left.state] ?? 4) - (priority[right.state] ?? 4) || String(left.name).localeCompare(String(right.name)));
  const online = ordered.filter((friend) => friend.state !== 'offline');
  $('#dashboardFriends').innerHTML = online.slice(0, 5).map(friendRow).join('') || '<div class="empty-state">No friends online.</div>';
  $('#socialFriends').innerHTML = ordered.map(friendRow).join('') || '<div class="empty-state">No friends returned by Riot Client.</div>';
  text('#friendsCount', `${online.length} online`);
  text('#onlineBadge', online.length);
  text('#socialCount', `${friends.length} contacts`);
}

function renderLoadout() {
  const loadout = state.snapshot?.loadout || [];
  $('#loadoutGrid').innerHTML = loadout.map((item) => `<article class="weapon-card" style="--card-color:${escapeHtml(item.color)}"><small>${escapeHtml(item.slot)}</small>${safeImage(item.image) ? `<div class="weapon-image"><img src="${safeImage(item.image)}" alt="${escapeHtml(item.skin)}"></div>` : '<div class="weapon-shape"></div>'}<small>${escapeHtml(item.edition)}</small><strong>${escapeHtml(item.skin)}</strong></article>`).join('') || '<div class="empty-state glass">No equipped loadout was returned.</div>';
}

function renderAgents() {
  const agents = state.snapshot?.agents || [];
  $('#agentGrid').innerHTML = agents.map((agent) => `<article class="agent-card" style="--agent-color:${escapeHtml(agent.color)}"><div class="agent-portrait">${safeImage(agent.image) ? `<img src="${safeImage(agent.image)}" alt="${escapeHtml(agent.name)}">` : escapeHtml(agent.initials || initials(agent.name))}</div><h3>${escapeHtml(agent.name)}</h3><p>${escapeHtml(agent.role)} • ${escapeHtml(agent.games || 0)} act ${Number(agent.games) === 1 ? 'match' : 'matches'}</p><div class="agent-performance"><span><small>WIN RATE</small><strong>${escapeHtml(agent.winRate ?? 0)}%</strong></span><span><small>K/D</small><strong>${escapeHtml(agent.kd ?? '—')}</strong></span><span><small>HS</small><strong>${escapeHtml(agent.headshot ?? 0)}%</strong></span></div><div class="mastery-line"><div><span>ACT PICK RATE</span><strong>${escapeHtml(agent.mastery || 0)}%</strong></div><span><i style="width:${Number(agent.mastery) || 0}%"></i></span></div></article>`).join('') || '<div class="empty-state glass">Agent usage will appear after competitive matches load.</div>';
}

function trajectorySvg(journey, compact = false) {
  const rows = (journey || []).filter((point) => Number.isFinite(Number(point.rr)));
  if (!rows.length) return '<div class="empty-state">Competitive RR movement will appear here.</div>';
  const width = 820;
  const height = compact ? 92 : 260;
  const padX = compact ? 5 : 28;
  const padY = compact ? 8 : 24;
  const values = rows.map((point) => Number(point.tier || 0) * 100 + Number(point.rr || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(20, max - min);
  const points = rows.map((point, index) => ({
    ...point,
    x: rows.length === 1 ? width / 2 : padX + (index / (rows.length - 1)) * (width - padX * 2),
    y: height - padY - ((values[index] - min) / range) * (height - padY * 2)
  }));
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;
  const id = compact ? 'mini' : 'full';
  const dots = compact ? '' : points.map((point) => `<circle class="trajectory-dot" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(point.rank)} ${escapeHtml(point.rr)} RR • ${escapeHtml(point.map)} • ${escapeHtml(point.rrChange > 0 ? `+${point.rrChange}` : point.rrChange)} RR</title></circle>`).join('');
  const labels = compact ? '' : `<text class="journey-label" x="${padX}" y="${height - 3}">${escapeHtml(rows[0].rank)}</text><text class="journey-label" text-anchor="end" x="${width - padX}" y="${height - 3}">${escapeHtml(rows.at(-1).rank)}</text>`;
  return `<svg class="trajectory-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Act rank trajectory"><defs><linearGradient id="line-${id}" x1="0" x2="1"><stop stop-color="#7457ef"/><stop offset=".55" stop-color="#c7baff"/><stop offset="1" stop-color="#39e6c1"/></linearGradient><linearGradient id="area-${id}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8b6cff" stop-opacity=".25"/><stop offset="1" stop-color="#8b6cff" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#area-${id})"/><polyline points="${line}" fill="none" stroke="url(#line-${id})" stroke-width="${compact ? 3 : 4}" vector-effect="non-scaling-stroke"/>${dots}${labels}</svg>`;
}

function renderOverviewAnalytics() {
  const analytics = state.snapshot?.analytics || {};
  const insight = analytics.insights?.[0];
  const target = $('#primaryInsight');
  if (insight) {
    target.innerHTML = `<div class="insight-orbit"><span></span><i></i></div><div><p class="eyebrow">BYAKUGAN INSIGHT</p><h2>${escapeHtml(insight.title)}</h2><p>${escapeHtml(insight.body)}</p></div><button class="text-button" id="allInsightsButton">All insights <span>→</span></button>`;
    $('#allInsightsButton')?.addEventListener('click', () => navigate('insights'));
  }
  const journey = analytics.journey || [];
  $('#miniTrajectory').innerHTML = trajectorySvg(journey, true);
  const rrDelta = journey.reduce((total, point) => total + (Number(point.rrChange) || 0), 0);
  text('#trajectoryDelta', `${rrDelta > 0 ? '+' : ''}${rrDelta} RR`);
  const session = analytics.session || {};
  $('#sessionMini').innerHTML = `<div class="session-mini-head"><p class="eyebrow">CURRENT SESSION</p><button class="text-button" data-manage-session>Manage</button></div><h2>${session.games || 0} ${Number(session.games) === 1 ? 'match' : 'matches'} analyzed</h2><div class="session-mini-grid"><span><small>W / L</small><strong>${escapeHtml(session.wins || 0)} / ${escapeHtml(session.losses || 0)}</strong></span><span><small>K/D</small><strong>${escapeHtml(session.kd ?? '—')}</strong></span><span><small>RR</small><strong>${session.rrChange > 0 ? '+' : ''}${escapeHtml(session.rrChange || 0)}</strong></span></div>`;
}

function sessionCandidates() {
  return (state.snapshot?.matches || [])
    .filter((match) => match?.id && ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result))
    .slice(0, 10);
}

function sessionMatchTime(match) {
  const timestamp = Number(match?.startedAt) || 0;
  if (!timestamp) return match?.ago || 'Recent match';
  return new Date(timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function updateSessionRecoveryCount() {
  const count = $$('#sessionRecoveryList input[type="checkbox"]:checked').length;
  text('#sessionRecoveryCount', `${count} ${count === 1 ? 'match' : 'matches'} selected`);
}

function openSessionManager() {
  const selected = new Set(state.snapshot?.analytics?.session?.matchIds || []);
  const candidates = sessionCandidates();
  $('#sessionRecoveryList').innerHTML = candidates.map((match, index) => {
    const rr = Number(match.rr) || 0;
    const rrLabel = match.isCompetitive || String(match.queueId || '').toLowerCase() === 'competitive'
      ? `${rr > 0 ? '+' : ''}${rr} RR`
      : match.playlist || 'Non-competitive';
    return `<label class="session-recovery-match ${match.result === 'DEFEAT' ? 'loss' : 'win'}">
      <input type="checkbox" value="${escapeHtml(match.id)}" ${selected.has(match.id) ? 'checked' : ''}>
      <i></i><span><strong>${escapeHtml(match.result)} • ${escapeHtml(match.map || match.playlist || 'Match')}</strong><small>${escapeHtml(match.agent || 'Agent unavailable')} • ${escapeHtml(match.kills)} / ${escapeHtml(match.deaths)} / ${escapeHtml(match.assists)} • ${escapeHtml(sessionMatchTime(match))}</small></span>
      <em>${escapeHtml(rrLabel)}</em>${index === 0 ? '<b>LATEST</b>' : ''}
    </label>`;
  }).join('') || '<div class="empty-state">No completed recent matches are available yet. Select Refresh Data, then reopen session recovery.</div>';
  $('#sessionModal').hidden = false;
  updateSessionRecoveryCount();
}

function closeSessionManager() {
  $('#sessionModal').hidden = true;
}

async function saveSessionManager() {
  const candidates = sessionCandidates();
  if (!candidates.length) return;
  const selectedMatchIds = $$('#sessionRecoveryList input[type="checkbox"]:checked').map((input) => input.value);
  $('#saveSessionManager').disabled = true;
  try {
    const snapshot = await window.companion.updateSession({
      selectedMatchIds,
      candidateMatchIds: candidates.map((match) => match.id)
    });
    renderSnapshot(snapshot);
    closeSessionManager();
    toast('Session restored', `${selectedMatchIds.length} recent ${selectedMatchIds.length === 1 ? 'match is' : 'matches are'} now included in the current session and OBS overlay.`);
  } catch (error) {
    toast('Session recovery failed', error.message || 'The current session could not be updated.', 'error');
  } finally {
    $('#saveSessionManager').disabled = false;
  }
}

async function startNewSession() {
  if (!window.confirm('Start a new session now? Current session games will be cleared from the dashboard and OBS overlay, but match history will not be deleted.')) return;
  $('#startNewSession').disabled = true;
  try {
    const snapshot = await window.companion.updateSession({ reset: true });
    renderSnapshot(snapshot);
    closeSessionManager();
    toast('New session started', 'Session W/L, K/D, and RR movement were reset. Match history was not changed.');
  } catch (error) {
    toast('Could not start a new session', error.message || 'Try Refresh Data and start again.', 'error');
  } finally {
    $('#startNewSession').disabled = false;
  }
}

function renderJourney() {
  const profile = state.snapshot?.profile || {};
  const analytics = state.snapshot?.analytics || {};
  text('#journeyRank', profile.rank);
  text('#journeyRR', `${profile.rr ?? 0} RR`);
  text('#journeyScope', profile.statsScope || 'ACT');
  const image = safeImage(profile.rankImage);
  const element = $('#journeyRankImage');
  if (image) { element.src = image; element.hidden = false; }
  else { element.removeAttribute('src'); element.hidden = true; }
  $('#journeyChart').innerHTML = trajectorySvg(analytics.journey || []);
  const events = (analytics.journey || []).slice(-8).reverse();
  $('#journeyEvents').innerHTML = events.map((event) => `<article class="journey-event ${event.result === 'VICTORY' ? 'win' : event.result === 'DEFEAT' ? 'loss' : ''}"><small>${escapeHtml(event.result)}</small><strong>${escapeHtml(event.map)} • ${escapeHtml(event.agent)}</strong><span>${escapeHtml(event.rank)} • ${escapeHtml(event.rr)} RR • ${event.rrChange > 0 ? '+' : ''}${escapeHtml(event.rrChange)} RR</span></article>`).join('') || '<div class="empty-state glass">No current-act competitive journey is available.</div>';
}

function findMatchById(matchId) {
  return [...(state.snapshot?.matches || []), ...(state.snapshot?.synergyMatches || [])]
    .find((match) => match.id === matchId);
}

function completedSenseiMatches() {
  return (state.snapshot?.matches || [])
    .filter((match) => match?.id && ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result))
    .slice(0, 20);
}

function senseiEntryLabel(entry) {
  if (entry?.vod?.status === 'analyzed' && entry.vod.report) return 'VOD READY';
  if (entry?.vod?.checkpoint && ['canceled', 'failed'].includes(entry.vod.status)) return 'VOD PAUSED';
  if (entry?.vod?.status === 'analyzing') return 'VOD RUNNING';
  if (entry?.status === 'ready' && entry.report) return entry.tier === 'sensei' ? 'FULL SENSEI' : 'SENSEI LITE';
  if (entry?.status === 'failed') return 'RETRY';
  return 'NOT ANALYZED';
}

function renderOverviewSenseiFocus() {
  const entries = Object.values(state.senseiReportsByMatch || {});
  const selected = state.senseiReportsByMatch[state.senseiSelectedMatchId];
  const entry = selected?.report ? selected : entries.find((candidate) => candidate?.status === 'ready' && candidate.report);
  const target = $('#senseiFocusMini');
  if (!target) return;
  if (!entry?.report?.focusRule) {
    target.innerHTML = `<div><p class="eyebrow">CURRENT COACHING FOCUS</p><h2>No Sensei report selected</h2><p>Analyze a completed match to place its next-match focus here.</p></div><button class="text-button" data-sensei-overview-open>Open Sensei <span>→</span></button>`;
  } else {
    target.innerHTML = `<div><p class="eyebrow">CURRENT COACHING FOCUS</p><h2>${escapeHtml(entry.report.focusRule)}</h2><p>${escapeHtml(entry.tier === 'sensei' ? 'Full Sensei report' : 'Sensei Lite report')} • Open the workspace for drills and evidence.</p></div><button class="text-button" data-sensei-overview-open>Open Sensei <span>→</span></button>`;
  }
}

function renderSenseiHubLists() {
  const matches = completedSenseiMatches();
  const picker = $('#senseiMatchPicker');
  if (!picker) return;
  picker.innerHTML = matches.map((match) => {
    const entry = state.senseiReportsByMatch[match.id];
    return `<button type="button" class="sensei-match-option ${String(match.result).toLowerCase()} ${state.senseiSelectedMatchId === match.id ? 'active' : ''}" data-sensei-match-id="${escapeHtml(match.id)}"><span>${escapeHtml(match.result)}</span><span><strong>${escapeHtml(match.map || 'Unknown map')} • ${escapeHtml(match.agent || 'Agent unavailable')}</strong><small>${escapeHtml(match.score || 'Score unavailable')} • ${escapeHtml(match.kills)} / ${escapeHtml(match.deaths)} / ${escapeHtml(match.assists)} • ${escapeHtml(match.ago || 'Recent match')}</small></span><em>${escapeHtml(senseiEntryLabel(entry))}</em></button>`;
  }).join('') || '<div class="empty-state">No completed matches are available. Refresh BYAKUGAN after finishing a match.</div>';
  const reports = matches.filter((match) => {
    const entry = state.senseiReportsByMatch[match.id];
    return entry?.status === 'ready' || entry?.vod?.path || entry?.vod?.checkpoint || entry?.vod?.report;
  });
  $('#senseiRecentReports').innerHTML = reports.map((match) => {
    const entry = state.senseiReportsByMatch[match.id];
    return `<button type="button" class="sensei-report-option ${String(match.result).toLowerCase()}" data-sensei-match-id="${escapeHtml(match.id)}"><span>${escapeHtml(match.result)}</span><span><strong>${escapeHtml(match.map || 'Unknown map')} • ${escapeHtml(match.agent || 'Agent unavailable')}</strong><small>${escapeHtml(entry?.report?.focusRule || match.ago || 'Saved coaching report')}</small></span><em>${escapeHtml(senseiEntryLabel(entry))}</em></button>`;
  }).join('') || '<div class="empty-state">Completed Sensei reports will appear here.</div>';
  text('#senseiReportCount', `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`);
  renderOverviewSenseiFocus();
}

async function selectSenseiMatch(matchId) {
  const id = String(matchId || '');
  if (!findMatchById(id)) return;
  state.senseiSelectedMatchId = id;
  state.senseiEntry = state.senseiReportsByMatch[id] || null;
  renderSenseiHubLists();
  const panel = $('#senseiWorkspacePanel');
  if (panel) panel.innerHTML = '<div class="sensei-empty"><strong>Loading saved Sensei workspace…</strong><span>Opening this match does not start a new analysis.</span></div>';
  await hydrateSenseiPanel(id);
  if (state.senseiEntry) state.senseiReportsByMatch[id] = state.senseiEntry;
  renderSenseiHubLists();
  requestAnimationFrame(() => $('#senseiWorkspacePanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function hydrateSenseiHub() {
  const matches = completedSenseiMatches();
  renderSenseiHubLists();
  const token = Date.now();
  state.senseiHubLoadToken = token;
  const entries = await Promise.all(matches.map(async (match) => [match.id, await window.companion.getSenseiReport(match.id).catch(() => null)]));
  if (state.senseiHubLoadToken !== token) return;
  for (const [matchId, entry] of entries) if (entry) state.senseiReportsByMatch[matchId] = entry;
  if (!matches.some((match) => match.id === state.senseiSelectedMatchId)) {
    state.senseiSelectedMatchId = matches.find((match) => state.senseiReportsByMatch[match.id]?.status === 'ready')?.id || matches[0]?.id || '';
  }
  renderSenseiHubLists();
  if (state.senseiSelectedMatchId) await hydrateSenseiPanel(state.senseiSelectedMatchId);
  refreshSenseiStatus();
}

function synergyMatchRow(match) {
  const defeat = match.result === 'DEFEAT';
  const rr = Number(match.rr) || 0;
  const agentImage = safeImage(match.agentImage);
  const rating = match.hasRating === true ? `${rr > 0 ? '+' : rr < 0 ? '−' : '±'}${Math.abs(rr)} RR` : 'RR pending';
  return `<button type="button" class="synergy-match-row ${defeat ? 'defeat' : ''}" data-synergy-match-id="${escapeHtml(match.id)}">
    <span class="synergy-match-result"><i></i><span><strong>${escapeHtml(match.result)}</strong><small>${escapeHtml(match.ago || 'Tracked match')}</small></span></span>
    <span class="synergy-match-map">${agentImage ? `<img src="${agentImage}" alt="">` : ''}<span><strong>${escapeHtml(match.map)}</strong><small>${escapeHtml(match.agent)} • ${escapeHtml(match.playlist || 'Competitive')}</small></span></span>
    <span class="synergy-match-score"><small>SCORE</small><strong>${escapeHtml(match.score)}</strong></span>
    <span class="synergy-match-kda"><small>K / D / A</small><strong>${escapeHtml(match.kills)} / ${escapeHtml(match.deaths)} / ${escapeHtml(match.assists)}</strong></span>
    <span class="synergy-match-rr ${rr < 0 ? 'negative' : ''}">${escapeHtml(rating)}</span>
    <span class="synergy-match-open">View →</span>
  </button>`;
}

function renderSynergy(analytics = state.snapshot?.analytics || {}) {
  const synergy = analytics.synergy || [];
  if (!synergy.length) {
    state.selectedSynergyFriendId = '';
    $('#synergyList').innerHTML = '<div class="empty-state">No visible Riot friends appeared in tracked competitive matches.</div>';
    $('#synergyDetail').innerHTML = '<div class="synergy-detail-empty"><strong>No shared history yet</strong><p>Shared matches appear after full-act tracking identifies a visible Riot friend on your team.</p></div>';
    return;
  }
  if (!synergy.some((friend) => friend.id === state.selectedSynergyFriendId)) {
    state.selectedSynergyFriendId = synergy[0].id;
  }
  $('#synergyList').innerHTML = synergy.map((friend) => `<button type="button" class="synergy-friend-option ${friend.id === state.selectedSynergyFriendId ? 'active' : ''}" data-synergy-id="${escapeHtml(friend.id)}"><span class="synergy-friend-avatar">${escapeHtml(initials(friend.name))}</span><span><strong>${escapeHtml(friend.name)}${friend.tag ? ` <em>#${escapeHtml(friend.tag)}</em>` : ''}</strong><small>${escapeHtml(friend.games)} shared ${Number(friend.games) === 1 ? 'match' : 'matches'} • ${escapeHtml(friend.winRate)}% win rate</small></span><i>›</i></button>`).join('');
  const friend = synergy.find((item) => item.id === state.selectedSynergyFriendId) || synergy[0];
  const matchesById = new Map((state.snapshot?.synergyMatches || []).map((match) => [match.id, match]));
  const matches = (friend.matchIds || []).map((id) => matchesById.get(id) || findMatchById(id)).filter(Boolean);
  $('#synergyDetail').innerHTML = `<div class="synergy-detail-head"><div><p class="eyebrow">DUO HISTORY</p><h3>${escapeHtml(friend.name)}${friend.tag ? ` <em>#${escapeHtml(friend.tag)}</em>` : ''}</h3><p>${escapeHtml(friend.games)} tracked current-act competitive ${Number(friend.games) === 1 ? 'match' : 'matches'} together.</p></div><span class="feature-chip">${escapeHtml(friend.winRate)}% WIN RATE</span></div><div class="synergy-summary-grid"><span><small>W / L</small><strong>${escapeHtml(friend.wins)} / ${escapeHtml(friend.losses)}</strong></span><span><small>YOUR K/D</small><strong>${escapeHtml(friend.kd)}</strong></span><span><small>YOUR RR</small><strong>${friend.rr > 0 ? '+' : ''}${escapeHtml(friend.rr)}</strong></span><span><small>GAMES</small><strong>${escapeHtml(friend.games)}</strong></span></div><div class="synergy-match-heading"><span>SHARED MATCH HISTORY</span><small>Click a match for the full Match Autopsy</small></div><div class="synergy-match-list">${matches.map(synergyMatchRow).join('') || '<div class="empty-state">Shared match details are still loading.</div>'}</div>`;
}

function renderInsights() {
  const analytics = state.snapshot?.analytics || {};
  const insights = analytics.insights || [];
  $('#insightGrid').innerHTML = insights.map((insight, index) => `<article class="insight-card glass ${escapeHtml(insight.tone)}" data-icon="${escapeHtml(insight.icon)}"><span class="insight-index">SIGNAL ${String(index + 1).padStart(2, '0')}</span><h3>${escapeHtml(insight.title)}</h3><p>${escapeHtml(insight.body)}</p></article>`).join('') || '<div class="empty-state glass">More competitive matches are needed for insights.</div>';
  const challenges = analytics.challenges || [];
  $('#challengeGrid').innerHTML = challenges.map((challenge) => `<div class="challenge-row"><div><h3>${escapeHtml(challenge.title)}</h3><p>${escapeHtml(challenge.description)}</p></div><div class="challenge-progress"><span><i style="width:${Math.max(0, Math.min(100, Number(challenge.current) || 0))}%"></i></span><strong>${escapeHtml(challenge.target)}</strong></div></div>`).join('') || '<div class="empty-state">Challenges appear after competitive matches load.</div>';
  const session = analytics.session || {};
  $('#sessionCard').innerHTML = `<div class="panel-heading"><div><p class="eyebrow">SESSION MODE</p><h2>Current run</h2></div><span class="feature-chip">LIVE</span></div><p class="muted">Automatically preserved through app restarts and updates.</p><div class="session-score"><div><small>MATCHES</small><strong>${escapeHtml(session.games || 0)}</strong></div><div><small>WIN / LOSS</small><strong>${escapeHtml(session.wins || 0)} / ${escapeHtml(session.losses || 0)}</strong></div><div><small>SESSION K/D</small><strong>${escapeHtml(session.kd ?? '—')}</strong></div><div><small>RR MOVEMENT</small><strong>${session.rrChange > 0 ? '+' : ''}${escapeHtml(session.rrChange || 0)}</strong></div></div><button class="ghost-button session-manage-full" data-manage-session>Manage or recover session games</button>`;
  renderSynergy(analytics);
}

function renderMaps() {
  const maps = state.snapshot?.analytics?.maps || [];
  $('#mapLabGrid').innerHTML = maps.map((map) => `<article class="map-lab-card glass">${safeImage(map.image) ? `<img src="${safeImage(map.image)}" alt="">` : ''}<div class="map-lab-content"><p class="eyebrow">${escapeHtml(map.games)} ACT ${Number(map.games) === 1 ? 'MATCH' : 'MATCHES'}</p><h2>${escapeHtml(map.name)}</h2><div class="map-metrics"><span><small>WIN RATE</small><strong>${escapeHtml(map.winRate)}%</strong></span><span><small>K/D</small><strong>${escapeHtml(map.kd)}</strong></span><span><small>HS</small><strong>${escapeHtml(map.headshot)}%</strong></span><span><small>AVG KILLS</small><strong>${escapeHtml(map.averageKills)}</strong></span></div><div class="map-win-bar"><i style="width:${Math.max(0, Math.min(100, Number(map.winRate) || 0))}%"></i></div></div></article>`).join('') || '<div class="empty-state glass">Map analytics will appear after competitive matches load.</div>';
}

function renderServers() {
  const servers = state.snapshot?.analytics?.servers || [];
  $('#serverGrid').innerHTML = servers.map((server) => `<article class="server-card glass"><div class="server-card-head"><div><p class="eyebrow">RIOT GAME SERVER</p><h2>${escapeHtml(server.name)}</h2><span class="server-region">${escapeHtml(server.region || 'Detected from match routing')}</span></div><span class="server-match-count">${escapeHtml(server.games)} ${Number(server.games) === 1 ? 'MATCH' : 'MATCHES'}</span></div><div class="server-metrics"><span><small>W / L</small><strong>${escapeHtml(server.wins)} / ${escapeHtml(server.losses)}</strong></span><span><small>WIN RATE</small><strong>${escapeHtml(server.winRate)}%</strong></span><span><small>K/D</small><strong>${escapeHtml(server.kd)}</strong></span><span><small>HEADSHOT</small><strong>${escapeHtml(server.headshot)}%</strong></span><span><small>AVG KILLS</small><strong>${escapeHtml(server.averageKills)}</strong></span><span><small>RR</small><strong>${server.rr > 0 ? '+' : ''}${escapeHtml(server.rr)}</strong></span></div><div class="server-win-bar"><i style="width:${Math.max(0, Math.min(100, Number(server.winRate) || 0))}%"></i></div></article>`).join('') || '<div class="empty-state glass">Server performance will appear as full-act match details finish loading.</div>';
}

function matchVerdict(match) {
  const openings = (Number(match.report?.openingKills) || 0) - (Number(match.report?.openingDeaths) || 0);
  if (match.result === 'VICTORY' && Number(match.kd) >= 1.3) return ['High-impact victory', 'You combined a positive result with strong personal efficiency. Review the highlighted multikill and opening-duel rounds to reinforce what worked.'];
  if (openings < 0) return ['First contact created pressure', `You finished ${Math.abs(openings)} opening duel${Math.abs(openings) === 1 ? '' : 's'} negative. Prioritize survival, trading distance, and a safer first engagement next match.`];
  if (Number(match.kd) < 1) return ['Low-survival match', 'Deaths outpaced kills. The round timeline identifies where early deaths and low-damage rounds clustered.'];
  if (match.result === 'DEFEAT') return ['Positive individual performance', 'Your personal output remained stable despite the loss. Focus on converting the strongest rounds into repeatable team advantages.'];
  return ['Balanced performance', 'No single metric dominated this result. Use the round timeline to compare your highest-damage rounds with the rounds where impact dropped.'];
}

function historicalPlayerRow(player) {
  const agentImage = safeImage(player.agentImage);
  const rankImage = safeImage(player.rankImage);
  const displayName = player.hidden ? player.agent : player.name || 'Riot Player';
  const detail = player.hidden ? 'IDENTITY HIDDEN' : player.agent;
  const clickable = Boolean(player.inspectable && player.profileId);
  const peakLabel = player.peakRank ? `PEAK ${player.peakRank}` : 'PEAK UNAVAILABLE';
  const peakContext = [player.peakEpisode, player.peakAct].filter(Boolean).join(' • ') || 'EPISODE / ACT UNAVAILABLE';
  return `<div class="history-player ${player.isSelf ? 'self' : ''} ${player.hidden ? 'hidden-name' : ''} ${clickable ? 'inspectable' : ''}" ${clickable ? `data-player-id="${escapeHtml(player.profileId)}" role="button" tabindex="0"` : ''}>
    <div class="history-player-agent" style="--player-color:${escapeHtml(player.agentColor || '#7b67f6')}">${agentImage ? `<img src="${agentImage}" alt="${escapeHtml(player.agent)}">` : `<span>${escapeHtml(initials(player.agent))}</span>`}</div>
    <div class="history-player-name"><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(detail)}</small></div>
    <div class="history-player-performance"><small>THIS MATCH</small><strong>${escapeHtml(player.kills)} / ${escapeHtml(player.deaths)} / ${escapeHtml(player.assists)}</strong><em>${escapeHtml(player.acs || 0)} ACS</em></div>
    <div class="history-player-rank">${rankImage ? `<img src="${rankImage}" alt="">` : '<i></i>'}<span><small>MATCH RANK</small><strong>${escapeHtml(player.rank)}</strong><em>${escapeHtml(peakLabel)}</em><b>${escapeHtml(peakContext)}</b></span></div>
  </div>`;
}

function matchEvents(match) {
  return (match.report?.rounds || []).flatMap((round) => (round.events || []).map((event) => ({ ...event, round: round.round })));
}

function eventTimestamp(event) {
  if (!event.time) return 'TIME N/A';
  return event.timeScope === 'MATCH' ? `${event.time} MATCH` : event.time;
}

function eventLabel(event) {
  const action = event.type === 'KILL' ? 'Eliminated' : 'Killed by';
  const place = event.callout ? ` • ${event.callout}` : '';
  return `Round ${event.round} • Event #${event.sequence || 1} • ${eventTimestamp(event)} • ${action} ${event.opponentAgent || 'Unknown agent'}${place}`;
}

function showTacticalTooltip(target) {
  const node = target?.closest?.('[data-tactical-tooltip]');
  const map = node?.closest?.('.tactical-map');
  const tooltip = map?.querySelector('.tactical-hover-card');
  if (!node || !tooltip) return;
  tooltip.textContent = node.dataset.tacticalTooltip || '';
  tooltip.hidden = false;
}

function hideTacticalTooltip(target, relatedTarget) {
  const node = target?.closest?.('[data-tactical-tooltip]');
  if (!node || (relatedTarget && node.contains(relatedTarget))) return;
  const tooltip = node.closest('.tactical-map')?.querySelector('.tactical-hover-card');
  if (tooltip) tooltip.hidden = true;
}

function tacticalMapMarkup(match, selectedRound) {
  const rounds = match.report?.rounds || [];
  const allEvents = matchEvents(match);
  const selected = String(selectedRound || 'ALL');
  const visibleEvents = selected === 'ALL' ? allEvents : allEvents.filter((event) => String(event.round) === selected);
  const positioned = visibleEvents.filter((event) => event.playerPoint);
  const mapImage = safeImage(match.mapTacticalImage);
  const controls = `<div class="tactical-round-picker"><button type="button" data-tactical-round="ALL" class="${selected === 'ALL' ? 'active' : ''}">ALL</button>${rounds.map((round) => `<button type="button" data-tactical-round="${escapeHtml(round.round)}" class="${selected === String(round.round) ? 'active' : ''}">R${escapeHtml(round.round)}</button>`).join('')}</div>`;
  if (!mapImage || !positioned.length) {
    return `<section class="tactical-section"><div class="panel-heading"><div><p class="eyebrow">TACTICAL REPLAY</p><h2>Round event map</h2></div><span class="muted">Completed-match data only</span></div>${controls}<div class="tactical-empty"><strong>Position data unavailable</strong><span>Riot returned the round results, but this match did not include enough calibrated location snapshots to draw the event map.</span></div></section>`;
  }
  const mapNodes = positioned.map((event) => {
    const type = event.type.toLowerCase();
    const player = event.playerPoint;
    const opponent = event.opponentPoint;
    const tooltip = escapeHtml(eventLabel(event));
    if (selected === 'ALL') return `<g class="map-event-node heat ${type}" data-tactical-tooltip="${tooltip}" tabindex="0"><title>${tooltip}</title><circle class="heat-ring" cx="${Number(player.x)}" cy="${Number(player.y)}" r="4.6"></circle><circle class="heat-core" cx="${Number(player.x)}" cy="${Number(player.y)}" r="1.55"></circle><circle class="event-hit-area" cx="${Number(player.x)}" cy="${Number(player.y)}" r="5.5"></circle></g>`;
    const vector = opponent ? `<line x1="${Number(player.x)}" y1="${Number(player.y)}" x2="${Number(opponent.x)}" y2="${Number(opponent.y)}"></line><circle class="opponent-point" cx="${Number(opponent.x)}" cy="${Number(opponent.y)}" r="1.7"></circle>` : '';
    return `<g class="map-event-node ordered ${type}" data-tactical-tooltip="${tooltip}" tabindex="0"><title>${tooltip}</title>${vector}<circle class="event-badge" cx="${Number(player.x)}" cy="${Number(player.y)}" r="2.65"></circle><text class="event-order" x="${Number(player.x)}" y="${Number(player.y)}">${escapeHtml(event.sequence || 1)}</text><circle class="event-hit-area" cx="${Number(player.x)}" cy="${Number(player.y)}" r="5.5"></circle></g>`;
  }).join('');
  const heat = `<svg class="tactical-event-surface" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="${escapeHtml(selected === 'ALL' ? 'Match engagement heat map' : `Round ${selected} ordered duel map`)}">${mapNodes}</svg>`;
  const eventRows = visibleEvents.map((event) => `<div class="tactical-event-row ${event.type.toLowerCase()}"><span>${event.type === 'KILL' ? 'K' : 'D'}${escapeHtml(event.sequence || 1)}</span><div><strong>R${escapeHtml(event.round)} • #${escapeHtml(event.sequence || 1)} • ${escapeHtml(eventTimestamp(event))} • ${escapeHtml(event.type === 'KILL' ? 'Eliminated' : 'Killed by')} ${escapeHtml(event.opponentAgent || 'Unknown agent')}</strong><small>${escapeHtml(event.callout || 'Location label unavailable')}${event.opening ? ' • OPENING DUEL' : ''}</small></div></div>`).join('');
  return `<section class="tactical-section"><div class="panel-heading"><div><p class="eyebrow">TACTICAL REPLAY</p><h2>${selected === 'ALL' ? 'Match heat map' : `Round ${escapeHtml(selected)} event map`}</h2></div><span class="muted">Select a round to inspect each duel</span></div>${controls}<div class="tactical-layout"><div class="tactical-map"><img src="${mapImage}" alt="${escapeHtml(match.map)} overhead map"><div class="tactical-map-layer">${heat}</div><div class="tactical-hover-card" role="tooltip" hidden></div><div class="tactical-legend"><span><i class="kill"></i>KILL</span><span><i class="death"></i>DEATH</span></div></div><div class="tactical-event-list">${eventRows || '<div class="empty-state">No personal kill or death event was recorded for this round.</div>'}</div></div><p class="tactical-note">The all-round view shows your engagement locations. Select a round to see numbered personal events in order, then hover or focus an indicator for the timestamp, opponent agent, and map area. Hidden identities remain anonymous.</p></section>`;
}

function iglReviewMarkup(match, selectedRound) {
  const review = match.report?.iglReview;
  if (!review) return '<section class="igl-review"><div class="panel-heading"><div><p class="eyebrow">IGL REVIEW</p><h2>Post-match coaching</h2></div></div><div class="empty-state">Not enough completed-match evidence was returned for a coaching review.</div></section>';
  const selected = String(selectedRound || 'ALL');
  const roundReview = selected === 'ALL' ? null : (review.rounds || []).find((round) => String(round.round) === selected);
  const strengths = (review.strengths || []).map((item) => `<article class="igl-signal positive"><small>KEEP</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join('');
  const priorities = (review.priorities || []).map((item) => `<article class="igl-signal priority"><small>ADJUST</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join('');
  const focus = roundReview ? `<article class="igl-round-focus ${escapeHtml(roundReview.tone || 'neutral')}"><span>ROUND ${escapeHtml(roundReview.round)}</span><div><h3>${escapeHtml(roundReview.title)}</h3><p>${escapeHtml(roundReview.body)}</p></div></article>` : '';
  return `<section class="igl-review"><div class="panel-heading"><div><p class="eyebrow">IGL REVIEW</p><h2>${escapeHtml(review.title)}</h2></div><span class="feature-chip">POST-MATCH ONLY</span></div><p class="igl-summary">${escapeHtml(review.summary)}</p>${focus}<div class="igl-signal-grid">${strengths}${priorities}</div><p class="igl-disclaimer">IGL Review explains patterns supported by completed-match events. It does not read communications, intent, utility placement, or live opponent strategy.</p></section>`;
}

function senseiPanelShell() {
  return `<section class="sensei-panel" id="senseiPanel"><div class="sensei-panel-head"><div><p class="eyebrow">SENSEI VISION</p><h2>Post-match coach debrief</h2></div><span class="sensei-status-chip">LOADING</span></div><div class="sensei-empty"><strong>Loading saved analysis…</strong><span>Saved reports open without starting a new analysis.</span></div></section>`;
}

function senseiList(items) {
  return `<ul>${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function senseiVodMarkup(entry) {
  const vod = entry?.vod;
  if (!state.settings?.senseiVodEnabled) return `<div class="sensei-vod-card"><div class="sensei-vod-head"><div><h3>VOD Vision add-on</h3><p>Enable this optional local feature in Settings to import a clean gameplay recording.</p></div><button class="ghost-button" data-sensei-settings>Settings</button></div></div>`;
  const file = vod?.name ? `${vod.name} • ${formatBytes(vod.size)}` : 'No recording attached';
  const analyzed = vod?.report;
  const findings = (analyzed?.findings || []).map((finding) => `<div class="sensei-vod-finding ${escapeHtml(finding.outcome || 'neutral')}"><time>${escapeHtml(finding.timestamp || '—')}${finding.round ? `<small>ROUND ${escapeHtml(finding.round)}</small>` : ''}</time><b>${escapeHtml(finding.category || 'Decision')}</b><span><strong>${escapeHtml(finding.observation)}</strong>${finding.evidence ? `<small><em>EVIDENCE</em>${escapeHtml(finding.evidence)}</small>` : ''}${finding.coaching ? `<small class="sensei-vod-coaching"><em>${finding.outcome === 'positive' ? 'KEEP' : 'ADJUSTMENT'}</em>${escapeHtml(finding.coaching)}</small>` : ''}</span></div>`).join('');
  const patterns = (analyzed?.patterns || []).map((pattern) => `<article><strong>${escapeHtml(pattern.category)}</strong><small>${escapeHtml(pattern.occurrences)} repeated moment${Number(pattern.occurrences) === 1 ? '' : 's'}</small><p>${escapeHtml(pattern.coaching)}</p></article>`).join('');
  const analyzing = vod?.status === 'analyzing';
  const selectedMode = state.settings?.senseiVodMode === 'exhaustive' ? 'exhaustive' : 'adaptive';
  const checkpointMode = vod?.checkpoint?.mode || (Number(vod?.checkpoint?.version) === 2 ? 'exhaustive' : '');
  const resumable = checkpointMode === selectedMode && Number(vod?.checkpoint?.version) === SENSEI_VOD_CHECKPOINT_VERSIONS[selectedMode] && Number(vod?.checkpoint?.completedSegments) > 0 && Number(vod?.checkpoint?.completedSegments) < Number(vod?.checkpoint?.totalSegments);
  const reportMode = analyzed?.mode === 'adaptive-full-match' ? 'adaptive' : 'exhaustive';
  const reportOutdated = analyzed && Number(analyzed.analysisVersion) !== SENSEI_VOD_CHECKPOINT_VERSIONS[reportMode];
  const modeLabel = selectedMode === 'adaptive' ? 'Adaptive Quality Test' : 'Exhaustive Comparison';
  const missing = state.senseiStatus?.vodMissing || ['Local setup check has not finished'];
  const ready = state.senseiStatus?.vodReady === true;
  const reason = missing.join('; ');
  const actions = analyzing
    ? '<button class="ghost-button" disabled>Analysis running</button>'
    : vod?.path
      ? `<button class="ghost-button" data-sensei-vod-import>Replace VOD</button><button class="primary-button" data-sensei-vod-analyze ${ready ? '' : 'disabled'} title="${escapeHtml(ready ? 'Analyze this recording locally' : reason)}">${resumable ? 'Resume full analysis' : analyzed ? 'Regenerate full analysis' : 'Run full-match analysis'}</button>${analyzed ? '<button class="ghost-button danger" data-sensei-vod-delete>I’ve read it — remove VOD</button>' : ''}`
      : '<button class="primary-button" data-sensei-vod-import>Import clean VOD</button>';
  const progress = state.senseiVodProgress || { phase: 'preparing', current: vod?.checkpoint?.completedSegments || 0, total: vod?.checkpoint?.totalSegments || 0, mode: selectedMode, message: 'Preparing recording' };
  const progressDetail = progress.phase === 'adaptive-scan'
    ? `Scanning every second from ${formatElapsed((Number(progress.mediaSeconds) || 0) * 1_000)} of ${formatElapsed((Number(progress.durationSeconds) || 0) * 1_000)} • detailed windows follow`
    : progress.phase === 'full-analysis'
      ? `${progress.current || 0} of ${progress.total || '—'} ${progress.mode === 'adaptive' ? 'high-quality review windows' : 'chronological segments'} • ${formatEta(progress.etaSeconds)}`
      : 'Preparing local full-match pipeline • original VOD unchanged';
  const progressMarkup = analyzing ? `<div class="sensei-vod-progress"><div class="sensei-progress-head"><span><strong>${escapeHtml(progress.mode === 'adaptive' || progress.phase === 'adaptive-scan' ? 'ADAPTIVE QUALITY TEST IN PROGRESS' : 'EXHAUSTIVE ANALYSIS IN PROGRESS')}</strong><small>${escapeHtml(progress.message || 'Preparing recording')}</small></span><time id="senseiVodElapsed">${formatElapsed(Date.now() - (state.senseiVodStartedAt || Date.now()))}</time></div><div class="sensei-progress-track"><i style="width:${senseiProgressPercent(progress)}%"></i></div><div class="sensei-progress-foot"><span>${escapeHtml(progressDetail)}</span><button class="ghost-button danger" data-sensei-vod-cancel>Pause safely</button></div></div>` : '';
  const readinessMarkup = vod?.path && !analyzing && !ready ? `<div class="sensei-readiness-blocked"><strong>VOD analysis is not ready</strong><span>${escapeHtml(reason)}. Open Settings and run Check local setup.</span></div>` : '';
  const coverage = analyzed?.coverage;
  const coverageLabel = coverage
    ? analyzed.mode === 'adaptive-full-match'
      ? `${escapeHtml(coverage.scanPercent || coverage.percent)}% FULL-VIDEO SCAN • ${escapeHtml(coverage.completedSegments)} / ${escapeHtml(coverage.totalSegments)} DETAIL WINDOWS • ${escapeHtml(coverage.detailedPercent)}% DEEP-REVIEW COVERAGE • ${escapeHtml(analyzed.framesReviewed || 0)} ORDERED FRAMES`
      : `${escapeHtml(coverage.percent)}% COVERAGE • ${escapeHtml(coverage.completedSegments)} / ${escapeHtml(coverage.totalSegments)} SEGMENTS • ${escapeHtml(analyzed.framesReviewed || 0)} ORDERED FRAMES`
    : `${escapeHtml(analyzed?.framesReviewed || 0)} FRAMES`;
  const outdatedMarkup = reportOutdated ? '<div class="sensei-error">This report was created by an earlier VOD analysis engine. Regenerate it to apply fixed-agent, spectator, round, evidence, and duplication safeguards.</div>' : '';
  const qualityMarkup = analyzed?.quality
    ? `<p class="muted">Accepted ${escapeHtml(analyzed.quality.retainedFindings || 0)} of ${escapeHtml(analyzed.quality.candidateFindings || 0)} model candidates • Ignored ${escapeHtml(analyzed.quality.nonCoachableWindows || 0)} non-coachable windows, including ${escapeHtml(analyzed.quality.spectatorWindows || 0)} spectator windows</p>`
    : '';
  return `<div class="sensei-vod-card"><div class="sensei-vod-head"><div><h3>VOD Vision · ${escapeHtml(modeLabel)}</h3><p>${escapeHtml(file)}${vod?.status === 'deleted' ? ' • Source moved to Recycle Bin; report retained' : ' • Designed for extended or overnight local analysis'}</p></div><div class="sensei-panel-actions">${actions}</div></div>${progressMarkup}${readinessMarkup}${vod?.error && !analyzing ? `<div class="sensei-error">${escapeHtml(vod.error)}</div>` : ''}${outdatedMarkup}${analyzed ? `<div class="sensei-verdict"><small>FULL VISUAL DEBRIEF • ${escapeHtml(analyzed.confidence || 'low')} CONFIDENCE • ${coverageLabel}</small><p>${escapeHtml(analyzed.summary)}</p>${qualityMarkup}</div>${patterns ? `<div class="sensei-vod-patterns"><h3>Repeated patterns</h3><div>${patterns}</div></div>` : ''}<div class="sensei-vod-findings">${findings || '<div class="empty-state">The full recording was reviewed, but no defensible coachable moment was returned. BYAKUGAN did not manufacture advice.</div>'}</div>${analyzed.limitations?.length ? `<div class="sensei-section-card"><h3>Visual limitations</h3>${senseiList(analyzed.limitations)}</div>` : ''}` : ''}</div>`;
}

function renderSenseiPanel(entry, selector = '#senseiWorkspacePanel') {
  const panel = $(selector);
  if (!panel) return;
  if (entry) state.senseiEntry = entry;
  if (!state.settings?.senseiEnabled) {
    panel.innerHTML = `<div class="sensei-panel-head"><div><p class="eyebrow">SENSEI VISION</p><h2>Post-match coach debrief</h2></div><span class="sensei-status-chip">OPTIONAL</span></div><div class="sensei-empty"><strong>Sensei Vision is disabled</strong><span>Enable Sensei Lite or a local Sensei model in Settings. Nothing downloads or runs automatically.</span><button class="ghost-button" data-sensei-settings>Review setup</button></div>`;
    return;
  }
  const status = entry?.status || 'not-analyzed';
  const label = status === 'not-analyzed' ? 'NOT ANALYZED' : status === 'analyzing' ? 'ANALYZING…' : status === 'ready' ? 'READY' : 'FAILED';
  const actions = status === 'analyzing'
    ? '<button class="primary-button" disabled>Analyzing locally…</button>'
    : status === 'ready'
      ? '<button class="ghost-button" data-sensei-run data-regenerate="true">Regenerate</button>'
      : '<button class="primary-button" data-sensei-run>Run Sensei Vision</button>';
  let body = '';
  if (status === 'not-analyzed') body = `<div class="sensei-empty"><strong>Analyze this completed match when you’re ready</strong><span>${state.settings.senseiTier === 'lite' ? 'Sensei Lite uses the built-in offline statistics engine with negligible load.' : 'Full Sensei uses your selected local Ollama model. It does not run during live play.'}</span></div>`;
  if (status === 'failed') body = `<div class="sensei-error">${escapeHtml(entry?.error || 'The local analysis failed. Review Settings and try again.')}</div>`;
  if (status === 'ready' && entry.report) {
    const report = entry.report;
    const scorecard = Object.entries(report.scorecard || {}).map(([key, value]) => `<span class="${escapeHtml(value)}"><small>${escapeHtml(key)}</small><strong>${escapeHtml(value)}</strong></span>`).join('');
    const drills = (report.drills || []).map((drill) => `<article class="sensei-drill"><h3>${escapeHtml(drill.name)}</h3><p><strong>Run it:</strong> ${escapeHtml(drill.setup)}</p><p><strong>Done:</strong> ${escapeHtml(drill.success)}</p></article>`).join('');
    const chat = (entry.chat || []).map((message) => `<div class="sensei-chat-message ${escapeHtml(message.role)}"><strong>${message.role === 'assistant' ? 'SENSEI' : 'YOU'}</strong><br>${escapeHtml(message.text)}</div>`).join('');
    const fallbackNotice = entry.notice ? `<div class="sensei-notice"><strong>LOCAL MODEL FALLBACK</strong><span>${escapeHtml(entry.notice)}</span></div>` : '';
    body = `<div class="sensei-report">${fallbackNotice}<div class="sensei-verdict"><small>MATCH VERDICT • ${escapeHtml(entry.tier === 'sensei' ? 'FULL SENSEI' : 'SENSEI LITE')}</small><p>${escapeHtml(report.verdict)}</p></div><div class="sensei-scorecard">${scorecard}</div><div class="sensei-columns"><article class="sensei-section-card"><h3>Strengths</h3>${senseiList(report.strengths)}</article><article class="sensei-section-card"><h3>Weaknesses</h3>${senseiList(report.weaknesses)}</article></div><div class="sensei-drills">${drills}</div><div class="sensei-focus"><small>NEXT-MATCH FOCUS</small><strong>${escapeHtml(report.focusRule)}</strong></div><div class="sensei-citations">Evidence: ${(report.citations || []).map(escapeHtml).join(' • ')}</div>${senseiVodMarkup(entry)}<div class="sensei-chat"><div class="sensei-vod-head"><div><h3>Ask Sensei</h3><p>Short follow-up using this saved match report only.</p></div></div><div class="sensei-chat-log">${chat || '<div class="sensei-chat-message assistant">Ask about a weakness, drill, or next-match focus. This does not rerun the analysis.</div>'}</div><form class="sensei-chat-form" data-sensei-chat><input name="question" maxlength="1000" placeholder="Ask about this match…" required><button class="ghost-button">Ask</button></form></div></div>`;
  }
  panel.innerHTML = `<div class="sensei-panel-head"><div><p class="eyebrow">SENSEI VISION</p><h2>Post-match coach debrief</h2></div><div class="sensei-panel-actions"><span class="sensei-status-chip ${status}">${label}</span>${actions}</div></div>${body}`;
}

async function hydrateSenseiPanel(matchId) {
  try {
    const entry = await window.companion.getSenseiReport(matchId);
    if (state.senseiSelectedMatchId === matchId) {
      if (entry?.vod?.status === 'analyzing') state.senseiVodStartedAt = Number(entry.vod.analysisStartedAt) || Date.now();
      renderSenseiPanel(entry);
      if (entry?.vod?.status === 'analyzing') { state.senseiBusy = true; startSenseiVodTimer(); }
      if (state.settings?.senseiVodEnabled) refreshSenseiStatus();
    }
  } catch (error) {
    if (state.senseiSelectedMatchId === matchId) renderSenseiPanel({ status: 'failed', error: error.message });
  }
}

function senseiMatchLinkMarkup(matchId) {
  return `<section class="sensei-match-link"><div><p class="eyebrow">SENSEI</p><h2>Post-match coaching</h2><p>Statistical coaching, saved reports, Ask Sensei, and optional full-match VOD analysis now live in the dedicated Sensei workspace.</p></div><button class="primary-button" data-open-sensei-match="${escapeHtml(matchId)}">Open in Sensei</button></section>`;
}

function openMatchAutopsy(matchId) {
  const match = findMatchById(matchId);
  if (!match) return;
  if (state.openMatchId !== matchId) state.autopsyRound = 'ALL';
  state.openMatchId = matchId;
  const [verdictTitle, verdictBody] = matchVerdict(match);
  const report = match.report || {};
  const rounds = report.rounds || [];
  const competitive = match.isCompetitive === true || String(match.queueId || '').toLowerCase() === 'competitive';
  const hasRating = competitive && match.hasRating === true;
  const rr = Number(match.rr) || 0;
  const context = competitive ? `${match.playlist || 'Competitive'} • ${match.rankName || 'Rank unavailable'}` : match.playlist || 'Unknown Playlist';
  const ratingValue = hasRating ? `${rr > 0 ? '+' : rr < 0 ? '−' : '±'}${Math.abs(rr)}` : competitive ? 'Pending' : match.playlist || '—';
  const roster = match.roster || [];
  const allies = roster.filter((player) => player.side === 'ally');
  const enemies = roster.filter((player) => player.side === 'enemy');
  const rosterMarkup = roster.length ? `<div class="postmatch-roster"><section><div class="postmatch-team-title"><span>YOUR TEAM</span><small>${escapeHtml(allies.length)} PLAYERS</small></div>${allies.map(historicalPlayerRow).join('')}</section><section><div class="postmatch-team-title enemy"><span>OPPONENTS</span><small>${escapeHtml(enemies.length)} PLAYERS</small></div>${enemies.map(historicalPlayerRow).join('')}</section></div>` : '<div class="empty-state">Riot did not return the roster for this match.</div>';
  const tacticalMarkup = tacticalMapMarkup(match, state.autopsyRound);
  const coachingMarkup = iglReviewMarkup(match, state.autopsyRound);
  $('#matchAutopsyContent').innerHTML = `<div class="autopsy-hero">${safeImage(match.mapImage) ? `<img src="${safeImage(match.mapImage)}" alt="">` : ''}<div class="autopsy-hero-content"><div><p class="eyebrow">MATCH AUTOPSY • ${escapeHtml(match.result)}</p><h1 id="autopsyTitle">${escapeHtml(match.map)}</h1><p>${escapeHtml(match.agent)} • ${escapeHtml(context)} • ${escapeHtml(match.ago)}</p></div><div class="autopsy-score">${escapeHtml(match.score)}</div></div></div><div class="autopsy-body"><div class="autopsy-metrics"><div><small>K / D / A</small><strong>${escapeHtml(match.kills)} / ${escapeHtml(match.deaths)} / ${escapeHtml(match.assists)}</strong></div><div><small>K/D</small><strong>${escapeHtml(match.kd)}</strong></div><div><small>${competitive ? 'RR' : 'PLAYLIST'}</small><strong>${escapeHtml(ratingValue)}</strong></div><div><small>OPENING KILLS</small><strong>${escapeHtml(report.openingKills || 0)}</strong></div><div><small>OPENING DEATHS</small><strong>${escapeHtml(report.openingDeaths || 0)}</strong></div><div><small>MULTIKILL ROUNDS</small><strong>${escapeHtml(report.multikillRounds || 0)}</strong></div></div><div class="autopsy-verdict"><h3>${escapeHtml(verdictTitle)}</h3><p>${escapeHtml(verdictBody)}</p></div><div class="panel-heading"><div><p class="eyebrow">ROUND SIGNAL</p><h2>Personal impact timeline</h2></div><span class="muted">Select a round to focus the review</span></div><div class="round-timeline">${rounds.map((round) => `<button type="button" data-tactical-round="${escapeHtml(round.round)}" class="round-chip ${String(round.result).toLowerCase()} ${round.opening === 'KILL' ? 'opening-kill' : round.opening === 'DEATH' ? 'opening-death' : ''} ${state.autopsyRound === String(round.round) ? 'active' : ''}"><small>R${escapeHtml(round.round)}</small><strong>${escapeHtml(round.kills)}K / ${escapeHtml(round.deaths)}D</strong></button>`).join('') || '<div class="empty-state">Round detail was not returned for this match.</div>'}</div>${tacticalMarkup}${coachingMarkup}${senseiMatchLinkMarkup(matchId)}<div class="panel-heading postmatch-heading"><div><p class="eyebrow">MATCH ROSTER</p><h2>Players & performance</h2></div><span class="muted">Select a visible player to inspect</span></div>${rosterMarkup}</div>`;
  $('#matchModal').hidden = false;
}

function closeMatchAutopsy() {
  $('#matchModal').hidden = true;
  state.openMatchId = '';
  state.autopsyRound = 'ALL';
}

function exportMatchRecap() {
  const match = findMatchById(state.openMatchId);
  if (!match) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 1200, 675);
  gradient.addColorStop(0, '#080912');
  gradient.addColorStop(.55, '#17142e');
  gradient.addColorStop(1, '#0b1720');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 675);
  context.strokeStyle = 'rgba(194,180,255,.18)';
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(920, 180, 210, 105, -.25, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = '#c2b4ff';
  context.font = '700 24px Segoe UI';
  context.fillText('BYAKUGAN // MATCH AUTOPSY', 70, 80);
  context.fillStyle = '#ffffff';
  context.font = '800 64px Segoe UI';
  context.fillText(match.map || 'VALORANT', 70, 175);
  context.fillStyle = match.result === 'VICTORY' ? '#39e6c1' : match.result === 'DEFEAT' ? '#ee5c78' : '#c2b4ff';
  context.font = '800 30px Segoe UI';
  context.fillText(`${match.result}  ${match.score}`, 72, 225);
  context.fillStyle = '#979db3';
  context.font = '500 24px Segoe UI';
  context.fillText(`${match.agent} • ${match.playlist || 'Unknown Playlist'}${match.isCompetitive ? ` • ${match.rankName || 'Rank unavailable'}` : ''}`, 72, 274);
  const metrics = [['K / D / A', `${match.kills} / ${match.deaths} / ${match.assists}`], ['K/D', String(match.kd)], ['RR', `${match.rr > 0 ? '+' : ''}${match.rr || 0}`], ['OPENINGS', `${match.report?.openingKills || 0} / ${match.report?.openingDeaths || 0}`]];
  metrics.forEach(([label, value], index) => {
    const x = 70 + index * 265;
    context.fillStyle = 'rgba(255,255,255,.055)';
    context.fillRect(x, 345, 235, 130);
    context.fillStyle = '#858ba1';
    context.font = '700 16px Segoe UI';
    context.fillText(label, x + 22, 382);
    context.fillStyle = '#ffffff';
    context.font = '800 34px Segoe UI';
    context.fillText(value, x + 22, 435);
  });
  const [title] = matchVerdict(match);
  context.fillStyle = '#c2b4ff';
  context.font = '700 22px Segoe UI';
  context.fillText(title, 70, 545);
  context.fillStyle = '#72798e';
  context.font = '500 18px Segoe UI';
  context.fillText('See beyond the scoreboard.', 70, 602);
  const link = document.createElement('a');
  link.download = `BYAKUGAN-${String(match.map || 'match').replace(/[^a-z0-9]+/gi, '-')}-${match.id}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('Recap exported', 'Your BYAKUGAN match card was saved as a PNG.');
}

function livePlayerRow(player) {
  const agentImage = safeImage(player.agentImage);
  const rankImage = safeImage(player.rankImage);
  const peakLabel = player.peakRank ? `PEAK ${player.peakRank}` : 'PEAK —';
  const peakContext = [player.peakEpisode, player.peakAct].filter(Boolean).join(' • ');
  const hasLevel = player.level !== null && player.level !== undefined && Number.isFinite(Number(player.level));
  const levelIsHidden = Boolean(player.levelHidden && !player.partyMember);
  const levelLabel = hasLevel ? `LVL ${Math.floor(Number(player.level))}` : player.partyMember ? 'LVL SYNCING' : levelIsHidden ? 'LVL HIDDEN' : 'LVL PRIVATE';
  const hiddenIdentity = Boolean(player.hidden);
  const unresolvedIdentity = Boolean(player.identityUnavailable || (!player.isSelf && !player.hidden && !player.name));
  const agentOnly = hiddenIdentity || unresolvedIdentity;
  const identityTitle = agentOnly
    ? `<strong>${escapeHtml(player.agent)}</strong>`
    : `<strong class="live-player-name">${player.partyMember ? '◆ ' : player.friend ? '● ' : ''}${escapeHtml(player.name)}</strong>`;
  const identityDetail = hiddenIdentity
    ? `IDENTITY HIDDEN${player.side === 'enemy' ? ' • ENEMY' : ''}${player.locked ? ' • LOCKED' : ''}`
    : unresolvedIdentity
      ? `RIOT NAME UNAVAILABLE${player.locked ? ' • LOCKED' : ''}`
    : `${escapeHtml(player.agent)}${player.side === 'enemy' ? ' • ENEMY' : player.partyMember ? ' • PARTY' : player.friend ? ' • RIOT FRIEND' : ''}${player.locked ? ' • LOCKED' : ''}`;
  return `<div class="live-player-row ${player.isSelf ? 'self' : ''} ${player.hidden ? 'hidden-name' : ''} ${player.inspectable ? 'inspectable' : ''}" ${player.inspectable ? `data-player-id="${escapeHtml(player.id)}" role="button" tabindex="0"` : ''}>
    <div class="live-agent" style="--player-color:${escapeHtml(player.agentColor || '#7b67f6')}">${agentImage ? `<img src="${agentImage}" alt="${escapeHtml(player.agent)}">` : `<span>${escapeHtml(initials(player.agent))}</span>`}</div>
    <div class="live-player-identity"><div class="live-player-heading">${identityTitle}<span class="live-player-level ${levelIsHidden ? 'hidden' : ''}">${escapeHtml(levelLabel)}</span></div><small>${identityDetail}</small></div>
    <div class="live-rank">${rankImage ? `<img src="${rankImage}" alt="">` : '<i></i>'}<span><small>CURRENT</small><strong>${escapeHtml(player.rank)}</strong><em>${escapeHtml(peakLabel)}</em><b>${escapeHtml(peakContext || 'EPISODE / ACT UNAVAILABLE')}</b></span></div>
  </div>`;
}

async function openPlayerProfile(playerId) {
  if (!playerId) return;
  state.openPlayerId = playerId;
  $('#playerProfileContent').innerHTML = '<div class="player-profile-loading"><div><span class="loading-ring"></span><p>Reading visible player profile…</p></div></div>';
  $('#playerModal').hidden = false;
  try {
    const profile = await window.companion.inspectPlayer(playerId);
    if (state.openPlayerId !== playerId) return;
    const rankImage = safeImage(profile.rankImage);
    const peakImage = safeImage(profile.peakRankImage);
    const stats = profile.stats || {};
    const loadout = profile.loadout || [];
    const statsAvailable = stats.available !== false;
    const unavailable = '—';
    const actWinsAvailable = Number.isFinite(Number(stats.actWins));
    const matchesLabel = statsAvailable && stats.source === 'observed' ? 'OBSERVED MATCHES' : statsAvailable ? 'MATCHES' : actWinsAvailable ? 'CURRENT ACT WINS' : 'MATCHES';
    const matchesValue = statsAvailable ? stats.games || 0 : actWinsAvailable ? stats.actWins : unavailable;
    const rankLabel = profile.rr !== null && profile.rr !== undefined ? `${profile.rank} • ${profile.rr} RR` : profile.rank;
    $('#playerProfileContent').innerHTML = `<div class="player-profile-hero"><div class="player-profile-avatar">${escapeHtml(initials(profile.gameName))}</div><div><p class="eyebrow">${profile.isSelf ? 'YOUR PROFILE' : 'VISIBLE ALLY PROFILE'}</p><h1 id="playerProfileTitle">${escapeHtml(profile.gameName)} <em>${profile.tagLine ? `#${escapeHtml(profile.tagLine)}` : ''}</em></h1><p>Account level ${escapeHtml(profile.level || '—')} • ${escapeHtml(stats.scope || 'AVAILABLE COMPETITIVE')}</p></div><div class="player-rank-stack">${rankImage ? `<img src="${rankImage}" alt="${escapeHtml(profile.rank)}">` : ''}<span><small>CURRENT RANK</small><strong>${escapeHtml(rankLabel)}</strong><em>${escapeHtml(profile.peakRank)} all-time peak • ${escapeHtml([profile.peakEpisode, profile.peakAct].filter(Boolean).join(' • '))}</em></span></div></div><div class="player-profile-body"><div class="player-stat-grid"><span><small>${escapeHtml(matchesLabel)}</small><strong>${escapeHtml(matchesValue)}</strong></span><span><small>W / L</small><strong>${statsAvailable ? `${escapeHtml(stats.wins || 0)} / ${escapeHtml(stats.losses || 0)}` : unavailable}</strong></span><span><small>WIN RATE</small><strong>${statsAvailable && stats.games ? `${escapeHtml(((Number(stats.wins || 0) / Number(stats.games)) * 100).toFixed(1))}%` : unavailable}</strong></span><span><small>K/D</small><strong>${statsAvailable ? escapeHtml(stats.kd ?? unavailable) : unavailable}</strong></span><span><small>HEADSHOT</small><strong>${statsAvailable ? `${escapeHtml(stats.headshot ?? 0)}%` : unavailable}</strong></span></div><div class="player-profile-section-title"><p class="eyebrow">EQUIPPED COLLECTION</p><h2>Current skins</h2></div><div class="player-loadout-grid">${loadout.map((item) => `<div class="player-loadout-item">${safeImage(item.image) ? `<img src="${safeImage(item.image)}" alt="">` : ''}<small>${escapeHtml(item.slot)}</small><strong>${escapeHtml(item.skin)}</strong></div>`).join('') || '<div class="empty-state">Riot keeps this player’s current equipped loadout private.</div>'}</div><p class="player-privacy-note">◉ ${escapeHtml(profile.privacy || 'Private and opponent profiles remain unavailable.')}</p></div>`;
  } catch (error) {
    $('#playerProfileContent').innerHTML = `<div class="player-profile-loading"><div><strong>Profile unavailable</strong><p>${escapeHtml(error.message)}</p></div></div>`;
  }
}

function closePlayerProfile() {
  $('#playerModal').hidden = true;
  state.openPlayerId = '';
}

function hiddenOpponentSlot(index) {
  return `<div class="live-player-row concealed"><div class="live-agent"><span>?</span></div><div class="live-player-identity"><div class="live-player-heading"><strong>Opponent concealed</strong><span class="live-player-level hidden">LVL HIDDEN</span></div><small>Level, agent, and ranks reveal after the match begins</small></div><div class="live-rank"><i></i><span><small>CURRENT</small><strong>Hidden</strong><em>PEAK HIDDEN</em></span></div></div>`;
}

function renderLiveMatch() {
  const live = state.snapshot?.live || {};
  const players = live.players || [];
  const liveState = String(live.state || '').toUpperCase();
  const coreGameActive = ['INGAME', 'CORE_GAME'].includes(liveState);
  const allies = players.filter((player) => player.side === 'ally');
  const enemies = coreGameActive ? players.filter((player) => player.side === 'enemy') : [];
  const active = !['MENUS', 'IDLE', ''].includes(liveState);

  text('#rosterMap', active ? live.map : 'Waiting for match');
  text('#rosterStatus', live.rosterStatus || 'Open VALORANT and enter a match to populate the roster.');
  text('#rosterState', formatState(live.state));
  text('#rosterQueue', live.queue || '—');
  text('#allyCount', `${allies.length} / 5`);
  text('#enemyCount', `${enemies.length} / 5`);
  text('#liveBadge', active ? 'LIVE' : '—');

  const backdrop = $('#liveMapBackdrop');
  const mapImage = safeImage(live.mapImage);
  if (mapImage) { backdrop.src = mapImage; backdrop.hidden = false; }
  else { backdrop.removeAttribute('src'); backdrop.hidden = true; }

  $('#allyRoster').innerHTML = allies.map(livePlayerRow).join('') || '<div class="roster-empty">Your team will appear when Riot exposes the active roster.</div>';
  if (coreGameActive && enemies.length) $('#enemyRoster').innerHTML = enemies.map(livePlayerRow).join('');
  else if (liveState === 'PREGAME') $('#enemyRoster').innerHTML = Array.from({ length: 5 }, (_, index) => hiddenOpponentSlot(index)).join('');
  else $('#enemyRoster').innerHTML = '<div class="roster-empty">Enemy players will appear after the active match loads.</div>';
}

function renderDiagnostics() {
  const diagnostics = state.snapshot?.diagnostics || [];
  const target = $('#diagnosticList');
  if (!target) return;
  if (!diagnostics.length) {
    target.innerHTML = '<div class="diagnostic-ok">✓ All required data sources are healthy.</div>';
    return;
  }
  target.innerHTML = diagnostics.map((item) => `<div class="diagnostic-row"><span>${escapeHtml(item.service.toUpperCase())}</span><strong>${escapeHtml(item.status || 'ERR')}</strong><small>${escapeHtml(item.endpoint)}</small></div>`).join('');
}

function renderSnapshot(snapshot) {
  state.snapshot = snapshot;
  const { profile, live, connection } = snapshot;
  setConnection(connection);
  text('#profileAvatar', profile.card?.initials || initials(profile.gameName));
  text('#profileName', profile.gameName);
  text('#profileTag', profile.tagLine ? `#${profile.tagLine}` : '');
  text('#profileLevel', profile.level);
  text('#profileRank', profile.rank);
  text('#profileRR', profile.rr);
  text('#peakRank', profile.peakRank);
  text('#peakSeason', [profile.peakEpisode, profile.peakAct].filter(Boolean).join(' • ') || 'Peak act unavailable');
  const rankImage = safeImage(profile.rankImage);
  const peakRankImage = safeImage(profile.peakRankImage);
  const rankImageElement = $('#profileRankImage');
  const rankFallback = $('#profileRankFallback');
  if (rankImage) {
    rankImageElement.src = rankImage;
    rankImageElement.alt = `${profile.rank} rank emblem`;
    rankImageElement.hidden = false;
    rankFallback.hidden = true;
  } else {
    rankImageElement.removeAttribute('src');
    rankImageElement.hidden = true;
    rankFallback.hidden = false;
  }
  const peakRankImageElement = $('#peakRankImage');
  if (peakRankImage) {
    peakRankImageElement.src = peakRankImage;
    peakRankImageElement.alt = `${profile.peakRank} rank emblem`;
    peakRankImageElement.hidden = false;
  } else {
    peakRankImageElement.removeAttribute('src');
    peakRankImageElement.hidden = true;
  }
  $('#rankProgress').style.width = `${Math.max(0, Math.min(100, Number(profile.rr) || 0))}%`;
  updateLive(live);
  renderStats(profile);
  renderMatches();
  renderFriends();
  renderLoadout();
  renderAgents();
  renderOverviewAnalytics();
  renderJourney();
  renderInsights();
  renderMaps();
  renderServers();
  renderLiveMatch();
  renderDiagnostics();
  renderSenseiHubLists();
  if (state.currentView === 'sensei' || !Object.keys(state.senseiReportsByMatch).length) hydrateSenseiHub();
  applyPrivacy();
}

function updateLive(live) {
  if (!state.snapshot) return;
  state.snapshot.live = live;
  text('#liveState', formatState(live.state));
  text('#liveMap', live.map);
  text('#liveQueue', live.queue);
  text('#liveParty', `${live.partySize || 1} ${Number(live.partySize) === 1 ? 'player' : 'players'}`);
  text('#liveElapsed', live.elapsed);
  renderLiveMatch();
}

function applyPrivacy() {
  document.body.classList.toggle('privacy', Boolean(state.settings?.privacyMode));
  $('#privacyButton').classList.toggle('active', Boolean(state.settings?.privacyMode));
}

const viewMeta = {
  dashboard: ['COMMAND CENTER', 'Overview'], live: ['ACTIVE SESSION', 'Live match'], matches: ['PERFORMANCE', 'Match history'],
  sensei: ['POST-MATCH COACH', 'Sensei'],
  journey: ['ACT SIGNAL', 'Act journey'], insights: ['ENHANCED VISION', 'Insights & goals'],
  loadout: ['COLLECTION', 'Loadout'], agents: ['AGENT LAB', 'Agent performance'], maps: ['MAP LAB', 'Map performance'],
  servers: ['NETWORK PROFILE', 'Server performance'],
  social: ['RIOT SOCIAL', 'Social hub'], stream: ['BROADCAST CONTROL', 'Live Stream Vision'],
  settings: ['PREFERENCES', 'Settings']
};

function navigate(view) {
  state.currentView = view;
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $$('.view').forEach((panel) => panel.classList.toggle('active', panel.id === `view-${view}`));
  text('#pageEyebrow', viewMeta[view][0]);
  text('#pageTitle', viewMeta[view][1]);
  $('.main').scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'stream' && state.settings?.streamOverlayLayout === 'custom') requestAnimationFrame(renderCustomOverlayBuilder);
  if (view === 'settings') refreshSenseiStatus();
  if (view === 'sensei') hydrateSenseiHub();
}

async function refreshSenseiStatus() {
  const container = $('#senseiSystemStatus');
  const hubContainer = $('#senseiHubSystemStatus');
  if (!container) return;
  container.innerHTML = '<span>Checking local setup…</span>';
  if (hubContainer) hubContainer.innerHTML = '<span>Checking local setup…</span>';
  try {
    const status = await window.companion.getSenseiStatus();
    state.senseiStatus = status;
    const models = status.models || [];
    $('#senseiInstalledModels').innerHTML = models.map((model) => `<option value="${escapeHtml(model.name)}"></option>`).join('');
    const card = (title, detail, condition, optional = false) => `<span class="sensei-check-card ${optional ? 'optional' : condition ? 'ready' : 'missing'}"><i>${optional ? '•' : condition ? '✓' : '!'}</i><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>`;
    const textRequired = state.settings?.senseiTier === 'sensei';
    const vodRequired = state.settings?.senseiVodEnabled === true;
    const statusMarkup = [
      card('OLLAMA', status.connected ? 'Running locally' : 'Not running', status.connected),
      card('SENSEI TEXT MODEL', textRequired ? (status.textModel?.installed ? status.textModel.name : status.textModel?.name ? `${status.textModel.name} not installed` : 'No model selected') : 'Sensei Lite selected — not required', !textRequired || status.textModel?.installed, !textRequired),
      card('VISION MODEL', vodRequired ? (status.visionModel?.installed ? `${status.visionModel.name}${status.visionModel.visionCapable ? ' • vision ready' : ' • no vision support'}` : status.visionModel?.name ? `${status.visionModel.name} not installed` : 'No model selected') : 'VOD Vision disabled — not required', !vodRequired || (status.visionModel?.installed && status.visionModel?.visionCapable), !vodRequired),
      card('FFMPEG', status.ffmpegAvailable ? 'Detected in BYAKUGAN PATH' : 'Not detected — restart app after install', status.ffmpegAvailable),
      card('FFPROBE', status.ffprobeAvailable ? 'Detected and ready' : 'Not detected — install complete FFmpeg package', status.ffprobeAvailable),
      card('STORAGE', `${formatBytes(status.freeStorage)} free`, status.storageReady)
    ].join('');
    container.innerHTML = statusMarkup;
    if (hubContainer) hubContainer.innerHTML = statusMarkup;
    if (state.senseiSelectedMatchId && state.senseiEntry) renderSenseiPanel(state.senseiEntry);
  } catch (error) {
    const errorMarkup = `<span><strong>SETUP CHECK FAILED</strong>${escapeHtml(error.message || 'Local setup could not be checked.')}</span>`;
    container.innerHTML = errorMarkup;
    if (hubContainer) hubContainer.innerHTML = errorMarkup;
  }
}

function syncSettingsForm() {
  const settings = state.settings;
  $('#autoRefresh').checked = Boolean(settings.autoRefresh);
  $('#launchAtStartup').checked = Boolean(settings.launchAtStartup);
  $('#privacyMode').checked = Boolean(settings.privacyMode);
  $('#compactMatches').checked = Boolean(settings.compactMatches);
  $('#uiScale').value = String(settings.uiScale || 100);
  $('#refreshSeconds').value = String(settings.refreshSeconds || 30);
  $('#senseiEnabled').checked = Boolean(settings.senseiEnabled);
  $('#senseiTier').value = settings.senseiTier || 'lite';
  $('#senseiModel').value = settings.senseiModel || '';
  $('#senseiVodEnabled').checked = Boolean(settings.senseiVodEnabled);
  $('#senseiVodModel').value = settings.senseiVodModel || '';
  $('#senseiVodMode').value = settings.senseiVodMode === 'exhaustive' ? 'exhaustive' : 'adaptive';
  $('#senseiOfferVodCleanup').checked = Boolean(settings.senseiOfferVodCleanup);
  $('#senseiTier').disabled = !settings.senseiEnabled;
  $('#senseiModel').disabled = !settings.senseiEnabled || settings.senseiTier !== 'sensei';
  $('#senseiVodEnabled').disabled = !settings.senseiEnabled;
  $('#senseiVodModel').disabled = !settings.senseiEnabled || !settings.senseiVodEnabled;
  $('#senseiVodMode').disabled = !settings.senseiEnabled || !settings.senseiVodEnabled;
  $('#senseiOfferVodCleanup').disabled = !settings.senseiEnabled || !settings.senseiVodEnabled;
  $('#senseiModelRow').hidden = settings.senseiTier !== 'sensei';
  $('#senseiVodModelRow').hidden = !settings.senseiVodEnabled;
  $('#senseiVodModeRow').hidden = !settings.senseiVodEnabled;
  const senseiChip = $('#senseiSettingsChip');
  senseiChip.textContent = settings.senseiEnabled ? (settings.senseiTier === 'sensei' ? 'SENSEI' : 'LITE READY') : 'DISABLED';
  senseiChip.classList.toggle('ready', Boolean(settings.senseiEnabled));
  $('#pcRole').value = settings.pcRole || 'gaming';
  $('#gamingRelayMode').checked = Boolean(settings.gamingRelayMode);
  $('#remoteViewerEnabled').checked = Boolean(settings.remoteViewerEnabled);
  $('#remoteViewerEnabled').disabled = Boolean(settings.gamingRelayMode);
  $('#remoteSourceUrl').value = settings.remoteSourceUrl || '';
  $('#remoteHostControls').hidden = settings.pcRole === 'viewer';
  $('#remoteViewerControls').hidden = settings.pcRole !== 'viewer';
  $('#streamOverlayEnabled').checked = Boolean(settings.streamOverlayEnabled);
  $('#streamOverlayLanEnabled').checked = Boolean(settings.streamOverlayLanEnabled);
  $('#streamOverlayLayout').value = settings.streamOverlayLayout || 'horizontal';
  renderOverlayDimensions(settings.streamOverlayLayout);
  const customLayout = settings.streamOverlayLayout === 'custom';
  $('#customOverlayBuilder').hidden = !customLayout;
  $('.overlay-options-heading').hidden = customLayout;
  $('.overlay-field-grid').hidden = customLayout;
  $('#streamOverlayShowIdentity').checked = Boolean(settings.streamOverlayShowIdentity);
  $('#streamOverlayShowWl').checked = settings.streamOverlayShowWl !== false;
  $('#streamOverlayShowKd').checked = settings.streamOverlayShowKd !== false;
  $('#streamOverlayShowAgent').checked = settings.streamOverlayShowAgent !== false;
  $('#streamOverlayShowMap').checked = settings.streamOverlayShowMap !== false;
  $('#streamOverlayShowRR').checked = settings.streamOverlayShowRR !== false;
  $('#streamOverlayShowPeakRank').checked = settings.streamOverlayShowPeakRank !== false;
  $('#streamOverlayShowRrChange').checked = settings.streamOverlayShowRrChange !== false;
  $('#streamOverlayAnimatedRrBeam').checked = settings.streamOverlayAnimatedRrBeam !== false;
  $('#streamOverlaySmoothTransitions').checked = settings.streamOverlaySmoothTransitions !== false;
  $('#streamOverlayTransitionSound').checked = settings.streamOverlayTransitionSound === true;
  $('#streamOverlayMatchPulse').checked = Boolean(settings.streamOverlayMatchPulse);
  $('#streamOverlayMatchPulseStyle').value = settings.streamOverlayMatchPulseStyle || 'segments';
  $('#streamOverlayPostMatchRecap').checked = settings.streamOverlayPostMatchRecap !== false;
  $('#streamOverlayPostMatchRecapSeconds').value = String(settings.streamOverlayPostMatchRecapSeconds || 7);
  $('#reactiveVisionOptions').hidden = !['reactive', 'custom'].includes(settings.streamOverlayLayout);
  syncTransitionPreviewControl(settings);
  $('#customOverlayAnimatedRrBeam').checked = settings.streamOverlayAnimatedRrBeam !== false;
  const backgroundOpacity = Number.isFinite(Number(settings.streamOverlayBackgroundOpacity)) ? Number(settings.streamOverlayBackgroundOpacity) : 70;
  $('#streamOverlayBackgroundOpacity').value = String(backgroundOpacity);
  text('#streamOverlayBackgroundOpacityValue', `${backgroundOpacity}%`);
  if (customLayout) requestAnimationFrame(renderCustomOverlayBuilder);
}

function renderOverlayDimensions(layout) {
  const custom = state.settings?.streamOverlayCustom || DEFAULT_CUSTOM_OVERLAY;
  const selected = layout === 'custom'
    ? {
        width: custom.reactive ? Math.max(Number(custom.width) || 960, Number(custom.inGameWidth) || Number(custom.width) || 960, Number(custom.postMatchWidth) || Number(custom.width) || 960) : Number(custom.width) || 960,
        height: custom.reactive ? Math.max(Number(custom.height) || 360, Number(custom.inGameHeight) || Number(custom.height) || 360, Number(custom.postMatchHeight) || Number(custom.height) || 360) : Number(custom.height) || 360
      }
    : OVERLAY_DIMENSIONS[layout] || OVERLAY_DIMENSIONS.horizontal;
  text('#overlayDimensions', `${selected.width} × ${selected.height}`);
  text('#overlayDimensionsHelp', layout === 'custom'
    ? custom.reactive
      ? `Use this safe envelope in OBS. Between Games, In Game, and Post Match keep their own visible canvas sizes inside it.`
      : `Use these exact custom canvas dimensions in OBS. You can still resize the finished source on your scene.`
    : layout === 'reactive'
    ? `Set Width to ${selected.width} and Height to ${selected.height} in OBS. The dock animates inside this fixed canvas.`
    : `Set Width to ${selected.width} and Height to ${selected.height} in OBS.`);
}

function syncTransitionPreviewControl(settings = state.settings || {}) {
  const button = $('#previewOverlayTransitions');
  if (!button) return;
  const audioToggle = $('#streamOverlayTransitionSound');
  const layout = settings.streamOverlayLayout || 'horizontal';
  const reactiveLayout = layout === 'reactive' || (layout === 'custom' && Boolean(settings.streamOverlayCustom?.reactive));
  const transitionsEnabled = settings.streamOverlaySmoothTransitions !== false;
  button.disabled = !reactiveLayout || !transitionsEnabled;
  if (audioToggle) audioToggle.disabled = !reactiveLayout || !transitionsEnabled;
  text('#transitionPreviewHelp', !reactiveLayout
    ? 'Enable Reactive Vision Dock or Reactive Vision Mode in the Custom Overlay Builder to preview its state changes.'
    : !transitionsEnabled
      ? 'Turn on BYAKUGAN Shift transitions to preview the animated sequence. OBS will remain instant while it is off.'
      : 'Watch Between Games, In Game, Post Match, and RR beam movement without changing OBS or live match data.');
}

function cloneCustomOverlay(value = state.settings?.streamOverlayCustom || DEFAULT_CUSTOM_OVERLAY) {
  return JSON.parse(JSON.stringify(value));
}

function customCanvasColor(hex, opacity) {
  const match = /^#([a-f0-9]{6})$/i.exec(String(hex || ''));
  if (!match) return 'transparent';
  const value = Number.parseInt(match[1], 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${Math.max(0,Math.min(1,opacity))})`;
}

function customEditorSigned(value, suffix = '') {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : number < 0 ? '−' : '±'}${Math.abs(number)}${suffix}`;
}

function customEditorCopy(label, value, detail = '', element = {}, auxiliary = '') {
  const labelMarkup = element.showLabel === false ? '' : `<small>${escapeHtml(label)}</small>`;
  const detailMarkup = detail && element.showDetail !== false ? `<em>${escapeHtml(detail)}</em>` : '';
  const auxiliaryMarkup = auxiliary ? `<em class="custom-editor-aux-detail">${escapeHtml(auxiliary)}</em>` : '';
  return `<span class="custom-editor-copy">${labelMarkup}<strong>${escapeHtml(value)}</strong>${detailMarkup}${auxiliaryMarkup}</span>`;
}

function customEditorIcon(url, fallback, extraClass = '') {
  const image = safeImage(url);
  return `<span class="custom-editor-icon-shell ${extraClass}"><span class="custom-editor-icon-fallback">${escapeHtml(fallback)}</span>${image ? `<img class="custom-editor-icon" src="${image}" alt="">` : ''}</span>`;
}

function customEditorBeam(preview, showMarker) {
  const rr = Number(preview.lastRR) || 0;
  const tone = rr > 0 ? 'positive' : rr < 0 ? 'negative' : 'neutral';
  return `<span class="custom-editor-beam-fill"><img src="../overlay/rr-energy-beam.gif" alt=""></span>${showMarker ? `<strong class="custom-editor-beam-marker ${tone}">${escapeHtml(customEditorSigned(rr, ' RR'))}</strong>` : ''}`;
}

function customOverlayEditorPreview() {
  const snapshot = state.snapshot || {};
  const profile = snapshot.profile || {};
  const session = snapshot.analytics?.session || {};
  const live = snapshot.live || {};
  const matches = Array.isArray(snapshot.matches) ? snapshot.matches : [];
  const sessionMatchIds = new Set((session.matchIds || []).map(String));
  const recentMatch = matches.find((match) => sessionMatchIds.has(String(match?.id || ''))
    && ['VICTORY', 'DEFEAT', 'DRAW'].includes(match?.result)) || {};
  const self = (live.players || []).find((player) => player?.isSelf) || {};
  const hasProfile = Boolean(profile.gameName || profile.rank);
  const rr = Number.isFinite(Number(profile.rr)) ? Number(profile.rr) : 42;
  const kd = Number.isFinite(Number(session.kd)) ? Number(session.kd).toFixed(2) : '1.24';
  const agent = self.agent || recentMatch.agent || 'OMEN';
  return {
    playerName: hasProfile ? [profile.gameName, profile.tagLine ? `#${profile.tagLine}` : ''].filter(Boolean).join('') : 'PLAYER',
    currentRank: profile.rank || 'ASCENDANT 1',
    rankImage: profile.rankImage || '',
    rr,
    peakRank: profile.peakRank || 'IMMORTAL 2',
    peakRankImage: profile.peakRankImage || '',
    peakContext: [profile.peakEpisode, profile.peakAct].filter(Boolean).join(' • ') || 'ALL-TIME PEAK',
    wins: Number.isFinite(Number(session.wins)) ? Number(session.wins) : 2,
    losses: Number.isFinite(Number(session.losses)) ? Number(session.losses) : 1,
    kd,
    rrChange: Number.isFinite(Number(session.rrChange)) ? Number(session.rrChange) : 38,
    lastResult: recentMatch.result || 'VICTORY',
    lastRR: Number.isFinite(Number(recentMatch.rr)) ? Number(recentMatch.rr) : 18,
    agent,
    agentImage: self.agentImage || recentMatch.agentImage || '',
    map: live.map || recentMatch.map || 'ABYSS',
    liveLabel: live.state ? formatState(live.state) : 'IN MENUS',
    matchScore: recentMatch.score || live.score || '13 – 9',
    roundPulse: live.roundPulse?.length ? live.roundPulse : ['WIN','WIN','LOSS','WIN','LOSS','WIN','WIN','LOSS','WIN']
  };
}

function customOverlayEditorMarkup(id, preview, element) {
  if (id === 'branding') return `<span class="custom-editor-eye"></span>${customEditorCopy('BYAKUGAN', 'SESSION VISION', '', element)}`;
  if (id === 'playerName') return customEditorCopy('RIOT ID', preview.playerName, '', element);
  if (id === 'currentRank') return `${customEditorIcon(preview.rankImage, initials(preview.currentRank))}${customEditorCopy('CURRENT RANK', preview.currentRank, '', element, element.showCurrentRR ? `${preview.rr} / 100 RR` : '')}`;
  if (id === 'currentRR') return customEditorCopy('CURRENT RR', `${preview.rr} RR`, '', element);
  if (id === 'peakRank') return `${customEditorIcon(preview.peakRankImage, initials(preview.peakRank))}${customEditorCopy('ALL-TIME PEAK', preview.peakRank, preview.peakContext, element)}`;
  if (id === 'sessionWL') return customEditorCopy('SESSION W / L', `${preview.wins} W / ${preview.losses} L`, '', element);
  if (id === 'sessionKD') return customEditorCopy('SESSION K/D', preview.kd, '', element);
  if (id === 'rrChange') return customEditorCopy('SESSION RR', customEditorSigned(preview.rrChange, ' RR'), '', element);
  if (id === 'lastMatch') return customEditorCopy('LAST MATCH', preview.lastResult, customEditorSigned(preview.lastRR, ' RR'), element);
  if (id === 'agent') return `${customEditorIcon(preview.agentImage, initials(preview.agent), 'custom-editor-agent-icon')}${customEditorCopy('AGENT', preview.agent, '', element)}`;
  if (id === 'map') return customEditorCopy('CURRENT MAP', preview.map, preview.liveLabel, element);
  if (id === 'matchScore') return customEditorCopy('FINAL SCORE', preview.matchScore, '', element);
  if (id === 'matchPulse') return `${element.showLabel === false ? '' : '<span class="custom-editor-pulse-label">MATCH PULSE</span>'}<span class="custom-editor-pulse">${preview.roundPulse.map((round) => `<i class="${String(round).toLowerCase()}"></i>`).join('')}</span>`;
  if (id === 'rrBeam') return customEditorBeam(preview, element.showMarker !== false);
  return '';
}

function customElementsForState(config, canvasState = state.customOverlayCanvasState) {
  if (canvasState === 'postmatch' && config?.reactive) return config.postMatchElements;
  return canvasState === 'ingame' && config?.reactive ? config.inGameElements : config?.elements;
}

function customDimensionsForState(config, canvasState = state.customOverlayCanvasState) {
  const inGame = canvasState === 'ingame' && config?.reactive;
  const postMatch = canvasState === 'postmatch' && config?.reactive;
  return {
    width: Number(postMatch ? config.postMatchWidth : inGame ? config.inGameWidth : config.width) || DEFAULT_CUSTOM_OVERLAY.width,
    height: Number(postMatch ? config.postMatchHeight : inGame ? config.inGameHeight : config.height) || DEFAULT_CUSTOM_OVERLAY.height
  };
}

function selectedCustomElement(config = state.settings?.streamOverlayCustom) {
  return customElementsForState(config)?.find((element) => element.id === state.customOverlaySelectedId) || null;
}

function renderCustomInspector(config) {
  const element = selectedCustomElement(config);
  $('#customElementInspector').classList.toggle('disabled', !element);
  text('#customSelectedElement', element ? CUSTOM_OVERLAY_LABELS[element.id] : 'Choose an element');
  if (!element) return;
  $('#customElementX').value = String(element.x);
  $('#customElementY').value = String(element.y);
  $('#customElementWidth').value = String(element.width);
  $('#customElementHeight').value = String(element.height);
  $('#customElementFontSize').value = String(element.fontSize);
  $('#customElementLabelFontSize').value = String(element.labelFontSize || Math.max(6, Math.round(element.fontSize * 0.38)));
  $('#customElementDetailFontSize').value = String(element.detailFontSize || Math.max(6, Math.round(element.fontSize * 0.42)));
  $('#customElementShowLabel').checked = element.showLabel !== false;
  $('#customElementShowDetail').checked = element.showDetail !== false;
  $('#customElementShowCurrentRR').checked = element.showCurrentRR === true;
  $('#customElementShowLabelControl').hidden = element.id === 'rrBeam';
  $('#customElementShowDetailControl').hidden = !['peakRank', 'lastMatch', 'map'].includes(element.id);
  $('#customElementShowCurrentRRControl').hidden = element.id !== 'currentRank';
  $('#customElementLabelFontSizeControl').hidden = element.id === 'rrBeam';
  $('#customElementDetailFontSizeControl').hidden = !['peakRank', 'lastMatch', 'map'].includes(element.id);
  $('#customElementOpacity').value = String(element.opacity);
  text('#customElementOpacityValue', `${element.opacity}%`);
  $('#customElementAlign').value = element.align;
  $('#customElementColor').value = element.color;
}

function customPaletteRow(element) {
  return `<div class="custom-palette-item ${element.id === state.customOverlaySelectedId ? 'selected' : ''}" data-custom-select="${element.id}"><input type="checkbox" data-custom-visible="${element.id}" ${element.visible ? 'checked' : ''} aria-label="Show ${escapeHtml(CUSTOM_OVERLAY_LABELS[element.id])}"><span>${escapeHtml(CUSTOM_OVERLAY_LABELS[element.id])}</span><button type="button" data-custom-reset="${element.id}" title="Reset only ${escapeHtml(CUSTOM_OVERLAY_LABELS[element.id])}">↺</button></div>`;
}

function customReactivePalette(config) {
  return `<div class="custom-palette-item custom-reactive-toggle ${config.reactive ? 'enabled' : ''}"><input type="checkbox" data-custom-reactive-visible ${config.reactive ? 'checked' : ''} aria-label="Enable three-state custom Reactive Vision"><span>Reactive Vision Mode</span></div>${config.reactive ? `<div class="custom-reactive-preview-switch" aria-label="Choose the custom canvas to edit"><small>EDITING CANVAS</small><button type="button" data-custom-canvas-select="between" class="${state.customOverlayCanvasState === 'between' ? 'active' : ''}">Between games</button><button type="button" data-custom-canvas-select="ingame" class="${state.customOverlayCanvasState === 'ingame' ? 'active' : ''}">In game</button><button type="button" data-custom-canvas-select="postmatch" class="${state.customOverlayCanvasState === 'postmatch' ? 'active' : ''}">Post match</button></div>` : ''}`;
}

function renderCustomEditorCanvas(canvas, elements, canvasState, config, scale, preview) {
  const dimensions = customDimensionsForState(config, canvasState);
  canvas.style.width = `${Math.round(dimensions.width * scale)}px`;
  canvas.style.height = `${Math.round(dimensions.height * scale)}px`;
  canvas.style.background = customCanvasColor(config.backgroundColor, (Number(state.settings.streamOverlayBackgroundOpacity) || 0) / 100);
  canvas.setAttribute('aria-label', `${canvasState === 'ingame' ? 'In-game' : canvasState === 'postmatch' ? 'Post-match' : config.reactive ? 'Between-games' : 'Base'} custom overlay canvas ${dimensions.width} by ${dimensions.height}`);
  canvas.innerHTML = elements.filter((element) => element.visible).map((element) => `<div class="custom-editor-item custom-editor-${element.id} align-${element.align} ${element.id === 'rrBeam' && state.settings.streamOverlayAnimatedRrBeam === false ? 'beam-static' : ''} ${canvasState === state.customOverlayCanvasState && element.id === state.customOverlaySelectedId ? 'selected' : ''}" data-custom-element="${element.id}" style="left:${element.x}%;top:${element.y}%;width:${element.width}%;height:${element.height}%;--custom-font-size:${Math.max(3,element.fontSize * scale)}px;--custom-label-size:${Math.max(3,(element.labelFontSize || Math.max(6,Math.round(element.fontSize*.38))) * scale)}px;--custom-detail-size:${Math.max(3,(element.detailFontSize || Math.max(6,Math.round(element.fontSize*.42))) * scale)}px;color:${element.color};opacity:${element.opacity / 100};text-align:${element.align};--custom-editor-beam-progress:${Math.max(0,Math.min(100,preview.rr))}%">${customOverlayEditorMarkup(element.id, preview, element)}<i class="resize-handle" data-custom-resize="${element.id}"></i></div>`).join('');
}

function renderCustomOverlayBuilder() {
  if (!state.settings || state.settings.streamOverlayLayout !== 'custom') return;
  const config = state.settings.streamOverlayCustom || cloneCustomOverlay(DEFAULT_CUSTOM_OVERLAY);
  $('#customOverlayWidth').value = String(config.width);
  $('#customOverlayHeight').value = String(config.height);
  $('#customOverlayInGameWidth').value = String(config.inGameWidth || config.width);
  $('#customOverlayInGameHeight').value = String(config.inGameHeight || config.height);
  $('#customOverlayPostMatchWidth').value = String(config.postMatchWidth || config.width);
  $('#customOverlayPostMatchHeight').value = String(config.postMatchHeight || config.height);
  $('#customOverlayBackgroundColor').value = config.backgroundColor;

  if (!config.reactive) state.customOverlayCanvasState = 'between';
  const activeElements = customElementsForState(config);
  const activeBeam = activeElements.find((element) => element.id === 'rrBeam');
  $('#customOverlayShowBeamRR').checked = activeBeam?.showMarker !== false;
  text('#customOverlayShowBeamRRLabel', config.reactive
    ? `Show +/- RR on beam (${state.customOverlayCanvasState === 'ingame' ? 'In game' : state.customOverlayCanvasState === 'postmatch' ? 'Post match' : 'Between'})`
    : 'Show +/- RR on beam');
  text('#customOverlayWidthLabel', config.reactive ? 'Between width' : 'Canvas width');
  text('#customOverlayHeightLabel', config.reactive ? 'Between height' : 'Canvas height');
  $('#customInGameWidthControl').hidden = !config.reactive;
  $('#customInGameHeightControl').hidden = !config.reactive;
  $('#customPostMatchWidthControl').hidden = !config.reactive;
  $('#customPostMatchHeightControl').hidden = !config.reactive;
  $('#customElementPalette').innerHTML = `${activeElements.map(customPaletteRow).join('')}${customReactivePalette(config)}`;

  const stage = $('.custom-stage-shell');
  const betweenCanvas = $('#customEditorCanvas');
  const inGameCanvas = $('#customEditorCanvasInGame');
  const postMatchCanvas = $('#customEditorCanvasPostMatch');
  const availableWidth = Math.max(300, stage.getBoundingClientRect().width - 26);
  const maximumWidth = config.reactive ? Math.max(config.width, config.inGameWidth || config.width, config.postMatchWidth || config.width) : config.width;
  const scale = Math.min(1.25, availableWidth / maximumWidth);
  const preview = customOverlayEditorPreview();
  $('[data-custom-state-frame="between"] > small').textContent = config.reactive ? 'BETWEEN GAMES' : 'BASE CANVAS';
  $('#customInGameEditorState').hidden = !config.reactive;
  $('#customPostMatchEditorState').hidden = !config.reactive;
  $$('[data-custom-state-frame]', $('#customEditorStack')).forEach((frame) => frame.classList.toggle('active', frame.dataset.customStateFrame === state.customOverlayCanvasState));
  renderCustomEditorCanvas(betweenCanvas, config.elements, 'between', config, scale, preview);
  if (config.reactive) renderCustomEditorCanvas(inGameCanvas, config.inGameElements, 'ingame', config, scale, preview);
  if (config.reactive) renderCustomEditorCanvas(postMatchCanvas, config.postMatchElements, 'postmatch', config, scale, preview);
  text('#customCanvasPreviewSize', config.reactive
    ? `Between ${config.width} × ${config.height} • In game ${config.inGameWidth} × ${config.inGameHeight} • Post match ${config.postMatchWidth} × ${config.postMatchHeight} • ${Math.round(scale * 100)}% preview`
    : `${config.width} × ${config.height} canvas • ${Math.round(scale * 100)}% preview`);
  renderCustomInspector(config);
  renderOverlayDimensions('custom');
}

async function persistCustomOverlay(config, feedback = false) {
  state.settings = await window.companion.updateSettings({ streamOverlayCustom: config });
  renderCustomOverlayBuilder();
  await refreshOverlayStatus();
  if (feedback) toast('Custom overlay saved', 'Your canvas and element layout were updated.');
}

function updateSelectedCustomElement(property, rawValue) {
  const config = cloneCustomOverlay();
  const element = selectedCustomElement(config);
  if (!element) return null;
  if (['x','y','width','height','fontSize','labelFontSize','detailFontSize','opacity'].includes(property)) element[property] = Number(rawValue);
  else element[property] = rawValue;
  state.settings.streamOverlayCustom = config;
  renderCustomOverlayBuilder();
  return config;
}

function resetCustomElement(id) {
  const config = cloneCustomOverlay();
  const elements = customElementsForState(config);
  const fallbackElements = state.customOverlayCanvasState === 'postmatch' && config.reactive
    ? DEFAULT_CUSTOM_OVERLAY.postMatchElements
    : state.customOverlayCanvasState === 'ingame' && config.reactive
      ? DEFAULT_CUSTOM_OVERLAY.inGameElements : DEFAULT_CUSTOM_OVERLAY.elements;
  const element = elements.find((entry) => entry.id === id);
  const fallback = fallbackElements.find((entry) => entry.id === id);
  if (!element || !fallback) return null;
  const visible = element.visible;
  Object.assign(element, JSON.parse(JSON.stringify(fallback)), { visible });
  state.customOverlaySelectedId = id;
  state.settings.streamOverlayCustom = config;
  return config;
}

function beginCustomElementDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  state.customOverlayCanvasState = ['ingame', 'postmatch'].includes(event.currentTarget.dataset.customCanvasState)
    ? event.currentTarget.dataset.customCanvasState : 'between';
  const item = event.target.closest('[data-custom-element]');
  if (!item) {
    renderCustomOverlayBuilder();
    return;
  }
  const id = item.dataset.customElement;
  state.customOverlaySelectedId = id;
  const config = cloneCustomOverlay();
  const element = customElementsForState(config).find((entry) => entry.id === id);
  if (!element) return;
  const canvasRect = event.currentTarget.getBoundingClientRect();
  const start = { x: event.clientX, y: event.clientY, element: { ...element } };
  const resizing = Boolean(event.target.closest('[data-custom-resize]'));
  event.preventDefault();
  const pointerTarget = event.currentTarget;
  pointerTarget.setPointerCapture?.(event.pointerId);
  document.body.classList.add('custom-editor-dragging');

  const move = (moveEvent) => {
    const dx = ((moveEvent.clientX - start.x) / canvasRect.width) * 100;
    const dy = ((moveEvent.clientY - start.y) / canvasRect.height) * 100;
    if (resizing) {
      element.width = Math.max(4, Math.min(100 - element.x, Math.round((start.element.width + dx) * 10) / 10));
      element.height = Math.max(4, Math.min(100 - element.y, Math.round((start.element.height + dy) * 10) / 10));
    } else {
      element.x = Math.max(0, Math.min(100 - element.width, Math.round((start.element.x + dx) * 10) / 10));
      element.y = Math.max(0, Math.min(100 - element.height, Math.round((start.element.y + dy) * 10) / 10));
    }
    state.settings.streamOverlayCustom = config;
    const liveItem = $(`[data-custom-element="${id}"]`, pointerTarget);
    if (liveItem) {
      liveItem.style.left = `${element.x}%`;
      liveItem.style.top = `${element.y}%`;
      liveItem.style.width = `${element.width}%`;
      liveItem.style.height = `${element.height}%`;
    }
    renderCustomInspector(config);
  };
  const end = async (endEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    if (pointerTarget.hasPointerCapture?.(endEvent?.pointerId)) pointerTarget.releasePointerCapture(endEvent.pointerId);
    document.body.classList.remove('custom-editor-dragging');
    await persistCustomOverlay(config);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end, { once: true });
  window.addEventListener('pointercancel', end, { once: true });
  $$('.custom-editor-item', $('#customEditorStack')).forEach((node) => node.classList.toggle('selected', node === item));
  renderCustomInspector(config);
}

function renderRemoteStatus(status = {}) {
  state.remoteStatus = status;
  const viewer = state.settings?.pcRole === 'viewer';
  const viewerConnected = viewer && state.snapshot?.connection?.source === 'remote'
    && state.snapshot.connection.status === 'connected';
  const hostReady = !viewer && Boolean(status.remoteEnabled && status.running && status.remoteUrl);
  const statusElement = $('#remoteStatus');
  statusElement.textContent = viewer ? (viewerConnected ? 'CONNECTED' : 'VIEWER') : (hostReady ? 'HOST LIVE' : 'LOCAL');
  statusElement.classList.toggle('live', viewerConnected || hostReady);
  text('#remoteHostUrl', hostReady
    ? `http://${status.host}:${status.port}/remote/••••••••••••`
    : status.error || 'Enable Remote Viewer to create a connection.');
  $('#copyRemoteUrl').disabled = !hostReady;
}

async function refreshRemoteStatus() {
  try { renderRemoteStatus(await window.companion.getRemoteStatus()); }
  catch (error) { renderRemoteStatus({ remoteEnabled: false, running: false, error: error.message }); }
}

function renderOverlayStatus(status = {}) {
  state.overlayStatus = status;
  const ready = Boolean(status.enabled && status.running && status.url);
  const statusElement = $('#overlayStatus');
  statusElement.textContent = ready ? 'LIVE' : status.error ? 'ERROR' : 'OFF';
  statusElement.classList.toggle('live', ready);
  text('#overlayUrl', ready
    ? `http://${status.host || '127.0.0.1'}:${status.port}/overlay/••••••••••••`
    : status.error || 'Enable the overlay to create your URL.');
  text('#overlaySecurityNote', status.access === 'network' || state.settings?.streamOverlayLanEnabled
    ? 'Same-network mode is active. Keep BYAKUGAN open on the gaming PC, allow Private networks if Windows asks, and regenerate this URL if it is ever shown publicly.'
    : 'The URL is token protected and works only on this computer. Regenerate it if it is ever shown on stream.');
  $('#copyOverlayUrl').disabled = !ready;
  $('#regenerateOverlayUrl').disabled = !status.enabled;
}

async function refreshOverlayStatus() {
  try {
    renderOverlayStatus(await window.companion.getOverlayStatus());
  } catch (error) {
    renderOverlayStatus({ enabled: false, running: false, error: error.message });
  }
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function renderUpdateStatus(status = {}) {
  state.updateStatus = status;
  const phase = status.state || 'unavailable';
  const percent = Math.max(0, Math.min(100, Number(status.percent) || 0));
  const active = ['available', 'downloading', 'downloaded', 'installing'].includes(phase);
  const transferring = ['downloading', 'downloaded', 'installing'].includes(phase);
  const banner = $('#updateBanner');
  banner.hidden = !active;
  text('#updateBannerTitle', phase === 'available'
    ? `BYAKUGAN ${status.version || 'update'} is ready`
    : phase === 'downloading' ? 'Downloading BYAKUGAN update'
      : phase === 'downloaded' ? 'Update downloaded'
        : 'Applying update and restarting');
  text('#updateBannerMessage', status.message || 'A newer beta build is available.');
  $('#updateBannerProgress').hidden = !transferring;
  $('#updateBannerProgressBar').style.width = `${percent}%`;
  text('#updateBannerPercent', `${Math.round(percent)}%`);
  $('#reviewUpdateButton').textContent = phase === 'available' ? 'Review update' : phase === 'downloading' ? 'Downloading…' : 'Restarting…';
  $('#reviewUpdateButton').disabled = phase !== 'available';

  const settingsLabels = {
    idle: 'Automatic beta checks are enabled.', checking: 'Checking for updates…',
    available: `Version ${status.version} is available.`, downloading: `Downloading ${Math.round(percent)}%…`,
    downloaded: 'Download complete; preparing restart.', installing: 'Installing and restarting…',
    'up-to-date': 'BYAKUGAN is up to date.', error: status.message || 'Update check failed.',
    unavailable: status.message || 'Available after installing a configured build.'
  };
  text('#settingsUpdateStatus', settingsLabels[phase] || status.message || 'Beta update status unavailable.');
  $('#checkForUpdatesButton').disabled = ['checking', 'downloading', 'downloaded', 'installing'].includes(phase);

  if (!$('#updateModal').hidden) {
    const busy = ['downloading', 'downloaded', 'installing'].includes(phase);
    const failed = phase === 'error';
    $('#updateDownloadState').hidden = !busy && !failed;
    $('#updateConfirmationNote').hidden = busy || failed;
    $('#updateReleaseNotes').hidden = busy || failed;
    $('#updateLaterButton').hidden = Boolean(status.mandatory);
    $('#updateLaterButton').disabled = busy || Boolean(status.mandatory);
    $('#updateLaterButton').textContent = failed ? 'Close' : 'Later';
    $('#confirmUpdateButton').disabled = busy;
    $('#confirmUpdateButton').textContent = failed ? 'Try again' : 'Download and restart';
    $('#updateProgressBar').style.width = `${percent}%`;
    text('#updateProgressPercent', `${Math.round(percent)}%`);
    text('#updateProgressLabel', phase === 'installing' ? 'Applying update…' : phase === 'downloaded' ? 'Preparing restart…' : phase === 'error' ? 'Update failed' : 'Downloading update…');
    text('#updateProgressDetails', phase === 'error'
      ? status.message
      : status.total ? `${formatBytes(status.transferred)} of ${formatBytes(status.total)} • BYAKUGAN will restart automatically.`
        : 'BYAKUGAN will restart automatically when the update is ready.');
  }
  if (phase === 'available' && status.mandatory && $('#updateModal').hidden) openUpdateDialog();
}

function openUpdateDialog() {
  const status = state.updateStatus || {};
  if (status.state !== 'available') return;
  text('#updateDialogTitle', status.mandatory ? 'Update required' : (status.releaseName || 'Update available'));
  text('#updateCurrentVersion', `Current ${status.currentVersion || '—'}`);
  text('#updateNextVersion', `New ${status.version || '—'}`);
  text('#updateReleaseNotes', status.releaseNotes || 'This beta update contains improvements and fixes.');
  $('#updateReleaseNotes').hidden = false;
  $('#updateDownloadState').hidden = true;
  text('#updateConfirmationNote', status.mandatory
    ? 'A newer BYAKUGAN build was detected during startup. Install it now to continue using the application.'
    : 'BYAKUGAN will download the update, close, install it, and reopen automatically.');
  $('#updateConfirmationNote').hidden = false;
  $('#updateLaterButton').hidden = Boolean(status.mandatory);
  $('#updateLaterButton').disabled = Boolean(status.mandatory);
  $('#updateLaterButton').textContent = 'Later';
  $('#confirmUpdateButton').disabled = false;
  $('#confirmUpdateButton').textContent = status.mandatory ? 'Update now' : 'Download and restart';
  $('#updateModal').hidden = false;
}

function closeUpdateDialog() {
  if (state.updateStatus?.mandatory) return;
  if (['downloading', 'downloaded', 'installing'].includes(state.updateStatus?.state)) return;
  $('#updateModal').hidden = true;
}

function scheduleRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  if (state.settings?.gamingRelayMode) return;
  if (!state.settings?.autoRefresh) return;
  const seconds = Math.max(15, Number(state.settings.refreshSeconds) || 30);
  state.refreshTimer = setInterval(() => refresh(false), seconds * 1000);
}

async function refresh(showFeedback = true) {
  if (state.busy) return;
  state.busy = true;
  try {
    const snapshot = await window.companion.refresh();
    renderSnapshot(snapshot);
    if (showFeedback) toast('Data refreshed', `Updated from ${snapshot.connection.label}.`);
  } catch (error) {
    setConnection({ status: 'disconnected' });
    toast('Connection failed', error.message || 'Could not refresh Riot data.', 'error');
  } finally { state.busy = false; }
}

async function reconnect(showFeedback = true) {
  if (state.busy) return;
  state.busy = true;
  setConnection({ status: 'disconnected' });
  try {
    const snapshot = await window.companion.reconnect();
    renderSnapshot(snapshot);
    await refreshRemoteStatus();
    if (showFeedback) toast(state.settings?.pcRole === 'viewer' ? 'Gaming PC connected' : 'Riot reconnected', state.settings?.pcRole === 'viewer'
      ? 'The streaming PC is now receiving live BYAKUGAN data.'
      : 'Connection, authentication, and live Riot data were restarted.');
  } catch (error) {
    setConnection({ status: 'disconnected' });
    toast('Reconnection failed', error.message || 'Could not reconnect to Riot Client.', 'error');
  } finally { state.busy = false; }
}

async function saveSettingsPatch(patch, feedback = true) {
  state.settings = await window.companion.updateSettings(patch);
  syncSettingsForm();
  applyPrivacy();
  renderMatches();
  scheduleRefresh();
  await refreshOverlayStatus();
  await refreshRemoteStatus();
  if (feedback) toast('Settings saved', 'Your preferences were updated.');
}

async function runSenseiForOpenMatch(regenerate = false) {
  const matchId = state.senseiSelectedMatchId;
  if (state.senseiBusy || !matchId) return;
  if (regenerate && !window.confirm('Regenerate Sensei Vision for this match? The saved report and its Ask Sensei thread will be replaced.')) return;
  state.senseiBusy = true;
  renderSenseiPanel({ status: 'analyzing' });
  try {
    const entry = await window.companion.runSensei({ matchId, regenerate });
    state.senseiReportsByMatch[matchId] = entry;
    renderSenseiPanel(entry);
    renderSenseiHubLists();
    toast('Sensei Vision ready', 'The report was saved to this completed match.');
  } catch (error) {
    const entry = await window.companion.getSenseiReport(matchId).catch(() => ({ status: 'failed', error: error.message }));
    state.senseiReportsByMatch[matchId] = entry;
    renderSenseiPanel(entry);
    renderSenseiHubLists();
    toast('Sensei analysis failed', error.message || 'Review Sensei Settings and try again.', 'error');
  } finally { state.senseiBusy = false; }
}

async function importSenseiVod() {
  const matchId = state.senseiSelectedMatchId;
  if (state.senseiBusy || !matchId) return;
  try {
    const entry = await window.companion.importSenseiVod(matchId);
    if (entry?.canceled) return;
    state.senseiReportsByMatch[matchId] = entry;
    renderSenseiPanel(entry);
    renderSenseiHubLists();
    toast('VOD attached', 'Confirm this recording matches the selected match, then run VOD analysis.');
  } catch (error) { toast('VOD import failed', error.message, 'error'); }
}

async function analyzeSenseiVod() {
  if (state.senseiBusy || !state.senseiSelectedMatchId) return;
  const matchId = state.senseiSelectedMatchId;
  if (!state.senseiStatus?.vodReady) await refreshSenseiStatus();
  if (!state.senseiStatus?.vodReady) {
    toast('VOD setup is incomplete', (state.senseiStatus?.vodMissing || ['Run Check local setup in Settings']).join('; '), 'error');
    return;
  }
  const checkpoint = state.senseiEntry?.vod?.checkpoint;
  const selectedMode = state.settings?.senseiVodMode === 'exhaustive' ? 'exhaustive' : 'adaptive';
  const checkpointMode = checkpoint?.mode || (Number(checkpoint?.version) === 2 ? 'exhaustive' : '');
  const compatibleCheckpoint = checkpointMode === selectedMode && Number(checkpoint?.version) === SENSEI_VOD_CHECKPOINT_VERSIONS[selectedMode] ? checkpoint : null;
  const resumeText = Number(compatibleCheckpoint?.completedSegments) > 0
    ? `Resume after ${selectedMode === 'adaptive' ? 'review window' : 'segment'} ${compatibleCheckpoint.completedSegments} of ${compatibleCheckpoint.totalSegments}? Completed work will be retained.`
    : selectedMode === 'adaptive'
      ? 'Run the Adaptive Quality Test? BYAKUGAN will scan the entire recording, then deeply review selected activity windows and periodic quiet-play audits with your vision model.'
      : 'Run the original Exhaustive review continuously from beginning to end?';
  const replacementWarning = checkpoint && !compatibleCheckpoint
    ? `\n\nThe saved ${checkpointMode || 'other-mode'} checkpoint is incompatible with ${selectedMode} mode and will be replaced if you continue.`
    : '';
  if (!window.confirm(`${resumeText}${replacementWarning}\n\nThis analysis can use substantial GPU and memory. Adaptive mode is intended for an overnight quality test; Exhaustive mode can take considerably longer. Avoid running it during a live stream unless the streaming PC has adequate headroom.`)) return;
  state.senseiBusy = true;
  state.senseiVodRequestActive = true;
  state.senseiVodActiveMatchId = matchId;
  const savedElapsedMs = Math.max(0, Number(compatibleCheckpoint?.elapsedMs) || 0);
  const legacyElapsedMs = savedElapsedMs ? 0 : Math.max(0, Number(compatibleCheckpoint?.updatedAt || 0) - Number(compatibleCheckpoint?.startedAt || 0));
  state.senseiVodStartedAt = Date.now() - (savedElapsedMs || legacyElapsedMs);
  state.senseiVodProgress = { matchId, phase: 'preparing', current: compatibleCheckpoint?.completedSegments || 0, total: compatibleCheckpoint?.totalSegments || 0, mode: selectedMode, message: compatibleCheckpoint ? 'Preparing saved checkpoint' : `Preparing ${selectedMode} full-match analysis` };
  renderSenseiVodGlobal();
  const existing = state.senseiEntry || await window.companion.getSenseiReport(matchId).catch(() => null);
  if (existing && state.senseiSelectedMatchId === matchId) renderSenseiPanel({ ...existing, vod: { ...existing.vod, status: 'analyzing', error: '' } });
  startSenseiVodTimer();
  try {
    const entry = await window.companion.analyzeSenseiVod(matchId);
    state.senseiReportsByMatch[matchId] = entry;
    if (state.senseiSelectedMatchId === matchId) {
      state.senseiEntry = entry;
      renderSenseiPanel(entry);
    }
    renderSenseiHubLists();
    toast('Full-match analysis ready', state.settings.senseiOfferVodCleanup ? 'Read the report, then use “I’ve read it — remove VOD” to reclaim storage.' : 'The complete chronological review was saved to this match.');
  } catch (error) {
    const entry = await window.companion.getSenseiReport(matchId).catch(() => null);
    if (entry) state.senseiReportsByMatch[matchId] = entry;
    if (entry && state.senseiSelectedMatchId === matchId) renderSenseiPanel(entry);
    renderSenseiHubLists();
    const paused = /canceled|paused/i.test(error?.message || '');
    toast(paused ? 'Full-match analysis paused' : 'VOD analysis failed', paused ? 'Completed sections were checkpointed. Use Resume full analysis whenever you are ready.' : error.message, paused ? '' : 'error');
  } finally {
    state.senseiBusy = false;
    state.senseiVodRequestActive = false;
    if (state.senseiVodActiveMatchId === matchId) {
      state.senseiVodActiveMatchId = '';
      state.senseiVodProgress = null;
      state.senseiVodStartedAt = 0;
      stopSenseiVodTimer();
      renderSenseiVodGlobal();
    }
  }
}

async function cancelSenseiVod() {
  const matchId = state.senseiVodActiveMatchId || state.senseiSelectedMatchId;
  if (!matchId || !state.senseiBusy) return;
  const button = $('[data-sensei-vod-cancel]');
  if (button) { button.disabled = true; button.textContent = 'Pausing safely…'; }
  try {
    const result = await window.companion.cancelSenseiVod(matchId);
    if (!result?.ok) toast('Nothing to cancel', result?.message || 'The analysis already stopped.');
  } catch (error) { toast('Could not cancel analysis', error.message, 'error'); }
}

async function deleteSenseiVod() {
  const matchId = state.senseiSelectedMatchId;
  if (state.senseiBusy || !matchId) return;
  const entry = await window.companion.getSenseiReport(matchId);
  const vod = entry?.vod;
  if (!vod?.path) return;
  const confirmed = window.confirm(`You confirmed that you have read the saved VOD report. Move this original recording to the Windows Recycle Bin?\n\n${vod.path}\n${formatBytes(vod.size)}\n\nThe written report remains available, but visual analysis cannot be regenerated without reimporting a video.`);
  if (!confirmed) return;
  try {
    const next = await window.companion.deleteSenseiVod({ matchId, confirmed: true });
    state.senseiReportsByMatch[matchId] = next;
    renderSenseiPanel(next);
    renderSenseiHubLists();
    toast('VOD moved to Recycle Bin', 'The complete saved Sensei report remains attached to this match.');
  } catch (error) { toast('VOD could not be removed', error.message, 'error'); }
}

function bindEvents() {
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
  $$('[data-jump]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.jump)));
  $('#senseiVodGlobal').addEventListener('click', () => {
    if (state.senseiVodActiveMatchId) { navigate('sensei'); selectSenseiMatch(state.senseiVodActiveMatchId); }
  });
  $('#senseiHubReturn').addEventListener('click', () => {
    if (state.senseiVodActiveMatchId) selectSenseiMatch(state.senseiVodActiveMatchId);
  });
  document.body.addEventListener('click', (event) => {
    if (event.target.closest('[data-manage-session]')) openSessionManager();
    if (event.target.closest('[data-sensei-overview-open]')) navigate('sensei');
    if (event.target.closest('[data-sensei-hub-settings]')) navigate('settings');
  });
  $('#sidebarRefresh').addEventListener('click', () => refresh(true));
  $('#connectButton').addEventListener('click', () => reconnect(true));
  $('#privacyButton').addEventListener('click', () => saveSettingsPatch({ privacyMode: !state.settings.privacyMode }, false));
  ['#dashboardMatches', '#fullMatchList'].forEach((selector) => $(selector).addEventListener('click', (event) => {
    const row = event.target.closest('[data-match-id]');
    if (row) openMatchAutopsy(row.dataset.matchId);
  }));
  $('#synergyList').addEventListener('click', (event) => {
    const option = event.target.closest('[data-synergy-id]');
    if (!option) return;
    state.selectedSynergyFriendId = option.dataset.synergyId;
    renderSynergy();
  });
  $('#synergyDetail').addEventListener('click', (event) => {
    const row = event.target.closest('[data-synergy-match-id]');
    if (row) openMatchAutopsy(row.dataset.synergyMatchId);
  });
  $('#closeMatch').addEventListener('click', closeMatchAutopsy);
  $('#shareMatch').addEventListener('click', exportMatchRecap);
  $('#matchModal').addEventListener('click', (event) => { if (event.target === $('#matchModal')) closeMatchAutopsy(); });
  $('#matchAutopsyContent').addEventListener('click', (event) => {
    const openSensei = event.target.closest('[data-open-sensei-match]');
    if (openSensei) { const matchId = openSensei.dataset.openSenseiMatch; closeMatchAutopsy(); navigate('sensei'); selectSenseiMatch(matchId); return; }
    const round = event.target.closest('[data-tactical-round]');
    if (round) {
      state.autopsyRound = String(round.dataset.tacticalRound || 'ALL');
      openMatchAutopsy(state.openMatchId);
      return;
    }
    const row = event.target.closest('[data-player-id]');
    if (row) openPlayerProfile(row.dataset.playerId);
  });
  $('#matchAutopsyContent').addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const row = event.target.closest('[data-player-id]');
    if (row) { event.preventDefault(); openPlayerProfile(row.dataset.playerId); }
  });
  $('#matchAutopsyContent').addEventListener('mouseover', (event) => showTacticalTooltip(event.target));
  $('#matchAutopsyContent').addEventListener('mouseout', (event) => hideTacticalTooltip(event.target, event.relatedTarget));
  $('#matchAutopsyContent').addEventListener('focusin', (event) => showTacticalTooltip(event.target));
  $('#matchAutopsyContent').addEventListener('focusout', (event) => hideTacticalTooltip(event.target, event.relatedTarget));
  ['#senseiMatchPicker', '#senseiRecentReports'].forEach((selector) => $(selector).addEventListener('click', (event) => {
    const option = event.target.closest('[data-sensei-match-id]');
    if (option) selectSenseiMatch(option.dataset.senseiMatchId);
  }));
  $('#senseiWorkspacePanel').addEventListener('click', (event) => {
    if (event.target.closest('[data-sensei-settings]')) { navigate('settings'); return; }
    const runSensei = event.target.closest('[data-sensei-run]');
    if (runSensei) { runSenseiForOpenMatch(runSensei.dataset.regenerate === 'true'); return; }
    if (event.target.closest('[data-sensei-vod-import]')) { importSenseiVod(); return; }
    if (event.target.closest('[data-sensei-vod-analyze]')) { analyzeSenseiVod(); return; }
    if (event.target.closest('[data-sensei-vod-cancel]')) { cancelSenseiVod(); return; }
    if (event.target.closest('[data-sensei-vod-delete]')) deleteSenseiVod();
  });
  $('#senseiWorkspacePanel').addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-sensei-chat]');
    if (!form) return;
    event.preventDefault();
    const input = form.elements.question;
    const question = input.value.trim();
    if (!question || state.senseiBusy) return;
    state.senseiBusy = true;
    input.disabled = true;
    try {
      const entry = await window.companion.askSensei({ matchId: state.senseiSelectedMatchId, question });
      state.senseiReportsByMatch[state.senseiSelectedMatchId] = entry;
      renderSenseiPanel(entry);
    } catch (error) { toast('Ask Sensei failed', error.message, 'error'); }
    finally { state.senseiBusy = false; }
  });
  $('#allyRoster').addEventListener('click', (event) => {
    const row = event.target.closest('[data-player-id]');
    if (row) openPlayerProfile(row.dataset.playerId);
  });
  $('#allyRoster').addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const row = event.target.closest('[data-player-id]');
    if (row) { event.preventDefault(); openPlayerProfile(row.dataset.playerId); }
  });
  $('#closePlayerProfile').addEventListener('click', closePlayerProfile);
  $('#playerModal').addEventListener('click', (event) => { if (event.target === $('#playerModal')) closePlayerProfile(); });
  $('#closeSessionManager').addEventListener('click', closeSessionManager);
  $('#cancelSessionManager').addEventListener('click', closeSessionManager);
  $('#saveSessionManager').addEventListener('click', saveSessionManager);
  $('#startNewSession').addEventListener('click', startNewSession);
  $('#selectLatestSessionMatch').addEventListener('click', () => {
    const latest = $('#sessionRecoveryList input[type="checkbox"]');
    if (latest) latest.checked = true;
    updateSessionRecoveryCount();
  });
  $('#sessionRecoveryList').addEventListener('change', updateSessionRecoveryCount);
  $('#sessionModal').addEventListener('click', (event) => { if (event.target === $('#sessionModal')) closeSessionManager(); });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#matchModal').hidden) closeMatchAutopsy();
    if (!$('#playerModal').hidden) closePlayerProfile();
    if (!$('#sessionModal').hidden) closeSessionManager();
    if (!$('#updateModal').hidden) closeUpdateDialog();
  });

  $$('#matchFilters button').forEach((button) => button.addEventListener('click', () => {
    state.matchFilter = button.dataset.filter;
    $$('#matchFilters button').forEach((item) => item.classList.toggle('active', item === button));
    renderMatches();
  }));
  $('#matchPlaylistFilter').addEventListener('change', (event) => {
    state.matchPlaylist = event.target.value;
    renderMatches();
  });

  $('#autoRefresh').addEventListener('change', (event) => saveSettingsPatch({ autoRefresh: event.target.checked }, false));
  $('#launchAtStartup').addEventListener('change', (event) => saveSettingsPatch({ launchAtStartup: event.target.checked }, false));
  $('#privacyMode').addEventListener('change', (event) => saveSettingsPatch({ privacyMode: event.target.checked }, false));
  $('#compactMatches').addEventListener('change', (event) => saveSettingsPatch({ compactMatches: event.target.checked }, false));
  $('#uiScale').addEventListener('change', async (event) => {
    const uiScale = Number(event.target.value);
    await saveSettingsPatch({ uiScale }, false);
    toast('Interface scale updated', `BYAKUGAN is now displayed at ${uiScale}%.`);
  });
  $('#refreshSeconds').addEventListener('change', (event) => saveSettingsPatch({ refreshSeconds: Number(event.target.value) }, false));
  $('#senseiEnabled').addEventListener('change', async (event) => {
    await saveSettingsPatch({ senseiEnabled: event.target.checked }, false);
    toast(event.target.checked ? 'Sensei Vision enabled' : 'Sensei Vision disabled', event.target.checked ? 'Completed matches now offer manual post-match analysis.' : 'Saved reports remain stored and no analysis controls are active.');
    refreshSenseiStatus();
  });
  $('#senseiTier').addEventListener('change', async (event) => { await saveSettingsPatch({ senseiTier: event.target.value }, false); refreshSenseiStatus(); });
  $('#senseiModel').addEventListener('change', async (event) => { await saveSettingsPatch({ senseiModel: event.target.value.trim() }, false); refreshSenseiStatus(); });
  $('#senseiVodEnabled').addEventListener('change', async (event) => {
    await saveSettingsPatch({ senseiVodEnabled: event.target.checked }, false);
    refreshSenseiStatus();
  });
  $('#senseiVodModel').addEventListener('change', async (event) => { await saveSettingsPatch({ senseiVodModel: event.target.value.trim() }, false); refreshSenseiStatus(); });
  $('#senseiVodMode').addEventListener('change', async (event) => {
    await saveSettingsPatch({ senseiVodMode: event.target.value }, false);
    if (state.senseiSelectedMatchId && state.senseiEntry) renderSenseiPanel(state.senseiEntry);
    toast('VOD review mode updated', event.target.value === 'adaptive' ? 'Adaptive Quality Test will scan the full video and deeply review selected context windows.' : 'Exhaustive mode will use the original slower four-second review pipeline.');
  });
  $('#senseiOfferVodCleanup').addEventListener('change', (event) => saveSettingsPatch({ senseiOfferVodCleanup: event.target.checked }, false));
  $('#checkSenseiSystem').addEventListener('click', refreshSenseiStatus);
  $('#pcRole').addEventListener('change', async (event) => {
    const role = event.target.value;
    await saveSettingsPatch({ pcRole: role }, false);
    setConnection({ status: 'disconnected', source: role === 'viewer' ? 'remote' : 'local' });
    toast(role === 'viewer' ? 'Streaming PC mode selected' : 'Gaming PC mode selected', role === 'viewer'
      ? 'Paste the connection URL from the gaming PC, then select Connect to gaming PC.'
      : 'Use Reconnect Riot to restore the local VALORANT connection.');
  });
  $('#gamingRelayMode').addEventListener('change', async (event) => {
    const enabled = event.target.checked;
    const confirmed = window.confirm(enabled
      ? 'Enable Gaming PC Relay Mode and restart BYAKUGAN? The dashboard will close, full-speed data collection will continue from the system tray, and the streaming-PC link will remain active.'
      : 'Disable Gaming PC Relay Mode and restart BYAKUGAN with the full dashboard?');
    if (!confirmed) {
      event.target.checked = !enabled;
      return;
    }
    try {
      await saveSettingsPatch({
        gamingRelayMode: enabled,
        ...(enabled ? { pcRole: 'gaming', remoteViewerEnabled: true } : {})
      }, false);
      toast(enabled ? 'Starting Gaming PC Relay Mode' : 'Restoring full BYAKUGAN', 'BYAKUGAN will restart automatically.');
      await window.companion.restartApp();
    } catch (error) {
      event.target.checked = !enabled;
      toast('Relay Mode could not restart', error.message || 'The setting could not be applied.', 'error');
    }
  });
  $('#remoteViewerEnabled').addEventListener('change', async (event) => {
    await saveSettingsPatch({ remoteViewerEnabled: event.target.checked }, false);
    if (event.target.checked) toast('Remote Viewer host enabled', 'Copy the connection URL and paste it into BYAKUGAN on the streaming PC. Allow Private networks if Windows asks.');
  });
  $('#copyRemoteUrl').addEventListener('click', async () => {
    try {
      const status = await window.companion.copyRemoteUrl();
      renderRemoteStatus(status);
      toast('Connection URL copied', 'Paste it into Dual PC Streaming Mode on the streaming PC. Treat this URL like a password.');
    } catch (error) {
      toast('Remote Viewer unavailable', error.message, 'error');
    }
  });
  $('#connectRemoteViewer').addEventListener('click', async () => {
    try {
      const remoteSourceUrl = $('#remoteSourceUrl').value.trim();
      state.settings = await window.companion.updateSettings({ pcRole: 'viewer', remoteSourceUrl });
      syncSettingsForm();
      await reconnect(true);
    } catch (error) {
      setConnection({ status: 'disconnected', source: 'remote' });
      toast('Gaming PC connection failed', error.message || 'Could not connect to the gaming PC.', 'error');
    }
  });
  $('#streamOverlayEnabled').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayEnabled: event.target.checked }, false));
  $('#streamOverlayLanEnabled').addEventListener('change', async (event) => {
    await saveSettingsPatch({ streamOverlayLanEnabled: event.target.checked }, false);
    if (event.target.checked) toast('Streaming PC mode enabled', 'Use Copy OBS URL, then paste it into a Browser Source on the other PC. Allow Private networks if Windows asks.');
  });
  $('#streamOverlayLayout').addEventListener('change', (event) => {
    renderOverlayDimensions(event.target.value);
    $('#reactiveVisionOptions').hidden = !['reactive', 'custom'].includes(event.target.value);
    syncTransitionPreviewControl({ ...state.settings, streamOverlayLayout: event.target.value });
    saveSettingsPatch({ streamOverlayLayout: event.target.value }, false);
  });
  $('#customElementPalette').addEventListener('click', async (event) => {
    const reset = event.target.closest('[data-custom-reset]');
    if (reset) {
      event.preventDefault();
      event.stopPropagation();
      const config = resetCustomElement(reset.dataset.customReset);
      if (config) await persistCustomOverlay(config, true);
      return;
    }
    const canvasSelect = event.target.closest('[data-custom-canvas-select]');
    if (canvasSelect) {
      state.customOverlayCanvasState = ['ingame', 'postmatch'].includes(canvasSelect.dataset.customCanvasSelect)
        ? canvasSelect.dataset.customCanvasSelect : 'between';
      const config = cloneCustomOverlay();
      const activeElements = customElementsForState(config);
      if (!activeElements.some((element) => element.id === state.customOverlaySelectedId)) state.customOverlaySelectedId = 'currentRank';
      renderCustomOverlayBuilder();
      return;
    }
    const reactiveToggle = event.target.closest('[data-custom-reactive-visible]');
    if (reactiveToggle) {
      const config = cloneCustomOverlay();
      config.reactive = reactiveToggle.checked;
      state.customOverlayCanvasState = 'between';
      state.settings.streamOverlayCustom = config;
      syncTransitionPreviewControl(state.settings);
      await persistCustomOverlay(config);
      return;
    }
    const option = event.target.closest('[data-custom-select]');
    if (!option) return;
    state.customOverlaySelectedId = option.dataset.customSelect;
    if (event.target.matches('[data-custom-visible]')) {
      const config = cloneCustomOverlay();
      const element = customElementsForState(config).find((entry) => entry.id === event.target.dataset.customVisible);
      if (element) element.visible = event.target.checked;
      state.settings.streamOverlayCustom = config;
      await persistCustomOverlay(config);
    } else {
      renderCustomOverlayBuilder();
    }
  });
  $('#customEditorCanvas').addEventListener('pointerdown', beginCustomElementDrag);
  $('#customEditorCanvasInGame').addEventListener('pointerdown', beginCustomElementDrag);
  $('#customEditorCanvasPostMatch').addEventListener('pointerdown', beginCustomElementDrag);
  for (const [id, property, minimum, maximum] of [
    ['customOverlayWidth', 'width', 320, 1920], ['customOverlayHeight', 'height', 120, 1080],
    ['customOverlayInGameWidth', 'inGameWidth', 320, 1920], ['customOverlayInGameHeight', 'inGameHeight', 120, 1080],
    ['customOverlayPostMatchWidth', 'postMatchWidth', 320, 1920], ['customOverlayPostMatchHeight', 'postMatchHeight', 120, 1080]
  ]) {
    const input = $(`#${id}`);
    input.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || value < minimum || value > maximum) return;
      const config = cloneCustomOverlay();
      config[property] = value;
      state.settings.streamOverlayCustom = config;
      renderCustomOverlayBuilder();
    });
    input.addEventListener('change', async (event) => {
      const config = cloneCustomOverlay();
      config[property] = Number(event.target.value);
      state.settings.streamOverlayCustom = config;
      await persistCustomOverlay(config);
    });
  }
  $('#customOverlayBackgroundColor').addEventListener('change', async (event) => {
    const config = cloneCustomOverlay();
    config.backgroundColor = event.target.value;
    state.settings.streamOverlayCustom = config;
    await persistCustomOverlay(config);
  });
  $('#customOverlayAnimatedRrBeam').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayAnimatedRrBeam: event.target.checked }, false));
  $('#customOverlayShowBeamRR').addEventListener('change', async (event) => {
    const config = cloneCustomOverlay();
    const beam = customElementsForState(config).find((element) => element.id === 'rrBeam');
    if (!beam) return;
    beam.showMarker = event.target.checked;
    state.settings.streamOverlayCustom = config;
    await persistCustomOverlay(config);
  });
  for (const [id, property] of [
    ['customElementShowLabel', 'showLabel'],
    ['customElementShowDetail', 'showDetail'],
    ['customElementShowCurrentRR', 'showCurrentRR']
  ]) {
    $(`#${id}`).addEventListener('change', async (event) => {
      const config = updateSelectedCustomElement(property, event.target.checked);
      if (config) await persistCustomOverlay(config);
    });
  }
  const customInspectorFields = {
    customElementX: 'x', customElementY: 'y', customElementWidth: 'width', customElementHeight: 'height',
    customElementFontSize: 'fontSize', customElementLabelFontSize: 'labelFontSize', customElementDetailFontSize: 'detailFontSize',
    customElementOpacity: 'opacity', customElementAlign: 'align', customElementColor: 'color'
  };
  for (const [id, property] of Object.entries(customInspectorFields)) {
    if (['x', 'y', 'width', 'height', 'fontSize', 'labelFontSize', 'detailFontSize'].includes(property)) {
      $(`#${id}`).addEventListener('input', (event) => updateSelectedCustomElement(property, event.target.value));
    }
    $(`#${id}`).addEventListener('change', async (event) => {
      const config = updateSelectedCustomElement(property, event.target.value);
      if (config) await persistCustomOverlay(config);
    });
  }
  $('#customElementOpacity').addEventListener('input', (event) => {
    text('#customElementOpacityValue', `${event.target.value}%`);
    updateSelectedCustomElement('opacity', event.target.value);
  });
  $('#resetSelectedCustomElement').addEventListener('click', async () => {
    const config = resetCustomElement(state.customOverlaySelectedId);
    if (config) await persistCustomOverlay(config, true);
  });
  $('#resetCustomOverlay').addEventListener('click', async () => {
    state.customOverlaySelectedId = 'branding';
    const config = cloneCustomOverlay(DEFAULT_CUSTOM_OVERLAY);
    state.settings.streamOverlayCustom = config;
    await persistCustomOverlay(config, true);
  });
  window.addEventListener('resize', () => {
    if (state.settings?.streamOverlayLayout === 'custom' && state.currentView === 'stream') renderCustomOverlayBuilder();
  });
  $('#streamOverlayBackgroundOpacity').addEventListener('input', (event) => text('#streamOverlayBackgroundOpacityValue', `${event.target.value}%`));
  $('#streamOverlayBackgroundOpacity').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayBackgroundOpacity: Number(event.target.value) }, false));
  $('#streamOverlayShowIdentity').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowIdentity: event.target.checked }, false));
  $('#streamOverlayShowWl').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowWl: event.target.checked }, false));
  $('#streamOverlayShowKd').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowKd: event.target.checked }, false));
  $('#streamOverlayShowAgent').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowAgent: event.target.checked }, false));
  $('#streamOverlayShowMap').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowMap: event.target.checked }, false));
  $('#streamOverlayShowRR').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowRR: event.target.checked }, false));
  $('#streamOverlayShowPeakRank').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowPeakRank: event.target.checked }, false));
  $('#streamOverlayShowRrChange').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowRrChange: event.target.checked }, false));
  $('#streamOverlayAnimatedRrBeam').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayAnimatedRrBeam: event.target.checked }, false));
  $('#streamOverlaySmoothTransitions').addEventListener('change', (event) => saveSettingsPatch({ streamOverlaySmoothTransitions: event.target.checked }, false));
  $('#streamOverlayTransitionSound').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayTransitionSound: event.target.checked }, false));
  $('#streamOverlayMatchPulse').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayMatchPulse: event.target.checked }, false));
  $('#streamOverlayMatchPulseStyle').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayMatchPulseStyle: event.target.value }, false));
  $('#streamOverlayPostMatchRecap').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayPostMatchRecap: event.target.checked }, false));
  $('#streamOverlayPostMatchRecapSeconds').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayPostMatchRecapSeconds: Number(event.target.value) }, false));
  $('#copyOverlayUrl').addEventListener('click', async () => {
    try {
      const status = await window.companion.copyOverlayUrl();
      renderOverlayStatus(status);
      toast('OBS URL copied', 'Add a Browser Source in OBS and paste the copied address.');
    } catch (error) {
      toast('Overlay unavailable', error.message, 'error');
    }
  });
  $('#regenerateOverlayUrl').addEventListener('click', async () => {
    try {
      const status = await window.companion.regenerateOverlayToken();
      renderOverlayStatus(status);
      toast('Private URL regenerated', 'Copy the new URL and replace the old Browser Source address in OBS.');
    } catch (error) {
      toast('Could not regenerate URL', error.message, 'error');
    }
  });
  $('#previewOverlay').addEventListener('click', async () => {
    try {
      await window.companion.previewOverlay({ animation: false });
      toast('Overlay preview opened', 'This window uses the same live layout and data that OBS receives.');
    } catch (error) {
      toast('Preview unavailable', error.message, 'error');
    }
  });
  $('#previewOverlayTransitions').addEventListener('click', async () => {
    try {
      await window.companion.previewOverlay({ animation: true });
      toast('Animation preview started', 'The preview safely simulates Between Games, In Game, Post Match, and RR beam movement. Click again to replay it.');
    } catch (error) {
      toast('Animation preview unavailable', error.message, 'error');
    }
  });
  $('#reviewUpdateButton').addEventListener('click', openUpdateDialog);
  $('#updateLaterButton').addEventListener('click', closeUpdateDialog);
  $('#updateModal').addEventListener('click', (event) => { if (event.target === $('#updateModal')) closeUpdateDialog(); });
  $('#confirmUpdateButton').addEventListener('click', async () => {
    $('#confirmUpdateButton').disabled = true;
    $('#updateLaterButton').disabled = true;
    $('#updateReleaseNotes').hidden = true;
    $('#updateConfirmationNote').hidden = true;
    $('#updateDownloadState').hidden = false;
    try {
      renderUpdateStatus(await window.companion.downloadAndInstallUpdate());
    } catch (error) {
      renderUpdateStatus({ ...state.updateStatus, state: 'error', message: error.message });
      $('#updateLaterButton').disabled = Boolean(state.updateStatus?.mandatory);
    }
  });
  $('#checkForUpdatesButton').addEventListener('click', async () => {
    try {
      const status = await window.companion.checkForUpdates();
      renderUpdateStatus(status);
      if (status.state === 'up-to-date') toast('No update available', 'This BYAKUGAN beta is up to date.');
      if (status.state === 'unavailable') toast('Updates unavailable', status.message, 'error');
      if (status.state === 'error') toast('Update check failed', status.message, 'error');
    } catch (error) {
      toast('Update check failed', error.message, 'error');
    }
  });

  window.companion.onLiveState(updateLive);
  window.companion.onSnapshot((snapshot) => {
    renderSnapshot(snapshot);
    renderRemoteStatus(state.remoteStatus || {});
    toast('Act stats updated', 'BYAKUGAN refreshed your current-act competitive history.');
  });
  window.companion.onActProgress((progress) => {
    const loaded = Number(progress.loaded) || 0;
    const total = Number(progress.total) || 0;
    if (state.snapshot?.profile && progress.stats) {
      Object.assign(state.snapshot.profile, {
        wins: progress.stats.wins,
        losses: progress.stats.losses,
        kd: progress.stats.kd,
        headshot: progress.stats.headshot,
        statsScope: progress.stats.scope,
        actStatsLoading: progress.loading !== false,
        actStatsLoaded: loaded,
        actStatsTotal: total
      });
      renderStats(state.snapshot.profile);
    }
  });
  window.companion.onSenseiVodProgress(async (progress) => {
    const matchId = String(progress?.matchId || '');
    if (!matchId || (state.senseiVodActiveMatchId && state.senseiVodActiveMatchId !== matchId)) return;
    state.senseiVodActiveMatchId = matchId;
    state.senseiVodProgress = mergeSenseiVodProgress(state.senseiVodProgress, progress);
    if (Number(progress.analysisStartedAt) > 0) state.senseiVodStartedAt = Number(progress.analysisStartedAt);
    else if (!state.senseiVodStartedAt) state.senseiVodStartedAt = Date.now();
    renderSenseiVodGlobal();
    if (!['complete', 'failed', 'canceled'].includes(progress.phase)) {
      startSenseiVodTimer();
      if (state.senseiSelectedMatchId === matchId && state.senseiEntry) renderSenseiPanel({ ...state.senseiEntry, vod: { ...state.senseiEntry.vod, status: 'analyzing', error: '' } });
    } else if (!state.senseiVodRequestActive) {
      state.senseiBusy = false;
      state.senseiVodActiveMatchId = '';
      state.senseiVodProgress = null;
      state.senseiVodStartedAt = 0;
      stopSenseiVodTimer();
      renderSenseiVodGlobal();
      const entry = await window.companion.getSenseiReport(matchId).catch(() => null);
      if (entry) state.senseiReportsByMatch[matchId] = entry;
      if (entry && matchId === String(state.senseiSelectedMatchId)) renderSenseiPanel(entry);
      renderSenseiHubLists();
    }
  });
  window.companion.onWarning((message) => toast('Connector notice', message, 'error'));
  window.companion.onUpdateStatus(renderUpdateStatus);
}

async function initialize() {
  bindEvents();
  try {
    const bootstrap = await window.companion.bootstrap();
    state.settings = bootstrap.settings;
    renderOverlayStatus(bootstrap.overlay);
    renderRemoteStatus(bootstrap.overlay);
    renderUpdateStatus(bootstrap.update);
    text('#versionLabel', `v${bootstrap.version}`);
    text('#aboutVersion', bootstrap.version);
    syncSettingsForm();
    renderSnapshot(bootstrap.snapshot);
    renderRemoteStatus(bootstrap.overlay);
    scheduleRefresh();
  } catch (error) {
    state.settings = await window.companion.getSettings().catch(() => ({
      autoRefresh: false, refreshSeconds: 30,
      launchAtStartup: false, privacyMode: false, compactMatches: false, uiScale: 100,
      pcRole: 'gaming', gamingRelayMode: false, remoteViewerEnabled: false, remoteSourceUrl: '',
      streamOverlayEnabled: false, streamOverlayLayout: 'horizontal',
      streamOverlayLanEnabled: false, streamOverlayShowIdentity: false,
      streamOverlayShowWl: true, streamOverlayShowKd: true,
      streamOverlayShowAgent: true, streamOverlayShowMap: true,
      streamOverlayShowRR: true, streamOverlayShowPeakRank: true, streamOverlayShowRrChange: true,
      streamOverlayAnimatedRrBeam: true, streamOverlaySmoothTransitions: true, streamOverlayTransitionSound: false,
      streamOverlayMatchPulse: false, streamOverlayMatchPulseStyle: 'segments',
      streamOverlayPostMatchRecap: true, streamOverlayPostMatchRecapSeconds: 7,
      streamOverlayBackgroundOpacity: 70,
      streamOverlayCustom: cloneCustomOverlay(DEFAULT_CUSTOM_OVERLAY)
    }));
    syncSettingsForm();
    applyPrivacy();
    renderRemoteStatus({});
    setConnection({ status: 'disconnected' });
    toast('Startup failed', error.message || 'BYAKUGAN could not initialize.', 'error');
  } finally {
    setLoading(false);
  }
}

initialize();
