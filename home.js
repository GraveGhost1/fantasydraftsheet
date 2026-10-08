const LINEUP_KEY = 'ghost-ff-lineup';
const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

const summaryGrid = document.getElementById('summary-grid');
const briefList = document.getElementById('brief-list');
const briefCount = document.getElementById('brief-count');
const spotlight = document.getElementById('spotlight');
const rankList = document.getElementById('rank-list');
const rankFilters = document.getElementById('rank-filters');
const rankSearch = document.getElementById('rank-search');
const rankEyebrow = document.getElementById('rank-eyebrow');
const rankHeading = document.getElementById('rank-heading');
const homeWeek = document.getElementById('home-week');
const homeEyebrow = document.getElementById('home-eyebrow');

const state = {
  week: null,
  position: 'All',
  query: '',
  players: [],
  lineup: null,
  boardMode: 'weekly',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function fmt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(1).replace(/\.0$/, '');
}

function readLineup() {
  try {
    const saved = JSON.parse(localStorage.getItem(LINEUP_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return null;
    return saved;
  } catch (error) {
    return null;
  }
}

const DEFAULT_STARTER_SPOTS = 7;

function isBenchLabel(label) {
  const slot = String(label || '').toUpperCase();
  return !slot || slot === 'BN' || slot === 'BENCH' || slot === 'IR' || slot.startsWith('TAXI');
}

function starterPlan(lineup) {
  if (!Array.isArray(lineup?.slotPlan)) return null;
  const plan = lineup.slotPlan.filter((slot) => !isBenchLabel(slot?.label || slot?.id));
  return plan.length ? plan : null;
}

function lineupPlayers(lineup) {
  const slots = lineup?.slots || {};
  const plan = starterPlan(lineup);
  if (plan) {
    return plan.map((slot) => slots[slot.id]).filter((player) => player && player.name);
  }
  return Object.values(slots).filter((player) => player && player.name);
}

function starterSpotTotal(lineup) {
  const plan = starterPlan(lineup);
  if (plan) return plan.length;
  return DEFAULT_STARTER_SPOTS;
}

function hasScore(player) {
  return player && player.adjusted != null && Number.isFinite(Number(player.adjusted));
}

function bindNav() {
  const navToggle = document.getElementById('nav-expand-toggle');
  const headerCluster = document.querySelector('.header-cluster');
  navToggle?.addEventListener('click', () => {
    const open = headerCluster.classList.toggle('is-nav-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function renderSummary() {
  const players = lineupPlayers(state.lineup);
  const filled = players.length;
  const scored = players.filter(hasScore);
  const projected = scored.reduce((sum, player) => sum + Number(player.adjusted), 0);
  const hasScores = scored.length > 0;
  summaryGrid.innerHTML = `
    <a class="summary-card featured" href="/lineup">
      <span class="summary-icon" aria-hidden="true">✦</span>
      <div>
        <span>Starters set</span>
        <strong>${filled} <small>/ ${starterSpotTotal(state.lineup)}</small></strong>
        <p>${filled ? 'Saved lineup on this browser' : 'Add players on the lineup page'}</p>
      </div>
    </a>
    <a class="summary-card" href="/lineup">
      <span class="summary-icon" aria-hidden="true">↗</span>
      <div>
        <span>Projected total</span>
        <strong>${hasScores ? fmt(projected) : '—'}</strong>
        <p>${hasScores ? 'Start/Sit adjusted points' : 'Fill two slots to project'}</p>
      </div>
    </a>
    <a class="summary-card" href="/start-sit">
      <span class="summary-icon" aria-hidden="true">⇄</span>
      <div>
        <span>Week</span>
        <strong>${state.week || '—'}</strong>
        <p>Open a head-to-head compare</p>
      </div>
    </a>
  `;
}

function legalMove(lineup) {
  const move = lineup?.suggestion?.moves?.find((item) => item && item.inName && item.outName);
  if (!move) return null;
  return {
    higher: {
      name: move.inName,
      position: move.inPos,
      team: move.inTeam,
      adjusted: move.inPoints,
    },
    lower: {
      name: move.outName,
      position: move.outPos,
      team: move.outTeam,
      adjusted: move.outPoints,
    },
    margin: move.gain,
    slot: move.slot,
  };
}

function compareHref(left, right) {
  const params = new URLSearchParams({
    week: String(state.lineup?.week || state.week || ''),
    scoring: state.lineup?.scoring || 'half',
    tePremium: String(state.lineup?.tePremium || 0),
    players: `${left.name},${right.name}`,
  });
  return `/start-sit?${params.toString()}`;
}

function renderBrief(pair) {
  const players = lineupPlayers(state.lineup);
  const items = [];
  if (pair) {
    items.push({
      href: compareHref(pair.higher, pair.lower),
      title: `Start ${pair.higher.name} at ${pair.slot || 'flex'}`,
      detail: `${fmt(pair.margin)} projected points ahead of ${pair.lower.name} in a slot both can fill.`,
      tag: 'Review',
      tagClass: 'action',
    });
  } else if (state.lineup?.suggestion?.summary && players.length) {
    items.push({
      href: '/lineup',
      title: 'No lineup change',
      detail: state.lineup.suggestion.summary,
      tag: 'Set',
      tagClass: 'clear',
    });
  } else {
    items.push({
      href: '/lineup',
      title: 'Set this week’s starters',
      detail: 'The home page reads the lineup you save in the browser.',
      tag: 'Lineup',
      tagClass: 'action',
    });
  }
  items.push({
    href: '/',
    title: 'Your rankings board is ready',
    detail: 'Drag, tier, import, and mark picks the same way as before.',
    tag: 'Board',
    tagClass: '',
  });
  items.push({
    href: '/start-sit',
    title: players.length >= 2 ? 'Compare any two names' : 'Start/Sit is ready when you are',
    detail: 'Search two to four players for the current week.',
    tag: players.length >= 7 ? 'Clear' : 'Open',
    tagClass: players.length >= 7 ? 'clear' : '',
  });
  briefCount.textContent = pair ? '1 decision' : 'Get started';
  briefList.innerHTML = items.map((item, index) => `
    <a class="brief-row" href="${escapeHtml(item.href)}">
      <span class="brief-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="brief-copy">
        <b>${escapeHtml(item.title)}</b>
        <small>${escapeHtml(item.detail)}</small>
      </span>
      <span class="status-tag ${item.tagClass}">${escapeHtml(item.tag)}</span>
    </a>
  `).join('');
}

function normalizePhotoName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v|vi)$/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

function photoPosition(value) {
  const pos = String(value || '').trim().toUpperCase();
  if (pos === 'DST' || pos === 'D/ST' || pos === 'D' || pos === 'DEF') return 'DEF';
  if (pos === 'PK') return 'K';
  return pos;
}

function photoKeys(player) {
  const name = normalizePhotoName(player?.name);
  const pos = photoPosition(player?.position);
  const team = String(player?.team || '').trim().toUpperCase();
  const keys = [];
  if (name && pos && team) keys.push(`${name}|${pos}|${team}`);
  if (name && pos) keys.push(`${name}|${pos}`);
  if (name) keys.push(name);
  if (pos === 'DEF' && team) keys.push(`def|${team}`);
  return keys;
}

function playerPhotoUrl(player) {
  if (player?.photo) return player.photo;
  const pos = photoPosition(player?.position);
  const team = String(player?.team || '').trim().toLowerCase();
  if (pos === 'DEF' && team) {
    return `https://sleepercdn.com/images/team_logos/nfl/${team}.png`;
  }
  if (player?.sleeperId) {
    return `https://sleepercdn.com/content/nfl/players/thumb/${player.sleeperId}.jpg`;
  }
  if (player?.espnId) {
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espnId}.png`;
  }
  return '';
}

function attachPhoto(player, index) {
  if (!player) return player;
  if (!player.photo && !player.sleeperId && !player.espnId && index) {
    for (const key of photoKeys(player)) {
      const hit = index[key];
      if (!hit) continue;
      if (hit.sleeperId) player.sleeperId = hit.sleeperId;
      if (hit.espnId) player.espnId = hit.espnId;
      break;
    }
  }
  if (!player.photo) {
    const url = playerPhotoUrl(player);
    if (url) player.photo = url;
  }
  return player;
}

function playerMark(player, large) {
  const pos = String(player.position || '').toUpperCase();
  const url = player?.photo || '';
  const fallback = player?.espnId && url && !String(url).includes('espncdn')
    ? `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espnId}.png`
    : '';
  const image = url
    ? `<img src="${escapeHtml(url)}" alt="" loading="lazy"${fallback ? ` data-fallback="${escapeHtml(fallback)}"` : ''} onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback');return;}this.parentElement.classList.remove('has-photo');this.remove()">`
    : '';
  return `<span class="player-mark${large ? ' player-mark-large' : ''}${url ? ' has-photo' : ''}" data-pos="${escapeHtml(pos)}">${escapeHtml(initials(player.name))}${image}</span>`;
}

function renderSpotlight(pair) {
  if (!pair) {
    const note = state.lineup?.suggestion?.summary;
    const ready = lineupPlayers(state.lineup).length > 0 && note;
    spotlight.innerHTML = `
      <div class="section-heading compact">
        <div>
          <span class="eyebrow">Matchup spotlight</span>
          <h2>${ready ? 'Lineup check' : 'Make the close call'}</h2>
        </div>
      </div>
      <p class="muted">${ready ? escapeHtml(note) : 'Add starters on the lineup page. A suggestion appears only when a bench player can legally replace someone.'}</p>
      <a class="primary-button wide" href="/lineup">Build a lineup</a>
    `;
    return;
  }
  const card = (player) => `
    <div class="versus-player">
      ${playerMark(player, true)}
      <b>${escapeHtml(player.name)}</b>
      <span>${escapeHtml(player.position || '')}${player.team ? ` · ${escapeHtml(player.team)}` : ''}</span>
      <strong>${fmt(player.adjusted)} <small>pts</small></strong>
    </div>
  `;
  spotlight.innerHTML = `
    <div class="section-heading compact">
      <div>
          <span class="eyebrow">Matchup spotlight</span>
          <h2>Bench swap</h2>
        </div>
      </div>
      <p class="muted">${escapeHtml(pair.slot || 'FLEX')} is the slot this bench player can take.</p>
    <div class="versus">
      ${card(pair.higher)}
      <span class="vs">VS</span>
      ${card(pair.lower)}
    </div>
    <div class="edge-note">
      <span>
        <b>${fmt(pair.margin)} point edge</b>
        <small>${escapeHtml(pair.higher.name)} would replace ${escapeHtml(pair.lower.name)}</small>
      </span>
    </div>
    <a class="primary-button wide" href="${escapeHtml(compareHref(pair.higher, pair.lower))}">Compare players</a>
  `;
}

function visibleRanks() {
  const query = state.query.trim().toLowerCase();
  return state.players.filter((player) => {
    const pos = String(player.position || '').toUpperCase();
    const posOk = state.position === 'All' || pos === state.position;
    const nameOk = !query || String(player.name || '').toLowerCase().includes(query);
    return posOk && nameOk;
  }).slice(0, 8);
}

function renderRanks() {
  rankFilters.innerHTML = POSITIONS.map((option) => `
    <button type="button" class="filter${state.position === option ? ' active' : ''}" data-pos="${option}">${option}</button>
  `).join('');
  const rows = visibleRanks();
  rankList.innerHTML = rows.length
    ? rows.map((player) => `
      <a class="ranking-row" href="/">
        <span class="rank">${escapeHtml(player.rank)}</span>
        ${playerMark(player)}
        <span class="player-name">
          <b>${escapeHtml(player.name)}</b>
          <small>${escapeHtml(player.position || '')}${player.team ? ` · ${escapeHtml(player.team)}` : ''}${player.opponent ? ` · ${escapeHtml(player.opponent)}` : ''}</small>
        </span>
        <span class="projection"><b>${fmt(player.points)}</b><small>${state.boardMode === 'draft' ? 'season' : 'proj'}</small></span>
      </a>
    `).join('')
    : '<p class="empty-state">No players found. Try another position or search.</p>';
}

async function loadHome() {
  state.lineup = readLineup();
  const pair = legalMove(state.lineup);
  const scoring = state.lineup?.scoring === 'ppr'
    ? 'ppr'
    : state.lineup?.scoring === 'standard'
      ? 'standard'
      : 'half';
  const [metaResult, photoResult, weeklyResult] = await Promise.allSettled([
    fetch('/api/start-sit/meta').then((response) => response.json()),
    fetch('/api/sleeper-photos').then((response) => response.json()),
    fetch(`/api/weekly-rankings?scoring=${encodeURIComponent(scoring)}`).then((response) => response.json()),
  ]);
  const weekly = weeklyResult.status === 'fulfilled' ? weeklyResult.value : null;
  const meta = metaResult.status === 'fulfilled' ? metaResult.value : null;
  state.boardMode = weekly?.mode === 'draft' || meta?.mode === 'draft' ? 'draft' : 'weekly';
  state.week = state.boardMode === 'draft'
    ? null
    : (weekly?.week || meta?.week || state.lineup?.week || null);
  if (homeWeek) homeWeek.textContent = state.boardMode === 'draft' ? 'Offseason' : (state.week ? `Week ${state.week}` : 'Week unavailable');
  if (homeEyebrow) {
    homeEyebrow.textContent = state.boardMode === 'draft'
      ? 'Offseason'
      : (state.week ? `Week ${state.week}` : 'This week');
  }
  const index = photoResult.status === 'fulfilled' ? (photoResult.value.index || {}) : {};
  if (state.boardMode === 'draft') {
    try {
      const response = await fetch('/api/espn');
      const data = await response.json();
      state.players = Array.isArray(data.players) ? data.players : [];
    } catch (error) {
      state.players = [];
    }
    if (rankEyebrow) rankEyebrow.textContent = 'Offseason';
    if (rankHeading) rankHeading.textContent = 'Draft rankings';
  } else {
    state.players = Array.isArray(weekly?.players) ? weekly.players : [];
    if (rankEyebrow) rankEyebrow.textContent = state.week ? `Week ${state.week}` : 'This week';
    if (rankHeading) rankHeading.textContent = 'Week rankings';
  }
  state.players.forEach((player) => attachPhoto(player, index));
  if (pair) {
    attachPhoto(pair.higher, index);
    attachPhoto(pair.lower, index);
  }
  renderSummary();
  renderBrief(pair);
  renderSpotlight(pair);
  renderRanks();
}

rankFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-pos]');
  if (!button) return;
  state.position = button.dataset.pos;
  renderRanks();
});

rankSearch.addEventListener('input', () => {
  state.query = rankSearch.value;
  renderRanks();
});

bindNav();
loadHome();
