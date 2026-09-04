(function (global) {
  const MAX_DRAFTS = 2000;

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

  function emptyStats() {
    return {
      drafts: [],
      playerCounts: {},
      comboCounts: {},
      totalDrafts: 0,
      source: null,
      updatedAt: null,
      importedExposure: false
    };
  }

  function loadFromStorage(raw) {
    if (!raw || typeof raw !== 'object') {
      return emptyStats();
    }
    return {
      drafts: Array.isArray(raw.drafts) ? raw.drafts : [],
      playerCounts: raw.playerCounts || {},
      comboCounts: raw.comboCounts || {},
      totalDrafts: Number(raw.totalDrafts) || 0,
      source: raw.source || null,
      updatedAt: raw.updatedAt || null,
      importedExposure: Boolean(raw.importedExposure)
    };
  }

  function slimPick(player) {
    return {
      name: player.name,
      position: player.position,
      team: player.team
    };
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
    if (meta.importedExposure != null) next.importedExposure = Boolean(meta.importedExposure);
    next.updatedAt = Date.now();
    return next;
  }

  function recordDraft(stats, myRoster, meta = {}) {
    const next = loadFromStorage(stats);
    if (!myRoster?.length) {
      return next;
    }
    const picks = myRoster.map(slimPick);
    const draftId = meta.draftId || `draft-${Date.now()}`;
    const fingerprint = rosterFingerprint(picks);
    if (next.drafts.some((d) => d.id === draftId || rosterFingerprint(d.picks) === fingerprint)) {
      return next;
    }

    next.drafts.unshift({
      id: draftId,
      savedAt: Date.now(),
      picks
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
      if (!fp || seenFp.has(fp)) {
        removed += 1;
        return;
      }
      seenFp.add(fp);
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
    const seenIds = new Set(next.drafts.map((d) => String(d.id)));
    const seenFp = new Set(next.drafts.map((d) => rosterFingerprint(d.picks)).filter(Boolean));
    let added = 0;
    let skipped = 0;
    (incoming || []).forEach((draft, index) => {
      const picks = (draft.picks || []).map(slimPick).filter((p) => p.name && p.position);
      if (picks.length < 8) {
        skipped += 1;
        return;
      }
      const id = String(draft.id || `sync-${Date.now()}-${index}`);
      const fingerprint = rosterFingerprint(picks);
      if (seenIds.has(id) || seenFp.has(fingerprint)) {
        skipped += 1;
        return;
      }
      seenIds.add(id);
      seenFp.add(fingerprint);
      added += 1;
      next.drafts.unshift({ id, savedAt: draft.savedAt || Date.now(), picks });
    });
    next.drafts = next.drafts.slice(0, meta.maxDrafts || MAX_DRAFTS);
    const result = added && next.drafts.length
      ? rebuildCounts(next, { source: meta.source || 'sync', importedExposure: false })
      : next;
    return { stats: result, added, skipped };
  }

  function fromExposureEntries(entries, { totalDrafts = 100, source = 'csv' } = {}) {
    const next = emptyStats();
    next.importedExposure = true;
    next.source = source;
    next.totalDrafts = Number(totalDrafts) || 100;
    next.updatedAt = Date.now();
    (entries || []).forEach((entry) => {
      const key = playerKey(entry);
      next.playerCounts[key] = Math.round((Number(entry.exposurePct) / 100) * next.totalDrafts);
    });
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

  function summarize(stats) {
    const next = loadFromStorage(stats);
    const comboCounts = Object.values(next.comboCounts || {});
    return {
      totalDrafts: next.totalDrafts || next.drafts.length || 0,
      lineupCount: next.drafts.length,
      playerCount: Object.keys(next.playerCounts || {}).length,
      comboCount: comboCounts.length,
      repeatComboCount: comboCounts.filter((count) => count >= 2).length,
      hasLineups: next.drafts.length > 0,
      importedExposure: Boolean(next.importedExposure),
      source: next.source,
      updatedAt: next.updatedAt
    };
  }

  function serializeForCloud(stats) {
    const next = loadFromStorage(stats);
    return {
      drafts: (next.drafts || []).slice(0, MAX_DRAFTS).map((draft) => ({
        id: draft.id,
        savedAt: draft.savedAt || Date.now(),
        picks: (draft.picks || []).map(slimPick).filter((p) => p.name && p.position)
      })),
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

  function portfolioPenalty(player, myRoster, stats, weight) {
    const scale = (weight ?? 40) / 100;
    if (!scale || !stats?.totalDrafts) {
      return 0;
    }
    const playerExp = exposurePct(stats, player);
    const comboExp = comboExposurePct(stats, player, myRoster);
    let penalty = 0;
    if (playerExp > 25) penalty += (playerExp - 25) * 0.9;
    if (playerExp > 40) penalty += (playerExp - 40) * 1.2;
    if (comboExp > 15) penalty += (comboExp - 15) * 0.7;
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
    exposurePct,
    comboExposurePct,
    comboBreakdown,
    topExposures,
    topCombos,
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
