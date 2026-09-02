(function (global) {
  const STYLE_ID = 'fds-host-highlight-style';
  const MARK = 'fds-host-heat';
  const CAPITAL_ID = 'fds-capital-host';

  const CSS = `
    .fds-host-heat {
      position: relative !important;
    }
    .fds-host-heat-best {
      background: rgba(34, 197, 94, 0.38) !important;
      box-shadow: inset 0 0 0 2px rgba(34, 197, 94, 0.85) !important;
    }
    .fds-host-heat-good {
      background: rgba(132, 204, 22, 0.28) !important;
      box-shadow: inset 0 0 0 2px rgba(132, 204, 22, 0.7) !important;
    }
    .fds-host-heat-ok {
      background: rgba(249, 115, 22, 0.30) !important;
      box-shadow: inset 0 0 0 2px rgba(249, 115, 22, 0.75) !important;
    }
    .fds-host-heat-fade {
      background: rgba(239, 68, 68, 0.22) !important;
      box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.55) !important;
    }
    .fds-host-heat[data-fds-rec-label]::after {
      content: attr(data-fds-rec-label);
      position: absolute;
      left: 8px;
      top: -9px;
      font: 700 10px/1 "Segoe UI", sans-serif;
      color: #052e16;
      background: #86efac;
      padding: 3px 6px;
      border-radius: 999px;
      pointer-events: none;
      z-index: 3;
    }
    #fds-capital-host {
      position: fixed;
      left: 18px;
      bottom: 16px;
      z-index: 2147483645;
      width: 280px;
      padding: 12px 14px 10px;
      border-radius: 14px;
      background: rgba(10, 14, 20, 0.94);
      border: 1px solid rgba(255,255,255,0.12);
      color: #f9fafb;
      font: 12px/1.3 "Segoe UI", Tahoma, sans-serif;
      box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    }
    #fds-capital-host .fds-cap-chart-wrap h3 {
      margin: 0 0 8px;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #9ca3af;
    }
    #fds-capital-host .fds-cap-chart {
      position: relative;
      width: 100%;
      border-radius: 8px 8px 0 0;
      overflow: hidden;
      background: rgba(255,255,255,0.06);
    }
    #fds-capital-host .fds-cap-target {
      position: absolute;
      inset: 0;
      border: 2px dashed rgba(161, 161, 170, 0.75);
      border-radius: 6px;
      box-sizing: border-box;
      pointer-events: none;
      z-index: 2;
    }
    #fds-capital-host .fds-cap-legend {
      margin-top: 6px;
      font-size: 9px;
    }
    #fds-capital-host .fds-cap-cols {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 8px;
      height: 120px;
    }
    #fds-capital-host .fds-cap-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    #fds-capital-host .fds-cap-fill {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      border-radius: 6px 6px 0 0;
      z-index: 1;
    }
    #fds-capital-host .fds-cap-fill.QB { background: #a855f7; }
    #fds-capital-host .fds-cap-fill.RB { background: #22c55e; }
    #fds-capital-host .fds-cap-fill.WR { background: #f97316; }
    #fds-capital-host .fds-cap-fill.TE { background: #3b82f6; }
    #fds-capital-host .fds-cap-fill.is-over {
      box-shadow: inset 0 0 0 2px rgba(251, 191, 36, 0.85);
    }
    #fds-capital-host .fds-cap-pos { font-weight: 800; font-size: 11px; }
    #fds-capital-host .fds-cap-pct { font-size: 12px; font-weight: 700; }
    #fds-capital-host .fds-cap-val { font-size: 10px; color: #9ca3af; }
  `;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.documentElement.appendChild(style);
  }

  function isTestRoom() {
    return Boolean(document.querySelector('[data-fds-test-room]'));
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
      ...document.querySelectorAll('.ud-player-row, [class*="player-row"]'),
      ...document.querySelectorAll('[data-testid*="player" i], [data-testid*="draft" i]'),
      ...document.querySelectorAll('[class*="DraftPlayer"], [class*="draft-player"], [class*="PlayerRow"], [class*="player-row"]'),
      ...document.querySelectorAll('[class*="player"], [class*="Player"], [role="row"], [role="option"], li, tr, button')
    ];
    const uniq = [];
    const seen = new Set();
    selected.forEach((node) => {
      if (seen.has(node) || isOurUi(node)) return;
      seen.add(node);
      uniq.push(node);
    });
    return uniq.slice(0, 700);
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
    if (text.length < 6 || text.length > 160) {
      return false;
    }
    const compact = global.FDSPlayerMatch.normalizeName(text);
    return global.FDSPlayerMatch.getNameMatchKeys(player.name).some((key) => {
      return key.length >= 8 && compact.includes(key);
    });
  }

  function paintTarget(node) {
    return node.closest?.('[data-fds-player], .ud-player-row, .player-row, li, tr, [role="row"], [role="option"]') || node;
  }

  function renderCapital(capital) {
    if (isTestRoom()) return;
    if (!global.FDSCapitalChart) return;
    let host = document.getElementById(CAPITAL_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = CAPITAL_ID;
      document.documentElement.appendChild(host);
    }
    host.innerHTML = global.FDSCapitalChart.renderColumns(capital, { title: 'Draft capital' });
  }

  function paint({ recs = [], heat = [], capital = null } = {}) {
    if (!global.FDSPlayerMatch) return;
    ensureStyle();
    clearHeat();
    const nodes = candidateNodes();
    const recLabel = new Map();
    recs.forEach((rec, index) => {
      recLabel.set(`${rec.player.name}|${rec.player.position}`, `REC ${index + 1} · ${rec.displayScore}`);
    });

    heat.slice(0, 80).forEach((item) => {
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

    if (capital) {
      renderCapital(capital);
    }
  }

  function clear() {
    clearHeat();
    if (!isTestRoom()) {
      document.getElementById(CAPITAL_ID)?.remove();
    }
  }

  global.FDSHostHighlight = { paint, clear };
})(typeof window !== 'undefined' ? window : globalThis);
