'use strict';

window.actSummaryUi = (() => {
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const numeric = (value, suffix = '') => value == null ? '—' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })}${suffix}`;
  let preview = null;
  let currentSnapshot = null;
  let busy = false;

  function body(summary) {
    const t = summary.totals;
    const unclassified = t.matches - t.wins - t.losses - (t.draws ?? 0);
    const results = `${numeric(t.wins)} wins · ${numeric(t.losses)} losses · ${t.draws == null ? 'draws not supplied' : `${numeric(t.draws)} draws`}${unclassified ? ` · ${numeric(unclassified)} unclassified` : ''}`;
    const stats = [['Matches', t.matches], ['Wins', t.wins], ['Losses', t.losses], ['K/D', t.kd], ['Headshot %', t.headshotPct, '%'], ['Win %', t.winPct, '%']];
    const details = [['Kills', t.kills], ['Deaths', t.deaths], ['Assists', t.assists], ['ADR', t.adr], ['ACS', t.acs], ['KAST', t.kastPct, '%'], ['DDA / round', t.ddaPerRound], ['KAD', t.kad], ['Kills / round', t.killsPerRound], ['First bloods', t.firstBloods], ['Flawless rounds', t.flawlessRounds], ['Aces', t.aces], ['Playtime', t.playtimeHours, ' hours']];
    return `<div class="act-summary-heading"><div><small>IMPORTED TRACKER SUMMARY · COMPETITIVE</small><h2>${escape(summary.act.label)}</h2><span class="act-summary-identity">${escape(summary.riotId.gameName)}#${escape(summary.riotId.tagLine)}</span></div><span class="act-summary-tag">Saved snapshot</span></div>
      <dl class="act-summary-grid">${stats.map(([name, value, suffix]) => `<div><dt>${escape(name)}</dt><dd>${numeric(value, suffix)}</dd></div>`).join('')}</dl>
      <p class="act-summary-copy"><strong>${escape(results)}</strong><br>Captured: ${summary.capturedAt ? escape(new Date(summary.capturedAt).toLocaleString()) : 'date not supplied'}. These totals remain as captured; new matches are collected separately.</p>
      <details class="act-summary-details"><summary>More imported stats${summary.agents.length ? ' and agents' : ''}</summary>
        ${summary.notes ? `<p class="act-summary-copy">${escape(summary.notes)}</p>` : ''}
        <dl class="act-summary-grid">${details.filter(([, value]) => value != null).map(([name, value, suffix]) => `<div><dt>${escape(name)}</dt><dd>${numeric(value, suffix)}</dd></div>`).join('')}</dl>
        ${summary.agents.length ? `<div class="act-summary-table-wrap"><table><thead><tr><th>Agent label</th><th>Matches</th><th>Win %</th><th>K/D</th><th>ADR</th><th>ACS</th><th>DDA</th><th>HS %</th></tr></thead><tbody>${summary.agents.map(row => `<tr><td>${escape(row.label)}</td>${['matches', 'winPct', 'kd', 'adr', 'acs', 'ddaPerRound', 'headshotPct'].map(key => `<td>${numeric(row[key], key.endsWith('Pct') ? '%' : '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      </details>`;
  }

  function status(message) { $('#actSummaryStatus').textContent = message; }

  function render(snapshot) {
    currentSnapshot = snapshot;
    const entry = snapshot?.importedActSummary;
    const card = $('#importedActCard');
    card.hidden = !entry;
    // Preserve the user's expanded details while normal data refreshes.
    if (card.dataset.digest !== (entry?.digest || '')) {
      card.innerHTML = entry ? `${body(entry.summary)}<p class="act-summary-copy">Saved on this PC ${escape(new Date(entry.importedAt).toLocaleString())}. Manage this import in Settings.</p>` : '';
      card.dataset.digest = entry?.digest || '';
    }
    $('#actSummaryExport').disabled = busy || !entry;
    $('#actSummaryRemove').disabled = busy || !entry;
    if (preview && (snapshot?.profile?.senseiAccountKey !== preview.context.accountKey || String(snapshot?.profile?.activeSeasonId || '').toLowerCase() !== preview.context.seasonId)) {
      preview = null;
      $('#actSummaryPreview').hidden = true;
      status('Account or Act changed. Choose the summary again.');
    }
    if (snapshot?.actSummaryNotice) status(snapshot.actSummaryNotice);
  }

  function mount(api, onSnapshot) {
    async function run(operation) {
      if (busy) return;
      busy = true;
      $('#actSummaryChoose').disabled = true;
      render(currentSnapshot);
      try { await operation(); }
      catch (error) { status(error.message || 'Could not save this summary.'); }
      finally { busy = false; $('#actSummaryChoose').disabled = false; render(currentSnapshot); }
    }
    $('#actSummaryChoose').addEventListener('click', () => run(async () => {
      preview = null;
      $('#actSummaryPreview').hidden = true;
      const chosen = await api.chooseActSummary();
      if (!chosen) return;
      preview = chosen;
      const container = $('#actSummaryPreview');
      container.innerHTML = `${body(chosen.summary)}<p class="act-summary-copy">Destination: ${escape(chosen.activeActLabel)}. Saving replaces an earlier imported summary for this account and Act.</p>
        <label class="act-summary-confirm"><input type="checkbox" id="actSummaryConfirm"><span>I confirm these are my <strong>Competitive</strong> stats for <strong>${escape(chosen.summary.act.label)}</strong>, and that this is the current Act.</span></label>
        <button class="primary-button" id="actSummaryApply" disabled>Save on this PC</button>`;
      container.hidden = false;
      $('#actSummaryConfirm').addEventListener('change', event => { $('#actSummaryApply').disabled = !event.target.checked; });
      $('#actSummaryApply').addEventListener('click', () => run(async () => {
        const selected = preview;
        if (!selected || !$('#actSummaryConfirm').checked) return;
        $('#actSummaryApply').disabled = true;
        try {
          const next = await api.applyActSummary({ digest: selected.digest, actConfirmed: true });
          preview = null;
          container.hidden = true;
          onSnapshot(next);
          status('Saved on this PC. Open Overview to see your imported Competitive summary.');
        } finally { if (preview) $('#actSummaryApply').disabled = !$('#actSummaryConfirm').checked; }
      }));
      status('Review the stats and confirm the Act before saving.');
    }));
    $('#actSummaryExport').addEventListener('click', () => run(async () => {
      if ((await api.exportActSummary()).saved) status('Summary exported.');
    }));
    $('#actSummaryRemove').addEventListener('click', () => run(async () => {
      onSnapshot(await api.removeActSummary());
      preview = null;
      $('#actSummaryPreview').hidden = true;
      status('Imported summary removed. Collected match history is unchanged.');
    }));
  }
  return { render, mount };
})();
