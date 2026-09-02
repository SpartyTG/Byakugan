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
let reactiveRecapTimer = null;
let reactiveRecapActive = false;
let lastRoundPulseRevision = -1;

function isReactiveCompactState(value) {
  return ['PREGAME', 'INGAME', 'CORE_GAME'].includes(String(value || '').toUpperCase());
}

function isCompletedMatchState(value) {
  return ['INGAME', 'CORE_GAME'].includes(String(value || '').toUpperCase());
}

function awakenReactiveDock() {
  overlay.classList.add('reactive-awakening');
  clearTimeout(reactiveAwakenTimer);
  reactiveAwakenTimer = setTimeout(() => overlay.classList.remove('reactive-awakening'), 4_500);
}

function updateReactiveState(layout, liveState, session, preferences = {}, customReactive = false) {
  const reactive = layout === 'reactive' || (layout === 'custom' && customReactive);
  const compact = isReactiveCompactState(liveState);
  const matchJustEnded = isCompletedMatchState(previousLiveState) && !isCompletedMatchState(liveState);
  const matchKey = [session.lastMatchId || '', session.lastMatchResult || '', Number(session.lastMatchRR) || 0].join(':');
  const recapEnabled = preferences.postMatchRecap !== false;

  if (!reactive) {
    reactivePostMatchPending = false;
    reactiveRecapActive = false;
    clearTimeout(reactivePendingTimer);
    clearTimeout(reactiveRecapTimer);
  } else if (compact) {
    reactivePostMatchPending = false;
    reactiveRecapActive = false;
    clearTimeout(reactivePendingTimer);
    clearTimeout(reactiveRecapTimer);
  } else {
    if (!recapEnabled && reactiveRecapActive) {
      reactiveRecapActive = false;
      clearTimeout(reactiveRecapTimer);
    }
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
      if (recapEnabled) {
        reactiveRecapActive = true;
        clearTimeout(reactiveRecapTimer);
        reactiveRecapTimer = setTimeout(() => {
          reactiveRecapActive = false;
          overlay.classList.remove('reactive-recap-active');
          overlay.classList.add('reactive-expanded');
          awakenReactiveDock();
        }, Math.max(3, Math.min(15, Number(preferences.postMatchRecapSeconds) || 7)) * 1000);
      } else {
        awakenReactiveDock();
      }
    }
  }

  overlay.classList.toggle('reactive-compact', reactive && compact && !reactiveRecapActive);
  overlay.classList.toggle('reactive-expanded', reactive && !compact && !reactiveRecapActive);
  overlay.classList.toggle('reactive-recap-active', reactive && reactiveRecapActive);
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
  const shell = customNode('span', `custom-icon-shell ${className === 'custom-agent-image' ? 'custom-agent-shell' : ''}`);
  shell.append(customNode('span', 'custom-icon-fallback', fallback));
  if (url) {
    const image = customNode('img', `custom-icon-image ${className}`);
    image.src = url;
    image.alt = '';
    shell.append(image);
  }
  return shell;
}

function rgbaFromHex(value, opacity) {
  const match = /^#([a-f0-9]{6})$/i.exec(String(value || ''));
  if (!match) return 'transparent';
  const number = Number.parseInt(match[1], 16);
  return `rgba(${number >> 16},${(number >> 8) & 255},${number & 255},${Math.max(0, Math.min(1, opacity))})`;
}

function renderReactivePreviewComparison(layout, preferences = {}) {
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
    const recapFrame = customNode('article', 'reactive-preview-state reactive-recap-preview');
    recapFrame.append(customNode('small', 'reactive-preview-label', 'POST MATCH'));
    comparison.append(expandedFrame, compactFrame, recapFrame);
    document.body.append(comparison);
  }

  overlay.classList.remove('reactive-compact', 'reactive-recap-active', 'reactive-postmatch-pending', 'reactive-awakening');
  overlay.classList.add('reactive-expanded');
  const compactFrame = comparison.querySelector('.reactive-compact-preview');
  compactFrame.querySelector('.overlay')?.remove();
  const compactDock = overlay.cloneNode(true);
  compactDock.removeAttribute('id');
  compactDock.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  compactDock.classList.remove('reactive-expanded', 'reactive-recap-active', 'reactive-postmatch-pending', 'reactive-awakening');
  compactDock.classList.add('reactive-compact');
  compactFrame.append(compactDock);

  const recapFrame = comparison.querySelector('.reactive-recap-preview');
  recapFrame.hidden = preferences.postMatchRecap === false;
  recapFrame.querySelector('.overlay')?.remove();
  if (!recapFrame.hidden) {
    const recapDock = overlay.cloneNode(true);
    recapDock.removeAttribute('id');
    recapDock.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    recapDock.classList.remove('reactive-expanded', 'reactive-compact', 'reactive-postmatch-pending', 'reactive-awakening');
    recapDock.classList.add('reactive-recap-active');
    recapFrame.append(recapDock);
  }
}

function renderMatchPulse(live, preferences) {
  text('#reactiveLiveScore', live.score || '0–0');
  const container = document.querySelector('#reactiveRoundPulse');
  if (!container) return;
  const rounds = preferences.matchPulse ? (live.roundPulse || []) : [];
  const revision = Number(live.roundPulseRevision) || 0;
  const animateLatest = revision !== lastRoundPulseRevision;
  const nodes = rounds.map((round, index) => {
    const normalized = ['WIN', 'LOSS'].includes(String(round).toUpperCase()) ? String(round).toUpperCase() : 'UNKNOWN';
    const node = customNode('i', normalized.toLowerCase());
    node.setAttribute('aria-label', `Round ${index + 1}: ${normalized === 'WIN' ? 'won' : normalized === 'LOSS' ? 'lost' : 'not observed'}`);
    if (animateLatest && index === rounds.length - 1 && normalized !== 'UNKNOWN') node.classList.add('latest');
    return node;
  });
  container.replaceChildren(...nodes);
  lastRoundPulseRevision = revision;
}

function renderCustomOverlay(data, player, session, live, appearance, beamFrom = 0) {
  const canvas = document.querySelector('#customOverlayCanvas');
  if (!canvas) return;
  canvas.replaceChildren();
  if (data.layout !== 'custom') return;
  const config = data.customOverlay || { elements: [] };
  canvas.style.setProperty('--custom-canvas-background', rgbaFromHex(config.backgroundColor, appearance.backgroundOpacity / 100));
  const recap = config.reactive && reactiveRecapActive;
  const compact = config.reactive && !recap && isReactiveCompactState(live.state);
  const renderPlayer = recap ? (data.recap?.player || player) : player;
  const renderSession = recap ? (data.recap?.session || session) : session;
  const renderLive = recap ? (data.recap?.live || live) : live;
  const elements = recap ? config.postMatchElements : compact ? config.inGameElements : config.elements;
  const canvasWidth = Number(recap ? config.postMatchWidth : compact ? config.inGameWidth : config.width) || 960;
  const canvasHeight = Number(recap ? config.postMatchHeight : compact ? config.inGameHeight : config.height) || 360;
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;

  for (const element of elements || []) {
    if (!element.visible) continue;
    if (element.id === 'matchPulse' && data.preferences?.matchPulse !== true) continue;
    const item = customNode('div', `custom-overlay-item custom-${element.id} align-${element.align}`);
    item.style.left = `${element.x}%`;
    item.style.top = `${element.y}%`;
    item.style.width = `${element.width}%`;
    item.style.height = `${element.height}%`;
    item.style.setProperty('--custom-font-size', `${element.fontSize}px`);
    item.style.setProperty('--custom-label-size', `${element.labelFontSize || Math.max(6, Math.round(element.fontSize * 0.38))}px`);
    item.style.setProperty('--custom-detail-size', `${element.detailFontSize || Math.max(6, Math.round(element.fontSize * 0.42))}px`);
    item.style.setProperty('--custom-opacity', String(element.opacity / 100));
    item.style.setProperty('--custom-align', element.align);
    item.style.setProperty('--custom-color', element.color);

    if (element.id === 'branding') {
      item.append(customNode('span', 'custom-eye'), customCopy('BYAKUGAN', 'SESSION VISION'));
    } else if (element.id === 'playerName') {
      item.append(customCopy('RIOT ID', renderPlayer.name || 'PLAYER'));
    } else if (element.id === 'currentRank') {
      item.append(customImage(renderPlayer.rankImage, initials(renderPlayer.rank)), customCopy('CURRENT RANK', renderPlayer.rank || 'UNRATED'));
    } else if (element.id === 'currentRR') {
      item.append(customCopy('CURRENT RR', `${Number(renderPlayer.rr) || 0} RR`));
    } else if (element.id === 'peakRank') {
      const season = [renderPlayer.peakEpisode, renderPlayer.peakAct].filter(Boolean).join(' • ');
      item.append(customImage(renderPlayer.peakRankImage, initials(renderPlayer.peakRank)), customCopy('ALL-TIME PEAK', renderPlayer.peakRank || 'UNRATED', season));
    } else if (element.id === 'sessionWL') {
      item.append(customCopy('SESSION W / L', `${Number(renderSession.wins) || 0} W / ${Number(renderSession.losses) || 0} L`));
    } else if (element.id === 'sessionKD') {
      item.append(customCopy('SESSION K/D', Number(renderSession.kd || 0).toFixed(2)));
    } else if (element.id === 'rrChange') {
      item.append(customCopy('SESSION RR', signed(renderSession.rrChange, ' RR')));
    } else if (element.id === 'lastMatch') {
      item.append(customCopy('LAST MATCH', renderSession.lastMatchResult || 'NO MATCH', signed(renderSession.lastMatchRR, ' RR')));
    } else if (element.id === 'agent') {
      item.append(customImage(renderLive.agentImage, initials(renderLive.agent), 'custom-agent-image'), customCopy(renderLive.agentLabel || 'AGENT', renderLive.agent || 'WAITING…'));
    } else if (element.id === 'map') {
      item.append(customCopy(recap ? 'LAST MAP' : 'CURRENT MAP', renderLive.map || '—', renderLive.label || 'IN MENUS'));
    } else if (element.id === 'matchScore') {
      item.append(customCopy('FINAL SCORE', renderSession.lastMatchScore || renderLive.score || '—'));
    } else if (element.id === 'matchPulse') {
      const pulse = customNode('span', 'custom-pulse');
      for (const [index, round] of (renderLive.roundPulse || []).entries()) {
        const normalized = ['WIN', 'LOSS'].includes(String(round).toUpperCase()) ? String(round).toUpperCase() : 'UNKNOWN';
        const marker = customNode('i', normalized.toLowerCase());
        marker.setAttribute('aria-label', `Round ${index + 1}: ${normalized === 'WIN' ? 'won' : normalized === 'LOSS' ? 'lost' : 'not observed'}`);
        pulse.append(marker);
      }
      item.append(customNode('small', 'custom-pulse-label', 'MATCH PULSE'), pulse);
    } else if (element.id === 'rrBeam') {
      const fill = customNode('span', 'custom-beam-fill');
      const beam = customNode('img');
      beam.src = '/rr-energy-beam.gif';
      beam.alt = '';
      fill.append(beam);
      const beamTo = Math.max(0, Math.min(100, Number(renderSession.beamProgress) || 0));
      item.style.setProperty('--custom-beam-progress', `${Math.max(0, Math.min(100, Number(beamFrom) || 0))}%`);
      item.append(fill);
      if (element.showMarker !== false) {
        const lastRr = Number(renderSession.lastMatchRR) || 0;
        const tone = lastRr > 0 ? 'positive' : lastRr < 0 ? 'negative' : 'neutral';
        item.append(customNode('strong', `custom-beam-marker ${tone}`, signed(lastRr, ' RR')));
      }
      requestAnimationFrame(() => item.style.setProperty('--custom-beam-progress', `${beamTo}%`));
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
  overlay.classList.toggle('motion-instant', preferences.smoothTransitions === false);
  overlay.classList.toggle('hide-match-pulse', preferences.matchPulse !== true);
  overlay.classList.toggle('pulse-dots', preferences.matchPulseStyle === 'dots');
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
  updateReactiveState(layout, live.state, session, preferences, Boolean(data.customOverlay?.reactive));

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
  text('#reactiveRecapResult', session.lastMatchResult || 'NO MATCH');
  text('#reactiveRecapScore', session.lastMatchScore || '—');
  text('#reactiveRecapRR', signed(session.lastMatchRR, ' RR'));
  text('#reactiveRecapCurrentRR', `${Number(player.rr) || 0} RR CURRENT`);
  text('#reactiveRecapRecord', `${Number(session.wins) || 0} W / ${Number(session.losses) || 0} L`);
  text('#reactiveRecapKd', Number(session.kd || 0).toFixed(2));
  text('#reactiveRecapMarker', signed(session.lastMatchRR, ' RR'));
  text('#sessionGames', `${Number(session.games) || 0} ${(Number(session.games) || 0) === 1 ? 'GAME' : 'GAMES'}`);
  text('#sessionKd', Number(session.kd || 0).toFixed(2));
  text('#sessionRR', signed(session.rrChange));
  text('#rankMovement', session.startingRank && session.currentRank && session.startingRank !== session.currentRank
    ? `${session.startingRank} → ${session.currentRank}`
    : session.currentRank || 'NO CHANGE');
  text('#lastMatchRR', signed(session.lastMatchRR, ' RR'));
  text('#lastMatchResult', session.lastMatchResult || 'NO MATCH');
  const previousBeamProgress = currentBeamProgress;
  const nextBeamProgress = Math.max(0, Math.min(100, Number(session.beamProgress) || 0));
  overlay.classList.toggle('beam-empty', nextBeamProgress <= 0);
  overlay.style.setProperty('--rr-beam-progress', `${currentBeamProgress}%`);
  overlay.style.setProperty('--recap-beam-progress', `${currentBeamProgress}%`);
  requestAnimationFrame(() => {
    overlay.style.setProperty('--rr-beam-progress', `${nextBeamProgress}%`);
    overlay.style.setProperty('--recap-beam-progress', `${nextBeamProgress}%`);
  });
  currentBeamProgress = nextBeamProgress;

  text('#liveLabel', live.agentLabel || live.label || 'WAITING FOR AGENT');
  text('#liveMap', live.map || '—');
  text('#liveAgent', live.agent || live.queue || '—');
  setImage('#agentImage', '#agentFallback', live.agentImage, initials(live.agent));
  renderMatchPulse(live, preferences);
  renderCustomOverlay(data, player, session, live, appearance, previousBeamProgress);

  markAlive();
  renderReactivePreviewComparison(layout, preferences);
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
