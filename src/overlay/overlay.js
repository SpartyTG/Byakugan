'use strict';

const overlay = document.querySelector('#overlay');
const token = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');
document.body.classList.toggle('preview-mode', new URLSearchParams(location.search).get('preview') === '1');
let staleTimer = null;
let currentBeamProgress = 0;

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

function render(data) {
  const player = data.player || {};
  const session = data.session || {};
  const live = data.live || {};
  const preferences = data.preferences || {};
  const appearance = data.appearance || {};

  overlay.className = `overlay layout-${data.layout || 'horizontal'}`;
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

  text('#playerName', player.name || 'PLAYER');
  text('#playerRank', player.rank || 'Unrated');
  text('#playerRR', `${Number(player.rr) || 0} RR`);
  text('#beamCurrentRR', `${Number(player.rr) || 0} RR`);
  const peakSeason = [player.peakEpisode, player.peakAct].filter(Boolean).join(' • ');
  text('#playerPeakRank', [player.peakRank || 'Unrated', peakSeason].filter(Boolean).join(' • '));
  setImage('#rankImage', '#rankFallback', player.rankImage, initials(player.rank));
  setImage('#peakRankImage', '#peakRankFallback', player.peakRankImage, initials(player.peakRank));

  text('#sessionRecord', `${Number(session.wins) || 0}–${Number(session.losses) || 0}`);
  text('#rankSessionLabel', preferences.showWl === false ? 'SESSION K/D' : 'SESSION RECORD');
  text('#rankSessionRecord', `${Number(session.wins) || 0} W / ${Number(session.losses) || 0} L`);
  text('#rankSessionKd', `${Number(session.kd || 0).toFixed(2)} K/D`);
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

  markAlive();
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
