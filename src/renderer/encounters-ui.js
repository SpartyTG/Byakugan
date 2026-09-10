'use strict';

window.encounterUi = (() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = value => value == null ? '—' : Number(value).toLocaleString();
  const relationship = value => ({ with: 'TEAMMATE', against: 'OPPONENT' }[value] || 'OPPONENT');
  let view = null;

  function badge(player) {
    if (player.isSelf || !player.encounters) return '';
    if (!player.encounters.available) return '<span class="encounter-note">Shared history unavailable</span>';
    const h = player.encounters;
    if (!h.total) return '<span class="encounter-note">No shared matches saved</span>';
    const parts = [h.with ? `${num(h.with)} with` : '', h.against ? `${num(h.against)} against` : ''].filter(Boolean);
    return `<span class="encounter-badge" title="Open the player profile to see your saved Competitive matches">PLAYED BEFORE · ${esc(parts.join(' · '))}</span>`;
  }

  function row(match) {
    const date = match.startedAt ? new Date(match.startedAt).toLocaleString() : 'Date not saved';
    const kda = player => `${num(player?.kills)} / ${num(player?.deaths)} / ${num(player?.assists)}`;
    return `<details class="encounter-match"><summary><span><small>${esc(date)} · Competitive</small><strong>${esc(match.map || 'Unknown map')}</strong></span><span class="encounter-relationship ${esc(match.relationship)}">${relationship(match.relationship)}</span><span class="encounter-result ${match.result === 'VICTORY' ? 'won' : match.result === 'DEFEAT' ? 'lost' : ''}">${esc(match.result)}<small>${esc(match.score)}</small></span></summary><div class="encounter-recap"><div><small>YOU · ${esc(match.self?.agent)}</small><strong>${esc(kda(match.self))}</strong></div><div><small>THIS PLAYER · ${esc(match.other?.agent)}</small><strong>${esc(kda(match.other))}</strong></div><p>Kills / deaths / assists · Result and score from your perspective.</p></div></details>`;
  }

  function open(player, live, api, showProfile) {
    if (!player.encounterId || player.encounters?.available !== true || player.hidden) return;
    view = { id: player.encounterId, matchId: live.matchId, history: structuredClone(player.encounters), loading: false };
    const active = view;
    $('#playerModal').hidden = false;
    $('#playerProfileContent').innerHTML = `<div class="player-profile-hero encounter-hero"><div><p class="eyebrow">${player.side === 'enemy' ? 'OPPONENT' : 'TEAMMATE'} PROFILE</p><h1 id="playerProfileTitle" class="encounter-name">${esc(player.name)}</h1><p>${esc(player.agent)} · Account level ${num(player.level)}</p><p>${esc(player.rank)}${player.peakRank ? ` · Peak ${esc(player.peakRank)}` : ''}</p></div></div><div class="player-profile-body"><div class="player-profile-section-title"><p class="eyebrow">PLAYED TOGETHER</p><h2>Competitive match history</h2></div><div class="encounter-counts"><span><strong>${num(active.history.with)}</strong> as teammates</span><span><strong>${num(active.history.against)}</strong> as opponents</span></div><p class="encounter-scope">Competitive matches saved by BYAKUGAN across Acts. Older games without saved roster data may be missing.</p><p id="encounterWarning" class="encounter-scope" role="status">${esc(active.history.warning)}</p><div id="encounterMatches"></div><p id="encounterPageCount" class="encounter-scope"></p><button id="encounterMore" class="ghost-button" hidden>Load more matches</button></div>`;
    const draw = () => {
      $('#encounterMatches').innerHTML = active.history.matches.map(row).join('') || '<div class="empty-state">No Competitive matches were found in your saved history.</div>';
      $('#encounterPageCount').textContent = `${active.history.matches.length} of ${active.history.total} saved Competitive matches`;
      $('#encounterMore').hidden = active.history.nextOffset == null;
      $('#encounterMore').disabled = active.loading;
    };
    if (player.inspectable && showProfile) {
      const button = document.createElement('button');
      button.className = 'ghost-button'; button.textContent = 'More player details';
      button.addEventListener('click', () => { if (view === active) showProfile(player.id); });
      $('.encounter-hero').append(button);
    }
    draw();
    $('#encounterMore').addEventListener('click', async () => {
      if (view !== active || active.loading || active.history.nextOffset == null) return;
      active.loading = true; $('#encounterMore').disabled = true;
      try {
        const page = await api.getPlayerEncounters({ encounterId: active.id, matchId: active.matchId, offset: active.history.nextOffset });
        if (view !== active) return;
        const seen = new Set(active.history.matches.map(match => match.id));
        active.history.matches.push(...page.matches.filter(match => !seen.has(match.id)));
        active.history.nextOffset = page.nextOffset;
        active.history.total = page.total;
        active.loading = false; draw();
      } catch (error) {
        if (view === active) { $('#encounterWarning').textContent = error.message; active.loading = false; $('#encounterMore').disabled = false; }
      }
    });
  }

  function close() { view = null; }

  function updateLive(live) {
    if (!view) return;
    if (live?.matchId !== view.matchId || !['INGAME', 'CORE_GAME'].includes(live?.state)
      || !live.players?.some(player => player.encounterId === view.id && !player.hidden)) {
      close(); $('#playerModal').hidden = true;
    }
  }
  return { badge, open, close, updateLive };
})();
