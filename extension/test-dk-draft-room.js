(function () {
  const FALLBACK_PLAYERS = [
    { name: 'Ja\'Marr Chase', position: 'WR', team: 'CIN', myRank: 1, adp: 1.2 },
    { name: 'Bijan Robinson', position: 'RB', team: 'ATL', myRank: 2, adp: 2.1 },
    { name: 'Jahmyr Gibbs', position: 'RB', team: 'DET', myRank: 3, adp: 3.4 },
    { name: 'Puka Nacua', position: 'WR', team: 'LAR', myRank: 4, adp: 4.1 },
    { name: 'Justin Jefferson', position: 'WR', team: 'MIN', myRank: 5, adp: 5.0 },
    { name: 'CeeDee Lamb', position: 'WR', team: 'DAL', myRank: 6, adp: 6.2 },
    { name: 'Christian McCaffrey', position: 'RB', team: 'SF', myRank: 7, adp: 7.1 },
    { name: 'Jaxon Smith-Njigba', position: 'WR', team: 'SEA', myRank: 8, adp: 8.3 },
    { name: 'Amon-Ra St. Brown', position: 'WR', team: 'DET', myRank: 9, adp: 9.0 },
    { name: 'Josh Allen', position: 'QB', team: 'BUF', myRank: 10, adp: 12.0 },
    { name: 'Saquon Barkley', position: 'RB', team: 'PHI', myRank: 11, adp: 10.4 },
    { name: 'Nico Collins', position: 'WR', team: 'HOU', myRank: 12, adp: 13.1 },
    { name: 'Derrick Henry', position: 'RB', team: 'BAL', myRank: 13, adp: 14.2 },
    { name: 'Drake London', position: 'WR', team: 'ATL', myRank: 14, adp: 15.0 },
    { name: 'Lamar Jackson', position: 'QB', team: 'BAL', myRank: 15, adp: 16.5 },
    { name: 'Brock Bowers', position: 'TE', team: 'LV', myRank: 16, adp: 18.0 },
    { name: 'James Cook III', position: 'RB', team: 'BUF', myRank: 17, adp: 19.2 },
    { name: 'Jonathan Taylor', position: 'RB', team: 'IND', myRank: 18, adp: 11.5 },
    { name: 'A.J. Brown', position: 'WR', team: 'PHI', myRank: 19, adp: 20.1 },
    { name: 'Trey McBride', position: 'TE', team: 'ARI', myRank: 20, adp: 22.0 }
  ];

  function send(type, payload) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve({ ok: false, error: 'No extension runtime' });
        return;
      }
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false });
      });
    });
  }

  const TEAMS = 12;
  let board = [];
  let posFilter = 'ALL';
  let state = { picks: [], onTheClock: true, mySlot: 9, draftId: 'dk-test-room', totalPicks: 20 };

  function attr(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatAdp(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function currentPickNo() {
    return state.picks.length + 1;
  }

  function slotForPick(pickNo) {
    const round = Math.ceil(pickNo / TEAMS);
    const posInRound = (pickNo - 1) % TEAMS;
    return round % 2 === 1 ? posInRound + 1 : TEAMS - posInRound;
  }

  function roundLabel(pickNo) {
    const round = Math.ceil(pickNo / TEAMS);
    const slot = slotForPick(pickNo);
    return `${round}.${String(slot).padStart(2, '0')}`;
  }

  function isMyPick(pickNo) {
    return slotForPick(pickNo) === state.mySlot;
  }

  function findPlayer(name) {
    return board.find((p) => p.name === name);
  }

  async function loadBoard() {
    const response = await send('GET_BOARD');
    if (response?.ok && response.board?.players?.length) {
      board = response.board.players.slice(0, 140);
      document.getElementById('dev-status').textContent =
        `Loaded ${board.length} players · ${response.board.rankSource || 'expert'} ranks`;
      sync();
      return;
    }
    try {
      const res = await fetch('/api/assistant/board?rankSource=expert');
      if (res.ok) {
        const data = await res.json();
        if (data.players?.length) {
          board = data.players.slice(0, 140);
          document.getElementById('dev-status').textContent =
            `Loaded ${board.length} players · ${data.rankSource || 'expert'} ranks`;
          sync();
          return;
        }
      }
    } catch (err) {
      // Fall through to the built-in list.
    }
    board = FALLBACK_PLAYERS.slice();
    document.getElementById('dev-status').textContent =
      `Using ${board.length} demo players${response?.error ? ` · ${response.error}` : ''}. Click Load expert ranks in the popup for the full board.`;
    sync();
  }

  function availablePlayers() {
    const taken = new Set(state.picks.map((p) => p.name));
    return board.filter((p) => !taken.has(p.name) && (posFilter === 'ALL' || p.position === posFilter));
  }

  function draftPlayer(player, mine) {
    const pickNo = currentPickNo();
    state.picks.push({
      name: player.name,
      position: player.position,
      team: player.team || '',
      pickNo,
      mine: Boolean(mine),
      trusted: true
    });
    if (mine) state.onTheClock = false;
    else if (isMyPick(currentPickNo())) state.onTheClock = true;
    sync();
  }

  function writeRoomState() {
    const json = JSON.stringify(state);
    const room = document.getElementById('room');
    room.setAttribute('data-fds-test-dk-room', json);
    room.setAttribute('data-fds-test-room', json);
  }

  function renderTicker() {
    const next = currentPickNo();
    const cards = [];
    const start = Math.max(1, next - 2);
    const end = Math.min(TEAMS * 20, next + 7);
    for (let pickNo = start; pickNo <= end; pickNo += 1) {
      const pick = state.picks[pickNo - 1];
      const isCurrent = pickNo === next;
      if (pick) {
        cards.push(`<div class="pick-card${isCurrent ? ' current' : ''}${pick.mine ? ' mine' : ''}">
          <div class="meta"><span>${esc(roundLabel(pickNo))}</span><span>${pickNo}</span></div>
          <div class="name">${esc(pick.name)}</div>
          <div class="sub">${esc(pick.position)} · ${esc(pick.team || '—')}</div>
        </div>`);
      } else if (isCurrent) {
        cards.push(`<div class="pick-card current empty">
          <div class="meta"><span>${esc(roundLabel(pickNo))}</span><span>Now</span></div>
          <div class="name">${state.onTheClock ? 'On the clock' : 'Upcoming'}</div>
          <div class="sub">Team ${slotForPick(pickNo)}${isMyPick(pickNo) ? ' (you)' : ''}</div>
        </div>`);
      } else {
        cards.push(`<div class="pick-card empty">
          <div class="meta"><span>${esc(roundLabel(pickNo))}</span><span>${pickNo}</span></div>
          <div class="name">Upcoming</div>
          <div class="sub">Team ${slotForPick(pickNo)}</div>
        </div>`);
      }
    }
    document.getElementById('ticker').innerHTML = cards.join('');
  }

  function sync() {
    writeRoomState();
    document.body.classList.toggle('on-clock', state.onTheClock);
    document.getElementById('clock-banner').textContent = state.onTheClock
      ? "You're on the clock — make your pick"
      : 'Waiting for other teams…';
    renderTicker();
    const list = availablePlayers();
    document.getElementById('avail-count').textContent = `${list.length} available`;
    document.getElementById('available').innerHTML = list.slice(0, 80).map((player) => `
      <div class="dk-player-row player-row pos-${esc(player.position)}" data-fds-player="${attr(player.name)}" data-name="${attr(player.name)}">
        <div>
          <div class="name-line">
            <strong>${esc(player.name)}</strong>
            <span class="fds-rank-inline">${esc(player.myRank ?? '—')}</span>
          </div>
          <div class="pos-line">
            <span class="pos-chip ${esc(player.position)}">${esc(player.position)}</span>
            ${esc(player.team || '—')}
          </div>
        </div>
        <span class="adp-num">${esc(formatAdp(player.adp))}</span>
      </div>
    `).join('') || '<div class="empty">No players match this filter.</div>';
    document.getElementById('feed').innerHTML = state.picks.length
      ? state.picks.map((pick) => `
          <div class="pick${pick.mine ? ' is-mine' : ''}">
            <span class="slot">${esc(roundLabel(pick.pickNo))}</span>
            <div>
              <strong>${esc(pick.name)}</strong>
              <span class="pos-line">${esc(pick.position)} · ${esc(pick.team || '—')}</span>
            </div>
            ${pick.mine ? '<span class="you">YOU</span>' : ''}
          </div>
        `).join('')
      : '<div class="empty">Picks will show here.</div>';
    const mine = state.picks.filter((p) => p.mine);
    const grouped = { QB: [], RB: [], WR: [], TE: [] };
    mine.forEach((p) => {
      if (grouped[p.position]) grouped[p.position].push(p);
    });
    document.getElementById('roster-counts').innerHTML =
      ['QB', 'RB', 'WR', 'TE'].map((pos) => `<span>${pos} ${grouped[pos].length}</span>`).join('');
    document.getElementById('roster-list').innerHTML = mine.length
      ? ['QB', 'RB', 'WR', 'TE'].map((pos) => `
          <div class="roster-group">
            <h3>${pos} (${grouped[pos].length})</h3>
            ${grouped[pos].length
              ? grouped[pos].map((p) => `<div class="roster-row"><strong>${esc(p.name)}</strong><span>${esc(p.team || '')}</span></div>`).join('')
              : '<div class="roster-empty" style="padding:4px 0;text-align:left">—</div>'}
          </div>
        `).join('')
      : '<div class="roster-empty">No picks yet — draft when you\'re on the clock.</div>';
  }

  function bindEvents() {
    document.getElementById('pos-tabs').addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-pos]');
      if (!btn) return;
      posFilter = btn.getAttribute('data-pos');
      document.querySelectorAll('#pos-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
      sync();
    });

    document.getElementById('available').addEventListener('click', (event) => {
      const row = event.target.closest('.dk-player-row');
      if (!row) return;
      const player = findPlayer(row.getAttribute('data-name'));
      if (!player) return;
      draftPlayer(player, state.onTheClock && isMyPick(currentPickNo()));
    });

    document.getElementById('toggle-clock').addEventListener('click', () => {
      state.onTheClock = !state.onTheClock;
      sync();
    });

    document.getElementById('auto-pick').addEventListener('click', () => {
      const avail = board.filter((p) => !state.picks.some((pick) => pick.name === p.name));
      if (!avail.length) return;
      const top = avail.sort((a, b) => (a.myRank || 999) - (b.myRank || 999))[0];
      draftPlayer(top, isMyPick(currentPickNo()) && state.onTheClock);
    });

    document.getElementById('load-demo').addEventListener('click', () => {
      const demoNames = [
        'Ja\'Marr Chase', 'Bijan Robinson', 'Jahmyr Gibbs', 'Puka Nacua',
        'Christian McCaffrey', 'Jaxon Smith-Njigba', 'Jonathan Taylor', 'CeeDee Lamb',
        'Amon-Ra St. Brown', 'James Cook III', 'Justin Jefferson', 'Josh Allen',
        'Derrick Henry', 'Saquon Barkley', 'Drake London', 'Nico Collins'
      ];
      state.picks = [];
      demoNames.forEach((name, i) => {
        const p = findPlayer(name) || FALLBACK_PLAYERS.find((row) => row.name === name) || { name, position: 'WR', team: '—' };
        state.picks.push({
          name: p.name,
          position: p.position,
          team: p.team || '',
          pickNo: i + 1,
          mine: slotForPick(i + 1) === state.mySlot,
          trusted: true
        });
      });
      state.onTheClock = true;
      state.mySlot = 9;
      sync();
    });

    document.getElementById('reset').addEventListener('click', () => {
      state.picks = [];
      state.onTheClock = true;
      sync();
    });
  }

  bindEvents();
  loadBoard();
})();
