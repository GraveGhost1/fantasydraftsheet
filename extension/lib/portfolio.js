(function (global) {
  const MAX_DRAFTS = 2000;
  const MODES = ['season', 'daily'];
  const MIN_DAILY_PICKS = 4;
  const MAX_DAILY_PICKS = 10;
  const MIN_SEASON_PICKS = 8;

  function playerKey(player) {
    return `${player?.name}|${player?.position}|${player?.team}`.toLowerCase();
  }

  function comboKey(a, b) {
    const keys = [playerKey(a), playerKey(b)].sort();
    return `${keys[0]}::${keys[1]}`;
  }

  function rosterFingerprint(picks) {
    return (picks || [])
      .map((player) => `${String(player?.name || '').trim().toLowerCase()}|${String(player?.position || '').trim().toLowerCase()}`)
      .filter((key) => key !== '|')
      .sort()
      .join('::');
  }

  function normalizeMode(mode) {
    return mode === 'daily' ? 'daily' : 'season';
  }

  function inferModeFromPicks(picks) {
    const count = (picks || []).length;
    if (count >= 12) return 'season';
    if (count >= MIN_DAILY_PICKS && count <= MAX_DAILY_PICKS) return 'daily';
    return 'season';
  }

  function resolveDraftMode(picks, explicitMode) {
    if (explicitMode === 'daily' || explicitMode === 'season') return explicitMode;
    return inferModeFromPicks(picks);
  }

  function minPicksForMode(mode) {
    return normalizeMode(mode) === 'daily' ? MIN_DAILY_PICKS : MIN_SEASON_PICKS;
  }

  function draftMode(draft) {
    return resolveDraftMode(draft?.picks, draft?.mode);
  }

  function emptyImported() {
    return { season: null, daily: null };
  }

  function emptyStats() {
    return {
      drafts: [],
      playerCounts: {},
      comboCounts: {},
      totalDrafts: 0,
      source: null,
      updatedAt: null,
      importedExposure: false,
      importedByMode: emptyImported()
    };
  }

  function cloneImportedEntry(entry) {
    if (!entry || typeof entry !== 'object' || !entry.playerCounts) return null;
    return {
      playerCounts: { ...entry.playerCounts },
      totalDrafts: Number(entry.totalDrafts) || 0,
      source: entry.source || null,
      updatedAt: entry.updatedAt || null
    };
  }

  function loadImportedByMode(raw, drafts) {
    const imported = emptyImported();
    const stored = raw?.importedByMode;
    if (stored && typeof stored === 'object') {
      MODES.forEach((mode) => {
        imported[mode] = cloneImportedEntry(stored[mode]);
      });
    }
    const hasSeasonDrafts = (drafts || []).some((draft) => draftMode(draft) === 'season');
    if (
      raw?.importedExposure
      && raw.playerCounts
      && typeof raw.playerCounts === 'object'
      && Object.keys(raw.playerCounts).length
      && !hasSeasonDrafts
      && !imported.season
    ) {
      imported.season = {
        playerCounts: { ...raw.playerCounts },
        totalDrafts: Number(raw.totalDrafts) || 0,
        source: raw.source || null,
        updatedAt: raw.updatedAt || null
      };
    }
    return imported;
  }

  function slimPick(player) {
    if (!player || typeof player !== 'object') {
      return { name: '', position: '', team: '' };
    }
    const pick = {
      name: player.name,
      position: player.position,
      team: player.team
    };
    if (player.appearanceId) pick.appearanceId = String(player.appearanceId);
    return pick;
  }

  function isAccountDraft(draft) {
    return /^ud-/i.test(String(draft?.id || ''));
  }

  function slimDraft(draft) {
    if (!draft || typeof draft !== 'object') {
      return { id: '', savedAt: null, picks: [], mode: 'season' };
    }
    const rawPicks = Array.isArray(draft.picks) ? draft.picks : [];
    const tagged = draft.mode === 'daily' || draft.mode === 'season';
    if (tagged && rawPicks.every((player) => player && player.name && player.position)) {
      return {
        ...draft,
        slateId: draft.slateId ? String(draft.slateId) : '',
        slateTitle: draft.slateTitle || ''
      };
    }
    const picks = rawPicks.map(slimPick).filter((p) => p.name && p.position);
    return {
      id: String(draft.id || ''),
      savedAt: draft.savedAt || null,
      picks,
      mode: resolveDraftMode(picks, draft.mode),
      slateId: draft.slateId ? String(draft.slateId) : '',
      slateTitle: draft.slateTitle || ''
    };
  }

  function loadFromStorage(raw) {
    if (!raw || typeof raw !== 'object') {
      return emptyStats();
    }
    const drafts = Array.isArray(raw.drafts) ? raw.drafts.map(slimDraft) : [];
    return {
      drafts,
      playerCounts: raw.playerCounts || {},
      comboCounts: raw.comboCounts || {},
      totalDrafts: Number(raw.totalDrafts) || 0,
      source: raw.source || null,
      updatedAt: raw.updatedAt || null,
      importedExposure: Boolean(raw.importedExposure),
      importedByMode: loadImportedByMode(raw, drafts)
    };
  }

  function pruneImported(next) {
    MODES.forEach((mode) => {
      if ((next.drafts || []).some((draft) => draftMode(draft) === mode)) {
        next.importedByMode[mode] = null;
      }
    });
    next.importedExposure = Boolean(
      !next.drafts.length && (next.importedByMode.season || next.importedByMode.daily)
    );
    return next;
  }

  function rebuildCounts(stats, meta = {}) {
    const next = loadFromStorage(stats);
    next.playerCounts = {};
    next.comboCounts = {};
    next.drafts.forEach((draft) => {
      const picks = draft.picks || [];
      picks.forEach((player) => {
        const key = playerKey(player);
        next.playerCounts[key] = (next.playerCounts[key] || 0) + 1;
      });
      for (let i = 0; i < picks.length; i += 1) {
        for (let j = i + 1; j < picks.length; j += 1) {
          const key = comboKey(picks[i], picks[j]);
          next.comboCounts[key] = (next.comboCounts[key] || 0) + 1;
        }
      }
    });
    next.totalDrafts = next.drafts.length || Number(meta.totalDrafts) || 0;
    if (meta.source) next.source = meta.source;
    pruneImported(next);
    if (meta.importedExposure != null && next.drafts.length) {
      next.importedExposure = false;
    } else if (meta.importedExposure != null && !next.drafts.length) {
      next.importedExposure = Boolean(meta.importedExposure) || next.importedExposure;
    }
    next.updatedAt = Date.now();
    return next;
  }

  const forModeCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  function countDrafts(drafts, source) {
    const playerCounts = {};
    const comboCounts = {};
    (drafts || []).forEach((draft) => {
      const picks = draft?.picks || [];
      picks.forEach((player, i) => {
        if (!player?.name || !player?.position) return;
        const key = playerKey(player);
        playerCounts[key] = (playerCounts[key] || 0) + 1;
        for (let j = i + 1; j < picks.length; j += 1) {
          const other = picks[j];
          if (!other?.name || !other?.position) continue;
          const combo = comboKey(player, other);
          comboCounts[combo] = (comboCounts[combo] || 0) + 1;
        }
      });
    });
    return {
      drafts,
      playerCounts,
      comboCounts,
      totalDrafts: drafts.length,
      source: source || null,
      updatedAt: null,
      importedExposure: false,
      importedByMode: emptyImported()
    };
  }

  function computeForMode(stats, mode) {
    const normalized = normalizeMode(mode);
    const drafts = Array.isArray(stats?.drafts) ? stats.drafts : [];
    const filtered = drafts.filter((draft) => draftMode(draft) === normalized);
    if (filtered.length) {
      return countDrafts(filtered, stats?.source || null);
    }
    const imported = stats?.importedByMode?.[normalized];
    if (imported?.totalDrafts && imported.playerCounts) {
      return {
        drafts: [],
        playerCounts: imported.playerCounts,
        comboCounts: {},
        totalDrafts: imported.totalDrafts,
        source: imported.source,
        updatedAt: imported.updatedAt,
        importedExposure: true,
        importedByMode: emptyImported()
      };
    }
    return emptyStats();
  }

  function forMode(stats, mode) {
    const normalized = normalizeMode(mode);
    if (!stats || typeof stats !== 'object') {
      return emptyStats();
    }
    if (forModeCache) {
      let cached = forModeCache.get(stats);
      if (!cached) {
        cached = {};
        forModeCache.set(stats, cached);
      }
      if (!cached[normalized]) {
        cached[normalized] = computeForMode(stats, normalized);
      }
      return cached[normalized];
    }
    return computeForMode(stats, normalized);
  }

  function clearMode(stats, mode) {
    const normalized = normalizeMode(mode);
    const next = loadFromStorage(stats);
    next.drafts = next.drafts.filter((draft) => draftMode(draft) !== normalized);
    if (next.importedByMode) next.importedByMode[normalized] = null;
    return rebuildCounts(next, { source: next.source, importedExposure: false });
  }

  function countsFromIncoming(incoming, fallbackTotal) {
    if (incoming?.playerCounts && typeof incoming.playerCounts === 'object') {
      return {
        playerCounts: { ...incoming.playerCounts },
        totalDrafts: Number(incoming.totalDrafts) || Number(fallbackTotal) || 100
      };
    }
    const entries = Array.isArray(incoming) ? incoming : incoming?.entries || [];
    const totalDrafts = Number(incoming?.totalDrafts) || Number(fallbackTotal) || 100;
    const playerCounts = {};
    entries.forEach((entry) => {
      const key = playerKey(entry);
      playerCounts[key] = Math.round((Number(entry.exposurePct) / 100) * totalDrafts);
    });
    return { playerCounts, totalDrafts };
  }

  function applyImportedExposure(stats, incoming, { mode, totalDrafts, source } = {}) {
    const normalized = normalizeMode(mode);
    const next = loadFromStorage(stats);
    next.drafts = next.drafts.filter((draft) => draftMode(draft) !== normalized);
    const counted = countsFromIncoming(incoming, totalDrafts);
    const src = source || incoming?.source || 'csv';
    next.importedByMode[normalized] = {
      playerCounts: counted.playerCounts,
      totalDrafts: counted.totalDrafts,
      source: src,
      updatedAt: Date.now()
    };
    return rebuildCounts(next, { source: src, importedExposure: !next.drafts.length });
  }

  function mergeImportedByMode(target, other) {
    const next = loadFromStorage(target);
    const src = loadFromStorage(other);
    MODES.forEach((mode) => {
      if (next.drafts.some((draft) => draftMode(draft) === mode)) {
        next.importedByMode[mode] = null;
        return;
      }
      if (!next.importedByMode[mode] && src.importedByMode[mode]) {
        next.importedByMode[mode] = cloneImportedEntry(src.importedByMode[mode]);
      }
    });
    return pruneImported(next);
  }

  function recordDraft(stats, myRoster, meta = {}) {
    const next = loadFromStorage(stats);
    if (!myRoster?.length) {
      return next;
    }
    const picks = myRoster.map(slimPick).filter((p) => p.name && p.position);
    if (picks.length < minPicksForMode(meta.mode || inferModeFromPicks(picks))) {
      return next;
    }
    const draftId = String(meta.draftId || `draft-${Date.now()}`);
    const mode = resolveDraftMode(picks, meta.mode);
    const fingerprint = rosterFingerprint(picks);
    const existingIdx = next.drafts.findIndex((draft) => String(draft.id) === draftId);
    if (existingIdx >= 0) {
      const existing = next.drafts[existingIdx];
      if (draftMode(existing) === mode && rosterFingerprint(existing.picks) === fingerprint) {
        return next;
      }
      next.drafts[existingIdx] = {
        id: draftId,
        savedAt: Date.now(),
        picks,
        mode
      };
      return rebuildCounts(next, { source: meta.source || next.source || 'live', importedExposure: false });
    }
    if (next.drafts.some((draft) => draftMode(draft) === mode && rosterFingerprint(draft.picks) === fingerprint)) {
      return next;
    }

    next.drafts.unshift({
      id: draftId,
      savedAt: Date.now(),
      picks,
      mode
    });
    next.drafts = next.drafts.slice(0, MAX_DRAFTS);
    return rebuildCounts(next, { source: meta.source || next.source || 'live', importedExposure: false });
  }

  function compactDuplicateDrafts(stats) {
    const next = loadFromStorage(stats);
    const seenFp = new Set();
    const drafts = [];
    let removed = 0;
    next.drafts.forEach((draft) => {
      const fp = rosterFingerprint(draft.picks);
      const key = isAccountDraft(draft) ? `id:${draft.id}` : `${draftMode(draft)}::${fp}`;
      if ((!fp && !isAccountDraft(draft)) || seenFp.has(key)) {
        removed += 1;
        return;
      }
      seenFp.add(key);
      drafts.push(draft);
    });
    if (!removed) {
      return { stats: next, removed: 0 };
    }
    next.drafts = drafts;
    return {
      stats: rebuildCounts(next, { source: next.source, importedExposure: next.importedExposure }),
      removed
    };
  }

  function mergeDrafts(stats, incoming, meta = {}) {
    const compacted = compactDuplicateDrafts(stats);
    const next = compacted.stats;
    const seenIds = new Set(next.drafts.map((draft) => String(draft.id)));
    const seenFp = new Set(next.drafts.map((draft) => `${draftMode(draft)}::${rosterFingerprint(draft.picks)}`).filter((key) => !key.endsWith('::')));
    let added = 0;
    let skipped = 0;
    (incoming || []).forEach((draft, index) => {
      const id = String(draft.id || `sync-${Date.now()}-${index}`);
      const picks = (draft.picks || []).map(slimPick).filter((p) => (
        p.name && (p.position || isAccountDraft({ id }))
      ));
      const mode = resolveDraftMode(picks, draft.mode || meta.mode);
      if (picks.length < minPicksForMode(mode)) {
        skipped += 1;
        return;
      }
      const fingerprint = rosterFingerprint(picks);
      const sameRoster = !isAccountDraft({ id }) && seenFp.has(`${mode}::${fingerprint}`);
      if (seenIds.has(id) || sameRoster) {
        skipped += 1;
        return;
      }
      seenIds.add(id);
      if (fingerprint) seenFp.add(`${mode}::${fingerprint}`);
      added += 1;
      next.drafts.unshift({
        id,
        savedAt: draft.savedAt || Date.now(),
        picks,
        mode,
        slateId: draft.slateId ? String(draft.slateId) : '',
        slateTitle: draft.slateTitle || ''
      });
    });
    next.drafts = next.drafts.slice(0, meta.maxDrafts || MAX_DRAFTS);
    const result = added && next.drafts.length
      ? rebuildCounts(next, { source: meta.source || 'sync', importedExposure: false })
      : next;
    return { stats: result, added, skipped };
  }

  function fromExposureEntries(entries, { totalDrafts = 100, source = 'csv', mode = 'season' } = {}) {
    const next = emptyStats();
    const normalized = normalizeMode(mode);
    next.importedExposure = true;
    next.source = source;
    next.totalDrafts = Number(totalDrafts) || 100;
    next.updatedAt = Date.now();
    (entries || []).forEach((entry) => {
      const key = playerKey(entry);
      next.playerCounts[key] = Math.round((Number(entry.exposurePct) / 100) * next.totalDrafts);
    });
    next.importedByMode[normalized] = {
      playerCounts: { ...next.playerCounts },
      totalDrafts: next.totalDrafts,
      source,
      updatedAt: next.updatedAt
    };
    return next;
  }

  function exposurePct(stats, player) {
    const total = stats?.totalDrafts || 0;
    if (!total) return 0;
    const key = playerKey(player);
    return ((stats.playerCounts[key] || 0) / total) * 100;
  }

  function comboExposurePct(stats, player, myRoster) {
    const total = stats?.totalDrafts || 0;
    if (!total || !myRoster?.length) return 0;
    let hits = 0;
    myRoster.forEach((owned) => {
      const key = comboKey(player, owned);
      hits = Math.max(hits, stats.comboCounts[key] || 0);
    });
    return (hits / total) * 100;
  }

  function comboBreakdown(stats, player, myRoster, { minPct = 1 } = {}) {
    const total = stats?.totalDrafts || 0;
    if (!total || !player || !myRoster?.length) return [];
    return myRoster
      .map((owned) => {
        const key = comboKey(player, owned);
        const pct = ((stats.comboCounts[key] || 0) / total) * 100;
        return { owned, pct: Math.round(pct) };
      })
      .filter((row) => row.pct >= minPct)
      .sort((a, b) => b.pct - a.pct || a.owned.name.localeCompare(b.owned.name));
  }

  function prettyFromKey(stats, key) {
    for (const draft of stats?.drafts || []) {
      for (const player of draft.picks || []) {
        if (playerKey(player) === key) {
          return { name: player.name, position: player.position, team: player.team };
        }
      }
    }
    const [name, position, team] = String(key || '').split('|');
    const titled = String(name || '').replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
    return { name: titled, position: (position || '').toUpperCase(), team: (team || '').toUpperCase() };
  }

  function topExposures(stats, limit = 8) {
    const total = stats?.totalDrafts || 0;
    if (!total) return [];
    return Object.entries(stats.playerCounts || {})
      .map(([key, count]) => {
        const pretty = prettyFromKey(stats, key);
        return {
          name: pretty.name,
          position: pretty.position,
          team: pretty.team,
          count,
          pct: Math.round((count / total) * 1000) / 10
        };
      })
      .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  function topCombos(stats, limit = 8, { minCount = 2 } = {}) {
    const total = stats?.totalDrafts || 0;
    if (!total) return [];
    return Object.entries(stats.comboCounts || {})
      .filter(([, count]) => count >= minCount)
      .map(([key, count]) => {
        const [left, right] = key.split('::');
        return {
          a: prettyFromKey(stats, left),
          b: prettyFromKey(stats, right),
          count,
          pct: Math.round((count / total) * 1000) / 10
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, limit);
  }

  function listTeams(stats, mode, limit) {
    const normalized = normalizeMode(mode);
    const drafts = (loadFromStorage(stats).drafts || []).filter((draft) => draftMode(draft) === normalized);
    const cap = Number(limit) > 0 ? Number(limit) : drafts.length;
    return drafts.slice(0, cap).map((draft, index) => ({
      id: draft.id,
      index: index + 1,
      slateTitle: draft.slateTitle || (normalized === 'daily' ? 'Daily' : 'Season'),
      pickCount: (draft.picks || []).length,
      preview: (draft.picks || []).slice(0, 4).map((pick) => pick.name).filter(Boolean).join(', ')
    }));
  }

  function summarize(stats) {
    const next = loadFromStorage(stats);
    const comboCounts = Object.values(next.comboCounts || {});
    const seasonLineups = next.drafts.filter((draft) => draftMode(draft) === 'season').length;
    const dailyLineups = next.drafts.filter((draft) => draftMode(draft) === 'daily').length;
    const slates = {};
    next.drafts.forEach((draft) => {
      const mode = draftMode(draft);
      const title = draft.slateTitle || (mode === 'daily' ? 'Daily' : 'Season');
      const key = `${mode}::${draft.slateId || title}`;
      if (!slates[key]) slates[key] = { title, mode, count: 0 };
      slates[key].count += 1;
    });
    return {
      totalDrafts: next.totalDrafts || next.drafts.length || 0,
      lineupCount: next.drafts.length,
      seasonLineups,
      dailyLineups,
      slates: Object.values(slates).sort((a, b) => b.count - a.count),
      playerCount: Object.keys(next.playerCounts || {}).length,
      comboCount: comboCounts.length,
      repeatComboCount: comboCounts.filter((count) => count >= 2).length,
      hasLineups: next.drafts.length > 0,
      importedExposure: Boolean(next.importedExposure),
      source: next.source,
      updatedAt: next.updatedAt
    };
  }

  function serializeImportedByMode(imported) {
    const out = emptyImported();
    MODES.forEach((mode) => {
      out[mode] = cloneImportedEntry(imported?.[mode]);
    });
    return out;
  }

  function serializeForCloud(stats) {
    const next = loadFromStorage(stats);
    return {
      drafts: (next.drafts || []).slice(0, MAX_DRAFTS).map((draft) => ({
        id: draft.id,
        savedAt: draft.savedAt || Date.now(),
        picks: (draft.picks || []).map(slimPick).filter((p) => p.name && p.position),
        slateId: draft.slateId || '',
        slateTitle: draft.slateTitle || '',
        mode: draftMode(draft)
      })),
      importedByMode: serializeImportedByMode(next.importedByMode),
      source: next.source || 'cloud',
      updatedAt: next.updatedAt || Date.now()
    };
  }

  function fromCloud(raw) {
    const loaded = loadFromStorage(raw);
    if (!loaded.drafts.length) {
      return loaded;
    }
    return rebuildCounts(loaded, {
      source: loaded.source || 'cloud',
      importedExposure: false
    });
  }

  function formatUpdated(ts) {
    if (!ts) return 'Never';
    try {
      return new Date(ts).toLocaleString(undefined, {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (err) {
      return 'Unknown';
    }
  }

  function portfolioPenalty(player, myRoster, stats, weight, options = {}) {
    const scale = (weight ?? 40) / 100;
    const n = Number(stats?.totalDrafts) || 0;
    if (!scale || n <= 0) {
      return 0;
    }
    const daily = options.mode === 'daily';
    const shrink = daily ? 10 : 8;
    const trust = n / (n + shrink);
    const playerExp = exposurePct(stats, player) * trust;
    const comboExp = comboExposurePct(stats, player, myRoster) * trust;
    const fadeAt = daily ? 40 : 25;
    const extraAt = daily ? 65 : 40;
    let penalty = 0;
    if (playerExp > fadeAt) penalty += (playerExp - fadeAt) * 0.9;
    if (playerExp > extraAt) penalty += (playerExp - extraAt) * 1.2;
    if (comboExp > (daily ? 25 : 15)) penalty += (comboExp - (daily ? 25 : 15)) * 0.7;
    return penalty * scale;
  }

  global.FDSPortfolio = {
    MAX_DRAFTS,
    emptyStats,
    loadFromStorage,
    rebuildCounts,
    recordDraft,
    compactDuplicateDrafts,
    mergeDrafts,
    fromExposureEntries,
    applyImportedExposure,
    mergeImportedByMode,
    forMode,
    clearMode,
    normalizeMode,
    MIN_DAILY_PICKS,
    MAX_DAILY_PICKS,
    MIN_SEASON_PICKS,
    minPicksForMode,
    inferModeFromPicks,
    resolveDraftMode,
    draftMode,
    exposurePct,
    comboExposurePct,
    comboBreakdown,
    topExposures,
    topCombos,
    listTeams,
    summarize,
    serializeForCloud,
    fromCloud,
    formatUpdated,
    portfolioPenalty,
    playerKey,
    comboKey,
    rosterFingerprint
  };
})(typeof window !== 'undefined' ? window : globalThis);
