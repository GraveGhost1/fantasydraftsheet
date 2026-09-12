const state = {
  week: 1,
  scoring: 'half',
  tePremium: 0,
  slots: ['', ''],
  players: [],
  playersLoading: false,
  playersError: '',
};

let playersLoadId = 0;

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

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v|vi)$/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

function filterLocalPlayers(query, limit = 8) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const needle = normalizeSearch(trimmed);
  if (!needle) return [];
  const needleLower = trimmed.toLowerCase();
  const needleTeam = trimmed.toUpperCase();

  return state.players
    .map((player) => {
      const name = player.name || '';
      const hay = player.nameKey || normalizeSearch(name);
      const keys = player.searchKeys || [];
      const parts = name.split(/\s+/).filter(Boolean);
      const first = normalizeSearch(parts[0] || '');
      const last = normalizeSearch(parts[parts.length - 1] || '');
      const pos = String(player.position || '').toUpperCase();
      const team = String(player.team || '').toUpperCase();
      const teamHit = needle === normalizeSearch(team) && (pos === 'DEF' || pos === 'K' || needleTeam.length <= 3);

      let score = 0;
      if (hay === needle) score = 100;
      else if (last === needle || first === needle) score = 92;
      else if (teamHit && pos === 'DEF') score = 90;
      else if (hay.startsWith(needle) || last.startsWith(needle) || first.startsWith(needle)) score = 85;
      else if (teamHit && pos === 'K') score = 80;
      else if (keys.includes(needle)) score = 75;
      else if (keys.some((key) => key.includes(needle))) score = 70;
      else if (hay.includes(needle) || name.toLowerCase().includes(needleLower)) score = 60;

      return { player, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (
      b.score - a.score
      || (a.player.team ? 0 : 1) - (b.player.team ? 0 : 1)
      || (a.player.name || '').localeCompare(b.player.name || '')
    ))
    .slice(0, limit)
    .map((entry) => entry.player);
}

function suggestOptions(picker) {
  return [...picker.querySelectorAll('.suggest button[data-name]')];
}

function setActiveSuggest(picker, index) {
  const options = suggestOptions(picker);
  if (!options.length) return;
  const next = ((index % options.length) + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    option.classList.toggle('is-active', optionIndex === next);
  });
  options[next].scrollIntoView({ block: 'nearest' });
}

function activeSuggestIndex(picker) {
  const options = suggestOptions(picker);
  return options.findIndex((option) => option.classList.contains('is-active'));
}

function renderSuggestMessage(picker, message) {
  const suggest = picker.querySelector('.suggest');
  suggest.innerHTML = `<div class="suggest-empty">${escapeHtml(message)}</div>`;
  openSuggest(picker);
}

function renderSuggestPlayers(picker, players) {
  const suggest = picker.querySelector('.suggest');
  suggest.innerHTML = players.map((player, index) => {
    const extra = [displayPos(player.position), player.team, player.matchupLabel, player.total != null ? `O/U ${fmt(player.total, 1)}` : '']
      .filter(Boolean)
      .join(' · ');
    return `<button type="button" data-name="${escapeHtml(player.name)}" class="${index === 0 ? 'is-active' : ''}">${photoHtml(player, 'is-suggest')}<span class="suggest-copy"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(extra)}</small></span></button>`;
  }).join('');
  openSuggest(picker);
}

function updateSuggestions(picker) {
  const input = picker.querySelector('.player-input');
  const query = input.value.trim();
  state.slots[Number(picker.dataset.slot)] = query;
  if (!query) {
    closeSuggest(picker);
    return;
  }
  if (state.playersLoading && !state.players.length) {
    renderSuggestMessage(picker, 'Loading players…');
    return;
  }
  if (!state.players.length) {
    renderSuggestMessage(picker, state.playersError || 'Player list is not ready yet.');
    return;
  }
  const matches = filterLocalPlayers(query);
  if (!matches.length) {
    renderSuggestMessage(picker, `No players match “${query}”`);
    return;
  }
  renderSuggestPlayers(picker, matches);
}

function chooseSuggestion(picker, name) {
  if (!name) return;
  setSlotValue(picker, name);
  closeSuggest(picker);
  picker.querySelector('.player-input')?.blur();
}

function bindPicker(picker) {
  const input = picker.querySelector('.player-input');
  const suggest = picker.querySelector('.suggest');
  input.addEventListener('input', () => updateSuggestions(picker));
  input.addEventListener('focus', () => {
    closeAllSuggests(picker);
    if (input.value.trim()) updateSuggestions(picker);
  });
  input.addEventListener('keydown', (event) => {
    const options = suggestOptions(picker);
    if (event.key === 'Escape') {
      closeSuggest(picker);
      input.blur();
      return;
    }
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      setActiveSuggest(picker, activeSuggestIndex(picker) + 1);
      return;
    }
    if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      const current = activeSuggestIndex(picker);
      setActiveSuggest(picker, current <= 0 ? options.length - 1 : current - 1);
      return;
    }
    if (event.key === 'Enter' && options.length) {
      event.preventDefault();
      const active = options[Math.max(0, activeSuggestIndex(picker))];
      chooseSuggestion(picker, active?.dataset.name);
    }
  });
  suggest.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('button[data-name]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    chooseSuggestion(picker, button.dataset.name);
  });
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
    <input id="player-${slot}" class="player-input" type="text" placeholder="Name, kicker, or D/ST" autocomplete="off" aria-autocomplete="list" />
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

async function loadPlayers() {
  const requestId = ++playersLoadId;
  state.playersLoading = true;
  state.playersError = '';
  pickerEls().forEach((picker) => {
    if (picker.querySelector('.player-input')?.value.trim()) updateSuggestions(picker);
  });
  try {
    const data = await fetchJson(`/api/start-sit/players?week=${state.week}`);
    if (requestId !== playersLoadId) return;
    state.players = data.players || [];
    if (!state.players.length) {
      state.playersError = 'No weekly players returned.';
    }
  } catch (error) {
    if (requestId !== playersLoadId) return;
    state.players = [];
    state.playersError = error.message || 'Could not load players.';
  } finally {
    if (requestId !== playersLoadId) return;
    state.playersLoading = false;
    pickerEls().forEach((picker) => {
      if (picker.querySelector('.player-input')?.value.trim()) updateSuggestions(picker);
    });
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
  state.players = [];
  await Promise.all([loadMeta(), loadPlayers()]);
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
state.playersLoading = true;
loadMeta()
  .catch((error) => {
    metaStatus.textContent = error.message || 'Could not load weekly games.';
  })
  .then(() => loadPlayers())
  .then(() => {
    if (selectedNames().length >= 2) compare();
  });
