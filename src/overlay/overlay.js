'use strict';

const overlay = document.querySelector('#overlay');
const token = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');
const previewMode = new URLSearchParams(location.search).get('preview') === '1';
document.body.classList.toggle('preview-mode', previewMode);
let staleTimer = null;
let currentBeamProgress = 0;
let previousLiveState = '';
let lastMatchKey = '';
let reactivePostMatchPending = false;
let reactivePendingTimer = null;
let reactiveAwakenTimer = null;

function isReactiveCompactState(value) {
  return ['PREGAME', 'INGAME', 'CORE_GAME'].includes(String(value || '').toUpperCase());
}

function isCompletedMatchState(value) {
  return ['INGAME', 'CORE_GAME'].includes(String(value || '').toUpperCase());
}

function updateReactiveState(layout, liveState, session) {
  const reactive = layout === 'reactive';
  const compact = isReactiveCompactState(liveState);
  const matchJustEnded = isCompletedMatchState(previousLiveState) && !isCompletedMatchState(liveState);
  const matchKey = [session.lastMatchId || '', session.lastMatchResult || '', Number(session.lastMatchRR) || 0].join(':');

  if (!reactive) {
    reactivePostMatchPending = false;
    clearTimeout(reactivePendingTimer);
  } else if (compact) {
    reactivePostMatchPending = false;
    clearTimeout(reactivePendingTimer);
  } else {
    if (matchJustEnded) {
      reactivePostMatchPending = true;
      clearTimeout(reactivePendingTimer);
      reactivePendingTimer = setTimeout(() => {
        reactivePostMatchPending = false;
        overlay.classList.remove('reactive-postmatch-pending');
      }, 45_000);
    }
    if (reactivePostMatchPending && matchKey && lastMatchKey && matchKey !== lastMatchKey) {
      reactivePostMatchPending = false;
      clearTimeout(reactivePendingTimer);
      overlay.classList.add('reactive-awakening');
      clearTimeout(reactiveAwakenTimer);
      reactiveAwakenTimer = setTimeout(() => overlay.classList.remove('reactive-awakening'), 4_500);
    }
  }

  overlay.classList.toggle('reactive-compact', reactive && compact);
  overlay.classList.toggle('reactive-expanded', reactive && !compact);
  overlay.classList.toggle('reactive-postmatch-pending', reactive && reactivePostMatchPending);
  if (!reactive) overlay.classList.remove('reactive-awakening');
  if (!compact && matchKey) lastMatchKey = matchKey;
  previousLiveState = liveState;
}

function markAlive() {
  overlay.classList.remove('is-loading', 'is-offline');
  document.querySelector('#connectionDot').title = 'BYAKUGAN connected';
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => overlay.classList.add('is-offline'), 45_000);
}

function text(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value ?? '—');
}

function initials(value) {
  return String(value || '—').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function setImage(selector, fallbackSelector, url, fallback) {
  const image = document.querySelector(selector);
  const fallbackElement = document.querySelector(fallbackSelector);
  if (url) {
    image.src = url;
    image.hidden = false;
    fallbackElement.hidden = true;
  } else {
    image.removeAttribute('src');
    image.hidden = true;
    fallbackElement.hidden = false;
    fallbackElement.textContent = fallback;
  }
}

function signed(value, suffix = '') {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : number < 0 ? '−' : '±'}${Math.abs(number)}${suffix}`;
}

function customNode(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}

function customCopy(label, value, detail = '') {
  const copy = customNode('span', 'custom-copy');
  copy.append(customNode('small', 'custom-label', label), customNode('strong', 'custom-value', value));
  if (detail) copy.append(customNode('em', 'custom-detail', detail));
  return copy;
}

function customImage(url, fallback, className = 'custom-icon') {
  if (url) {
    const image = customNode('img', className);
    image.src = url;
    image.alt = '';
    return image;
  }
  return customNode('span', 'custom-icon-fallback', fallback);
}

function rgbaFromHex(value, opacity) {
  const match = /^#([a-f0-9]{6})$/i.exec(String(value || ''));
  if (!match) return 'transparent';
  const number = Number.parseInt(match[1], 16);
  return `rgba(${number >> 16},${(number >> 8) & 255},${number & 255},${Math.max(0, Math.min(1, opacity))})`;
}

function renderReactivePreviewComparison(layout) {
  let comparison = document.querySelector('.reactive-preview-comparison');
  if (!previewMode || layout !== 'reactive') {
    if (comparison) {
      document.body.insertBefore(overlay, comparison);
      comparison.remove();
    }
    document.body.classList.remove('reactive-comparison-mode');
    return;
  }

  document.body.classList.add('reactive-comparison-mode');
  if (!comparison) {
    comparison = customNode('section', 'reactive-preview-comparison');
    const expandedFrame = customNode('article', 'reactive-preview-state reactive-expanded-preview');
    expandedFrame.append(customNode('small', 'reactive-preview-label', 'BETWEEN GAMES'), overlay);
    const compactFrame = customNode('article', 'reactive-preview-state reactive-compact-preview');
    compactFrame.append(customNode('small', 'reactive-preview-label', 'IN GAME'));
    comparison.append(expandedFrame, compactFrame);
    document.body.append(comparison);
  }

  overlay.classList.remove('reactive-compact', 'reactive-postmatch-pending', 'reactive-awakening');
  overlay.classList.add('reactive-expanded');
  const compactFrame = comparison.querySelector('.reactive-compact-preview');
  compactFrame.querySelector('.overlay')?.remove();
  const compactDock = overlay.cloneNode(true);
  compactDock.removeAttribute('id');
  compactDock.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  compactDock.classList.remove('reactive-expanded', 'reactive-postmatch-pending', 'reactive-awakening');
  compactDock.classList.add('reactive-compact');
  compactFrame.append(compactDock);
}

function renderCustomOverlay(data, player, session, live, appearance) {
  const canvas = document.querySelector('#customOverlayCanvas');
  if (!canvas) return;
  canvas.replaceChildren();
  if (data.layout !== 'custom') return;
  const config = data.customOverlay || { elements: [] };
  canvas.style.setProperty('--custom-canvas-background', rgbaFromHex(config.backgroundColor, appearance.backgroundOpacity / 100));

  for (const element of config.elements || []) {
    if (!element.visible) continue;
    const item = customNode('div', `custom-overlay-item custom-${element.id} align-${element.align}`);
    item.style.left = `${element.x}%`;
    item.style.top = `${element.y}%`;
    item.style.width = `${element.width}%`;
    item.style.height = `${element.height}%`;
    item.style.setProperty('--custom-font-size', `${element.fontSize}px`);
    item.style.setProperty('--custom-opacity', String(element.opacity / 100));
    item.style.setProperty('--custom-align', element.align);
    item.style.setProperty('--custom-color', element.color);

    if (element.id === 'branding') {
      item.append(customNode('span', 'custom-eye'), customCopy('BYAKUGAN', 'SESSION VISION'));
    } else if (element.id === 'playerName') {
      item.append(customCopy('RIOT ID', player.name || 'PLAYER'));
    } else if (element.id === 'currentRank') {
      item.append(customImage(player.rankImage, initials(player.rank)), customCopy('CURRENT RANK', player.rank || 'UNRATED'));
    } else if (element.id === 'currentRR') {
      item.append(customCopy('CURRENT RR', `${Number(player.rr) || 0} RR`));
    } else if (element.id === 'peakRank') {
      const season = [player.peakEpisode, player.peakAct].filter(Boolean).join(' • ');
      item.append(customImage(player.peakRankImage, initials(player.peakRank)), customCopy('ALL-TIME PEAK', player.peakRank || 'UNRATED', season));
    } else if (element.id === 'sessionWL') {
      item.append(customCopy('SESSION W / L', `${Number(session.wins) || 0} W / ${Number(session.losses) || 0} L`));
    } else if (element.id === 'sessionKD') {
      item.append(customCopy('SESSION K/D', Number(session.kd || 0).toFixed(2)));
    } else if (element.id === 'rrChange') {
      item.append(customCopy('SESSION RR', signed(session.rrChange, ' RR')));
    } else if (element.id === 'lastMatch') {
      item.append(customCopy('LAST MATCH', session.lastMatchResult || 'NO MATCH', signed(session.lastMatchRR, ' RR')));
    } else if (element.id === 'agent') {
      item.append(customImage(live.agentImage, initials(live.agent), 'custom-agent-image'), customCopy(live.agentLabel || 'AGENT', live.agent || 'WAITING…'));
    } else if (element.id === 'map') {
      item.append(customCopy('CURRENT MAP', live.map || '—', live.label || 'IN MENUS'));
    } else if (element.id === 'rrBeam') {
      const fill = customNode('span', 'custom-beam-fill');
      const beam = customNode('img');
      beam.src = '/rr-energy-beam.gif';
      beam.alt = '';
      fill.append(beam);
      item.style.setProperty('--custom-beam-progress', `${Math.max(0, Math.min(100, Number(session.beamProgress) || 0))}%`);
      item.append(fill, customNode('strong', 'custom-beam-marker', `${Number(player.rr) || 0} RR`));
    }
    canvas.append(item);
  }
}

function render(data) {
  const player = data.player || {};
  const session = data.session || {};
  const live = data.live || {};
  const preferences = data.preferences || {};
  const appearance = data.appearance || {};

  const layout = data.layout || 'horizontal';
  overlay.className = `overlay layout-${layout}`;
  document.body.classList.toggle('custom-layout', layout === 'custom');
  overlay.classList.toggle('hide-identity', !preferences.showIdentity);
  overlay.classList.toggle('hide-wl', preferences.showWl === false);
  overlay.classList.toggle('hide-kd', preferences.showKd === false);
  overlay.classList.toggle('hide-agent', preferences.showAgent === false);
  overlay.classList.toggle('hide-map', preferences.showMap === false);
  overlay.classList.toggle('hide-live-details', preferences.showAgent === false && preferences.showMap === false);
  overlay.classList.toggle('hide-rr', !preferences.showRR);
  overlay.classList.toggle('hide-rr-beam', !preferences.showRR);
  overlay.classList.toggle('beam-static', preferences.animatedRrBeam === false);
  overlay.classList.toggle('hide-peak-rank', preferences.showPeakRank === false);
  overlay.classList.toggle('hide-rr-change', preferences.showRrChange === false);
  overlay.classList.toggle('hide-metrics', preferences.showWl === false && preferences.showKd === false && preferences.showRrChange === false);
  overlay.classList.toggle('hide-rank-record', preferences.showWl === false && preferences.showKd === false);
  overlay.classList.toggle('hide-rank-footer', preferences.showRR === false && preferences.showWl === false && preferences.showKd === false);
  overlay.classList.toggle('rr-positive', Number(session.rrChange) > 0);
  overlay.classList.toggle('rr-negative', Number(session.rrChange) < 0);
  overlay.classList.toggle('last-positive', Number(session.lastMatchRR) > 0);
  overlay.classList.toggle('last-negative', Number(session.lastMatchRR) < 0);
  const backgroundOpacity = Math.max(0, Math.min(100, Number(appearance.backgroundOpacity) || 0));
  overlay.style.setProperty('--overlay-bg-opacity', String(backgroundOpacity / 100));
  updateReactiveState(layout, live.state, session);

  text('#playerName', player.name || 'PLAYER');
  text('#playerRank', player.rank || 'Unrated');
  text('#playerRR', `${Number(player.rr) || 0} RR`);
  text('#reactivePlayerRank', player.rank || 'Unrated');
  text('#reactivePlayerRR', `${Number(player.rr) || 0} RR`);
  text('#beamCurrentRR', `${Number(player.rr) || 0} RR`);
  const peakSeason = [player.peakEpisode, player.peakAct].filter(Boolean).join(' • ');
  text('#playerPeakRank', [player.peakRank || 'Unrated', peakSeason].filter(Boolean).join(' • '));
  text('#reactivePlayerPeakRank', [player.peakRank || 'Unrated', peakSeason].filter(Boolean).join(' • '));
  setImage('#rankImage', '#rankFallback', player.rankImage, initials(player.rank));
  setImage('#peakRankImage', '#peakRankFallback', player.peakRankImage, initials(player.peakRank));
  setImage('#reactiveRankImage', '#reactiveRankFallback', player.rankImage, initials(player.rank));
  setImage('#reactivePeakRankImage', '#reactivePeakRankFallback', player.peakRankImage, initials(player.peakRank));

  text('#sessionRecord', `${Number(session.wins) || 0}–${Number(session.losses) || 0}`);
  text('#rankSessionLabel', preferences.showWl === false ? 'SESSION K/D' : 'SESSION RECORD');
  text('#rankSessionRecord', `${Number(session.wins) || 0} W / ${Number(session.losses) || 0} L`);
  text('#rankSessionKd', `${Number(session.kd || 0).toFixed(2)} K/D`);
  text('#reactiveSessionRecord', `${Number(session.wins) || 0} W / ${Number(session.losses) || 0} L`);
  text('#reactiveSessionKd', Number(session.kd || 0).toFixed(2));
  text('#reactiveLastMatchRR', signed(session.lastMatchRR, ' RR'));
  text('#reactiveLastMatchResult', session.lastMatchResult || 'NO MATCH');
  text('#sessionGames', `${Number(session.games) || 0} ${(Number(session.games) || 0) === 1 ? 'GAME' : 'GAMES'}`);
  text('#sessionKd', Number(session.kd || 0).toFixed(2));
  text('#sessionRR', signed(session.rrChange));
  text('#rankMovement', session.startingRank && session.currentRank && session.startingRank !== session.currentRank
    ? `${session.startingRank} → ${session.currentRank}`
    : session.currentRank || 'NO CHANGE');
  text('#lastMatchRR', signed(session.lastMatchRR, ' RR'));
  text('#lastMatchResult', session.lastMatchResult || 'NO MATCH');
  const nextBeamProgress = Math.max(0, Math.min(100, Number(session.beamProgress) || 0));
  overlay.classList.toggle('beam-empty', nextBeamProgress <= 0);
  overlay.style.setProperty('--rr-beam-progress', `${currentBeamProgress}%`);
  requestAnimationFrame(() => overlay.style.setProperty('--rr-beam-progress', `${nextBeamProgress}%`));
  currentBeamProgress = nextBeamProgress;

  text('#liveLabel', live.agentLabel || live.label || 'WAITING FOR AGENT');
  text('#liveMap', live.map || '—');
  text('#liveAgent', live.agent || live.queue || '—');
  setImage('#agentImage', '#agentFallback', live.agentImage, initials(live.agent));
  renderCustomOverlay(data, player, session, live, appearance);

  markAlive();
  renderReactivePreviewComparison(layout);
}

function setOffline() {
  overlay.classList.add('is-offline');
  document.querySelector('#connectionDot').title = 'Reconnecting to BYAKUGAN';
}

fetch(`/snapshot?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unauthorized overlay URL')))
  .then(render)
  .catch(setOffline);

const events = new EventSource(`/events?token=${encodeURIComponent(token)}`);
events.addEventListener('session', (event) => {
  try { render(JSON.parse(event.data)); } catch { setOffline(); }
});
events.addEventListener('ping', markAlive);
events.addEventListener('error', setOffline);
