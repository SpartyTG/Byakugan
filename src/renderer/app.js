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
  openPlayerId: '',
  selectedSynergyFriendId: '',
  overlayStatus: null,
  remoteStatus: null,
  updateStatus: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const text = (selector, value) => { const element = $(selector); if (element) element.textContent = String(value ?? '—'); };
const OVERLAY_DIMENSIONS = Object.freeze({
  rank: { width: 680, height: 300 },
  horizontal: { width: 1600, height: 180 },
  compact: { width: 560, height: 240 },
  vertical: { width: 380, height: 660 }
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
  $('#sessionMini').innerHTML = `<p class="eyebrow">CURRENT SESSION</p><h2>${session.games || 0} ${Number(session.games) === 1 ? 'match' : 'matches'} analyzed</h2><div class="session-mini-grid"><span><small>W / L</small><strong>${escapeHtml(session.wins || 0)} / ${escapeHtml(session.losses || 0)}</strong></span><span><small>K/D</small><strong>${escapeHtml(session.kd ?? '—')}</strong></span><span><small>RR</small><strong>${session.rrChange > 0 ? '+' : ''}${escapeHtml(session.rrChange || 0)}</strong></span></div>`;
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
  $('#sessionCard').innerHTML = `<div class="panel-heading"><div><p class="eyebrow">SESSION MODE</p><h2>Current run</h2></div><span class="feature-chip">LIVE</span></div><p class="muted">Tracking from when BYAKUGAN connected.</p><div class="session-score"><div><small>MATCHES</small><strong>${escapeHtml(session.games || 0)}</strong></div><div><small>WIN / LOSS</small><strong>${escapeHtml(session.wins || 0)} / ${escapeHtml(session.losses || 0)}</strong></div><div><small>SESSION K/D</small><strong>${escapeHtml(session.kd ?? '—')}</strong></div><div><small>RR MOVEMENT</small><strong>${session.rrChange > 0 ? '+' : ''}${escapeHtml(session.rrChange || 0)}</strong></div></div>`;
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
  return `<div class="history-player ${player.isSelf ? 'self' : ''} ${player.hidden ? 'hidden-name' : ''} ${clickable ? 'inspectable' : ''}" ${clickable ? `data-player-id="${escapeHtml(player.profileId)}" role="button" tabindex="0"` : ''}>
    <div class="history-player-agent" style="--player-color:${escapeHtml(player.agentColor || '#7b67f6')}">${agentImage ? `<img src="${agentImage}" alt="${escapeHtml(player.agent)}">` : `<span>${escapeHtml(initials(player.agent))}</span>`}</div>
    <div class="history-player-name"><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(detail)}</small></div>
    <div class="history-player-performance"><small>THIS MATCH</small><strong>${escapeHtml(player.kills)} / ${escapeHtml(player.deaths)} / ${escapeHtml(player.assists)}</strong><em>${escapeHtml(player.acs || 0)} ACS</em></div>
    <div class="history-player-rank">${rankImage ? `<img src="${rankImage}" alt="">` : '<i></i>'}<span><small>MATCH RANK</small><strong>${escapeHtml(player.rank)}</strong></span></div>
  </div>`;
}

function openMatchAutopsy(matchId) {
  const match = findMatchById(matchId);
  if (!match) return;
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
  $('#matchAutopsyContent').innerHTML = `<div class="autopsy-hero">${safeImage(match.mapImage) ? `<img src="${safeImage(match.mapImage)}" alt="">` : ''}<div class="autopsy-hero-content"><div><p class="eyebrow">MATCH AUTOPSY • ${escapeHtml(match.result)}</p><h1 id="autopsyTitle">${escapeHtml(match.map)}</h1><p>${escapeHtml(match.agent)} • ${escapeHtml(context)} • ${escapeHtml(match.ago)}</p></div><div class="autopsy-score">${escapeHtml(match.score)}</div></div></div><div class="autopsy-body"><div class="autopsy-metrics"><div><small>K / D / A</small><strong>${escapeHtml(match.kills)} / ${escapeHtml(match.deaths)} / ${escapeHtml(match.assists)}</strong></div><div><small>K/D</small><strong>${escapeHtml(match.kd)}</strong></div><div><small>${competitive ? 'RR' : 'PLAYLIST'}</small><strong>${escapeHtml(ratingValue)}</strong></div><div><small>OPENING KILLS</small><strong>${escapeHtml(report.openingKills || 0)}</strong></div><div><small>OPENING DEATHS</small><strong>${escapeHtml(report.openingDeaths || 0)}</strong></div><div><small>MULTIKILL ROUNDS</small><strong>${escapeHtml(report.multikillRounds || 0)}</strong></div></div><div class="autopsy-verdict"><h3>${escapeHtml(verdictTitle)}</h3><p>${escapeHtml(verdictBody)}</p></div><div class="panel-heading"><div><p class="eyebrow">ROUND SIGNAL</p><h2>Personal impact timeline</h2></div><span class="muted">K/D per round</span></div><div class="round-timeline">${rounds.map((round) => `<div class="round-chip ${String(round.result).toLowerCase()} ${round.opening === 'KILL' ? 'opening-kill' : round.opening === 'DEATH' ? 'opening-death' : ''}"><small>R${escapeHtml(round.round)}</small><strong>${escapeHtml(round.kills)}K / ${escapeHtml(round.deaths)}D</strong></div>`).join('') || '<div class="empty-state">Round detail was not returned for this match.</div>'}</div><div class="panel-heading postmatch-heading"><div><p class="eyebrow">MATCH ROSTER</p><h2>Players & performance</h2></div><span class="muted">Select a visible player to inspect</span></div>${rosterMarkup}</div>`;
  $('#matchModal').hidden = false;
}

function closeMatchAutopsy() {
  $('#matchModal').hidden = true;
  state.openMatchId = '';
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
  const identity = player.side === 'enemy' && !player.friend
    ? `<strong>${escapeHtml(player.agent)}</strong><small>ENEMY AGENT${player.locked ? ' • LOCKED' : ''}</small>`
    : `<strong class="live-player-name">${player.partyMember ? '◆ ' : player.friend ? '● ' : player.hidden ? '◌ ' : ''}${escapeHtml(player.name)}</strong><small>${escapeHtml(player.agent)}${player.partyMember ? ' • PARTY' : player.friend ? ' • RIOT FRIEND' : ''}${player.locked ? ' • LOCKED' : ''}</small>`;
  return `<div class="live-player-row ${player.isSelf ? 'self' : ''} ${player.hidden ? 'hidden-name' : ''} ${player.inspectable ? 'inspectable' : ''}" ${player.inspectable ? `data-player-id="${escapeHtml(player.id)}" role="button" tabindex="0"` : ''}>
    <div class="live-agent" style="--player-color:${escapeHtml(player.agentColor || '#7b67f6')}">${agentImage ? `<img src="${agentImage}" alt="${escapeHtml(player.agent)}">` : `<span>${escapeHtml(initials(player.agent))}</span>`}</div>
    <div class="live-player-identity">${identity}</div>
    <div class="live-rank">${rankImage ? `<img src="${rankImage}" alt="">` : '<i></i>'}<span><small>RANK</small><strong>${escapeHtml(player.rank)}</strong></span></div>
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
  return `<div class="live-player-row concealed"><div class="live-agent"><span>?</span></div><div class="live-player-identity"><strong>Opponent hidden</strong><small>Revealed when Riot exposes the roster</small></div><div class="live-rank"><i></i><span><small>RANK</small><strong>Hidden</strong></span></div></div>`;
}

function renderLiveMatch() {
  const live = state.snapshot?.live || {};
  const players = live.players || [];
  const allies = players.filter((player) => player.side === 'ally');
  const enemies = players.filter((player) => player.side === 'enemy');
  const active = !['MENUS', 'IDLE', ''].includes(String(live.state || '').toUpperCase());

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
  if (enemies.length) $('#enemyRoster').innerHTML = enemies.map(livePlayerRow).join('');
  else if (String(live.state || '').toUpperCase() === 'PREGAME') $('#enemyRoster').innerHTML = Array.from({ length: 5 }, (_, index) => hiddenOpponentSlot(index)).join('');
  else $('#enemyRoster').innerHTML = '<div class="roster-empty">Enemy players will appear after the active match loads.</div>';
}

function renderDiagnostics() {
  const diagnostics = state.snapshot?.diagnostics || [];
  const target = $('#diagnosticList');
  if (!target) return;
  if (!diagnostics.length) {
    target.innerHTML = '<div class="diagnostic-ok">✓ All requested data sources responded.</div>';
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
}

function syncSettingsForm() {
  const settings = state.settings;
  $('#autoRefresh').checked = Boolean(settings.autoRefresh);
  $('#launchAtStartup').checked = Boolean(settings.launchAtStartup);
  $('#privacyMode').checked = Boolean(settings.privacyMode);
  $('#compactMatches').checked = Boolean(settings.compactMatches);
  $('#refreshSeconds').value = String(settings.refreshSeconds || 30);
  $('#pcRole').value = settings.pcRole || 'gaming';
  $('#remoteViewerEnabled').checked = Boolean(settings.remoteViewerEnabled);
  $('#remoteSourceUrl').value = settings.remoteSourceUrl || '';
  $('#remoteHostControls').hidden = settings.pcRole === 'viewer';
  $('#remoteViewerControls').hidden = settings.pcRole !== 'viewer';
  $('#streamOverlayEnabled').checked = Boolean(settings.streamOverlayEnabled);
  $('#streamOverlayLanEnabled').checked = Boolean(settings.streamOverlayLanEnabled);
  $('#streamOverlayLayout').value = settings.streamOverlayLayout || 'horizontal';
  renderOverlayDimensions(settings.streamOverlayLayout);
  $('#streamOverlayShowIdentity').checked = Boolean(settings.streamOverlayShowIdentity);
  $('#streamOverlayShowWl').checked = settings.streamOverlayShowWl !== false;
  $('#streamOverlayShowKd').checked = settings.streamOverlayShowKd !== false;
  $('#streamOverlayShowAgent').checked = settings.streamOverlayShowAgent !== false;
  $('#streamOverlayShowMap').checked = settings.streamOverlayShowMap !== false;
  $('#streamOverlayShowRR').checked = settings.streamOverlayShowRR !== false;
  $('#streamOverlayShowPeakRank').checked = settings.streamOverlayShowPeakRank !== false;
  $('#streamOverlayShowRrChange').checked = settings.streamOverlayShowRrChange !== false;
  $('#streamOverlayAnimatedRrBeam').checked = settings.streamOverlayAnimatedRrBeam !== false;
}

function renderOverlayDimensions(layout) {
  const selected = OVERLAY_DIMENSIONS[layout] || OVERLAY_DIMENSIONS.horizontal;
  text('#overlayDimensions', `${selected.width} × ${selected.height}`);
  text('#overlayDimensionsHelp', `Set Width to ${selected.width} and Height to ${selected.height} in OBS.`);
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

function bindEvents() {
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
  $$('[data-jump]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.jump)));
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
    const row = event.target.closest('[data-player-id]');
    if (row) openPlayerProfile(row.dataset.playerId);
  });
  $('#matchAutopsyContent').addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const row = event.target.closest('[data-player-id]');
    if (row) { event.preventDefault(); openPlayerProfile(row.dataset.playerId); }
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
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#matchModal').hidden) closeMatchAutopsy();
    if (!$('#playerModal').hidden) closePlayerProfile();
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
  $('#refreshSeconds').addEventListener('change', (event) => saveSettingsPatch({ refreshSeconds: Number(event.target.value) }, false));
  $('#pcRole').addEventListener('change', async (event) => {
    const role = event.target.value;
    await saveSettingsPatch({ pcRole: role }, false);
    setConnection({ status: 'disconnected', source: role === 'viewer' ? 'remote' : 'local' });
    toast(role === 'viewer' ? 'Streaming PC mode selected' : 'Gaming PC mode selected', role === 'viewer'
      ? 'Paste the connection URL from the gaming PC, then select Connect to gaming PC.'
      : 'Use Reconnect Riot to restore the local VALORANT connection.');
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
    saveSettingsPatch({ streamOverlayLayout: event.target.value }, false);
  });
  $('#streamOverlayShowIdentity').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowIdentity: event.target.checked }, false));
  $('#streamOverlayShowWl').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowWl: event.target.checked }, false));
  $('#streamOverlayShowKd').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowKd: event.target.checked }, false));
  $('#streamOverlayShowAgent').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowAgent: event.target.checked }, false));
  $('#streamOverlayShowMap').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowMap: event.target.checked }, false));
  $('#streamOverlayShowRR').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowRR: event.target.checked }, false));
  $('#streamOverlayShowPeakRank').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowPeakRank: event.target.checked }, false));
  $('#streamOverlayShowRrChange').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayShowRrChange: event.target.checked }, false));
  $('#streamOverlayAnimatedRrBeam').addEventListener('change', (event) => saveSettingsPatch({ streamOverlayAnimatedRrBeam: event.target.checked }, false));
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
      await window.companion.previewOverlay();
      toast('Overlay preview opened', 'This window uses the same live layout and data that OBS receives.');
    } catch (error) {
      toast('Preview unavailable', error.message, 'error');
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
      launchAtStartup: false, privacyMode: false, compactMatches: false,
      pcRole: 'gaming', remoteViewerEnabled: false, remoteSourceUrl: '',
      streamOverlayEnabled: false, streamOverlayLayout: 'horizontal',
      streamOverlayLanEnabled: false, streamOverlayShowIdentity: false,
      streamOverlayShowWl: true, streamOverlayShowKd: true,
      streamOverlayShowAgent: true, streamOverlayShowMap: true,
      streamOverlayShowRR: true, streamOverlayShowPeakRank: true, streamOverlayShowRrChange: true,
      streamOverlayAnimatedRrBeam: true
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
