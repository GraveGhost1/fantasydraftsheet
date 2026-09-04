(function (global) {
  function getSchedule() {
    return global.FDSNflSchedule2026 || null;
  }

  function normalizeTeam(team) {
    const code = String(team || '').toUpperCase().slice(0, 3);
    if (code === 'WSH') return 'WAS';
    if (code === 'JAC') return 'JAX';
    return code;
  }

  function getTeamInfo(team) {
    const schedule = getSchedule();
    const code = normalizeTeam(team);
    return schedule?.teams?.[code] || schedule?.teams?.[team?.toUpperCase()] || null;
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

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function shortName(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length <= 1) return parts[0] || '';
    return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  }

  function weekOppLabel(team, week) {
    const game = getTeamInfo(team)?.playoff?.[String(week)];
    if (!game) return '';
    if (game.raw) return game.raw;
    if (!game.opponent) return '';
    return game.home ? game.opponent : `@${game.opponent}`;
  }

  function rosterPlayoffRows(myRoster) {
    const groups = new Map();
    (myRoster || []).forEach((player) => {
      const team = normalizeTeam(player.team);
      if (!team) return;
      if (!groups.has(team)) groups.set(team, []);
      groups.get(team).push(player);
    });
    return [...groups.entries()]
      .map(([team, players]) => ({
        team,
        players,
        names: players.map((player) => shortName(player.name)).join(', '),
        w15: weekOppLabel(team, 15) || '—',
        w16: weekOppLabel(team, 16) || '—',
        w17: weekOppLabel(team, 17) || '—'
      }))
      .sort((a, b) => a.team.localeCompare(b.team));
  }

  function renderMatchupTable(myRoster) {
    const rows = rosterPlayoffRows(myRoster);
    if (!rows.length) {
      return `<div class="fds-playoff-table">
        <h3>Playoff matchups</h3>
        <p class="fds-cap-empty">Draft players to see W15–W17 opponents.</p>
      </div>`;
    }
    return `<div class="fds-playoff-table">
      <h3>Playoff matchups</h3>
      <div class="fds-po-table-head"><span>Team</span><span>Players</span><span>W15</span><span>W16</span><span>W17</span></div>
      ${rows.map((row) => `<div class="fds-po-table-row">
        <strong>${escapeHtml(row.team)}</strong>
        <span>${escapeHtml(row.names)}</span>
        <span>${escapeHtml(row.w15)}</span>
        <span>${escapeHtml(row.w16)}</span>
        <span>${escapeHtml(row.w17)}</span>
      </div>`).join('')}
    </div>`;
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
    weekOppLabel,
    rosterPlayoffRows,
    renderMatchupTable,
    scheduleSource: getSchedule()?.source || 'static',
    scheduleSeason: getSchedule()?.season || null
  };
})(typeof window !== 'undefined' ? window : globalThis);
