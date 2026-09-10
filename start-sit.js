const state = {
  week: 1,
  scoring: 'half',
  tePremium: 0,
  slots: ['', ''],
  activeSuggest: -1,
};

const weekSelect = document.getElementById('week-select');
const scoringSelect = document.getElementById('scoring-select');
const tePremiumInput = document.getElementById('te-premium');
const pickers = document.getElementById('player-pickers');
const addPlayerBtn = document.getElementById('add-player');
const compareBtn = document.getElementById('compare-btn');
const metaStatus = document.getElementById('meta-status');
const compareStatus = document.getElementById('compare-status');
const recommendationEl = document.getElementById('recommendation');
const resultsEl = document.getElementById('results');
const sourceNotes = document.getElementById('source-notes');
const navToggle = document.getElementById('nav-expand-toggle');
const headerCluster = document.querySelector('.header-cluster');

function fmt(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits).replace(/\.0$/, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function playerInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return escapeHtml(parts[0].slice(0, 2).toUpperCase());
  return escapeHtml(`${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase());
}

function photoHtml(player, extraClass = '') {
  const pos = String(player.position || '').toUpperCase();
  const isDst = pos === 'DEF' || pos === 'DST' || pos === 'D';
  const url = player.photo || '';
  const className = `player-photo${isDst ? ' is-dst' : ''}${url ? ' has-photo' : ''}${extraClass ? ` ${extraClass}` : ''}`;
  const image = url
    ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.parentElement.classList.remove('has-photo');this.remove()">`
    : '';
  return `<span class="${className}" aria-hidden="true"><span class="player-initials">${playerInitials(player.name)}</span>${image}</span>`;
}

function signed(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || Math.abs(num) < 0.05) return '0';
  return `${num > 0 ? '+' : ''}${fmt(num)}`;
}

function displayPos(pos) {
  if (pos === 'DEF' || pos === 'DST') return 'D/ST';
  return pos || '';
}

function projectedStatsLine(player) {
  const stats = player.stats || {};
  const pos = player.position;
  if (pos === 'K') {
    return [
      stats.fgm != null ? `${fmt(stats.fgm)} FG` : '',
      stats.xpm != null ? `${fmt(stats.xpm)} XP` : '',
    ].filter(Boolean).join(' · ');
  }
  if (pos === 'DEF' || pos === 'DST') {
    return [
      stats.sack != null ? `${fmt(stats.sack)} sacks` : '',
      stats.defInt != null ? `${fmt(stats.defInt)} INT` : '',
      stats.ptsAllow != null ? `${fmt(stats.ptsAllow)} PA` : '',
    ].filter(Boolean).join(' · ');
  }
  return [
    stats.rushAtt != null ? `${fmt(stats.rushAtt)} att` : '',
    stats.rec != null ? `${fmt(stats.rec)} rec` : '',
    stats.recYds != null ? `${fmt(stats.recYds)} rec yds` : '',
    stats.recTd != null ? `${fmt(stats.recTd)} rec TD` : '',
    stats.rushTd != null ? `${fmt(stats.rushTd)} rush TD` : '',
    stats.passYds != null ? `${fmt(stats.passYds)} pass yds` : '',
    stats.passTd != null ? `${fmt(stats.passTd)} pass TD` : '',
  ].filter(Boolean).join(' · ');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function fillWeeks(selected) {
  weekSelect.innerHTML = '';
  for (let week = 1; week <= 18; week += 1) {
    const option = document.createElement('option');
    option.value = String(week);
    option.textContent = `Week ${week}`;
    if (week === selected) option.selected = true;
    weekSelect.appendChild(option);
  }
}

function renderMetaGames(games) {
  if (!games?.length) {
    metaStatus.textContent = 'No games found for this week.';
    return;
  }
  const withTotal = games.filter((game) => game.total != null).length;
  const withSpread = games.filter((game) => game.spread != null).length;
  metaStatus.textContent = `Week ${state.week}: ${games.length} games · ${withTotal} with O/U · ${withSpread} with spreads${games.some((game) => game.oddsLive) ? ' (live lines)' : ''}.`;
}

function pickerEls() {
  return [...pickers.querySelectorAll('.picker')];
}

function closeSuggest(picker) {
  const suggest = picker.querySelector('.suggest');
  picker.classList.remove('is-open');
  suggest.classList.remove('is-open');
  suggest.hidden = true;
}

function closeAllSuggests(except) {
  pickerEls().forEach((picker) => {
    if (picker !== except) closeSuggest(picker);
  });
}

function openSuggest(picker) {
  const suggest = picker.querySelector('.suggest');
  if (!suggest.innerHTML.trim()) return;
  closeAllSuggests(picker);
  suggest.hidden = false;
  suggest.classList.add('is-open');
  picker.classList.add('is-open');
}

function setSlotValue(picker, name) {
  const input = picker.querySelector('.player-input');
  const slot = Number(picker.dataset.slot);
  input.value = name;
  state.slots[slot] = name;
}

function bindPicker(picker) {
  const input = picker.querySelector('.player-input');
  const suggest = picker.querySelector('.suggest');
  let timer = null;
  input.addEventListener('input', () => {
    const slot = Number(picker.dataset.slot);
    state.slots[slot] = input.value.trim();
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) {
      suggest.innerHTML = '';
      closeSuggest(picker);
      return;
    }
    timer = setTimeout(() => searchPlayers(picker, query), 180);
  });
  input.addEventListener('focus', () => {
    closeAllSuggests(picker);
    if (input.value.trim().length >= 2 && suggest.innerHTML.trim()) {
      openSuggest(picker);
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSuggest(picker);
      input.blur();
    }
  });
  suggest.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('button[data-name]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    setSlotValue(picker, button.dataset.name);
    picker.dataset.searchId = String(Number(picker.dataset.searchId || 0) + 1);
    suggest.innerHTML = '';
    closeSuggest(picker);
    input.blur();
  });
}

async function searchPlayers(picker, query) {
  const suggest = picker.querySelector('.suggest');
  const requestId = Number(picker.dataset.searchId || 0) + 1;
  picker.dataset.searchId = String(requestId);
  try {
    const data = await fetchJson(`/api/start-sit/search?q=${encodeURIComponent(query)}&week=${state.week}`);
    if (picker.dataset.searchId !== String(requestId)) return;
    if (picker.querySelector('.player-input').value.trim() !== query) return;
    const players = data.players || [];
    if (!players.length) {
      suggest.innerHTML = '';
      closeSuggest(picker);
      return;
    }
    suggest.innerHTML = players.map((player) => {
      const extra = [displayPos(player.position), player.team, player.matchupLabel, player.total != null ? `O/U ${fmt(player.total, 1)}` : '']
        .filter(Boolean)
        .join(' · ');
      return `<button type="button" data-name="${escapeHtml(player.name)}">${photoHtml(player, 'is-suggest')}<span class="suggest-copy"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(extra)}</small></span></button>`;
    }).join('');
    openSuggest(picker);
  } catch (error) {
    if (picker.dataset.searchId === String(requestId)) closeSuggest(picker);
  }
}

function addPicker() {
  if (state.slots.length >= 4) return;
  const slot = state.slots.length;
  state.slots.push('');
  const picker = document.createElement('div');
  picker.className = 'picker';
  picker.dataset.slot = String(slot);
  const labels = ['Player A', 'Player B', 'Player C', 'Player D'];
  picker.innerHTML = `
    <label for="player-${slot}">${labels[slot]}</label>
    <input id="player-${slot}" class="player-input" type="text" placeholder="Name, kicker, or D/ST" autocomplete="off" />
    <div class="suggest" hidden></div>
  `;
  pickers.appendChild(picker);
  bindPicker(picker);
  if (state.slots.length >= 4) addPlayerBtn.hidden = true;
}

function selectedNames() {
  return pickerEls()
    .map((picker) => picker.querySelector('.player-input')?.value.trim())
    .filter(Boolean);
}

function sourceRow(entry) {
  if (!entry) return '';
  return `<tr><td>${escapeHtml(entry.label)}</td><td>${fmt(entry.points)}</td></tr>`;
}

function matchupBlock(matchup) {
  if (!matchup) return '';
  const ou = matchup.total != null ? fmt(matchup.total, 1) : '—';
  const implied = matchup.implied != null ? fmt(matchup.implied, 1) : '—';
  const oppImplied = matchup.oppImplied != null ? fmt(matchup.oppImplied, 1) : '—';
  return `
    <div class="matchup-list">
      <div><span>Game</span><strong>${escapeHtml(matchup.label || '—')}</strong></div>
      <div><span>Total / spread</span><strong>${escapeHtml(ou)} · ${escapeHtml(matchup.spreadLabel || '—')}</strong></div>
      <div><span>Implied points</span><strong>${escapeHtml(implied)} vs ${escapeHtml(oppImplied)}</strong></div>
      <div><span>Venue</span><strong>${escapeHtml(matchup.stadium || (matchup.indoor ? 'Dome' : 'Outdoor'))}</strong></div>
    </div>
  `;
}

function chipFor(adj) {
  const cls = adj.delta > 0.04 ? 'up' : adj.delta < -0.04 ? 'down' : '';
  return `<span class="chip ${cls}">${escapeHtml(adj.label)} ${signed(adj.delta)}</span>`;
}

function renderPlayer(player) {
  if (player.missing) {
    return `<article class="missing-card">${photoHtml(player, 'is-card')}<div><strong>${escapeHtml(player.name)}</strong><p>${escapeHtml(player.error || 'Not found')}</p></div></article>`;
  }
  const verdict = player.verdict === 'start' ? 'Start' : 'Sit';
  const sources = Object.values(player.sources || {});
  const statBits = projectedStatsLine(player);
  const form = player.form?.average != null
    ? `Last 3 games: ${fmt(player.form.average)} pts/game`
    : (player.form?.note || 'Not enough 2026 games yet for recent form.');
  const kicker = [displayPos(player.position), player.team, player.injury].filter(Boolean).join(' · ');
  return `
    <article class="player-card is-${escapeHtml(player.verdict || 'sit')}">
      <header class="card-head">
        <div class="card-identity">
          ${photoHtml(player, 'is-card')}
          <div>
            <p class="card-kicker">${escapeHtml(kicker)}</p>
            <h3>${escapeHtml(player.name)}</h3>
          </div>
        </div>
        <p class="verdict ${escapeHtml(player.verdict || 'sit')}">${verdict}</p>
      </header>
      <div class="score-row">
        <div class="score">
          <span>Adjusted</span>
          <strong>${fmt(player.adjusted)}</strong>
        </div>
        <div class="score secondary">
          <span>Source average</span>
          <strong>${fmt(player.consensus)}</strong>
        </div>
      </div>
      ${matchupBlock(player.matchup)}
      <table class="proj-table">
        <thead><tr><th>Source</th><th>Proj</th></tr></thead>
        <tbody>
          ${sources.map(sourceRow).join('')}
        </tbody>
      </table>
      <p class="card-note">${statBits ? escapeHtml(statBits) : 'No projected stat line yet.'} · ${escapeHtml(form)}${player.teBonus ? ` · TE premium +${fmt(player.teBonus)} already included` : ''}</p>
      <div class="chips">${(player.adjustments || []).map(chipFor).join('')}</div>
    </article>
  `;
}

function confidenceLine(rec) {
  if (rec.confidence === 'high') return 'This one looks pretty clear.';
  if (rec.confidence === 'medium') return 'A reasonable lean, not a lock.';
  return 'Close enough that either call is defensible.';
}

function renderRecommendation(rec) {
  if (!rec) {
    recommendationEl.hidden = true;
    recommendationEl.innerHTML = '';
    return;
  }
  recommendationEl.hidden = false;
  recommendationEl.classList.toggle('is-low', rec.confidence === 'low');
  recommendationEl.innerHTML = `
    <p class="rec-kicker">${escapeHtml(confidenceLine(rec))}</p>
    <h3>${escapeHtml(rec.summary)}</h3>
    <p class="rec-meta">${fmt(rec.margin)} point gap after the matchup adjustments.</p>
  `;
}

async function compare() {
  const names = selectedNames();
  if (names.length < 2) {
    compareStatus.hidden = false;
    compareStatus.textContent = 'Pick at least two players.';
    return;
  }
  compareBtn.disabled = true;
  compareStatus.hidden = false;
  compareStatus.textContent = 'Pulling Sleeper, ESPN, and matchup lines…';
  const teValue = Number(tePremiumInput?.value);
  state.tePremium = Number.isFinite(teValue) ? Math.max(0, Math.min(2, teValue)) : 0;
  try {
    const data = await fetchJson('/api/start-sit/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players: names,
        week: state.week,
        scoring: state.scoring,
        tePremium: state.tePremium,
      }),
    });
    resultsEl.innerHTML = (data.players || []).map(renderPlayer).join('');
    renderRecommendation(data.recommendation);
    const missing = Object.entries(data.sourceErrors || {})
      .map(([key, message]) => `${key}: ${message}`)
      .join(' · ');
    const scoringNames = { standard: 'Standard', half: 'Half-PPR', ppr: 'PPR' };
    const scoringLabel = scoringNames[data.scoring] || data.scoring;
    compareStatus.hidden = true;
    sourceNotes.hidden = false;
    sourceNotes.textContent = `Week ${data.week} · ${scoringLabel}${data.tePremium ? ` · TE +${fmt(data.tePremium, 1)} per catch` : ''} · Sources: ${(data.sources || []).join(', ') || 'none'}${missing ? ` · Missing ${missing}` : ''}`;
    const params = new URLSearchParams({
      week: String(data.week),
      scoring: data.scoring,
      tePremium: String(data.tePremium || 0),
      players: names.join(','),
    });
    history.replaceState({}, '', `/start-sit?${params.toString()}`);
  } catch (error) {
    compareStatus.textContent = error.message || 'Compare failed.';
  } finally {
    compareBtn.disabled = false;
  }
}

async function loadMeta() {
  const data = await fetchJson(`/api/start-sit/meta?week=${state.week}&scoring=${state.scoring}`);
  state.week = data.week || state.week;
  fillWeeks(state.week);
  weekSelect.value = String(state.week);
  renderMetaGames(data.games || []);
}

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const week = Number(params.get('week'));
  if (week >= 1 && week <= 18) state.week = week;
  const scoring = params.get('scoring');
  if (['half', 'ppr', 'standard'].includes(scoring)) {
    state.scoring = scoring;
    scoringSelect.value = scoring;
  }
  const tePremium = Number(params.get('tePremium'));
  if (Number.isFinite(tePremium) && tePremium >= 0) {
    state.tePremium = Math.min(2, tePremium);
    if (tePremiumInput) tePremiumInput.value = String(state.tePremium);
  }
  const players = (params.get('players') || '').split(',').map((name) => name.trim()).filter(Boolean);
  if (players.length) {
    while (state.slots.length < Math.min(4, players.length)) {
      addPicker();
    }
    players.slice(0, 4).forEach((name, index) => {
      state.slots[index] = name;
      const input = document.getElementById(`player-${index}`);
      if (input) input.value = name;
    });
  }
}

navToggle?.addEventListener('click', () => {
  const open = headerCluster.classList.toggle('is-nav-open');
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

pickerEls().forEach(bindPicker);
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.picker')) closeAllSuggests();
});
addPlayerBtn.addEventListener('click', () => {
  closeAllSuggests();
  addPicker();
});
compareBtn.addEventListener('click', () => {
  closeAllSuggests();
  compare();
});
weekSelect.addEventListener('mousedown', () => closeAllSuggests());
weekSelect.addEventListener('change', async () => {
  closeAllSuggests();
  state.week = Number(weekSelect.value);
  await loadMeta();
});
scoringSelect.addEventListener('mousedown', () => closeAllSuggests());
scoringSelect.addEventListener('change', () => {
  closeAllSuggests();
  state.scoring = scoringSelect.value;
});
tePremiumInput?.addEventListener('mousedown', () => closeAllSuggests());
tePremiumInput?.addEventListener('change', () => {
  const value = Number(tePremiumInput.value);
  state.tePremium = Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 0;
  tePremiumInput.value = String(state.tePremium);
});

fillWeeks(1);
readQuery();
loadMeta()
  .then(() => {
    if (selectedNames().length >= 2) compare();
  })
  .catch((error) => {
    metaStatus.textContent = error.message || 'Could not load weekly games.';
  });
