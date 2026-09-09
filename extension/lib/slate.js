(function (global) {
  const TZ = 'America/New_York';
  const ALIASES = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const DAILY_FORMAT = {
    totalPicks: 8,
    posTarget: { QB: 1, RB: 2, WR: 4, TE: 1 },
    posMax: { QB: 2, RB: 3, WR: 5, TE: 2 },
    countBands: {
      QB: { min: 1, max: 2, earlyPick: 24 },
      RB: { min: 2, max: 3, earlyPick: 24 },
      WR: { min: 3, max: 5, earlyPick: 32 },
      TE: { min: 1, max: 2, earlyPick: 32 }
    }
  };

  const PRESETS = {
    primetime: {
      id: 'primetime',
      label: 'Primetime (Wed/Thu)',
      days: ['Wed', 'Thu'],
      kickoffAfter: 19
    },
    sunday: {
      id: 'sunday',
      label: 'Sunday',
      days: ['Sun'],
      kickoffAfter: 12
    },
    'sunday-main': {
      id: 'sunday-main',
      label: 'Sunday main',
      days: ['Sun'],
      kickoffAfter: 12,
      kickoffBefore: 20
    },
    snf: {
      id: 'snf',
      label: 'Sunday night',
      days: ['Sun'],
      kickoffAfter: 20
    },
    mnf: {
      id: 'mnf',
      label: 'Monday night',
      days: ['Mon'],
      kickoffAfter: 19
    },
    friday: {
      id: 'friday',
      label: 'Friday',
      days: ['Fri']
    },
    all: {
      id: 'all',
      label: 'Full week',
      days: WEEKDAYS.slice()
    }
  };

  function getStore() {
    return global.FDSNflGames2026 || null;
  }

  function getGames() {
    return getStore()?.games || [];
  }

  function normalizeTeam(team) {
    const code = String(team || '').toUpperCase().slice(0, 3);
    return ALIASES[code] || code;
  }

  function parseKickoff(iso) {
    const stamp = Date.parse(iso);
    return Number.isFinite(stamp) ? stamp : null;
  }

  function kickoffParts(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
      month: 'short',
      day: 'numeric'
    });
    const parts = {};
    fmt.formatToParts(date).forEach((part) => {
      if (part.type !== 'literal') parts[part.type] = part.value;
    });
    return {
      weekday: parts.weekday,
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      month: parts.month,
      day: Number(parts.day),
      label: `${parts.weekday} ${parts.month} ${Number(parts.day)} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')} ET`
    };
  }

  function matchesWindow(parts, preset) {
    if (!parts || !preset) return false;
    if (preset.days?.length && !preset.days.includes(parts.weekday)) return false;
    if (Number.isFinite(preset.kickoffAfter) && parts.hour < preset.kickoffAfter) return false;
    if (Number.isFinite(preset.kickoffBefore) && parts.hour >= preset.kickoffBefore) return false;
    return true;
  }

  function gamesForWeek(week) {
    const number = Number(week);
    if (!Number.isFinite(number) || number < 1) return getGames();
    return getGames().filter((game) => Number(game.week) === number);
  }

  function currentWeek(now = Date.now()) {
    const games = getGames();
    if (!games.length) return 1;
    const horizon = Number(now) - 12 * 60 * 60 * 1000;
    const upcoming = games
      .filter((game) => parseKickoff(game.kickoff) != null && parseKickoff(game.kickoff) > horizon)
      .sort((a, b) => parseKickoff(a.kickoff) - parseKickoff(b.kickoff));
    return upcoming[0]?.week || games[games.length - 1].week;
  }

  function resolveWeek(week) {
    const number = Number(week);
    if (Number.isFinite(number) && number >= 1) return number;
    return currentWeek();
  }

  function uniqueTeams(games) {
    const teams = new Set();
    (games || []).forEach((game) => {
      if (game.home) teams.add(normalizeTeam(game.home));
      if (game.away) teams.add(normalizeTeam(game.away));
    });
    return [...teams].sort();
  }

  function resolve(options = {}) {
    const presetId = options.preset || 'primetime';
    const preset = PRESETS[presetId] || PRESETS.primetime;
    const week = resolveWeek(options.week);
    let games = gamesForWeek(week);

    const manualTeams = (options.teams || []).map(normalizeTeam).filter(Boolean);
    if (manualTeams.length) {
      const want = new Set(manualTeams);
      games = games.filter((game) => want.has(normalizeTeam(game.home)) || want.has(normalizeTeam(game.away)));
    } else if (preset.id !== 'all') {
      games = games.filter((game) => matchesWindow(kickoffParts(game.kickoff), preset));
    }

    games = games.slice().sort((a, b) => parseKickoff(a.kickoff) - parseKickoff(b.kickoff));
    const teams = uniqueTeams(games);
    return {
      id: `${preset.id}-w${week}`,
      preset: preset.id,
      label: preset.label,
      week,
      games,
      teams,
      teamSet: new Set(teams)
    };
  }

  function playerOnSlate(player, slate) {
    if (!slate) return true;
    const team = normalizeTeam(player?.team);
    if (!team) return false;
    return slate.teamSet ? slate.teamSet.has(team) : (slate.teams || []).includes(team);
  }

  function gameForTeam(team, slate) {
    const code = normalizeTeam(team);
    if (!code || !slate?.games) return null;
    return slate.games.find((game) => normalizeTeam(game.home) === code || normalizeTeam(game.away) === code) || null;
  }

  function sameGame(teamA, teamB, slate) {
    const a = normalizeTeam(teamA);
    const b = normalizeTeam(teamB);
    if (!a || !b || a === b) return false;
    const game = gameForTeam(a, slate);
    if (!game) return false;
    return normalizeTeam(game.home) === b || normalizeTeam(game.away) === b;
  }

  function opponentFor(team, slate) {
    const game = gameForTeam(team, slate);
    if (!game) return '';
    const code = normalizeTeam(team);
    return normalizeTeam(game.home) === code ? game.away : game.home;
  }

  function slateBonusForPlayer(player, myRoster, slate, weights) {
    const game = gameForTeam(player?.team, slate);
    if (!game) return 0;
    const scale = (weights?.slateImportance ?? 70) / 100;
    let bonus = 0;
    const total = Number(game.total);
    if (Number.isFinite(total)) {
      bonus += (total - 45) * 1.2 * scale;
    }
    if (game.indoor) bonus += 6 * scale;
    return bonus;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function gameLabel(game) {
    const parts = kickoffParts(game.kickoff);
    const matchup = game.neutral ? `${game.away} vs ${game.home}` : `${game.away} @ ${game.home}`;
    const when = parts?.label || game.status || '';
    const extra = Number.isFinite(Number(game.total)) ? `O/U ${game.total}` : '';
    return { matchup, when, extra };
  }

  function renderSlateTable(slate, myRoster) {
    const myTeams = new Set((myRoster || []).map((player) => normalizeTeam(player.team)).filter(Boolean));
    if (!slate?.games?.length) {
      return `<div class="fds-playoff-table">
        <h3>${escapeHtml(slate?.label || 'Slate')}</h3>
        <p class="fds-cap-empty">No games in this window for week ${escapeHtml(slate?.week || '')}.</p>
      </div>`;
    }
    return `<div class="fds-playoff-table fds-slate-table">
      <h3>${escapeHtml(slate.label)} · week ${escapeHtml(slate.week)}</h3>
      <div class="fds-po-table-head fds-slate-head"><span>Matchup</span><span>Kickoff</span><span>Total</span></div>
      ${slate.games.map((game) => {
        const row = gameLabel(game);
        const mine = myTeams.has(normalizeTeam(game.home)) || myTeams.has(normalizeTeam(game.away));
        return `<div class="fds-po-table-row fds-slate-row${mine ? ' is-mine' : ''}">
          <strong>${escapeHtml(row.matchup)}</strong>
          <span>${escapeHtml(row.when)}</span>
          <span>${escapeHtml(row.extra || '—')}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  global.FDSSlate = {
    PRESETS,
    DAILY_FORMAT,
    getGames,
    gamesForWeek,
    currentWeek,
    kickoffParts,
    resolve,
    playerOnSlate,
    gameForTeam,
    sameGame,
    opponentFor,
    slateBonusForPlayer,
    renderSlateTable,
    scheduleSeason: getStore()?.season || null,
    scheduleSource: getStore()?.source || 'static'
  };
})(typeof window !== 'undefined' ? window : globalThis);
