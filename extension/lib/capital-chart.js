(function (global) {
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
  const CHART_HEIGHT = 100;

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function columnHtml(pos, item, maxTargetValue) {
    const spent = item?.spentPct ?? item?.pct ?? 0;
    const value = item?.value ?? 0;
    const targetValue = item?.targetValue ?? 0;
    const fillHeight = Math.max(0, Math.min(100, spent));
    const over = spent > 100;
    const chartHeight = Math.max(36, Math.round(CHART_HEIGHT * (targetValue / maxTargetValue)));
    return `
      <div class="fds-cap-col">
        <div class="fds-cap-chart" style="height:${chartHeight}px">
          <div class="fds-cap-target" title="Target ${targetValue} capital"></div>
          <div class="fds-cap-fill ${pos}${over ? ' is-over' : ''}" style="height:${fillHeight}%"></div>
        </div>
        <div class="fds-cap-pos">${pos}</div>
        <div class="fds-cap-pct">${spent}%</div>
        <div class="fds-cap-val">${value}</div>
      </div>
    `;
  }

  function renderColumns(capital, { title = 'Draft capital allocation' } = {}) {
    if (!capital?.byPosition) {
      return `<div class="fds-cap-chart-wrap"><h3>${escapeHtml(title)}</h3><div class="fds-cap-empty">Draft players to track capital.</div></div>`;
    }
    const maxTarget = capital.maxTargetValue
      || Math.max(...POSITIONS.map((pos) => capital.byPosition[pos]?.targetValue || 0), 1);
    const cols = POSITIONS.map((pos) => columnHtml(pos, capital.byPosition[pos], maxTarget)).join('');
    return `
      <div class="fds-cap-chart-wrap">
        <h3>${escapeHtml(title)}</h3>
        <div class="fds-cap-cols">${cols}</div>
        <p class="fds-cap-legend">Colored = current capital · dashed = target budget</p>
      </div>
    `;
  }

  function renderRows(capital) {
    if (!capital?.byPosition) return '';
    return POSITIONS.map((pos) => {
      const item = capital.byPosition[pos];
      const spent = item?.spentPct ?? 0;
      const value = item?.value ?? 0;
      const fillWidth = Math.max(0, Math.min(100, spent));
      const over = spent > 100;
      return `
        <div class="fds-cap-row-v">
          <strong>${pos}</strong>
          <div class="fds-cap-row-track">
            <div class="fds-cap-row-target" title="Target ${item.targetValue}"></div>
            <div class="fds-cap-row-fill ${pos}${over ? ' is-over' : ''}" style="width:${fillWidth}%"></div>
          </div>
          <div class="fds-cap-row-meta">${spent}% · ${value}</div>
        </div>
      `;
    }).join('');
  }

  global.FDSCapitalChart = {
    POSITIONS,
    columnHtml,
    renderColumns,
    renderRows
  };
})(typeof window !== 'undefined' ? window : globalThis);
