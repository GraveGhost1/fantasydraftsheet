(function (global) {
  const SCHEDULE = global.FDSNflSchedule2026 || null;

  function normalizeTeam(team) {
    const code = String(team || '').toUpperCase().slice(0, 3);
    if (code === 'WSH') return 'WAS';
    if (code === 'JAC') return 'JAX';
    return code;
  }

  function getTeamInfo(team) {
    const code = normalizeTeam(team);
    return SCHEDULE?.teams?.[code] || SCHEDULE?.teams?.[team?.toUpperCase()] || null;
  }

  function weekScore(gameTier, weekWeight) {
    return Math.round(40 + (Number(gameTier || 55) - 55) * 0.9 * weekWeight);
  }

  function getTeamPlayoffProfile(team) {
    const code = normalizeTeam(team);
    const info = getTeamInfo(code);
    if (!info) {
      return { team: code, w17Score: 45, w16Score: 40, w15Score: 35, w17Opp: '', w16Opp: '', w15Opp: '', dome: false };
    }

    const w17Tier = info.w17GameTier || 55;
    const w16Tier = Math.round(w17Tier * 0.88);
    const w15Tier = Math.round(w17Tier * 0.76);

    return {
      team: code,
      w17Score: weekScore(w17Tier, 1),
      w16Score: weekScore(w16Tier, 0.85),
      w15Score: weekScore(w15Tier, 0.7),
      w17Opp: info.playoff?.['17']?.opponent || '',
      w16Opp: info.playoff?.['16']?.opponent || '',
      w15Opp: info.playoff?.['15']?.opponent || '',
      dome: Boolean(info.dome)
    };
  }

  function playoffBonusForPlayer(player, myRoster, weights) {
    const profile = getTeamPlayoffProfile(player.team);
    let bonus = 0;
    const w17 = (weights?.week17Importance ?? 65) / 100;
    const w16 = (weights?.week16Importance ?? 25) / 100;
    const w15 = (weights?.week15Importance ?? 10) / 100;

    bonus += (profile.w17Score - 50) * 0.35 * w17;
    bonus += (profile.w16Score - 50) * 0.2 * w16;
    bonus += (profile.w15Score - 50) * 0.12 * w15;
    if (profile.dome) {
      bonus += 6 * w17;
    }

    const myTeams = new Set((myRoster || []).map((p) => normalizeTeam(p.team)));
    if (profile.w17Opp && myTeams.has(normalizeTeam(profile.w17Opp))) {
      bonus += 18 * w17;
    }
    if (profile.w16Opp && myTeams.has(normalizeTeam(profile.w16Opp))) {
      bonus += 10 * w16;
    }
    if (profile.w15Opp && myTeams.has(normalizeTeam(profile.w15Opp))) {
      bonus += 6 * w15;
    }
    if (myTeams.has(profile.team)) {
      bonus += 10 * w17;
    }
    return bonus;
  }

  global.FDSPlayoffSchedule = {
    getTeamPlayoffProfile,
    playoffBonusForPlayer,
    scheduleSource: SCHEDULE?.source || 'static',
    scheduleSeason: SCHEDULE?.season || null
  };
})(typeof window !== 'undefined' ? window : globalThis);
