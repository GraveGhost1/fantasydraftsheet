(function (global) {
  function normalizeTeam(team) {
    const code = String(team || '').toUpperCase().slice(0, 3);
    return code === 'WSH' ? 'WAS' : code;
  }

  function teamCounts(roster) {
    const counts = {};
    (roster || []).forEach((player) => {
      const team = normalizeTeam(player.team);
      if (!team) return;
      counts[team] = (counts[team] || 0) + 1;
    });
    return counts;
  }

  function rosterWarnings(myRoster, candidate) {
    const warnings = [];
    const counts = teamCounts(myRoster);
    const roster = candidate ? [...myRoster, candidate] : myRoster;
    const nextCounts = teamCounts(roster);

    Object.entries(nextCounts).forEach(([team, count]) => {
      if (count >= 4) {
        warnings.push({ type: 'team-heavy', team, count, severity: 'high', message: `${count} players from ${team}` });
      } else if (count === 3) {
        warnings.push({ type: 'team-heavy', team, count, severity: 'medium', message: `3 players from ${team}` });
      }
    });

    const qbs = roster.filter((p) => p.position === 'QB');
    const qbTeams = new Set(qbs.map((p) => normalizeTeam(p.team)));
    qbs.forEach((qb) => {
      const team = normalizeTeam(qb.team);
      const sameTeamSkill = roster.filter((p) => p.position !== 'QB' && normalizeTeam(p.team) === team);
      if (sameTeamSkill.length >= 3) {
        warnings.push({
          type: 'qb-stack-heavy',
          team,
          count: sameTeamSkill.length + 1,
          severity: 'medium',
          message: `Heavy ${team} stack (${sameTeamSkill.length + 1} with ${qb.name.split(' ').pop()})`
        });
      }
    });

    if (candidate) {
      const candTeam = normalizeTeam(candidate.team);
      const current = counts[candTeam] || 0;
      if (current >= 2 && candidate.position !== 'QB') {
        warnings.push({
          type: 'candidate-team',
          team: candTeam,
          count: current + 1,
          severity: current >= 3 ? 'high' : 'medium',
          message: `Adds a ${current + 1}${current + 1 === 3 ? 'rd' : 'th'} ${candTeam} player`
        });
      }
    }

    const seen = new Set();
    roster.forEach((player) => {
      const key = `${player.name}|${player.position}`.toLowerCase();
      if (seen.has(key)) {
        warnings.push({
          type: 'duplicate-player',
          severity: 'high',
          message: `Duplicate ${player.name}`
        });
      }
      seen.add(key);
    });

    const deduped = [];
    const seenMsg = new Set();
    warnings.forEach((warning) => {
      const key = warning.message;
      if (seenMsg.has(key)) return;
      seenMsg.add(key);
      deduped.push(warning);
    });
    return deduped;
  }

  function duplicatePenalty(player, myRoster, weight) {
    const scale = (weight ?? 35) / 100;
    if (!scale) return 0;
    const warnings = rosterWarnings(myRoster, player);
    let penalty = 0;
    warnings.forEach((warning) => {
      if (warning.type === 'candidate-team' || warning.type === 'team-heavy') {
        penalty += warning.severity === 'high' ? 22 : 12;
      }
      if (warning.type === 'qb-stack-heavy') {
        penalty += 14;
      }
    });
    return penalty * scale;
  }

  function draftSummary(myRoster) {
    const counts = teamCounts(myRoster);
    const topTeams = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const warnings = rosterWarnings(myRoster, null);
    const grouped = { QB: [], RB: [], WR: [], TE: [] };
    (myRoster || []).forEach((player) => {
      if (grouped[player.position]) grouped[player.position].push(player);
    });
    return {
      pickCount: myRoster.length,
      byPosition: grouped,
      topTeams,
      warnings
    };
  }

  global.FDSDuplicates = {
    rosterWarnings,
    duplicatePenalty,
    draftSummary,
    teamCounts
  };
})(typeof window !== 'undefined' ? window : globalThis);
