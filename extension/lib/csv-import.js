(function (global) {
  const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

  function splitLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  }

  function parseCsv(text) {
    return String(text || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(splitLine);
  }

  function headerIndex(headers, names) {
    const lower = headers.map((h) => h.toLowerCase());
    for (const name of names) {
      const idx = lower.indexOf(name.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function parseRankCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { players: [], error: 'Empty CSV' };

    const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
    const hasHeader = headerIndex(headers, ['player', 'name']) >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const rankIdx = hasHeader
      ? headerIndex(headers, ['rk', 'rank', 'myrank', 'overall'])
      : 0;
    const nameIdx = hasHeader
      ? headerIndex(headers, ['player', 'name'])
      : 1;
    const posIdx = hasHeader
      ? headerIndex(headers, ['pos', 'position'])
      : 2;
    const teamIdx = hasHeader
      ? headerIndex(headers, ['team', 'tm'])
      : 3;

    const players = [];
    dataRows.forEach((cells, index) => {
      const name = (cells[nameIdx >= 0 ? nameIdx : 1] || '').trim();
      const position = String(cells[posIdx >= 0 ? posIdx : 2] || '').toUpperCase().trim();
      const team = String(cells[teamIdx >= 0 ? teamIdx : 3] || '').toUpperCase().trim().slice(0, 3);
      const rankRaw = cells[rankIdx >= 0 ? rankIdx : 0];
      const rank = Number(String(rankRaw || '').replace(/[^\d.]/g, ''));
      if (!name || !SKILL.has(position) || !Number.isFinite(rank) || rank <= 0) return;
      players.push({
        name,
        position,
        team: team === 'WSH' ? 'WAS' : team,
        myRank: rank,
        rankIndex: index
      });
    });

    if (!players.length) {
      return { players: [], error: 'No valid rank rows found. Need columns like RK, Player, Pos, Team.' };
    }
    return { players, error: null };
  }

  function parseExposureCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { entries: [], error: 'Empty CSV' };

    const headers = rows[0].map((h) => h.trim());
    const hasHeader = headerIndex(headers, ['player', 'name']) >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const nameIdx = hasHeader ? headerIndex(headers, ['player', 'name']) : 0;
    const posIdx = hasHeader ? headerIndex(headers, ['pos', 'position']) : 1;
    const teamIdx = hasHeader ? headerIndex(headers, ['team', 'tm']) : 2;
    const expIdx = hasHeader
      ? headerIndex(headers, ['exposure', 'exposure%', 'own', 'ownership', 'drafted', 'percent'])
      : 3;

    const entries = [];
    dataRows.forEach((cells) => {
      const name = (cells[nameIdx >= 0 ? nameIdx : 0] || '').trim();
      const position = String(cells[posIdx >= 0 ? posIdx : 1] || '').toUpperCase().trim();
      const team = String(cells[teamIdx >= 0 ? teamIdx : 2] || '').toUpperCase().trim().slice(0, 3);
      let exposureRaw = expIdx >= 0 ? cells[expIdx] : cells[cells.length - 1];
      if (exposureRaw == null) return;
      exposureRaw = String(exposureRaw).replace('%', '').trim();
      const exposurePct = Number(exposureRaw);
      if (!name || !SKILL.has(position) || !Number.isFinite(exposurePct)) return;
      entries.push({
        name,
        position,
        team: team === 'WSH' ? 'WAS' : team,
        exposurePct: Math.max(0, Math.min(100, exposurePct))
      });
    });

    if (!entries.length) {
      return { entries: [], error: 'No exposure rows found. Need Player, Pos, Team, Exposure%.' };
    }
    return { entries, error: null };
  }

  function exposureToPortfolio(entries, { totalDrafts = 100, source = 'csv' } = {}) {
    if (global.FDSPortfolio?.fromExposureEntries) {
      return global.FDSPortfolio.fromExposureEntries(entries, { totalDrafts, source });
    }
    const portfolio = {
      drafts: [],
      playerCounts: {},
      comboCounts: {},
      totalDrafts,
      importedExposure: true,
      source,
      updatedAt: Date.now()
    };
    entries.forEach((entry) => {
      const key = `${entry.name}|${entry.position}|${entry.team}`.toLowerCase();
      portfolio.playerCounts[key] = Math.round((entry.exposurePct / 100) * totalDrafts);
    });
    return portfolio;
  }

  function parseLineupCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { drafts: [], error: 'Empty CSV' };

    const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
    const draftIdx = headerIndex(headers, ['draft_id', 'draftid', 'draft', 'entry', 'entry_id', 'lineup', 'team_id']);
    const nameIdx = headerIndex(headers, ['player', 'name']);
    if (draftIdx < 0 || nameIdx < 0) {
      return { drafts: [], error: 'Need Draft ID and Player columns for lineup import.' };
    }

    const posIdx = headerIndex(headers, ['pos', 'position']);
    const teamIdx = headerIndex(headers, ['team', 'tm']);
    const byId = new Map();
    rows.slice(1).forEach((cells) => {
      const draftId = String(cells[draftIdx] || '').trim();
      const name = String(cells[nameIdx] || '').trim();
      const position = String(cells[posIdx >= 0 ? posIdx : 2] || '').toUpperCase().trim();
      const team = String(cells[teamIdx >= 0 ? teamIdx : 3] || '').toUpperCase().trim().slice(0, 3);
      if (!draftId || !name || !SKILL.has(position)) return;
      if (!byId.has(draftId)) byId.set(draftId, []);
      byId.get(draftId).push({
        name,
        position,
        team: team === 'WSH' ? 'WAS' : team
      });
    });

    const drafts = [...byId.entries()]
      .filter(([, picks]) => picks.length >= 8)
      .map(([id, picks]) => ({ id, savedAt: Date.now(), picks }));

    if (!drafts.length) {
      return { drafts: [], error: 'No complete lineups found. Need 8+ skill players per Draft ID.' };
    }
    return { drafts, error: null };
  }

  function parsePortfolioCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { kind: null, error: 'Empty CSV' };
    const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
    const hasDraft = headerIndex(headers, ['draft_id', 'draftid', 'draft', 'entry', 'entry_id', 'lineup', 'team_id']) >= 0;
    if (hasDraft) {
      const parsed = parseLineupCsv(text);
      if (parsed.error) return { kind: 'lineups', error: parsed.error };
      return { kind: 'lineups', drafts: parsed.drafts, error: null };
    }
    const parsed = parseExposureCsv(text);
    if (parsed.error) return { kind: 'exposure', error: parsed.error };
    return { kind: 'exposure', entries: parsed.entries, error: null };
  }

  global.FDSCsvImport = {
    parseRankCsv,
    parseExposureCsv,
    parseLineupCsv,
    parsePortfolioCsv,
    exposureToPortfolio
  };
})(typeof window !== 'undefined' ? window : globalThis);
