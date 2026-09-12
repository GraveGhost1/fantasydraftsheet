(function (global) {
  const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);
  const TOTAL_PICKS = 18;
  const DEFAULT_TEAM_SIZE = 12;
  const DEFAULT_TARGETS = { QB: 2, RB: 4, WR: 6, TE: 2 };
  const DEFAULT_MAX = { QB: 3, RB: 6, WR: 9, TE: 3 };
  const COUNT_BANDS = {
    QB: { min: 2, max: 3, earlyPick: 72 },
    RB: { min: 4, max: 6, earlyPick: 48 },
    WR: { min: 6, max: 9, earlyPick: 60 },
    TE: { min: 2, max: 3, earlyPick: 60 }
  };
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
  const EARLY_PICK_MAX = 24;
  const POSITIONAL_NEED_MIN_PICK = 13;
  const TOP_RANK_CONTRARIAN_CUTOFF = 36;

  function clonePlayers(players) {
    return (players || []).map((player) => ({ ...player, drafted: false, draftedByMe: false, stack: false, bringBack: false }));
  }

  function findPlayer(players, pick) {
    const match = global.FDSPlayerMatch;
    if (!match?.namesMatch) return null;
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
    const name = `${pick?.name || pick?.playerName || ''}`.trim();
    return name.length >= 3;
  }

  function pickNameKey(pick) {
    const match = global.FDSPlayerMatch;
    const name = pick?.name || pick?.playerName || '';
    const pos = match?.normalizePosition(pick?.position) || String(pick?.position || '').toUpperCase();
    const normalized = match?.normalizeName(name) || String(name).toLowerCase();
    return `${normalized}|${pos}`;
  }

  function mergePicks(...lists) {
    const byName = new Map();
    const byPickNo = new Map();
    lists.flat().forEach((pick) => {
      const name = `${pick?.name || pick?.playerName || ''}`.trim();
      if (name.length < 3) return;
      const nameKey = pickNameKey(pick);
      const pickNo = Number(pick?.pickNo);
      const hasPickNo = Number.isFinite(pickNo) && pickNo > 0;
      const prev = (hasPickNo && byPickNo.get(pickNo)) || byName.get(nameKey) || {};
      const next = {
        ...prev,
        ...pick,
        name,
        position: pick.position || prev.position || '',
        team: pick.team || prev.team || '',
        pickNo: hasPickNo ? pickNo : (Number(prev.pickNo) > 0 ? Number(prev.pickNo) : null),
        mine: Boolean(prev.mine || pick.mine),
        trusted: true
      };
      byName.set(nameKey, next);
      if (Number(next.pickNo) > 0) byPickNo.set(Number(next.pickNo), next);
    });
    const uniq = new Set();
    byName.forEach((pick) => uniq.add(pick));
    return [...uniq].sort((a, b) => (Number(a.pickNo) || 999) - (Number(b.pickNo) || 999));
  }

  function applyPicks(players, picks, options = {}) {
    const remaining = clonePlayers(players);
    const unmatched = [];
    const drafted = [];
    mergePicks(picks).forEach((pick, index) => {
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
      if (player.drafted) {
        player.draftedByMe = player.draftedByMe || Boolean(pick?.mine);
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
    const slate = options.slate || null;

    remaining.forEach((player) => {
      if (player.drafted || !player.team) return;
      const team = String(player.team).toUpperCase();
      if (myTeams.has(team)) {
        const hasQbStack = player.position !== 'QB' && myRoster.some((owned) => owned.position === 'QB' && owned.team === team);
        const hasSkillStack = player.position === 'QB' && myRoster.some((owned) => owned.position !== 'QB' && owned.team === team);
        player.stack = hasQbStack || hasSkillStack;
      }
      if (slate && myRoster.length && global.FDSSlate?.sameGame) {
        player.bringBack = [...myTeams].some((owned) => global.FDSSlate.sameGame(team, owned, slate));
      } else if (playoff && myRoster.length) {
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

  function remainingPlayers(board, { position = 'ALL', query = '', sortKey = 'rank', slate = null } = {}) {
    const q = `${query || ''}`.trim().toLowerCase();
    return board.players
      .filter((player) => !player.drafted)
      .filter((player) => SKILL.has(player.position))
      .filter((player) => !slate || global.FDSSlate?.playerOnSlate(player, slate))
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

  function playerPickNo(player) {
    const pickNo = Number(player?.pickNo);
    if (Number.isFinite(pickNo) && pickNo > 0) return pickNo;
    const adp = Number(player?.adp);
    if (Number.isFinite(adp) && adp > 0) return adp;
    const rank = Number(player?.myRank);
    if (Number.isFinite(rank) && rank > 0) return rank;
    return 120;
  }

  function pickCapitalFromPickNo(pickNo) {
    return Math.max(6, Math.round(128 - Math.max(1, Number(pickNo) || 120) * 0.82));
  }

  function pickCapital(player) {
    return pickCapitalFromPickNo(playerPickNo(player));
  }

  function teamCode(team) {
    return String(team || '').toUpperCase().slice(0, 3);
  }

  function qbTeamCodes(myRoster) {
    return new Set(
      (myRoster || [])
        .filter((player) => player.position === 'QB' && player.team)
        .map((player) => teamCode(player.team))
    );
  }

  function stackedCount(players, qbTeams) {
    return (players || []).filter((player) => qbTeams.has(teamCode(player.team))).length;
  }

  function isDailyMode(settings) {
    return settings?.mode === 'daily';
  }

  function countBandFor(pos, settings) {
    const dailyBands = isDailyMode(settings) ? global.FDSSlate?.DAILY_FORMAT?.countBands : null;
    const band = dailyBands?.[pos] || COUNT_BANDS[pos] || { min: 2, max: 3, earlyPick: 72 };
    const defaultMax = isDailyMode(settings)
      ? (global.FDSSlate?.DAILY_FORMAT?.posMax?.[pos] ?? band.max)
      : (DEFAULT_MAX[pos] ?? band.max);
    const maxSetting = settings?.posMax?.[pos] ?? defaultMax;
    return {
      min: band.min,
      max: Math.max(band.min, Math.min(band.max, Number(maxSetting) || band.max)),
      earlyPick: band.earlyPick
    };
  }

  function suggestedCountFor(pos, players, myRoster, currentPickNo, band) {
    const earlyCount = (players || []).filter((player) => playerPickNo(player) <= band.earlyPick).length;
    const qbTeams = qbTeamCodes(myRoster);
    const stacked = (pos === 'WR' || pos === 'TE') ? stackedCount(players, qbTeams) : 0;
    let suggested;

    if (!players?.length) {
      suggested = currentPickNo > band.earlyPick ? band.max : band.min;
    } else if (earlyCount === 0) {
      suggested = band.max;
    } else {
      suggested = band.max - earlyCount;
    }

    if (pos === 'WR' && stacked >= 2) suggested -= 1;
    if (pos === 'TE' && stacked >= 1) suggested -= 1;

    return Math.max(band.min, Math.min(band.max, suggested));
  }

  function capitalWindow(suggestedCount, earlyCount, band) {
    const earlyCost = pickCapitalFromPickNo(Math.round(band.earlyPick * 0.55));
    const midCost = pickCapitalFromPickNo(band.earlyPick + 24);
    const lateCost = pickCapitalFromPickNo(140);
    const earlySlots = Math.min(earlyCount, suggestedCount);
    const cheapSlots = Math.max(0, suggestedCount - earlySlots);
    const low = earlySlots * midCost + cheapSlots * lateCost;
    const high = Math.max(low + 18, earlySlots * earlyCost + cheapSlots * midCost);
    return {
      capitalLow: Math.max(12, Math.round(low * 0.85)),
      capitalHigh: Math.max(Math.round(low * 0.85) + 20, Math.round(high * 1.15))
    };
  }

  function positionCapitalState(count, suggested, min, max, spent, capitalLow, capitalHigh) {
    if (count > max) return 'over';
    if (count >= suggested && count >= min) {
      if (spent > capitalHigh * 1.4 && spent > capitalHigh + 36) return 'over';
      return 'inRange';
    }
    if (count >= min && spent >= capitalHigh) return 'inRange';
    return 'need';
  }

  function capitalReason(pos, item) {
    if (item.state === 'over') return 'Over — look elsewhere';
    if (item.state === 'inRange') {
      if (item.stacked) return 'Stacked — fill others';
      if (item.earlyCount > 0) return 'Early — look elsewhere';
      return 'In range';
    }
    if (item.count < item.countMin) return 'Still need bodies';
    return 'Late — still want another';
  }

  function joinEnglish(parts) {
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  }

  function capitalMessage(byPosition) {
    const inRange = POSITIONS.filter((pos) => byPosition[pos]?.state === 'inRange');
    const over = POSITIONS.filter((pos) => byPosition[pos]?.state === 'over');
    const need = POSITIONS.filter((pos) => byPosition[pos]?.state === 'need');
    const done = inRange.concat(over);
    if (need.length && done.length) {
      const verb = done.length === 1 ? 'is' : 'are';
      const needBits = need.map((pos) => {
        const item = byPosition[pos];
        return `${pos} (${item.count} of ${item.countMin}–${item.countMax})`;
      });
      return `${joinEnglish(done)} ${verb} in range. Next picks should fill ${joinEnglish(needBits)}.`;
    }
    if (need.length) {
      const needBits = need.map((pos) => {
        const item = byPosition[pos];
        return `${pos} (${item.count} of ${item.countMin}–${item.countMax})`;
      });
      return `Still need ${joinEnglish(needBits)}.`;
    }
    if (over.length) {
      return `All positions are in range. ${joinEnglish(over)} ran hot — look elsewhere if you pick again.`;
    }
    return 'All positions are in range.';
  }

  function computeFullDraftBudget() {
    let sum = 0;
    for (let round = 1; round <= TOTAL_PICKS; round += 1) {
      sum += pickCapitalFromPickNo(round * 12 - 6);
    }
    return sum;
  }

  function computeCapitalTargets(settings, options) {
    const capital = draftCapital([], settings, options);
    const targets = {};
    POSITIONS.forEach((pos) => {
      const item = capital.byPosition[pos];
      targets[pos] = {
        targetValue: item.targetValue,
        targetPct: item.targetPct,
        targetCount: item.suggestedCount,
        maxCount: item.countMax,
        countMin: item.countMin,
        capitalLow: item.capitalLow,
        capitalHigh: item.capitalHigh
      };
    });
    return { fullBudget: capital.fullBudget, targets };
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

  function capitalAdjustment(item, settings) {
    const scale = (settings.capitalWeight ?? 45) / 100;
    if (!scale || !item) return 0;
    if (item.state === 'over') {
      const extra = Math.max(0, item.value - item.capitalHigh);
      return -(24 + extra * 0.4) * scale;
    }
    if (item.state === 'inRange') return -18 * scale;
    return 0;
  }

  function capitalPressure(player, myRoster, settings, pickNo) {
    if (!myRoster?.length) return 0;
    const capital = draftCapital(myRoster, settings, { pickNo });
    return capitalAdjustment(capital.byPosition[player.position], settings);
  }

  function applyPositionAndMaxRules(player, context, settings) {
    const bias = settings.posBias?.[player.position] || 'default';
    if (bias === 'exclude') return { blocked: true, score: -9999, bias };

    const myRoster = context.myRoster || [];
    const grouped = rosterByPosition(myRoster);
    const have = (grouped[player.position] || []).length;
    const dailyMax = isDailyMode(settings)
      ? global.FDSSlate?.DAILY_FORMAT?.posMax?.[player.position]
      : null;
    const max = settings.posMax?.[player.position] ?? dailyMax ?? DEFAULT_MAX[player.position] ?? 99;
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

    score += capitalPressure(player, rules.myRoster, settings, pickNo);

    if (global.FDSPortfolio && context.portfolio) {
      score -= global.FDSPortfolio.portfolioPenalty(
        player,
        rules.myRoster,
        context.portfolio,
        settings.portfolioWeight,
        { mode: settings.mode }
      );
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
    const daily = isDailyMode(settings);
    const capital = draftCapital(myRoster, settings, {
      pickNo,
      totalPicks: daily ? (global.FDSSlate?.DAILY_FORMAT?.totalPicks || 8) : TOTAL_PICKS
    });
    const capItem = capital.byPosition[player.position];
    const defaultTargets = daily
      ? (global.FDSSlate?.DAILY_FORMAT?.posTarget || DEFAULT_TARGETS)
      : DEFAULT_TARGETS;
    const target = capItem?.suggestedCount ?? settings.posTarget?.[player.position] ?? defaultTargets[player.position] ?? 2;
    const rank = Number(player.myRank || 999);

    let score = talentScore(player, settings);
    if (daily) {
      // Keep rank as a tie-break; matchup + correlation should move the board.
      score *= 0.32;
    }

    score += adpValueBonus(player, pickNo, settings) * (daily ? 0.55 : 1);
    score -= reachPenalty(player, pickNo) * (daily ? 0.45 : 1);

    const diff = adpDiff(player);
    if (diff != null && diff > 8) {
      score -= Math.min(daily ? 14 : 24, diff * (daily ? 0.45 : 0.9));
    }

    const stackScale = (settings.stackWeight ?? 55) / 50;
    if (daily) {
      if (player.stack) score += 130 * stackScale;
      if (player.bringBack) score += 95 * stackScale;
    } else {
      if (player.stack) score += 32 * stackScale;
      if (player.bringBack) score += 22 * stackScale;
    }

    if (daily && global.FDSSlate && context.slate) {
      score += global.FDSSlate.slateBonusForPlayer(player, myRoster, context.slate, settings);
    } else if (!daily && global.FDSPlayoffSchedule) {
      score += global.FDSPlayoffSchedule.playoffBonusForPlayer(player, myRoster, settings);
    }

    const needMin = daily ? 1 : POSITIONAL_NEED_MIN_PICK;
    if (pickNo >= needMin) {
      if (have < target) {
        score += positionalNeedBonus(have, target, pickNo) * (daily ? 1.35 : 1);
      } else {
        score -= (have - target + 1) * (daily ? 38 : 22);
      }
    }

    score += capitalAdjustment(capItem, settings);

    if (global.FDSPortfolio && context.portfolio) {
      score -= global.FDSPortfolio.portfolioPenalty(
        player,
        myRoster,
        context.portfolio,
        settings.portfolioWeight,
        { mode: settings.mode }
      );
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
    } else if (!daily) {
      if (pickNo <= 36 && player.position === 'QB' && rank > 24) score -= 28;
      if (pickNo <= 24 && player.position === 'QB' && rank > 18) score -= 18;
      if (pickNo <= 36 && player.position === 'TE' && rank > 30) score -= 16;
    } else {
      if (have >= target && player.position === 'QB') score -= 45;
      if (have >= target && player.position === 'TE') score -= 28;
    }

    const sos = Number(player.sosRank);
    if (Number.isFinite(sos) && sos > 0 && sos <= 10) {
      score += (11 - sos) * (daily ? 4 : 1.5);
    }

    if (rules.bias === 'boost') score += daily ? 90 : 58;
    return score;
  }

  function recScore(player, context = {}) {
    const settings = getSettings(context);
    const pickNo = context.pickNo || 1;
    if (isDailyMode(settings) || !isEarlyPick(pickNo)) {
      return fullRecScore(player, context, settings);
    }
    return earlyRecScore(player, context, settings);
  }

  function scorePlayers(remaining, context) {
    return (remaining || [])
      .map((player) => ({ player, score: recScore(player, context) }))
      .filter((item) => item.score > -9000);
  }

  function compareByExpertRank(a, b) {
    return (a.myRank || 999) - (b.myRank || 999) || (a.adp || 999) - (b.adp || 999);
  }

  function scoreReference(pickNo, daily = false) {
    const pick = pickNo || 1;
    if (daily) {
      if (pick <= 3) return 2200;
      if (pick <= 6) return 1800;
      return 1400;
    }
    if (pick <= 12) return 9200;
    if (pick <= 24) return 7800;
    if (pick <= 48) return 5200;
    if (pick <= 96) return 3200;
    return 1800;
  }

  function toDisplayScore(rawScore, pickNo, daily = false) {
    const ref = scoreReference(pickNo, daily);
    const scaled = Math.min(10, Math.max(0, (rawScore / ref) * 10));
    return Math.round(scaled * 10) / 10;
  }

  function reasonForRec(item, context) {
    const settings = getSettings(context);
    if (!isDailyMode(settings) || !global.FDSSlate?.explainDailyPick || !context.slate) {
      return [];
    }
    return global.FDSSlate.explainDailyPick(item.player, context.myRoster || [], context.slate);
  }

  function formatRecommendations(items, pickNo = 1, context = {}) {
    const settings = getSettings(context);
    const daily = isDailyMode(settings);
    return items.map((item) => ({
      ...item,
      rawScore: Math.round(item.score),
      displayScore: toDisplayScore(item.score, pickNo, daily),
      reasons: reasonForRec(item, context)
    }));
  }

  function sortScoredCandidates(scored) {
    return scored.sort((a, b) => b.score - a.score || compareByExpertRank(a.player, b.player));
  }

  function heatBand(index) {
    if (index <= 2) return 'best';
    if (index <= 7) return 'good';
    return null;
  }

  function heatMap(remaining, context) {
    const pickNo = context.pickNo || 1;
    const settings = getSettings(context);
    const daily = isDailyMode(settings);
    const scored = sortScoredCandidates(
      scorePlayers(remaining, context).filter((item) => daily || realisticForPick(item.player, pickNo))
    );
    return scored
      .map((item, index) => ({
        ...item,
        heat: heatBand(index),
        rank: index + 1,
        rawScore: Math.round(item.score),
        displayScore: toDisplayScore(item.score, pickNo, daily),
        reasons: reasonForRec(item, context)
      }))
      .filter((item) => item.heat);
  }

  function recommend(remaining, context, limit = 3) {
    const pickNo = context.pickNo || 1;
    const settings = getSettings(context);
    const pool = isDailyMode(settings)
      ? (remaining || [])
      : (remaining || []).filter((player) => realisticForPick(player, pickNo));
    const scored = sortScoredCandidates(scorePlayers(pool, context));

    if (!scored.length) {
      return formatRecommendations(
        sortScoredCandidates(scorePlayers(remaining, context)).slice(0, limit),
        pickNo,
        context
      );
    }

    return formatRecommendations(scored.slice(0, limit), pickNo, context);
  }

  function slotForPick(pickNo, teamSize = DEFAULT_TEAM_SIZE) {
    const pick = Number(pickNo);
    if (!Number.isFinite(pick) || pick <= 0) return null;
    const size = Number(teamSize) || DEFAULT_TEAM_SIZE;
    const round = Math.ceil(pick / size);
    const posInRound = ((pick - 1) % size) + 1;
    return round % 2 === 1 ? posInRound : size - posInRound + 1;
  }

  function liftZeroIndexedSlots(picks, mySlot) {
    const list = picks || [];
    const slots = list.map((pick) => Number(pick?.slot)).filter((slot) => Number.isFinite(slot));
    if (!slots.includes(0)) {
      const hinted = Number(mySlot);
      return {
        picks: list,
        mySlot: Number.isFinite(hinted) && hinted > 0 ? hinted : null
      };
    }
    const hinted = Number(mySlot);
    return {
      picks: list.map((pick) => {
        if (!Number.isFinite(Number(pick?.slot))) return pick;
        return { ...pick, slot: Number(pick.slot) + 1 };
      }),
      mySlot: Number.isFinite(hinted) ? hinted + 1 : null
    };
  }

  function inferTeamSize(picks, hinted) {
    const hint = Number(hinted);
    if (hint >= 6 && hint <= 14) return hint;
    const slots = (picks || []).map((pick) => Number(pick?.slot)).filter((slot) => slot >= 1 && slot <= 14);
    if (slots.length) {
      const max = Math.max(...slots);
      const unique = new Set(slots).size;
      if (unique >= 6) return Math.max(max, unique);
      if (max >= 8 && max <= 14) return max;
    }
    return DEFAULT_TEAM_SIZE;
  }

  function inferMySlot(picks, { mySlot = null, teamSize = DEFAULT_TEAM_SIZE } = {}) {
    const hinted = Number(mySlot);
    if (Number.isFinite(hinted) && hinted >= 1 && hinted <= 14) return hinted;
    const mine = (picks || []).filter((pick) => pick?.mine);
    const fromSlot = mine.map((pick) => Number(pick.slot)).filter((slot) => slot >= 1 && slot <= 14);
    if (fromSlot.length) {
      const counts = new Map();
      fromSlot.forEach((slot) => counts.set(slot, (counts.get(slot) || 0) + 1));
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    }
    const fromPickNo = mine
      .map((pick) => slotForPick(pick.pickNo, teamSize))
      .filter((slot) => slot >= 1);
    if (fromPickNo.length) return fromPickNo[0];
    return null;
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
    const lifted = liftZeroIndexedSlots(picks, mySlot);
    const size = inferTeamSize(lifted.picks, teamSize);
    const me = inferMySlot(lifted.picks, { mySlot: lifted.mySlot, teamSize: size });
    const bySlot = {};
    for (let slot = 1; slot <= size; slot += 1) {
      bySlot[slot] = {
        slot,
        isMe: me != null && Number(me) === slot,
        picks: [],
        counts: { QB: 0, RB: 0, WR: 0, TE: 0 },
        total: 0
      };
    }

    const totals = { QB: 0, RB: 0, WR: 0, TE: 0 };
    (lifted.picks || []).forEach((rawPick) => {
      const pick = enrichPickSlot(rawPick, size);
      const slot = Number(pick.slot);
      if (!Number.isFinite(slot) || !bySlot[slot]) return;
      const pos = pick.position;
      if (!SKILL.has(pos)) return;
      bySlot[slot].picks.push(pick);
      bySlot[slot].counts[pos] = (bySlot[slot].counts[pos] || 0) + 1;
      bySlot[slot].total += 1;
      totals[pos] = (totals[pos] || 0) + 1;
    });

    return {
      teamSize: size,
      mySlot: me,
      totals,
      teams: Object.values(bySlot).sort((a, b) => a.slot - b.slot)
    };
  }

  function draftCapital(myRoster, settings, options = {}) {
    const merged = getSettings({ settings });
    const grouped = rosterByPosition(myRoster);
    const pickCount = (myRoster || []).length;
    const totalPicks = Number(options.totalPicks) > 0 ? Number(options.totalPicks) : TOTAL_PICKS;
    const remainingPicks = Math.max(0, totalPicks - pickCount);
    const currentPickNo = Number(options.pickNo) > 0
      ? Number(options.pickNo)
      : (myRoster || []).reduce((max, player) => Math.max(max, playerPickNo(player)), 0) + 1;
    const byPosition = {};
    let allocated = 0;

    POSITIONS.forEach((pos) => {
      const players = grouped[pos] || [];
      const band = countBandFor(pos, merged);
      const earlyCount = players.filter((player) => playerPickNo(player) <= band.earlyPick).length;
      const qbTeams = qbTeamCodes(myRoster);
      const stacked = (pos === 'WR' || pos === 'TE') ? stackedCount(players, qbTeams) : 0;
      const suggestedCount = suggestedCountFor(pos, players, myRoster, currentPickNo, band);
      const { capitalLow, capitalHigh } = capitalWindow(suggestedCount, earlyCount, band);
      const value = Math.round(players.reduce((sum, player) => sum + pickCapital(player), 0));
      const targetValue = Math.round((capitalLow + capitalHigh) / 2);
      const spentPct = capitalHigh ? Math.round((value / capitalHigh) * 100) : 0;
      const state = positionCapitalState(
        players.length, suggestedCount, band.min, band.max, value, capitalLow, capitalHigh
      );

      const item = {
        position: pos,
        value,
        count: players.length,
        earlyCount,
        stacked: stacked > 0 && ((pos === 'WR' && stacked >= 2) || (pos === 'TE' && stacked >= 1)),
        countMin: band.min,
        countMax: band.max,
        suggestedCount,
        capitalLow,
        capitalHigh,
        targetValue,
        targetCount: suggestedCount,
        maxCount: band.max,
        targetPct: suggestedCount ? Math.round((players.length / suggestedCount) * 100) : 0,
        spentPct,
        barPct: Math.min(100, spentPct),
        pct: spentPct,
        state,
        reason: ''
      };
      item.reason = capitalReason(pos, item);
      byPosition[pos] = item;
      allocated += value;
    });

    const anyPicked = pickCount > 0;
    let chartMax = 1;
    POSITIONS.forEach((pos) => {
      const item = byPosition[pos];
      if (!anyPicked) {
        chartMax = Math.max(chartMax, item.capitalHigh);
      } else {
        chartMax = Math.max(chartMax, item.value, item.count > 0 ? item.capitalHigh : item.capitalLow);
      }
    });

    const fullBudget = POSITIONS.reduce((sum, pos) => sum + byPosition[pos].capitalHigh, 0);

    return {
      byPosition,
      allocated: Math.round(allocated),
      fullBudget,
      remaining: Math.max(0, fullBudget - allocated),
      budget: fullBudget,
      remainingPicks,
      pickCount,
      totalPicks,
      chartMax,
      maxTargetValue: chartMax,
      message: capitalMessage(byPosition)
    };
  }

  global.FDSRankBoard = {
    applyPicks,
    mergePicks,
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
    pickCapitalFromPickNo,
    computeFullDraftBudget,
    COUNT_BANDS,
    realisticForPick,
    slotForPick,
    enrichPickSlot,
    draftRoomState,
    inferMySlot,
    inferTeamSize,
    liftZeroIndexedSlots,
    toDisplayScore,
    DEFAULT_TARGETS,
    DEFAULT_MAX,
    DEFAULT_TEAM_SIZE,
    TOTAL_PICKS
  };
})(typeof window !== 'undefined' ? window : globalThis);
