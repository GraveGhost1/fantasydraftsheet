const LINEUP_KEY = 'ghost-ff-lineup';
const SLOTS = [
  { id: 'qb', label: 'QB', positions: ['QB'] },
  { id: 'rb1', label: 'RB', positions: ['RB'] },
  { id: 'rb2', label: 'RB', positions: ['RB'] },
  { id: 'wr1', label: 'WR', positions: ['WR'] },
  { id: 'wr2', label: 'WR', positions: ['WR'] },
  { id: 'te', label: 'TE', positions: ['TE'] },
  { id: 'flex', label: 'FLEX', positions: ['RB', 'WR', 'TE'] },
];

const weekSelect = document.getElementById('lineup-week');
const scoringSelect = document.getElementById('lineup-scoring');
const listEl = document.getElementById('lineup-list');
const totalEl = document.getElementById('lineup-total');
const statusEl = document.getElementById('lineup-status');
const headingEl = document.getElementById('lineup-heading');
const edgeEl = document.getElementById('lineup-edge');
const movesEl = document.getElementById('lineup-moves');
const compareLink = document.getElementById('lineup-compare');
const teInput = document.getElementById('lineup-te');
const refreshBtn = document.getElementById('refresh-lineup');

const state = {
  week: 1,
  scoring: 'half',
  tePremium: 0,
  slots: {},
  slotPlan: null,
  sleeper: null,
  bench: [],
  suggestion: null,
  positionFilter: 'All',
};

function activeSlots() {
  return state.slotPlan?.length ? state.slotPlan : SLOTS;
}

function positionsFor(label) {
  const slot = String(label || '').toUpperCase();
  if (slot.includes('SUPER')) return ['QB', 'RB', 'WR', 'TE'];
  if (slot.includes('FLEX') || slot.includes('W/R') || slot.includes('REC')) return ['RB', 'WR', 'TE'];
  if (slot === 'DEF' || slot === 'DST') return ['DEF', 'DST'];
  return [slot];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(1).replace(/\.0$/, '');
}

function slotAllows(label, pos) {
  const slot = String(label || '').toUpperCase();
  const raw = String(pos || '').toUpperCase();
  const player = raw === 'DST' || raw === 'D' || raw === 'D/ST' ? 'DEF' : raw;
  if (slot === 'QB') return player === 'QB';
  if (slot === 'RB') return player === 'RB';
  if (slot === 'WR') return player === 'WR';
  if (slot === 'TE') return player === 'TE';
  if (slot === 'K') return player === 'K';
  if (slot === 'DEF' || slot === 'DST') return player === 'DEF';
  if (slot.includes('SUPER')) return ['QB', 'RB', 'WR', 'TE'].includes(player);
  if (slot.includes('FLEX') || slot.includes('W/R') || slot.includes('REC')) return ['RB', 'WR', 'TE'].includes(player);
  return slot === player;
}

function slotFillOrder(label) {
  const slot = String(label || '').toUpperCase();
  if (slot.includes('SUPER')) return 2;
  if (slot.includes('FLEX') || slot.includes('W/R') || slot.includes('REC')) return 1;
  return 0;
}

function scoringLabel() {
  const base = state.scoring === 'ppr' ? 'PPR' : state.scoring === 'standard' ? 'Standard' : 'Half-PPR';
  const premium = Number(state.tePremium) || 0;
  return premium > 0 ? `${base} · TE +${fmt(premium)}` : base;
}

function posOk(slot, player) {
  const pos = String(player.position || '').toUpperCase();
  const allowed = (slot.positions || []).map((item) => String(item).toUpperCase());
  if (!allowed.length) return true;
  if (allowed.includes(pos)) return true;
  if ((pos === 'DEF' || pos === 'DST') && allowed.some((item) => item === 'DEF' || item === 'DST')) return true;
  return false;
}

function filled() {
  return activeSlots().map((slot) => state.slots[slot.id]).filter((player) => player && player.name);
}

function save() {
  const payload = {
    week: state.week,
    scoring: state.scoring,
    tePremium: state.tePremium || 0,
    slots: state.slots,
    slotPlan: state.slotPlan,
    sleeper: state.sleeper,
    bench: state.bench,
    suggestion: state.suggestion,
    updatedAt: Date.now(),
  };
  localStorage.setItem(LINEUP_KEY, JSON.stringify(payload));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(LINEUP_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return;
    if (saved.week) state.week = Number(saved.week) || state.week;
    if (['half', 'ppr', 'standard'].includes(saved.scoring)) state.scoring = saved.scoring;
    if (saved.tePremium != null) state.tePremium = Math.min(2, Math.max(0, Number(saved.tePremium) || 0));
    if (saved.suggestion && typeof saved.suggestion === 'object') state.suggestion = saved.suggestion;
    if (saved.slots && typeof saved.slots === 'object') state.slots = saved.slots;
    if (Array.isArray(saved.slotPlan) && saved.slotPlan.length) state.slotPlan = saved.slotPlan;
    if (saved.sleeper && typeof saved.sleeper === 'object') state.sleeper = saved.sleeper;
    if (Array.isArray(saved.bench)) state.bench = saved.bench;
  } catch (error) {
    state.slots = {};
  }
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function faceHtml(player) {
  if (!player?.name) return '<span class="player-mark"></span>';
  const photo = player.photo || '';
  const image = photo
    ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.remove()">`
    : '';
  return `<span class="player-mark${photo ? ' has-photo' : ''}" data-pos="${escapeHtml(player.position || '')}">${escapeHtml(initials(player.name))}${image}</span>`;
}

function renderRow(slot) {
  const player = state.slots[slot.id];
  const meta = player
    ? [player.position, player.team, player.matchupLabel].filter(Boolean).join(' · ')
    : 'Empty';
  return `
    <div class="lineup-row" data-slot="${slot.id}">
      <span class="slot-label">${slot.label}</span>
      ${faceHtml(player)}
      <div class="lineup-picker">
        <input type="text" value="${escapeHtml(player?.name || '')}" placeholder="Search ${slot.label}" aria-label="${slot.label} player" autocomplete="off" />
        <div class="lineup-suggest" hidden></div>
      </div>
      <span class="lineup-meta">${escapeHtml(meta)}</span>
      <span class="lineup-projection">
        <b>${player && player.adjusted != null ? fmt(player.adjusted) : '—'}</b>
        <small>proj</small>
      </span>
      <button type="button" class="lineup-clear" aria-label="Clear ${slot.label}">×</button>
    </div>
  `;
}

function rosterPos(player) {
  const pos = String(player?.position || '').toUpperCase();
  if (pos === 'DST' || pos === 'D/ST' || pos === 'D') return 'DEF';
  return pos;
}

function matchesPosition(player, filter) {
  if (!filter || filter === 'All') return true;
  return rosterPos(player) === filter;
}

function statNum(stats, key) {
  const value = Number(stats?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function waiverProfile(position, stats, points) {
  const pos = rosterPos({ position });
  if (!stats || !pos) return '';
  const total = Number(points);
  const tdPoints = statNum(stats, 'passTd') * 4 + (statNum(stats, 'rushTd') + statNum(stats, 'recTd')) * 6;
  const tdShare = Number.isFinite(total) && total > 0 ? tdPoints / total : 0;
  const skillTds = statNum(stats, 'rushTd') + statNum(stats, 'recTd');
  if (pos !== 'QB' && pos !== 'K' && pos !== 'DEF' && tdShare >= 0.4 && skillTds >= 0.3) return 'TD dependent';
  if (pos === 'QB' && tdShare >= 0.5 && statNum(stats, 'passTd') >= 1.2 && statNum(stats, 'passYds') < 220) return 'TD dependent';
  if (pos === 'WR' && statNum(stats, 'rec') > 0 && statNum(stats, 'rec') < 4.5 && total >= 6) return 'Boom/Bust';
  if (pos === 'TE' && statNum(stats, 'rec') > 0 && statNum(stats, 'rec') < 3.5 && total >= 5) return 'Boom/Bust';
  if (pos === 'RB' && statNum(stats, 'rushAtt') > 0 && statNum(stats, 'rushAtt') < 9 && statNum(stats, 'rec') < 3.5 && total >= 6) return 'Boom/Bust';
  if (pos === 'QB' && statNum(stats, 'passYds') > 0 && statNum(stats, 'passYds') < 190 && total >= 12) return 'Boom/Bust';
  if (pos === 'K' && statNum(stats, 'fgm') > 0 && statNum(stats, 'fgm') < 1.8) return 'Boom/Bust';
  if (pos === 'DEF' && (statNum(stats, 'sack') + statNum(stats, 'defInt') * 2 >= 3.5 || statNum(stats, 'ptsAllow') >= 21)) return 'Boom/Bust';
  return '';
}

function renderBench() {
  const list = document.getElementById('bench-list');
  const heading = document.getElementById('bench-heading');
  if (!list) return;
  const rows = state.bench || [];
  if (heading) {
    heading.textContent = rows.length
      ? `${rows.length} player${rows.length === 1 ? '' : 's'}`
      : 'No bench players';
  }
  const players = rows.map((row, index) => {
    const player = row.player || {};
    const meta = [player.position, player.team, player.matchupLabel].filter(Boolean).join(' · ');
    return `
      <div class="lineup-row" data-bench="${index}">
        <span class="slot-label">${escapeHtml(row.slot || 'BN')}</span>
        ${faceHtml(player)}
        <span class="player-name">
          <b>${escapeHtml(player.name || '')}</b>
          <small>${escapeHtml(meta || 'Bench')}</small>
        </span>
        <span class="lineup-meta">${escapeHtml(player.matchupLabel || '')}</span>
        <span class="lineup-projection">
          <b>${player.adjusted != null ? fmt(player.adjusted) : '—'}</b>
          <small>proj</small>
        </span>
        <button type="button" class="lineup-clear" aria-label="Remove ${escapeHtml(player.name || 'bench player')}">×</button>
      </div>
    `;
  }).join('');
  list.innerHTML = players || '<p class="muted">Bench players from your Sleeper roster show up here.</p>';
}

function lineupAdvice() {
  const pool = [];
  const seen = new Set();
  activeSlots().forEach((slot) => {
    const player = state.slots[slot.id];
    if (!player?.name || player.adjusted == null) return;
    const key = player.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ ...player, origin: 'start' });
  });
  (state.bench || []).forEach((row) => {
    if (row.slot && row.slot !== 'BN') return;
    const player = row.player;
    if (!player?.name || player.adjusted == null) return;
    const key = player.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ ...player, origin: 'bench' });
  });

  const used = new Set();
  const order = [...activeSlots()].sort((a, b) => slotFillOrder(a.label) - slotFillOrder(b.label));
  const moves = [];
  order.forEach((slot) => {
    const choices = pool
      .filter((player) => !used.has(player.name.toLowerCase()) && slotAllows(slot.label, player.position))
      .sort((a, b) => Number(b.adjusted) - Number(a.adjusted));
    const best = choices[0];
    if (!best) return;
    used.add(best.name.toLowerCase());
    if (best.origin !== 'bench') return;
    const current = state.slots[slot.id];
    if (current && current.name === best.name) return;
    const currentScore = current?.adjusted != null ? Number(current.adjusted) : null;
    const gain = currentScore == null ? Number(best.adjusted) : Number(best.adjusted) - currentScore;
    if (gain <= 0.3) return;
    moves.push({
      inName: best.name,
      outName: current?.name || '',
      inPos: best.position || '',
      outPos: current?.position || '',
      inTeam: best.team || '',
      outTeam: current?.team || '',
      inPoints: Number(best.adjusted),
      outPoints: currentScore,
      slot: slot.label,
      gain,
    });
  });
  moves.sort((a, b) => b.gain - a.gain);
  const top = moves[0];
  let summary = 'Add players to see a lineup suggestion.';
  if (top?.outName) {
    summary = `Start ${top.inName} over ${top.outName} at ${top.slot}. That is ${fmt(top.gain)} points better.`;
  } else if (top) {
    summary = `Start ${top.inName} in the open ${top.slot} slot.`;
  } else if (pool.length) {
    summary = 'Your starters already fill every slot. No bench player is ahead of the starter they can replace.';
  }
  state.suggestion = { summary, moves: moves.slice(0, 4) };
  return state.suggestion;
}

function render() {
  listEl.innerHTML = activeSlots().map(renderRow).join('');
  renderBench();
  const players = filled();
  const scored = players.filter((player) => player.adjusted != null && Number.isFinite(Number(player.adjusted)));
  const total = scored.reduce((sum, player) => sum + Number(player.adjusted), 0);
  totalEl.textContent = scored.length ? fmt(total) : '—';
  headingEl.textContent = `Week ${state.week} recommendation`;
  const advice = lineupAdvice();
  edgeEl.textContent = advice.summary;
  if (movesEl) {
    movesEl.innerHTML = advice.moves.map((move) => `
      <div class="waiver-row">
        <b>${escapeHtml(move.inName)} → ${escapeHtml(move.slot)}</b>
        <small>${move.outName ? `${fmt(move.gain)} ahead of ${escapeHtml(move.outName)}` : 'Open slot'}</small>
      </div>
    `).join('');
  }
  const swap = advice.moves.find((move) => move.outName);
  if (swap) {
    const params = new URLSearchParams({
      week: String(state.week),
      scoring: state.scoring,
      tePremium: String(state.tePremium || 0),
      players: `${swap.inName},${swap.outName}`,
    });
    compareLink.hidden = false;
    compareLink.href = `/start-sit?${params.toString()}`;
    compareLink.textContent = 'Compare this swap';
  } else {
    compareLink.hidden = true;
    compareLink.href = '/start-sit';
    compareLink.textContent = 'Compare players';
  }
}

function fillWeeks() {
  weekSelect.innerHTML = '';
  for (let week = 1; week <= 18; week += 1) {
    const option = document.createElement('option');
    option.value = String(week);
    option.textContent = `Week ${week}`;
    weekSelect.appendChild(option);
  }
  weekSelect.value = String(state.week);
  scoringSelect.value = state.scoring;
  if (teInput) teInput.value = String(state.tePremium || 0);
}

function rosterNames() {
  const names = filled().map((player) => player.name);
  (state.bench || []).forEach((row) => {
    if (row.player?.name) names.push(row.player.name);
  });
  return [...new Set(names)];
}

function applyProjection(current, projected) {
  if (!current) return;
  if (!projected || projected.missing) {
    current.adjusted = null;
    return;
  }
  current.adjusted = projected.adjusted;
  current.position = projected.position || current.position;
  current.team = projected.team || current.team;
  current.matchupLabel = projected.matchup?.label || current.matchupLabel;
  current.photo = projected.photo || current.photo;
}

async function project() {
  const names = rosterNames();
  if (names.length < 2) {
    statusEl.textContent = names.length
      ? 'Add one more player to load projections.'
      : 'Search a name into each slot.';
    Object.values(state.slots).forEach((player) => {
      if (player) delete player.adjusted;
    });
    (state.bench || []).forEach((row) => {
      if (row.player) delete row.player.adjusted;
    });
    render();
    save();
    return;
  }
  statusEl.textContent = 'Loading Start/Sit projections…';
  refreshBtn.disabled = true;
  try {
    const response = await fetch('/api/start-sit/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players: names,
        week: state.week,
        scoring: state.scoring,
        tePremium: state.tePremium || 0,
      }),
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'Could not project this lineup.');
    }
    const byName = new Map((data.players || []).map((player) => [player.name, player]));
    activeSlots().forEach((slot) => {
      const current = state.slots[slot.id];
      applyProjection(current, byName.get(current?.name));
    });
    (state.bench || []).forEach((row) => {
      applyProjection(row.player, byName.get(row.player?.name));
    });
    statusEl.textContent = `Week ${data.week} · ${scoringLabel()}`;
    render();
    save();
    loadWaivers();
  } catch (error) {
    statusEl.textContent = error.message || 'Could not project this lineup.';
  } finally {
    refreshBtn.disabled = false;
  }
}

let waiverLoadId = 0;

function syncWaiverFilters() {
  document.getElementById('lineup-pos-filters')?.querySelectorAll('[data-pos]').forEach((button) => {
    button.classList.toggle('active', button.dataset.pos === state.positionFilter);
  });
}

async function loadWaivers() {
  const list = document.getElementById('waiver-list');
  const eyebrow = document.getElementById('waiver-eyebrow');
  if (!list) return;
  const requestId = ++waiverLoadId;
  const filter = state.positionFilter || 'All';
  syncWaiverFilters();
  if (eyebrow) eyebrow.textContent = 'Waiver wire';
  if (!state.sleeper?.leagueId) {
    list.innerHTML = '<p class="muted">Loading</p>';
    return;
  }
  list.innerHTML = '<p class="muted">Loading</p>';
  try {
    const params = new URLSearchParams({
      leagueId: state.sleeper.leagueId,
      week: String(state.week),
      scoring: state.scoring,
    });
    if (filter !== 'All') params.set('position', filter);
    const response = await fetch(`/api/sleeper/waivers?${params.toString()}`);
    const data = await response.json();
    if (requestId !== waiverLoadId) return;
    if (data.ok === false) {
      list.innerHTML = `<p class="muted">${escapeHtml(data.error || 'Waiver suggestions are unavailable right now.')}</p>`;
      return;
    }
    const superflex = activeSlots().some((slot) => String(slot.label).toUpperCase().includes('SUPER'));
    const candidates = (data.players || []).filter((player) => {
      if (!matchesPosition(player, filter)) return false;
      return filter === 'QB' || superflex || rosterPos(player) !== 'QB';
    });
    const shortlist = candidates
      .slice()
      .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0))
      .slice(0, 5);
    if (!shortlist.length) {
      list.innerHTML = '<p class="muted">Loading</p>';
      return;
    }
    const names = shortlist.map((player) => player.name);
    let byName = new Map();
    if (names.length >= 2) {
      try {
        const compared = await fetch('/api/start-sit/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            players: names,
            week: state.week,
            scoring: state.scoring,
            tePremium: state.tePremium || 0,
          }),
        });
        const body = await compared.json();
        byName = new Map((body.players || []).map((player) => [player.name, player]));
      } catch (error) {
        byName = new Map();
      }
    }
    const options = shortlist.map((candidate) => {
      const projected = byName.get(candidate.name);
      const stats = projected?.stats || candidate.stats;
      const points = projected?.adjusted != null ? projected.adjusted : candidate.points;
      const player = {
        name: candidate.name,
        position: candidate.position,
        team: projected?.team || candidate.team,
        photo: projected?.photo || candidate.photo,
        points,
        profile: waiverProfile(candidate.position, stats, projected?.consensus || candidate.points),
      };
      const targets = activeSlots().filter((slot) => {
        const current = state.slots[slot.id];
        return current?.name && current.adjusted != null && slotAllows(slot.label, player.position);
      });
      const worst = targets.reduce((low, slot) => {
        const current = state.slots[slot.id];
        if (!low || Number(current.adjusted) < Number(low.player.adjusted)) return { slot, player: current };
        return low;
      }, null);
      const gain = worst && player.points != null ? Number(player.points) - Number(worst.player.adjusted) : null;
      const meta = [player.position, player.team].filter(Boolean).join(' · ');
      const note = gain != null && gain >= 0.5
        ? `${meta} · +${fmt(gain)} over ${worst.player.name}`
        : meta;
      return { ...player, note, sort: Number(player.points) || 0 };
    }).filter((player) => matchesPosition(player, filter)).sort((a, b) => b.sort - a.sort).slice(0, 5);
    if (requestId !== waiverLoadId) return;
    list.innerHTML = options.map((player) => `
      <div class="waiver-option">
        ${faceHtml(player)}
        <span>
          <b>${escapeHtml(player.name)}${player.profile ? `<span class="waiver-tag ${player.profile === 'Boom/Bust' ? 'is-bust' : 'is-td'}">${escapeHtml(player.profile)}</span>` : ''}</b>
          <small>${escapeHtml(player.note || '')}</small>
        </span>
        <span class="lineup-projection"><b>${fmt(player.points)}</b><small>proj</small></span>
      </div>
    `).join('');
  } catch (error) {
    if (requestId !== waiverLoadId) return;
    list.innerHTML = '<p class="muted">Waiver suggestions are unavailable right now.</p>';
  }
}

async function searchSlot(slot, query, suggest) {
  const text = query.trim();
  const requestId = (suggest._request || 0) + 1;
  suggest._request = requestId;
  if (text.length < 2) {
    suggest.hidden = true;
    suggest.classList.remove('is-open');
    suggest.innerHTML = '';
    return;
  }
  const response = await fetch(`/api/start-sit/search?week=${state.week}&q=${encodeURIComponent(text)}`);
  if (suggest._request !== requestId) return;
  const data = await response.json();
  const hits = (data.players || []).filter((player) => posOk(slot, player)).slice(0, 6);
  if (suggest._request !== requestId) return;
  if (!hits.length) {
    suggest.hidden = false;
    suggest.classList.add('is-open');
    suggest.innerHTML = '<button type="button" disabled>No matches for this slot</button>';
    return;
  }
  suggest.hidden = false;
  suggest.classList.add('is-open');
  suggest.innerHTML = hits.map((player, index) => `
    <button type="button" data-index="${index}">
      ${escapeHtml(player.name)}
      <small>${escapeHtml(player.position || '')}${player.team ? ` · ${escapeHtml(player.team)}` : ''}${player.matchupLabel ? ` · ${escapeHtml(player.matchupLabel)}` : ''}</small>
    </button>
  `).join('');
  suggest._hits = hits;
}

function choose(slotId, player) {
  state.slots[slotId] = {
    name: player.name,
    position: player.position,
    team: player.team,
    matchupLabel: player.matchupLabel || '',
    photo: player.photo || '',
  };
  save();
  render();
  project();
}

const lineupPanel = document.querySelector('.lineup-panel');

lineupPanel.addEventListener('input', (event) => {
  const input = event.target.closest('input');
  if (!input || input.id === 'sleeper-username') return;
  const row = input.closest('[data-slot]');
  if (!row) return;
  const slot = activeSlots().find((item) => item.id === row.dataset.slot);
  const suggest = row.querySelector('.lineup-suggest');
  if (!slot || !suggest) return;
  window.clearTimeout(input._timer);
  input._timer = window.setTimeout(() => {
    searchSlot(slot, input.value, suggest).catch(() => {
      suggest.hidden = true;
    });
  }, 180);
});

lineupPanel.addEventListener('click', (event) => {
  const clear = event.target.closest('.lineup-clear');
  if (clear) {
    const benchRow = clear.closest('[data-bench]');
    if (benchRow) {
      state.bench.splice(Number(benchRow.dataset.bench), 1);
      save();
      render();
      project();
      return;
    }
    const row = clear.closest('[data-slot]');
    if (!row) return;
    delete state.slots[row.dataset.slot];
    save();
    render();
    project();
    return;
  }
  const choice = event.target.closest('.lineup-suggest button[data-index]');
  if (!choice) return;
  const row = choice.closest('[data-slot]');
  const suggest = row.querySelector('.lineup-suggest');
  const player = (suggest._hits || [])[Number(choice.dataset.index)];
  if (!player) return;
  choose(row.dataset.slot, player);
});

document.getElementById('lineup-pos-filters')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-pos]');
  if (!button || button.dataset.pos === state.positionFilter) return;
  state.positionFilter = button.dataset.pos;
  loadWaivers();
});

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.lineup-picker')) return;
  lineupPanel.querySelectorAll('.lineup-suggest').forEach((suggest) => {
    suggest.hidden = true;
    suggest.classList.remove('is-open');
  });
});

weekSelect.addEventListener('change', () => {
  state.week = Number(weekSelect.value);
  save();
  if (state.sleeper?.username && state.sleeper?.leagueId) {
    connectSleeper(state.sleeper.leagueId);
    return;
  }
  project();
});

scoringSelect.addEventListener('change', () => {
  state.scoring = scoringSelect.value;
  save();
  project();
});

teInput?.addEventListener('change', () => {
  state.tePremium = Math.min(2, Math.max(0, Number(teInput.value) || 0));
  teInput.value = String(state.tePremium);
  save();
  project();
});

refreshBtn.addEventListener('click', () => project());

const sleeperForm = document.getElementById('sleeper-form');
const sleeperInput = document.getElementById('sleeper-username');
const sleeperLeague = document.getElementById('sleeper-league');
const sleeperStatus = document.getElementById('sleeper-status');
const lineupSubtitle = document.getElementById('lineup-subtitle');

function showLeagues(leagues, selectedId) {
  sleeperLeague.hidden = false;
  sleeperLeague.innerHTML = leagues.map((league) => (
    `<option value="${escapeHtml(league.id)}">${escapeHtml(league.name)}</option>`
  )).join('');
  if (selectedId) sleeperLeague.value = selectedId;
}

function starterLabels(rosterPositions) {
  return (rosterPositions || [])
    .map((pos) => String(pos || '').toUpperCase())
    .filter((label) => label && !['BN', 'BENCH', 'IR'].includes(label) && !label.startsWith('TAXI'));
}

function applySleeperTeam(data) {
  const fromLeague = starterLabels(data.league?.rosterPositions);
  const fromSlots = (data.slots || []).map((slot) => slot.slot || 'FLEX');
  const labels = fromLeague.length >= fromSlots.length ? fromLeague : fromSlots;
  const width = Math.max(labels.length, fromSlots.length, (data.slots || []).length);
  state.slotPlan = Array.from({ length: width }, (_, index) => {
    const label = fromSlots[index] || labels[index] || 'FLEX';
    return {
      id: `s${index}`,
      label,
      positions: positionsFor(label),
    };
  });
  if (data.league?.scoring && ['half', 'ppr', 'standard'].includes(data.league.scoring)) {
    state.scoring = data.league.scoring;
    scoringSelect.value = state.scoring;
  }
  if (data.league && data.league.tePremium != null) {
    state.tePremium = Math.min(2, Math.max(0, Number(data.league.tePremium) || 0));
    if (teInput) teInput.value = String(state.tePremium);
  }
  state.slots = {};
  (data.slots || []).forEach((slot, index) => {
    if (!slot.player) return;
    state.slots[`s${index}`] = slot.player;
  });
  state.bench = Array.isArray(data.bench) ? data.bench : [];
  state.sleeper = {
    username: data.username,
    leagueId: data.league?.id || '',
    leagueName: data.league?.name || '',
  };
  if (data.week) {
    state.week = data.week;
    weekSelect.value = String(state.week);
  }
  if (lineupSubtitle) {
    lineupSubtitle.textContent = data.league?.name
      ? `${data.username} · ${data.league.name}`
      : `Connected as ${data.username}`;
  }
  if (data.leagues?.length > 1) showLeagues(data.leagues, data.league?.id);
  const count = data.starterCount ?? Object.keys(state.slots).length;
  const spots = activeSlots().length;
  const benchCount = data.benchCount ?? state.bench.length;
  sleeperStatus.textContent = count
    ? `Loaded ${count} of ${spots} starters and ${benchCount} bench for week ${data.week}.`
    : 'Connected, but Sleeper has no starters set for this week.';
  save();
  render();
  project();
}

async function connectSleeper(leagueId) {
  const username = sleeperInput.value.trim();
  if (!username) {
    sleeperStatus.textContent = 'Enter a Sleeper username.';
    return;
  }
  sleeperStatus.textContent = 'Loading your Sleeper team…';
  const button = document.getElementById('sleeper-connect');
  if (button) button.disabled = true;
  const params = new URLSearchParams({ username, week: String(state.week) });
  if (leagueId) params.set('leagueId', leagueId);
  try {
    const response = await fetch(`/api/sleeper/team?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'Could not load that Sleeper user.');
    }
    if (data.needsLeague) {
      showLeagues(data.leagues || []);
      state.sleeper = { username: data.username || username, leagueId: '', leagueName: '' };
      sleeperStatus.textContent = 'Pick a league to load that roster.';
      save();
      return;
    }
    applySleeperTeam(data);
  } catch (error) {
    sleeperStatus.textContent = error.message || 'Could not load that Sleeper user.';
  } finally {
    if (button) button.disabled = false;
  }
}

sleeperForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const leagueId = sleeperLeague && !sleeperLeague.hidden ? sleeperLeague.value : (state.sleeper?.leagueId || '');
  connectSleeper(leagueId);
});

sleeperLeague?.addEventListener('change', () => {
  if (sleeperLeague.value) connectSleeper(sleeperLeague.value);
});

const navToggle = document.getElementById('nav-expand-toggle');
const headerCluster = document.querySelector('.header-cluster');
navToggle?.addEventListener('click', () => {
  const open = headerCluster.classList.toggle('is-nav-open');
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

load();
fillWeeks();
if (state.sleeper?.username && sleeperInput) sleeperInput.value = state.sleeper.username;
if (state.sleeper?.leagueName && lineupSubtitle) {
  lineupSubtitle.textContent = `${state.sleeper.username} · ${state.sleeper.leagueName}`;
}
render();
fetch('/api/start-sit/meta')
  .then((response) => response.json())
  .then((data) => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(LINEUP_KEY) || 'null');
    } catch (error) {
      saved = null;
    }
    if (!(saved && saved.week) && data.week) {
      state.week = data.week;
      weekSelect.value = String(state.week);
      render();
    }
  })
  .catch(() => {})
  .finally(() => {
    project();
  });
