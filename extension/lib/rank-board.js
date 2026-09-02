(function (global) {
  const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);
  const TOTAL_PICKS = 18;
  const DEFAULT_TEAM_SIZE = 12;
  const DEFAULT_TARGETS = { QB: 2, RB: 6, WR: 8, TE: 2 };
  const DEFAULT_MAX = { QB: 3, RB: 8, WR: 10, TE: 3 };
  const EARLY_PICK_MAX = 24;
  const POSITIONAL_NEED_MIN_PICK = 13;
  const TOP_RANK_CONTRARIAN_CUTOFF = 36;

  function clonePlayers(players) {
    return (players || []).map((player) => ({ ...player, drafted: false, draftedByMe: false, stack: false, bringBack: false }));
  }

  function findPlayer(players, pick) {
    const match = global.FDSPlayerMatch;
    const pickName = pick?.name || pick?.playerName || '';
    const pickPos = match.normalizePosition(pick?.position);
    const pickTeam = match.normalizeName(pick?.team);
    const nameHits = players.filter((player) => match.namesMatch(player.name, pickName));
    if (!nameHits.length) return null;
    if (pickPos && SKILL.has(pickPos)) {
      const posHits = nameHits.filter((player) => match.normalizePosition(player.position) === pickPos);
      if (posHits.length === 1) return posHits[0];
      if (posHits.length > 1 && pickTeam) {
        const teamHits = posHits.filter((player) => match.normalizeName(player.team) === pickTeam);
        if (teamHits.length) return teamHits[0];
      }
      if (posHits.length) return posHits[0];
    }
    if (pickTeam) {
      const teamHits = nameHits.filter((player) => match.normalizeName(player.team) === pickTeam);
      if (teamHits.length) return teamHits[0];
    }
    return nameHits[0];
  }

  function pickIsDrafted(pick) {
    if (Number(pick?.pickNo) > 0) return true;
    if (pick?.trusted) return true;
    return false;
  }

  function applyPicks(players, picks) {
    const remaining = clonePlayers(players);
    const unmatched = [];
    const drafted = [];
    (picks || []).forEach((pick, index) => {
      if (!pickIsDrafted(pick)) return;
      const player = findPlayer(remaining, pick);
      if (!player) {
        unmatched.push({
          name: pick?.name || pick?.playerName || 'Unknown',
          position: pick?.position || '',
          team: pick?.team || '',
          pickNo: pick?.pickNo || index + 1
        });
        return;
      }
      player.drafted = true;
      player.draftedByMe = Boolean(pick?.mine);
      player.pickNo = pick?.pickNo || index + 1;
      drafted.push(player);
    });

    const myRoster = remaining.filter((player) => player.draftedByMe);
    const myTeams = new Set(myRoster.map((player) => (player.team || '').toUpperCase()).filter(Boolean));
    const playoff = global.FDSPlayoffSchedule;

    remaining.forEach((player) => {
      if (player.drafted || !player.team) return;
      const team = String(player.team).toUpperCase();
      if (myTeams.has(team)) {
        const hasQbStack = player.position !== 'QB' && myRoster.some((owned) => owned.position === 'QB' && owned.team === team);
        const hasSkillStack = player.position === 'QB' && myRoster.some((owned) => owned.position !== 'QB' && owned.team === team);
        player.stack = hasQbStack || hasSkillStack;
      }
      if (playoff && myRoster.length) {
        const profile = playoff.getTeamPlayoffProfile(team);
        player.bringBack = Boolean(profile.w17Opp && myTeams.has(profile.w17Opp));
      }
    });

    return { players: remaining, unmatched, drafted, myRoster };
  }

  function adpDiff(player) {
    const rank = Number(player.myRank);
    const adp = Number(player.adp);
    if (!Number.isFinite(rank) || !Number.isFinite(adp) || adp <= 0) return null;
    return Math.round((rank - adp) * 10) / 10;
  }

  function pickWindow(pickNo) {
    return Math.max(10, Math.round(pickNo * 0.25) + 8);
  }

  function realisticForPick(player, pickNo) {
    const rank = Number(player.myRank);
    const adp = Number(player.adp);
    if (!Number.isFinite(rank) || rank <= 0) return false;
    const slot = Number.isFinite(adp) && adp > 0 ? Math.min(rank, adp) : rank;
    return slot <= pickNo + pickWindow(pickNo);
  }

  function adpValueBonus(player, pickNo, settings) {
    const rank = Number(player.myRank);
    const adp = Number(player.adp);
    if (!Number.isFinite(rank) || !Number.isFinite(adp) || adp <= 0) return 0;

    const diff = rank - adp;
    if (diff >= 0) return 0;

    const window = pickWindow(pickNo);
    if (adp > pickNo + window) return 0;

    const adpScale = (settings.adpWeight ?? 55) / 50;
    const relevantDiff = Math.min(Math.abs(diff), Math.max(0, adp - pickNo + 4));
    if (relevantDiff <= 0) return 0;
    return Math.min(36, relevantDiff * 1.6) * adpScale;
  }

  function reachPenalty(player, pickNo) {
    const rank = Number(player.myRank);
    const adp = Number(player.adp);
    if (!Number.isFinite(rank)) return 0;
    const slot = Number.isFinite(adp) && adp > 0 ? Math.min(rank, adp) : rank;
    const ahead = slot - pickNo;
    if (ahead <= 6) return 0;
    return Math.min(120, (ahead - 6) * 3.2);
  }

  function positionalNeedBonus(have, target, pickNo) {
    if (have >= target) {
      return -(have - target + 1) * 22;
    }
    const need = target - have;
    const earlyScale = pickNo <= 24 ? 0.55 : pickNo <= 48 ? 0.75 : 1;
    return need * 16 * earlyScale;
  }

  function comparePlayers(a, b, sortKey) {
    if (sortKey === 'adp') return (a.adp || 999) - (b.adp || 999) || (a.myRank || 999) - (b.myRank || 999);
    if (sortKey === 'diff') {
      const aDiff = adpDiff(a);
      const bDiff = adpDiff(b);
      return (aDiff == null ? 999 : aDiff) - (bDiff == null ? 999 : bDiff) || (a.myRank || 999) - (b.myRank || 999);
    }
    return (a.myRank || 999) - (b.myRank || 999) || (a.adp || 999) - (b.adp || 999);
  }

  function remainingPlayers(board, { position = 'ALL', query = '', sortKey = 'rank' } = {}) {
    const q = `${query || ''}`.trim().toLowerCase();
    return board.players
      .filter((player) => !player.drafted)
      .filter((player) => SKILL.has(player.position))
      .filter((player) => position === 'ALL' || player.position === position)
      .filter((player) => !q || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(q))
      .sort((a, b) => comparePlayers(a, b, sortKey));
  }

  function rosterByPosition(myRoster) {
    const grouped = { QB: [], RB: [], WR: [], TE: [] };
    (myRoster || []).forEach((player) => {
      if (grouped[player.position]) grouped[player.position].push(player);
    });
    return grouped;
  }

  function pickCapital(player) {
    const rank = Number(player?.myRank) || Number(player?.adp) || 120;
    const pickNo = Number(player?.pickNo) || rank;
    const combined = rank * 0.7 + pickNo * 0.3;
    return Math.max(6, Math.round(128 - combined * 0.82));
  }

  const FULL_DRAFT_BUDGET = 850;

  function computeFullDraftBudget() {
    return FULL_DRAFT_BUDGET;
  }

  function computeCapitalTargets(settings) {
    const merged = getSettings({ settings });
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const fullBudget = computeFullDraftBudget();
    let totalWeight = 0;
    const weights = {};

    positions.forEach((pos) => {
      const target = merged.posTarget?.[pos] ?? DEFAULT_TARGETS[pos] ?? 2;
      const max = merged.posMax?.[pos] ?? DEFAULT_MAX[pos] ?? 8;
      weights[pos] = Math.max(1, target) * 0.65 + Math.max(1, max) * 0.35;
      totalWeight += weights[pos];
    });

    const targets = {};
    positions.forEach((pos) => {
      const share = totalWeight ? weights[pos] / totalWeight : 0.25;
      const targetValue = Math.round(fullBudget * share);
      targets[pos] = {
        targetValue,
        targetPct: Math.round(share * 100),
        targetCount: merged.posTarget?.[pos] ?? DEFAULT_TARGETS[pos],
        maxCount: merged.posMax?.[pos] ?? DEFAULT_MAX[pos]
      };
    });

    return { fullBudget, targets };
  }

  function getSettings(context) {
    const defaults = global.FDSScoringSettings?.DEFAULT_SETTINGS || {};
    return global.FDSScoringSettings?.mergeSettings(context?.settings || defaults);
  }

  function isEarlyPick(pickNo) {
    return (pickNo || 1) <= EARLY_PICK_MAX;
  }

  function expertRankScore(player) {
    const rank = Number(player.myRank);
    if (!Number.isFinite(rank) || rank <= 0) return 0;
    return Math.max(0, (250 - rank) * 40);
  }

  function talentScore(player, settings) {
    const rank = Number(player.myRank || 250);
    const rankPart = Math.max(0, (220 - Math.min(rank, 220)) * 18);
    const projPart = Number(player.projectionPct || 0) * 4.5;
    const rankW = (settings.rankWeight ?? 85) / 100;
    const projW = (settings.projectionWeight ?? 35) / 100;
    const totalW = rankW + projW || 1;
    return (rankPart * rankW + projPart * projW) / totalW;
  }

  function capitalPressure(player, myRoster, settings) {
    const scale = (settings.capitalWeight ?? 45) / 100;
    if (!scale || !myRoster?.length) return 0;
    const capital = draftCapital(myRoster, settings);
    const item = capital.byPosition[player.position];
    if (!item) return 0;
    if (item.spentPct > 100) return -(item.spentPct - 100) * 1.3 * scale;
    if (item.spentPct > 85) return -(item.spentPct - 85) * 0.6 * scale;
    return 0;
  }

  function applyPositionAndMaxRules(player, context, settings) {
    const bias = settings.posBias?.[player.position] || 'default';
    if (bias === 'exclude') return { blocked: true, score: -9999, bias };

    const myRoster = context.myRoster || [];
    const grouped = rosterByPosition(myRoster);
    const have = (grouped[player.position] || []).length;
    const max = settings.posMax?.[player.position] ?? DEFAULT_MAX[player.position] ?? 99;
    if (have >= max) return { blocked: true, score: -9999, bias };

    return { blocked: false, have, bias, myRoster, grouped };
  }

  function earlyRecScore(player, context, settings) {
    const rules = applyPositionAndMaxRules(player, context, settings);
    if (rules.blocked) return rules.score;

    const pickNo = context.pickNo || 1;
    const rank = Number(player.myRank || 999);
    let score = expertRankScore(player);

    score += adpValueBonus(player, pickNo, settings) * 0.2;

    if (rules.myRoster.length) {
      const stackScale = (settings.stackWeight ?? 55) / 100;
      if (player.stack) score += 10 * stackScale;
      if (player.bringBack) score += 8 * stackScale;
    }

    if (settings.format !== 'superflex') {
      if (player.position === 'QB' && rank > 24) score -= 50;
      if (player.position === 'TE' && rank > 36) score -= 40;
    }

    score += capitalPressure(player, rules.myRoster, settings);

    if (global.FDSPortfolio && context.portfolio) {
      score -= global.FDSPortfolio.portfolioPenalty(player, rules.myRoster, context.portfolio, settings.portfolioWeight);
    }

    if (global.FDSDuplicates) {
      score -= global.FDSDuplicates.duplicatePenalty(player, rules.myRoster, settings.duplicateWeight ?? 35) * 0.5;
    }

    if (rules.bias === 'boost') score += 40;
    return score;
  }

  function fullRecScore(player, context, settings) {
    const rules = applyPositionAndMaxRules(player, context, settings);
    if (rules.blocked) return rules.score;

    const myRoster = rules.myRoster;
    const pickNo = context.pickNo || 1;
    const have = rules.have;
    const target = settings.posTarget?.[player.position] ?? DEFAULT_TARGETS[player.position] ?? 2;
    const rank = Number(player.myRank || 999);

    let score = talentScore(player, settings);

    score += adpValueBonus(player, pickNo, settings);
    score -= reachPenalty(player, pickNo);

    const diff = adpDiff(player);
    if (diff != null && diff > 8) {
      score -= Math.min(24, diff * 0.9);
    }

    const stackScale = (settings.stackWeight ?? 55) / 50;
    if (player.stack) score += 32 * stackScale;
    if (player.bringBack) score += 22 * stackScale;

    if (global.FDSPlayoffSchedule) {
      score += global.FDSPlayoffSchedule.playoffBonusForPlayer(player, myRoster, settings);
    }

    if (pickNo >= POSITIONAL_NEED_MIN_PICK) {
      if (have < target) {
        score += positionalNeedBonus(have, target, pickNo);
      } else {
        score -= (have - target + 1) * 22;
      }
    }

    score += capitalPressure(player, myRoster, settings);

    if (global.FDSPortfolio && context.portfolio) {
      score -= global.FDSPortfolio.portfolioPenalty(player, myRoster, context.portfolio, settings.portfolioWeight);
    }

    if (global.FDSDuplicates) {
      score -= global.FDSDuplicates.duplicatePenalty(player, myRoster, settings.duplicateWeight ?? 35);
    }

    const contrarian = (settings.contrarianWeight ?? 10) / 100;
    const adp = Number(player.adp);
    if (contrarian > 0 && rank > TOP_RANK_CONTRARIAN_CUTOFF && Number.isFinite(adp) && adp <= 24) {
      score -= (25 - adp) * 0.35 * contrarian;
    }

    if (settings.format === 'superflex') {
      if (player.position === 'QB') score += 35;
    } else {
      if (pickNo <= 36 && player.position === 'QB' && rank > 24) score -= 28;
      if (pickNo <= 24 && player.position === 'QB' && rank > 18) score -= 18;
      if (pickNo <= 36 && player.position === 'TE' && rank > 30) score -= 16;
    }

    const sos = Number(player.sosRank);
    if (Number.isFinite(sos) && sos > 0 && sos <= 10) {
      score += (11 - sos) * 1.5;
    }

    if (rules.bias === 'boost') score += 58;
    return score;
  }

  function recScore(player, context = {}) {
    const settings = getSettings(context);
    const pickNo = context.pickNo || 1;
    if (isEarlyPick(pickNo)) {
      return earlyRecScore(player, context, settings);
    }
    return fullRecScore(player, context, settings);
  }

  function scorePlayers(remaining, context) {
    return (remaining || [])
      .map((player) => ({ player, score: recScore(player, context) }))
      .filter((item) => item.score > -9000);
  }

  function compareByExpertRank(a, b) {
    return (a.myRank || 999) - (b.myRank || 999) || (a.adp || 999) - (b.adp || 999);
  }

  function scoreReference(pickNo) {
    const pick = pickNo || 1;
    if (pick <= 12) return 9200;
    if (pick <= 24) return 7800;
    if (pick <= 48) return 5200;
    if (pick <= 96) return 3200;
    return 1800;
  }

  function toDisplayScore(rawScore, pickNo) {
    const ref = scoreReference(pickNo);
    const scaled = Math.min(10, Math.max(0, (rawScore / ref) * 10));
    return Math.round(scaled * 10) / 10;
  }

  function formatRecommendations(items, pickNo = 1) {
    return items.map((item) => ({
      ...item,
      rawScore: Math.round(item.score),
      displayScore: toDisplayScore(item.score, pickNo)
    }));
  }

  function sortScoredCandidates(scored) {
    return scored.sort((a, b) => b.score - a.score || compareByExpertRank(a.player, b.player));
  }

  function heatBand(index, total) {
    if (index <= 2) return 'best';
    if (index <= 7) return 'good';
    if (index <= Math.max(12, Math.floor(total * 0.22))) return 'ok';
    return 'fade';
  }

  function heatMap(remaining, context) {
    const pickNo = context.pickNo || 1;
    const scored = sortScoredCandidates(
      scorePlayers(remaining, context).filter((item) => realisticForPick(item.player, pickNo))
    );
    return scored.map((item, index) => ({
      ...item,
      heat: heatBand(index, scored.length),
      rank: index + 1,
      rawScore: Math.round(item.score),
      displayScore: toDisplayScore(item.score, pickNo)
    }));
  }

  function recommend(remaining, context, limit = 3) {
    const pickNo = context.pickNo || 1;
    const scored = sortScoredCandidates(
      scorePlayers(
        (remaining || []).filter((player) => realisticForPick(player, pickNo)),
        context
      )
    );

    if (!scored.length) {
      return formatRecommendations(
        sortScoredCandidates(scorePlayers(remaining, context)).slice(0, limit),
        pickNo
      );
    }

    return formatRecommendations(scored.slice(0, limit), pickNo);
  }

  function slotForPick(pickNo, teamSize = DEFAULT_TEAM_SIZE) {
    const pick = Number(pickNo);
    if (!Number.isFinite(pick) || pick <= 0) return null;
    const size = Number(teamSize) || DEFAULT_TEAM_SIZE;
    const round = Math.ceil(pick / size);
    const posInRound = ((pick - 1) % size) + 1;
    return round % 2 === 1 ? posInRound : size - posInRound + 1;
  }

  function enrichPickSlot(pick, teamSize = DEFAULT_TEAM_SIZE) {
    if (!pick) return pick;
    const pickNo = Number(pick.pickNo);
    const slot = Number(pick.slot);
    if (Number.isFinite(slot) && slot > 0) {
      return { ...pick, slot };
    }
    if (!Number.isFinite(pickNo) || pickNo <= 0) {
      return pick;
    }
    return { ...pick, slot: slotForPick(pickNo, teamSize) };
  }

  function draftRoomState(picks, { teamSize = DEFAULT_TEAM_SIZE, mySlot = null } = {}) {
    const size = Number(teamSize) || DEFAULT_TEAM_SIZE;
    const bySlot = {};
    for (let slot = 1; slot <= size; slot += 1) {
      bySlot[slot] = {
        slot,
        isMe: mySlot != null && Number(mySlot) === slot,
        picks: [],
        counts: { QB: 0, RB: 0, WR: 0, TE: 0 },
        total: 0
      };
    }

    const totals = { QB: 0, RB: 0, WR: 0, TE: 0 };
    (picks || []).forEach((rawPick) => {
      const pick = enrichPickSlot(rawPick, size);
      const slot = pick.slot;
      if (!slot || !bySlot[slot]) return;
      const pos = pick.position;
      if (!SKILL.has(pos)) return;
      bySlot[slot].picks.push(pick);
      bySlot[slot].counts[pos] = (bySlot[slot].counts[pos] || 0) + 1;
      bySlot[slot].total += 1;
      totals[pos] = (totals[pos] || 0) + 1;
    });

    return {
      teamSize: size,
      mySlot: mySlot != null ? Number(mySlot) : null,
      totals,
      teams: Object.values(bySlot).sort((a, b) => a.slot - b.slot)
    };
  }

  function draftCapital(myRoster, settings) {
    const grouped = rosterByPosition(myRoster);
    const { fullBudget, targets } = computeCapitalTargets(settings);
    const pickCount = (myRoster || []).length;
    const remainingPicks = Math.max(0, TOTAL_PICKS - pickCount);
    const byPosition = {};
    let allocated = 0;
    let maxTargetValue = 1;

    ['QB', 'RB', 'WR', 'TE'].forEach((pos) => {
      maxTargetValue = Math.max(maxTargetValue, targets[pos].targetValue);
    });

    ['QB', 'RB', 'WR', 'TE'].forEach((pos) => {
      const value = (grouped[pos] || []).reduce((sum, player) => sum + pickCapital(player), 0);
      const roundedValue = Math.round(value);
      const targetValue = targets[pos].targetValue;
      const spentPct = targetValue ? Math.round((roundedValue / targetValue) * 100) : 0;
      const chartScale = targetValue / maxTargetValue;

      byPosition[pos] = {
        position: pos,
        value: roundedValue,
        count: (grouped[pos] || []).length,
        targetPct: targets[pos].targetPct,
        targetValue,
        targetCount: targets[pos].targetCount,
        maxCount: targets[pos].maxCount,
        spentPct,
        chartScale,
        barPct: Math.min(100, spentPct),
        pct: spentPct
      };
      allocated += value;
    });

    return {
      byPosition,
      allocated: Math.round(allocated),
      fullBudget,
      remaining: Math.max(0, fullBudget - allocated),
      budget: fullBudget,
      remainingPicks,
      pickCount,
      totalPicks: TOTAL_PICKS,
      maxTargetValue
    };
  }

  global.FDSRankBoard = {
    applyPicks,
    remainingPlayers,
    rosterByPosition,
    adpDiff,
    findPlayer,
    recommend,
    recScore,
    heatMap,
    draftCapital,
    computeCapitalTargets,
    pickCapital,
    computeFullDraftBudget,
    realisticForPick,
    slotForPick,
    enrichPickSlot,
    draftRoomState,
    toDisplayScore,
    DEFAULT_TARGETS,
    DEFAULT_MAX,
    DEFAULT_TEAM_SIZE,
    TOTAL_PICKS
  };
})(typeof window !== 'undefined' ? window : globalThis);
