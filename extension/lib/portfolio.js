(function (global) {
  const MAX_DRAFTS = 120;

  function playerKey(player) {
    return `${player?.name}|${player?.position}|${player?.team}`.toLowerCase();
  }

  function comboKey(a, b) {
    const keys = [playerKey(a), playerKey(b)].sort();
    return `${keys[0]}::${keys[1]}`;
  }

  function emptyStats() {
    return { drafts: [], playerCounts: {}, comboCounts: {}, totalDrafts: 0 };
  }

  function loadFromStorage(raw) {
    if (!raw || typeof raw !== 'object') {
      return emptyStats();
    }
    return {
      drafts: Array.isArray(raw.drafts) ? raw.drafts : [],
      playerCounts: raw.playerCounts || {},
      comboCounts: raw.comboCounts || {},
      totalDrafts: Number(raw.totalDrafts) || 0
    };
  }

  function recordDraft(stats, myRoster, meta = {}) {
    const next = loadFromStorage(stats);
    if (!myRoster?.length) {
      return next;
    }
    const draftId = meta.draftId || `draft-${Date.now()}`;
    const exists = next.drafts.some((d) => d.id === draftId);
    if (exists) {
      return next;
    }

    next.drafts.unshift({
      id: draftId,
      savedAt: Date.now(),
      picks: myRoster.map((p) => ({ name: p.name, position: p.position, team: p.team }))
    });
    next.drafts = next.drafts.slice(0, MAX_DRAFTS);
    next.totalDrafts = next.drafts.length;

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
    emptyStats,
    loadFromStorage,
    recordDraft,
    exposurePct,
    comboExposurePct,
    comboBreakdown,
    portfolioPenalty,
    playerKey,
    comboKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
