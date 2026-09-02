(function () {
  if (window !== window.top || window.__FDS_OVERLAY__) {
    return;
  }
  window.__FDS_OVERLAY__ = true;

  const HOST_ID = 'fds-draft-assistant-root';
  const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];
  const TABS = [
    ['recs', 'Recs'],
    ['board', 'Board'],
    ['team', 'Team']
  ];
  const SLIDER_GROUPS = [
    {
      title: 'Core',
      sliders: [
        ['rankWeight', 'Player ranks'],
        ['adpWeight', 'ADP value'],
        ['projectionWeight', 'Projections'],
        ['stackWeight', 'Stacking']
      ]
    },
    {
      title: 'Playoffs',
      sliders: [
        ['week17Importance', 'Week 17'],
        ['week16Importance', 'Week 16'],
        ['week15Importance', 'Week 15']
      ]
    },
    {
      title: 'Strategy',
      sliders: [
        ['capitalWeight', 'Capital fit'],
        ['portfolioWeight', 'Portfolio fade'],
        ['duplicateWeight', 'Duplicate teams'],
        ['contrarianWeight', 'Contrarian']
      ]
    }
  ];

  const ui = {
    collapsed: false,
    settingsOpen: false,
    activeTab: 'recs',
    position: 'ALL',
    query: '',
    sortKey: 'rank',
    manualPicks: [],
    onTheClock: false,
    settings: null,
    portfolio: null,
    recordedDraftId: null
  };

  let board = { players: [], loggedIn: false, username: null, savedRankCount: 0 };
  let boardReady = false;
  let boardLoadAttempts = 0;
  let lastSnapshot = { isDraftRoom: false, picks: [], onTheClock: null, source: 'none', draftId: null };
  let lastClockState = false;
  let cssText = '';
  let audioCtx = null;

  function playClockAlert() {
    if (ui.settings?.clockAlert === false) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (err) {
      // Audio may be blocked until user interaction.
    }
  }

  function maybeAlertOnClock(onClock) {
    if (onClock && !lastClockState) {
      playClockAlert();
    }
    lastClockState = onClock;
  }

  function send(type, payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: 'No response' });
      });
    });
  }

  function defaultSettings() {
    return window.FDSScoringSettings?.mergeSettings() || {};
  }

  function hostEl() {
    return document.getElementById(HOST_ID);
  }

  function shadow() {
    return hostEl()?.shadowRoot;
  }

  function allPicks() {
    const seen = new Set();
    const merged = [];
    [...(lastSnapshot.picks || []), ...ui.manualPicks].forEach((pick) => {
      const key = pick.pickNo
        ? `pick:${pick.pickNo}`
        : `${pick.name}|${pick.position}|${pick.team}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(pick);
    });
    return merged.sort((a, b) => (Number(a.pickNo) || 999) - (Number(b.pickNo) || 999));
  }

  function sliderLevel(value) {
    const n = Number(value) || 0;
    if (n >= 70) return 'High';
    if (n >= 35) return 'Med';
    return 'Low';
  }

  async function persistSettings(partial) {
    ui.settings = { ...defaultSettings(), ...ui.settings, ...partial };
    if (partial?.posBias) {
      ui.settings.posBias = { ...ui.settings.posBias, ...partial.posBias };
    }
    const response = await send('SAVE_ASSISTANT_SETTINGS', ui.settings);
    if (response?.settings) ui.settings = response.settings;
  }

  async function maybeRecordPortfolio(myRoster) {
    if (myRoster.length < window.FDSRankBoard.TOTAL_PICKS) return;
    const draftId = lastSnapshot.draftId || `local-${location.pathname}-${myRoster.map((p) => p.name).join('|')}`;
    if (ui.recordedDraftId === draftId) return;
    const response = await send('RECORD_PORTFOLIO_DRAFT', {
      draftId,
      picks: myRoster.map((p) => ({ name: p.name, position: p.position, team: p.team }))
    });
    if (response?.ok) {
      ui.portfolio = response.portfolio;
      ui.recordedDraftId = draftId;
    }
  }

  function formatDiff(diff) {
    if (diff == null) return '—';
    const rounded = Math.round(diff);
    return rounded > 0 ? `+${rounded}` : String(rounded);
  }

  async function ensureHost() {
    if (hostEl()) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    if (!cssText) {
      try {
        cssText = await (await fetch(chrome.runtime.getURL('overlay/panel.css'))).text();
      } catch (err) {
        cssText = '.fds-root{position:fixed;top:12px;right:12px;width:380px;background:#111;color:#fff;font-family:sans-serif;}';
      }
    }
    root.innerHTML = `<style>${cssText}</style><div class="fds-root"></div>`;
    bindEvents(root);
  }

  function bindEvents(root) {
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="stop"]')) {
        event.stopPropagation();
        return;
      }
      const action = event.target.closest('[data-action]')?.getAttribute('data-action');
      if (!action) return;
      if (action === 'collapse') {
        ui.collapsed = !ui.collapsed;
        render();
      } else if (action === 'settings') {
        ui.settingsOpen = !ui.settingsOpen;
        render();
      } else if (action === 'close-settings') {
        ui.settingsOpen = false;
        render();
      } else if (action === 'refresh') {
        loadBoard(true);
      } else if (action === 'undo') {
        ui.manualPicks.pop();
        render();
      } else if (action === 'tab') {
        ui.activeTab = event.target.closest('[data-action]').getAttribute('data-tab');
        render();
      } else if (action === 'filter') {
        ui.position = event.target.closest('[data-action]').getAttribute('data-pos');
        ui.activeTab = 'board';
        render();
      } else if (action === 'bias') {
        const pos = event.target.closest('[data-action]').getAttribute('data-pos');
        const order = ['default', 'boost', 'exclude'];
        const current = ui.settings?.posBias?.[pos] || 'default';
        const next = order[(order.indexOf(current) + 1) % order.length];
        persistSettings({ posBias: { [pos]: next } }).then(() => render());
      } else if (action === 'format') {
        const next = ui.settings?.format === 'superflex' ? 'bestball' : 'superflex';
        persistSettings({ format: next }).then(() => render());
      } else if (action === 'clear-portfolio') {
        send('CLEAR_PORTFOLIO').then((response) => {
          if (response?.portfolio) ui.portfolio = response.portfolio;
          render();
        });
      }
    });

    root.addEventListener('input', (event) => {
      if (event.target.id === 'fds-search') {
        ui.query = event.target.value;
        render({ keepSearch: true });
        return;
      }
      const slider = event.target.closest('[data-slider]');
      if (slider) {
        const key = slider.getAttribute('data-slider');
        persistSettings({ [key]: Number(slider.value) }).then(() => render({ keepSearch: true, keepSettings: true }));
        return;
      }
      const maxInput = event.target.closest('[data-pos-max]');
      if (maxInput) {
        const pos = maxInput.getAttribute('data-pos-max');
        persistSettings({ posMax: { [pos]: Number(maxInput.value) } }).then(() => render({ keepSettings: true }));
      }
    });

    root.addEventListener('change', (event) => {
      if (event.target.id === 'fds-sort') {
        ui.sortKey = event.target.value;
        render();
        return;
      }
      if (event.target.matches('[data-toggle="clockAlert"]')) {
        persistSettings({ clockAlert: event.target.checked }).then(() => render({ keepSettings: true }));
      }
    });

    root.addEventListener('click', (event) => {
      const rec = event.target.closest('.fds-rec[data-player]');
      if (!rec) return;
      let player;
      try {
        player = JSON.parse(rec.getAttribute('data-player'));
      } catch (err) {
        return;
      }
      ui.manualPicks.push({
        name: player.name,
        position: player.position,
        team: player.team,
        mine: true,
        trusted: true,
        pickNo: allPicks().length + 1
      });
      render();
    });
  }

  function buildContext(ranked) {
    return {
      myRoster: ranked.myRoster,
      pickNo: ranked.drafted.length + 1,
      settings: ui.settings || defaultSettings(),
      portfolio: ui.portfolio
    };
  }

  function renderRecsTab(recs, capital, rosterWarnings, summary, draftRoom, myRoster) {
    const parts = [];
    if (recs?.length) {
      parts.push(`
        <div class="fds-recs-block">
          <div class="fds-recs-head">
            <h3>Top picks</h3>
            <span>Tap to mark drafted</span>
          </div>
          <div class="fds-rec-list">
            ${recs.slice(0, 3).map((rec, index) => `
              <div class="fds-rec is-rec-${rec.player.position}" data-player="${playerPayload(rec.player)}">
                <div class="fds-rec-num">${index + 1}</div>
                <div class="fds-rec-body">
                  <strong>${escapeHtml(rec.player.name)}</strong>
                  <em>${rec.player.position} · ${escapeHtml(rec.player.team || '')} · Rank ${rec.player.myRank || '—'}</em>
                </div>
                <div class="fds-rec-score" title="Raw score ${rec.rawScore ?? Math.round(rec.score)}">
                  ${rec.displayScore}
                </div>
              </div>
            `).join('')}
          </div>
          <p class="fds-rec-hint">Score 0–10 from model · rows on the board are color-coded.</p>
        </div>
      `);
    } else {
      parts.push('<div class="fds-empty">No recommendations yet — load your board from the extension popup.</div>');
    }
    parts.push(renderComboWidget(recs, myRoster));
    parts.push(renderRoomWidget(draftRoom));
    if (rosterWarnings.length) {
      parts.push(renderWarnings(rosterWarnings));
    }
    if (summary) {
      parts.push(renderPostDraft(summary, capital));
    }
    parts.push(renderCapital(capital, true));
    return parts.join('');
  }

  function shortName(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length <= 1) return parts[0] || '';
    return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  }

  function renderComboWidget(recs, myRoster) {
    if (!ui.portfolio?.totalDrafts || !recs?.length || !myRoster?.length || !window.FDSPortfolio?.comboBreakdown) {
      return '';
    }
    const blocks = recs.slice(0, 3).map((rec) => {
      const combos = window.FDSPortfolio.comboBreakdown(ui.portfolio, rec.player, myRoster, { minPct: 8 });
      if (!combos.length) {
        return `<div class="fds-combo-row">
          <strong>${escapeHtml(shortName(rec.player.name))}</strong>
          <span class="fds-combo-none">No combo history ≥8%</span>
        </div>`;
      }
      const chips = combos.slice(0, 4).map((row) => {
        const hot = row.pct >= 25 ? ' is-hot' : row.pct >= 15 ? ' is-warn' : '';
        return `<span class="fds-combo-chip${hot}">+ ${escapeHtml(shortName(row.owned.name))} ${row.pct}%</span>`;
      }).join('');
      return `<div class="fds-combo-row">
        <strong>${escapeHtml(shortName(rec.player.name))}</strong>
        <div class="fds-combo-chips">${chips}</div>
      </div>`;
    }).join('');
    return `
      <div class="fds-section fds-combo-widget">
        <h3>Combo ownership <span class="fds-hint">${ui.portfolio.totalDrafts} drafts</span></h3>
        ${blocks}
      </div>
    `;
  }

  function renderRoomWidget(draftRoom) {
    if (!draftRoom?.teams?.length) return '';
    const drafted = draftRoom.teams.some((team) => team.total > 0);
    if (!drafted) return '';
    const posKeys = ['QB', 'RB', 'WR', 'TE'];
    const totalLine = posKeys.map((pos) => `${pos} ${draftRoom.totals[pos] || 0}`).join(' · ');
    const rows = draftRoom.teams
      .filter((team) => team.total > 0 || team.isMe)
      .map((team) => {
        const counts = posKeys.map((pos) => {
          const count = team.counts[pos] || 0;
          return `<span class="fds-room-pos ${pos}${count >= 3 ? ' is-heavy' : ''}">${pos}${count}</span>`;
        }).join('');
        const label = team.isMe ? `You · ${team.slot}` : `Team ${team.slot}`;
        return `<div class="fds-room-row${team.isMe ? ' is-me' : ''}">
          <span class="fds-room-label">${label}</span>
          <div class="fds-room-counts">${counts}</div>
        </div>`;
      }).join('');
    return `
      <div class="fds-section fds-room-widget">
        <h3>Draft room <span class="fds-hint">${totalLine}</span></h3>
        <div class="fds-room-grid">${rows}</div>
      </div>
    `;
  }

  function renderBoardTab(remaining, recs, heat, myRoster) {
    return `
      <div class="fds-toolbar">
        <input id="fds-search" type="search" placeholder="Search players…" value="${escapeHtml(ui.query)}" />
        <select id="fds-sort">
          <option value="rank" ${ui.sortKey === 'rank' ? 'selected' : ''}>Rank</option>
          <option value="adp" ${ui.sortKey === 'adp' ? 'selected' : ''}>ADP</option>
          <option value="diff" ${ui.sortKey === 'diff' ? 'selected' : ''}>Diff</option>
        </select>
      </div>
      <div class="fds-filters">
        ${POSITIONS.map((pos) => `<button data-action="filter" data-pos="${pos}" class="${ui.position === pos ? 'is-active' : ''}">${pos}</button>`).join('')}
        <button data-action="format" class="fds-format">${ui.settings.format === 'superflex' ? 'Superflex' : 'Best Ball'}</button>
      </div>
      <div class="fds-bias">
        ${['QB', 'RB', 'WR', 'TE'].map((pos) => {
          const mode = ui.settings.posBias?.[pos] || 'default';
          const label = mode === 'default' ? pos : `${pos} ${mode}`;
          return `<button data-action="bias" data-pos="${pos}" class="is-${mode}" title="Cycle dock / boost / exclude">${label}</button>`;
        }).join('')}
      </div>
      <div class="fds-list-head">
        <span>Rk</span><span>Player</span><span>Pos</span><span>ADP</span><span>Δ</span>
      </div>
      <div class="fds-list">
        ${remaining.length
          ? remaining.slice(0, 80).map((player) => renderRow(player, recs, heat, myRoster)).join('')
          : '<div class="fds-empty">No remaining players match your filters.</div>'}
      </div>
    `;
  }

  function renderTeamTab(ranked, roster, capital, draftRoom) {
    const proj = ranked.myRoster.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);
    const pickNo = ranked.drafted.length + 1;
    return `
      <div class="fds-stat-row">
        <div class="fds-stat">
          <div class="label">Your picks</div>
          <div class="value">${ranked.myRoster.length}/${window.FDSRankBoard.TOTAL_PICKS}</div>
        </div>
        <div class="fds-stat">
          <div class="label">Pick #</div>
          <div class="value">${pickNo}</div>
        </div>
      </div>
      ${renderRoomWidget(draftRoom)}
      <div class="fds-section">
        <h3>My roster</h3>
        <div class="fds-roster-grid">
          ${['QB', 'RB', 'WR', 'TE'].map((pos) => {
            const list = roster[pos] || [];
            return `<div class="fds-roster-pos">
              <strong>${pos} (${list.length})</strong>
              ${list.length
                ? `<ul>${list.map((p) => `<li>${escapeHtml(p.name)}<span>Rk ${p.myRank || '—'}</span></li>`).join('')}</ul>`
                : '<div class="fds-roster-empty">—</div>'}
            </div>`;
          }).join('')}
        </div>
        ${proj ? `<div class="fds-post-meta" style="margin-top:10px">Projected: ${Math.round(proj)} pts</div>` : ''}
      </div>
      ${renderCapital(capital, false)}
      ${ranked.unmatched.length ? `
        <div class="fds-section">
          <h3>Unmatched picks</h3>
          <div class="fds-unmatched">${ranked.unmatched.slice(0, 6).map((p) => escapeHtml(p.name)).join(', ')}</div>
        </div>` : ''}
      <div class="fds-actions">
        <button data-action="refresh">Refresh board</button>
        <button class="secondary" data-action="undo">Undo pick</button>
      </div>
    `;
  }

  function render(options = {}) {
    const root = shadow()?.querySelector('.fds-root');
    if (!root) return;
    if (!ui.settings) ui.settings = defaultSettings();

    const ranked = window.FDSRankBoard.applyPicks(board.players || [], allPicks());
    maybeRecordPortfolio(ranked.myRoster);
    const context = buildContext(ranked);
    const remaining = window.FDSRankBoard.remainingPlayers(ranked, {
      position: ui.position,
      query: ui.query,
      sortKey: ui.sortKey
    }).filter((player) => context.settings.posBias?.[player.position] !== 'exclude');

    const recPool = window.FDSRankBoard.remainingPlayers(ranked, { position: 'ALL', query: '', sortKey: 'rank' })
      .filter((player) => context.settings.posBias?.[player.position] !== 'exclude');
    const recs = window.FDSRankBoard.recommend(recPool, context);
    const heat = window.FDSRankBoard.heatMap(recPool, context);
    const capital = window.FDSRankBoard.draftCapital(ranked.myRoster, context.settings);
    const draftRoom = window.FDSRankBoard.draftRoomState(allPicks(), {
      mySlot: lastSnapshot.mySlot,
      teamSize: window.FDSRankBoard.DEFAULT_TEAM_SIZE
    });
    const roster = window.FDSRankBoard.rosterByPosition(ranked.myRoster);
    const onClock = Boolean(lastSnapshot.onTheClock);
    maybeAlertOnClock(onClock);
    const rosterWarnings = window.FDSDuplicates?.rosterWarnings(ranked.myRoster, null) || [];
    const draftComplete = ranked.myRoster.length >= window.FDSRankBoard.TOTAL_PICKS;
    const summary = draftComplete && window.FDSDuplicates
      ? window.FDSDuplicates.draftSummary(ranked.myRoster)
      : null;

    const statusClass = !boardReady || board.error || !board.players?.length ? 'err' : (lastSnapshot.isDraftRoom ? 'ok' : 'warn');
    const statusText = !boardReady
      ? 'Loading rankings…'
      : board.error
        ? board.error
        : !board.players?.length
          ? 'Open the extension popup → Load expert ranks'
          : lastSnapshot.isDraftRoom
            ? `${remaining.length} available · ${ranked.drafted.length} drafted`
            : 'Open an Underdog draft room or the test room';

    const rankLabel = board.rankSource === 'csv'
      ? 'CSV ranks'
      : board.rankSource === 'custom'
        ? (board.loggedIn ? `${board.username}` : 'Custom ranks')
        : 'Expert BB';

    let panelHtml = '';
    if (ui.activeTab === 'recs') {
      panelHtml = renderRecsTab(recs, capital, rosterWarnings, summary, draftRoom, ranked.myRoster);
    } else if (ui.activeTab === 'board') {
      panelHtml = renderBoardTab(remaining, recs, heat, ranked.myRoster);
    } else {
      panelHtml = renderTeamTab(ranked, roster, capital, draftRoom);
    }

    root.className = `fds-root${ui.collapsed ? ' is-collapsed' : ''}${onClock ? ' is-on-clock' : ''}`;
    root.innerHTML = `
      <div class="fds-header">
        <div class="fds-logo">DA</div>
        <div class="fds-title">
          <strong>${onClock ? 'On the clock' : 'Draft Assistant'}</strong>
          <span>${rankLabel} · ${ui.portfolio?.totalDrafts || 0} portfolio drafts</span>
        </div>
        <div class="fds-header-actions">
          <button class="fds-icon-btn${ui.settingsOpen ? ' is-active' : ''}" data-action="settings" title="Settings">⚙</button>
          <button class="fds-icon-btn" data-action="collapse" title="${ui.collapsed ? 'Expand' : 'Collapse'}">${ui.collapsed ? '▸' : '▾'}</button>
        </div>
      </div>
      <div class="fds-body">
        <div class="fds-status-bar ${statusClass}">
          <span class="fds-status-dot"></span>
          <span>${statusText}</span>
        </div>
        <div class="fds-tabs">
          ${TABS.map(([id, label]) => `
            <button class="fds-tab${ui.activeTab === id ? ' is-active' : ''}" data-action="tab" data-tab="${id}">${label}</button>
          `).join('')}
        </div>
        <div class="fds-panel">${panelHtml}</div>
        ${ui.settingsOpen ? renderSettingsOverlay() : ''}
      </div>
    `;

    if (options.keepSearch) {
      const input = root.querySelector('#fds-search');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
    if (window.FDSHostHighlight) {
      window.FDSHostHighlight.paint({ recs, heat, capital });
    }
  }

  function renderSettingsOverlay() {
    const groups = SLIDER_GROUPS.map((group) => `
      <div class="fds-settings-group">
        <h4>${group.title}</h4>
        ${group.sliders.map(([key, label]) => `
          <label class="fds-slider">
            <span>${label} <em>${sliderLevel(ui.settings[key])}</em></span>
            <input type="range" min="0" max="100" step="5" data-slider="${key}" value="${ui.settings[key] ?? 50}" />
          </label>
        `).join('')}
      </div>
    `).join('');
    const maxes = ['QB', 'RB', 'WR', 'TE'].map((pos) => `
      <label class="fds-max">${pos} max
        <input type="number" min="1" max="12" data-pos-max="${pos}" value="${ui.settings.posMax?.[pos] ?? 8}" />
      </label>
    `).join('');
    return `
      <div class="fds-settings-overlay" data-action="close-settings">
        <div class="fds-settings-sheet" data-action="stop">
          <div class="fds-settings-head">
            <h3>Settings</h3>
            <button class="fds-icon-btn" data-action="close-settings" title="Close">✕</button>
          </div>
          ${groups}
          <div class="fds-settings-group">
            <h4>Position limits <span class="fds-hint">(adjust capital targets)</span></h4>
            <div class="fds-max-row">${maxes}</div>
          </div>
          <div class="fds-settings-foot">
            <label class="fds-check">
              <input type="checkbox" data-toggle="clockAlert" ${ui.settings.clockAlert !== false ? 'checked' : ''} />
              Play sound when you're on the clock
            </label>
            <span style="font-size:11px;color:#9ca3af">Portfolio saves completed 18-pick rosters locally for exposure tracking.</span>
            <button class="secondary" data-action="clear-portfolio">Clear portfolio history</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderWarnings(warnings) {
    const items = warnings.slice(0, 3).map((warning) => `
      <div class="fds-warning is-${warning.severity || 'medium'}">${escapeHtml(warning.message)}</div>
    `).join('');
    return `<div class="fds-warnings">${items}</div>`;
  }

  function renderPostDraft(summary, capital) {
    const posLines = ['QB', 'RB', 'WR', 'TE'].map((pos) => {
      const list = summary.byPosition[pos] || [];
      return `<div><strong>${pos}</strong> ${list.map((p) => escapeHtml(p.name)).join(', ') || '—'}</div>`;
    }).join('');
    const teamLines = summary.topTeams.map(([team, count]) => `${team} (${count})`).join(' · ');
    return `
      <div class="fds-post-draft">
        <h3>Draft complete</h3>
        <div class="fds-roster-grid">${posLines}</div>
        <div class="fds-post-meta">Top teams: ${escapeHtml(teamLines || '—')}</div>
        <div class="fds-post-meta">Capital: ${capital.allocated} allocated · ${capital.remainingPicks} picks left</div>
      </div>
    `;
  }

  function renderCapital(capital, compact) {
    if (!window.FDSCapitalChart) return '';
    if (compact) {
      return `
        <div class="fds-section">
          ${capital.pickCount
            ? window.FDSCapitalChart.renderColumns(capital, { title: 'Draft capital' })
            : '<h3>Draft capital</h3><div class="fds-cap-empty">Draft players to track capital.</div>'}
        </div>
      `;
    }
    return `
      <div class="fds-section">
        ${capital.pickCount
          ? window.FDSCapitalChart.renderColumns(capital, { title: 'Draft capital allocation' })
          : '<h3>Draft capital allocation</h3><div class="fds-cap-empty">Draft players to track capital vs target.</div>'}
        ${capital.pickCount ? `<div class="fds-cap-remain">
          <span>${capital.allocated} capital spent · pick ${capital.pickCount}/${capital.totalPicks}</span>
          <span>Pools QB ${capital.byPosition.QB.targetValue} · RB ${capital.byPosition.RB.targetValue} · WR ${capital.byPosition.WR.targetValue} · TE ${capital.byPosition.TE.targetValue}</span>
        </div>` : ''}
      </div>
    `;
  }

  function renderRow(player, recs, heat, myRoster) {
    const diff = window.FDSRankBoard.adpDiff(player);
    const diffClass = diff == null ? '' : (diff < 0 ? 'is-value' : diff > 0 ? 'is-reach' : '');
    const rec = recs.findIndex((row) => row.player.name === player.name && row.player.position === player.position);
    const heatRow = heat.find((item) =>
      item.player.name === player.name && item.player.position === player.position
      || window.FDSPlayerMatch?.namesMatch(item.player.name, player.name) && item.player.position === player.position
    );
    const exp = ui.portfolio && window.FDSPortfolio
      ? Math.round(window.FDSPortfolio.exposurePct(ui.portfolio, player))
      : 0;
    const comboExp = ui.portfolio && window.FDSPortfolio && myRoster?.length
      ? Math.round(window.FDSPortfolio.comboExposurePct(ui.portfolio, player, myRoster))
      : 0;
    const badges = [
      player.stack ? '<span class="fds-badge">STK</span>' : '',
      player.bringBack ? '<span class="fds-badge">BB</span>' : '',
      rec >= 0 ? `<span class="fds-badge">#${rec + 1}</span>` : '',
      heatRow ? `<span class="fds-badge" title="Model score">${heatRow.displayScore}</span>` : '',
      exp >= 10 ? `<span class="fds-badge">${exp}%</span>` : '',
      comboExp >= 12 ? `<span class="fds-badge is-combo">C${comboExp}%</span>` : ''
    ].join('');
    return `
      <div class="fds-row${rec >= 0 ? ` is-rec-${player.position}` : ''}${heatRow ? ` is-heat-${heatRow.heat}` : ''}" data-player="${playerPayload(player)}">
        <div class="fds-rank">${player.myRank || '—'}</div>
        <div class="fds-name">
          <strong>${escapeHtml(player.name)}${badges}</strong>
          <em>${escapeHtml(player.team || '')}${player.projectedPoints ? ` · ${Math.round(player.projectedPoints)} pts` : ''}</em>
        </div>
        <div class="fds-pill ${player.position}">${player.position}</div>
        <div class="fds-adp">${player.adp || '—'}</div>
        <div class="fds-diff ${diffClass}">${formatDiff(diff)}</div>
      </div>
    `;
  }

  function playerPayload(player) {
    return escapeHtml(JSON.stringify({ name: player.name, position: player.position, team: player.team }));
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function loadBoard(force, attempt = 0) {
    const response = await send('GET_BOARD', { force: Boolean(force) });
    if (response?.ok && response.board?.players?.length) {
      board = response.board;
      boardReady = true;
      if (response.settings) ui.settings = response.settings;
      if (response.portfolio) ui.portfolio = response.portfolio;
    } else if (attempt < 8) {
      boardLoadAttempts = attempt + 1;
      board = {
        players: board.players || [],
        error: response?.error || (attempt === 0 ? null : 'Could not load rankings.')
      };
      setTimeout(() => loadBoard(true, attempt + 1), 1200);
    } else {
      board = { players: [], error: response?.error || 'Could not load rankings.' };
      boardReady = false;
    }
    render();
  }

  function pollDraft() {
    if (!window.FDSUnderdogAdapter) return;
    const snapshot = window.FDSUnderdogAdapter.read();
    const signature = JSON.stringify({
      count: snapshot.picks?.length || 0,
      clock: snapshot.onTheClock,
      source: snapshot.source,
      last: snapshot.picks?.[snapshot.picks.length - 1]?.name
    });
    const changed = signature !== pollDraft.lastSignature;
    if (changed) {
      pollDraft.lastSignature = signature;
      lastSnapshot = { ...snapshot, draftId: snapshot.draftId || lastSnapshot.draftId };
      if (snapshot.onTheClock) {
        maybeAlertOnClock(true);
      }
    }
    if (changed || boardReady) {
      render();
    }
  }

  async function start() {
    await ensureHost();
    const settingsResp = await send('GET_ASSISTANT_SETTINGS');
    if (settingsResp?.settings) ui.settings = settingsResp.settings;
    const portfolioResp = await send('GET_PORTFOLIO');
    if (portfolioResp?.portfolio) ui.portfolio = portfolioResp.portfolio;
    await loadBoard(false);
    pollDraft();
    setInterval(pollDraft, 400);
    setInterval(() => {
      if (!boardReady) {
        loadBoard(true, boardLoadAttempts);
      }
    }, 5000);
  }

  start();
})();
