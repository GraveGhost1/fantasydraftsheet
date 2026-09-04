(function (global) {
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
  const CHART_HEIGHT = 110;

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pct(value, max) {
    if (!max) return 0;
    return Math.max(0, Math.min(100, (Number(value) || 0) / max * 100));
  }

  function columnHtml(pos, item, chartMax, compact) {
    const spent = item?.value ?? 0;
    const low = item?.capitalLow ?? 0;
    const high = item?.capitalHigh ?? 0;
    const height = compact ? 88 : CHART_HEIGHT;
    const fillHeight = pct(spent, chartMax);
    const bandBottom = pct(low, chartMax);
    const bandHeight = Math.max(6, pct(high, chartMax) - bandBottom);
    const state = item?.state || 'need';
    const countLabel = `${item?.count ?? 0} of ${item?.countMin ?? 0}–${item?.countMax ?? 0}`;
    return `
      <div class="fds-cap-col is-${state}">
        <div class="fds-cap-chart" style="height:${height}px">
          <div class="fds-cap-band" style="bottom:${bandBottom}%;height:${bandHeight}%" title="Suggested ${low}–${high}"></div>
          <div class="fds-cap-fill ${pos} is-${state}" style="height:${fillHeight}%"></div>
        </div>
        <div class="fds-cap-pos">${pos}</div>
        <div class="fds-cap-pct">${countLabel}</div>
        ${compact ? '' : `<div class="fds-cap-val">${spent} / ${low}–${high}</div>`}
        <div class="fds-cap-chip is-${state}">${escapeHtml(item?.reason || '')}</div>
      </div>
    `;
  }

  function renderColumns(capital, { title = 'Draft capital allocation', compact = false } = {}) {
    if (!capital?.byPosition) {
      return `<div class="fds-cap-chart-wrap"><h3>${escapeHtml(title)}</h3><div class="fds-cap-empty">Draft players to track capital.</div></div>`;
    }
    const chartMax = capital.chartMax
      || Math.max(...POSITIONS.map((pos) => Math.max(
        capital.byPosition[pos]?.value || 0,
        capital.byPosition[pos]?.capitalHigh || 0
      )), 1);
    const cols = POSITIONS.map((pos) => columnHtml(pos, capital.byPosition[pos], chartMax, compact)).join('');
    const messageClass = /next picks should fill/i.test(capital.message || '')
      ? 'is-pivot'
      : /still need/i.test(capital.message || '')
        ? 'is-need'
        : 'is-ok';
    const message = capital.message
      ? `<p class="fds-cap-message ${messageClass}">${escapeHtml(capital.message)}</p>`
      : '';
    return `
      <div class="fds-cap-chart-wrap">
        <h3>${escapeHtml(title)}</h3>
        ${message}
        <div class="fds-cap-cols">${cols}</div>
        <p class="fds-cap-legend">Bar = capital spent · shaded band = suggested range</p>
      </div>
    `;
  }

  function renderRows(capital) {
    if (!capital?.byPosition) return '';
    const chartMax = capital.chartMax
      || Math.max(...POSITIONS.map((pos) => Math.max(
        capital.byPosition[pos]?.value || 0,
        capital.byPosition[pos]?.capitalHigh || 0
      )), 1);
    return POSITIONS.map((pos) => {
      const item = capital.byPosition[pos];
      const fillWidth = pct(item?.value, chartMax);
      const bandLeft = pct(item?.capitalLow, chartMax);
      const bandWidth = Math.max(8, pct(item?.capitalHigh, chartMax) - bandLeft);
      const state = item?.state || 'need';
      return `
        <div class="fds-cap-row-v is-${state}">
          <strong>${pos}</strong>
          <div class="fds-cap-row-track">
            <div class="fds-cap-row-band" style="left:${bandLeft}%;width:${bandWidth}%"></div>
            <div class="fds-cap-row-fill ${pos} is-${state}" style="width:${fillWidth}%"></div>
          </div>
          <div class="fds-cap-row-meta">${item.count} of ${item.countMin}–${item.countMax}</div>
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
