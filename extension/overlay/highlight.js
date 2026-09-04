(function (global) {
  const STYLE_ID = 'fds-host-highlight-style';
  const CHART_CSS_ID = 'fds-host-chart-css';
  const MARK = 'fds-host-heat';
  const CAPITAL_ID = 'fds-capital-host';

  const CSS = `
    .fds-host-heat {
      position: relative !important;
    }
    .fds-host-heat-best {
      background: rgba(37, 99, 235, 0.42) !important;
      box-shadow: inset 5px 0 0 #2563eb !important;
    }
    .fds-host-heat-good {
      background: rgba(168, 85, 247, 0.36) !important;
      box-shadow: inset 5px 0 0 #a855f7 !important;
    }
    .fds-host-heat-ok {
      background: rgba(168, 85, 247, 0.22) !important;
      box-shadow: inset 5px 0 0 #c084fc !important;
    }
    .fds-host-heat-fade {
      background: rgba(236, 72, 153, 0.28) !important;
      box-shadow: inset 5px 0 0 #ec4899 !important;
    }
    .fds-host-heat[data-fds-rec-label]::after {
      content: attr(data-fds-rec-label);
      position: absolute;
      left: 8px;
      top: -9px;
      font: 700 10px/1 "Segoe UI", sans-serif;
      color: #eff6ff;
      background: #2563eb;
      padding: 3px 6px;
      border-radius: 999px;
      pointer-events: none;
      z-index: 3;
    }
    .fds-host-name-line,
    .name-line {
      display: flex !important;
      align-items: center;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
    }
    .fds-host-rank,
    .fds-rank-inline {
      font-weight: 800;
      font-size: 12px;
      color: #60a5fa;
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }
    .fds-host-exp,
    .fds-exp-pill {
      margin-left: auto;
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 700;
      color: #e5e7eb;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      padding: 2px 7px;
      font-variant-numeric: tabular-nums;
    }
    .ud-player-row .fds-rank-inline,
    .player-row .fds-rank-inline {
      color: #2563eb;
    }
    .ud-player-row .fds-exp-pill,
    .player-row .fds-exp-pill,
    .ud-player-row .fds-host-exp,
    .player-row .fds-host-exp {
      color: #1e3a5f;
      background: #e2e8f0;
      border-color: #cbd5e1;
    }
    .fds-host-hide-rank-col {
      display: none !important;
    }
    #fds-capital-host {
      margin: 12px 12px 16px;
      padding: 14px;
      border-radius: 12px;
      background: rgba(17, 24, 39, 0.94);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f9fafb;
      font: 13px/1.4 "Segoe UI", system-ui, sans-serif;
    }
    #fds-capital-host h3 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9ca3af;
    }
    #fds-capital-host .fds-playoff-table {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      overflow-x: auto;
    }
  `;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.documentElement.appendChild(style);
  }

  function ensureChartCss() {
    if (document.getElementById(CHART_CSS_ID) || document.querySelector('link[href*="capital-chart.css"]')) {
      return;
    }
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return;
      const link = document.createElement('link');
      link.id = CHART_CSS_ID;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('overlay/capital-chart.css');
      document.documentElement.appendChild(link);
    } catch (err) {
      /* test pages already include the stylesheet */
    }
  }

  function isOurUi(node) {
    return Boolean(
      node.closest?.('#fds-draft-assistant-root') ||
      node.closest?.('#fds-capital-host')
    );
  }

  function clearHeat() {
    document.querySelectorAll('.' + MARK).forEach((node) => {
      node.classList.remove(MARK, `${MARK}-best`, `${MARK}-good`, `${MARK}-ok`, `${MARK}-fade`);
      node.removeAttribute('data-fds-rec-label');
      node.removeAttribute('data-fds-heat');
    });
  }

  function candidateNodes() {
    const selected = [
      ...document.querySelectorAll('[data-fds-player]'),
      ...document.querySelectorAll('.ud-player-row, [class*="player-row" i], [class*="PlayerRow"]'),
      ...document.querySelectorAll('[data-testid*="player" i], [data-testid*="draft" i]'),
      ...document.querySelectorAll('[class*="DraftPlayer"], [class*="draft-player"], [class*="PlayerCard"]'),
      ...document.querySelectorAll('[class*="available" i] [class*="player" i]'),
      ...document.querySelectorAll('[role="row"], [role="option"], li, tr, button')
    ];
    const uniq = [];
    const seen = new Set();
    selected.forEach((node) => {
      if (seen.has(node) || isOurUi(node)) return;
      seen.add(node);
      uniq.push(node);
    });
    return uniq.slice(0, 900);
  }

  function nodeMatches(node, player) {
    const labeled = node.getAttribute?.('data-fds-player');
    if (labeled) {
      return global.FDSPlayerMatch.namesMatch(labeled, player.name);
    }
    if (node.closest?.('[data-fds-player]')) {
      return false;
    }
    const text = `${node.textContent || ''}`.replace(/\s+/g, ' ').trim();
    if (text.length < 4 || text.length > 280) {
      return false;
    }
    const compact = global.FDSPlayerMatch.normalizeName(text);
    return global.FDSPlayerMatch.getNameMatchKeys(player.name).some((key) => {
      return key.length >= 5 && compact.includes(key);
    });
  }

  function paintTarget(node) {
    return node.closest?.('[data-fds-player], .ud-player-row, .player-row, li, tr, [role="row"], [role="option"], button') || node;
  }

  function matchPlayer(node, players) {
    if (!players?.length || !global.FDSPlayerMatch) return null;
    const labeled = node.getAttribute?.('data-fds-player');
    if (labeled) {
      return players.find((player) => global.FDSPlayerMatch.namesMatch(labeled, player.name)) || null;
    }
    return players.find((player) => nodeMatches(node, player)) || null;
  }

  function nameAnchor(row) {
    return row.querySelector?.('.name-line, .fds-host-name-line, .info strong, [class*="player-name" i], [class*="PlayerName"]')
      || row.querySelector?.('strong');
  }

  function exposureFor(player, portfolio) {
    if (!player || !portfolio || !global.FDSPortfolio?.exposurePct || !portfolio.totalDrafts) return null;
    const pct = Number(global.FDSPortfolio.exposurePct(portfolio, player));
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return Math.round(pct * 10) / 10;
  }

  function setRank(row, rank) {
    const label = rank || '—';
    const existing = row.querySelector('.fds-rank-inline, .fds-host-rank');
    if (existing) {
      existing.textContent = label;
      row.querySelector('.rank-num')?.classList.add('fds-host-hide-rank-col');
      return;
    }
    const anchor = nameAnchor(row);
    if (!anchor) return;
    const span = document.createElement('span');
    span.className = 'fds-host-rank';
    span.textContent = label;
    if (anchor.classList.contains('name-line')) {
      const nameEl = anchor.querySelector('strong') || anchor;
      nameEl.after(span);
    } else {
      anchor.classList.add('fds-host-name-line');
      anchor.appendChild(span);
    }
    row.querySelector('.rank-num')?.classList.add('fds-host-hide-rank-col');
  }

  function setExposure(row, pct) {
    let pill = row.querySelector('[data-fds-exp-slot], .fds-host-exp, .fds-exp-pill');
    if (pct == null) {
      if (pill?.hasAttribute?.('data-fds-exp-slot')) {
        pill.hidden = true;
        pill.textContent = '';
      }
      return;
    }
    const label = Number.isInteger(pct) ? `${pct}%` : `${pct}%`;
    if (pill) {
      pill.hidden = false;
      pill.textContent = label;
      return;
    }
    const anchor = nameAnchor(row);
    if (!anchor) return;
    if (!anchor.classList.contains('name-line')) {
      anchor.classList.add('fds-host-name-line');
    }
    pill = document.createElement('span');
    pill.className = 'fds-host-exp';
    pill.textContent = label;
    anchor.appendChild(pill);
  }

  function isMetaRow(node) {
    if (!node || isOurUi(node)) return false;
    if (node.closest?.('#ticker, .ticker, .pick-card, .queue-box, .roster-list, .fds-playoff-table')) return false;
    if (node.matches?.('.ud-player-row, .player-row, [data-fds-player]')) return true;
    if (node.querySelector?.('.name-line, .info, [class*="player-name" i]')) return true;
    const text = `${node.textContent || ''}`.replace(/\s+/g, ' ').trim();
    return text.length >= 8 && text.length <= 160 && /\b(QB|RB|WR|TE)\b/.test(text);
  }

  function injectRowMeta(players, portfolio) {
    if (!players?.length) return;
    const painted = new Set();
    candidateNodes().forEach((node) => {
      const target = paintTarget(node);
      if (painted.has(target) || isOurUi(target) || !isMetaRow(target)) return;
      const player = matchPlayer(node, players) || matchPlayer(target, players);
      if (!player) return;
      painted.add(target);
      setRank(target, player.myRank);
      setExposure(target, exposureFor(player, portfolio));
    });
  }

  function findQueueColumn() {
    const testCapital = document.getElementById('capital-block');
    if (testCapital) return null;
    const queue = document.getElementById('queue')
      || document.querySelector('.queue-box, [class*="Queue"]');
    if (queue) {
      return queue.closest('section, [class*="col"], [class*="column"], [class*="panel"]') || queue.parentElement;
    }
    const heading = [...document.querySelectorAll('h1, h2, h3, h4, [class*="title" i], [class*="header" i]')]
      .find((el) => /^\s*queue\s*$/i.test((el.textContent || '').trim()));
    if (heading) {
      return heading.closest('section, [class*="col"], [class*="column"], [class*="panel"]') || heading.parentElement;
    }
    return null;
  }

  function mountCenterWidgets({ capital, myRoster }) {
    if (document.getElementById('playoff-block') || document.getElementById('capital-block')) {
      document.getElementById(CAPITAL_ID)?.remove();
      return;
    }
    const mount = findQueueColumn();
    if (!mount) {
      document.getElementById(CAPITAL_ID)?.remove();
      return;
    }
    ensureChartCss();
    let host = document.getElementById(CAPITAL_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = CAPITAL_ID;
      mount.appendChild(host);
    }
    const capHtml = global.FDSCapitalChart?.renderColumns
      ? global.FDSCapitalChart.renderColumns(capital, { title: 'Draft capital allocation', compact: true })
      : '';
    const poHtml = global.FDSPlayoffSchedule?.renderMatchupTable?.(myRoster) || '';
    host.innerHTML = `${capHtml}${poHtml}`;
  }

  function paint({ recs = [], heat = [], players = [], myRoster = [], capital = null, portfolio = null } = {}) {
    if (!global.FDSPlayerMatch) return;
    ensureStyle();
    clearHeat();
    const nodes = candidateNodes();
    const recLabel = new Map();
    recs.forEach((rec, index) => {
      recLabel.set(`${rec.player.name}|${rec.player.position}`, `REC ${index + 1} · ${rec.displayScore}`);
    });

    heat.slice(0, 160).forEach((item) => {
      const painted = new Set();
      nodes.forEach((node) => {
        if (!nodeMatches(node, item.player)) return;
        const target = paintTarget(node);
        if (painted.has(target) || isOurUi(target)) return;
        painted.add(target);
        target.classList.add(MARK, `${MARK}-${item.heat}`);
        target.setAttribute('data-fds-heat', item.heat);
        const key = `${item.player.name}|${item.player.position}`;
        if (recLabel.has(key)) {
          target.setAttribute('data-fds-rec-label', recLabel.get(key));
        }
      });
    });

    injectRowMeta(players, portfolio);
    mountCenterWidgets({ capital, myRoster });
  }

  function clear() {
    clearHeat();
    document.getElementById(CAPITAL_ID)?.remove();
  }

  global.FDSHostHighlight = { paint, clear };
})(typeof window !== 'undefined' ? window : globalThis);
