(function (global) {
  const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

  function scrapeTeamCount() {
    const text = `${document.body?.innerText || ''}`;
    const match = text.match(/(\d+)\s+Teams\b/i);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function labeledEntries() {
    return [...document.querySelectorAll('[data-fds-exposure-player]')].map((node) => {
      const name = node.getAttribute('data-fds-exposure-player') || '';
      const position = String(node.getAttribute('data-pos') || '').toUpperCase();
      const team = String(node.getAttribute('data-team') || '').toUpperCase().slice(0, 3);
      const exposurePct = Number(node.getAttribute('data-pct'));
      if (!name || !SKILL.has(position) || !Number.isFinite(exposurePct)) return null;
      return { name, position, team: team === 'WSH' ? 'WAS' : team, exposurePct };
    }).filter(Boolean);
  }

  function scrapeVisibleExposure(boardPlayers) {
    const labeled = labeledEntries();
    const teamCount = scrapeTeamCount();
    if (labeled.length) {
      return { entries: labeled, teamCount, source: 'page' };
    }

    const pageText = `${document.body?.innerText || ''}`.replace(/\s+/g, ' ');
    const entries = [];
    const seen = new Set();
    (boardPlayers || []).slice(0, 320).forEach((player) => {
      if (!player?.name || !SKILL.has(player.position)) return;
      const key = `${player.name}|${player.position}`.toLowerCase();
      if (seen.has(key)) return;
      const escaped = String(player.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `${escaped}[\\s\\S]{0,220}?(\\d{1,2}(?:\\.\\d+)?)\\s*%(?:\\s*Drafted)?`,
        'i'
      );
      const match = pageText.match(pattern);
      if (!match) return;
      seen.add(key);
      entries.push({
        name: player.name,
        position: player.position,
        team: player.team || '',
        exposurePct: Number(match[1])
      });
    });

    return { entries, teamCount, source: 'page' };
  }

  function pageLooksLikeExplorer() {
    if (document.querySelector('[data-fds-test-explorer]')) return true;
    const path = String(location.pathname || '').toLowerCase();
    if (path.includes('lobby')) return true;
    const text = `${document.body?.innerText || ''}`.slice(0, 5000).toLowerCase();
    return (
      (text.includes('filters') && text.includes('drafted')) ||
      text.includes('player card') ||
      text.includes('all drafts') ||
      text.includes('tournaments only')
    );
  }

  function demoDrafts() {
    const p = (name, position, team) => ({ name, position, team });
    const cores = {
      gibbs: p('Jahmyr Gibbs', 'RB', 'DET'),
      bijan: p('Bijan Robinson', 'RB', 'ATL'),
      chase: p('Ja\'Marr Chase', 'WR', 'CIN'),
      arsb: p('Amon-Ra St. Brown', 'WR', 'DET'),
      jsn: p('Jaxon Smith-Njigba', 'WR', 'SEA'),
      jefferson: p('Justin Jefferson', 'WR', 'MIN'),
      lamb: p('CeeDee Lamb', 'WR', 'DAL'),
      puka: p('Puka Nacua', 'WR', 'LAR'),
      cmc: p('Christian McCaffrey', 'RB', 'SF'),
      cook: p('James Cook III', 'RB', 'BUF'),
      henry: p('Derrick Henry', 'RB', 'BAL'),
      allen: p('Josh Allen', 'QB', 'BUF'),
      goff: p('Jared Goff', 'QB', 'DET'),
      lamar: p('Lamar Jackson', 'QB', 'BAL'),
      bowers: p('Brock Bowers', 'TE', 'LV'),
      laporta: p('Sam LaPorta', 'TE', 'DET'),
      nico: p('Nico Collins', 'WR', 'HOU'),
      london: p('Drake London', 'WR', 'ATL'),
      btj: p('Brian Thomas Jr.', 'WR', 'JAX'),
      mhj: p('Marvin Harrison Jr.', 'WR', 'ARI'),
      kyren: p('Kyren Williams', 'RB', 'LAR'),
      jt: p('Jonathan Taylor', 'RB', 'IND'),
      purdy: p('Brock Purdy', 'QB', 'SF'),
      kittle: p('George Kittle', 'TE', 'SF'),
      ridley: p('Calvin Ridley', 'WR', 'TEN'),
      montgomery: p('David Montgomery', 'RB', 'DET')
    };

    const lineups = [
      [cores.gibbs, cores.arsb, cores.goff, cores.jsn, cores.bowers, cores.cook, cores.nico, cores.london, cores.purdy, cores.jt, cores.ridley, cores.laporta],
      [cores.gibbs, cores.montgomery, cores.arsb, cores.goff, cores.jefferson, cores.bowers, cores.cmc, cores.lamb, cores.allen, cores.nico, cores.kittle, cores.mhj],
      [cores.bijan, cores.chase, cores.allen, cores.jsn, cores.bowers, cores.henry, cores.puka, cores.btj, cores.laporta, cores.kyren, cores.london, cores.ridley],
      [cores.gibbs, cores.chase, cores.lamar, cores.arsb, cores.cook, cores.puka, cores.bowers, cores.nico, cores.jt, cores.mhj, cores.kittle, cores.purdy],
      [cores.bijan, cores.jefferson, cores.allen, cores.lamb, cores.cmc, cores.bowers, cores.jsn, cores.london, cores.laporta, cores.henry, cores.btj, cores.ridley],
      [cores.gibbs, cores.arsb, cores.goff, cores.montgomery, cores.jsn, cores.bowers, cores.puka, cores.cook, cores.nico, cores.kittle, cores.mhj, cores.jt],
      [cores.bijan, cores.chase, cores.lamar, cores.london, cores.henry, cores.puka, cores.bowers, cores.jefferson, cores.btj, cores.kyren, cores.laporta, cores.ridley],
      [cores.cmc, cores.lamb, cores.purdy, cores.kittle, cores.jsn, cores.gibbs, cores.nico, cores.bowers, cores.jt, cores.mhj, cores.arsb, cores.cook]
    ];

    return lineups.map((picks, index) => ({
      id: `demo-lineup-${index + 1}`,
      savedAt: Date.now() - index * 3600000,
      picks
    }));
  }

  function lineupId(picks, prefix) {
    const key = picks.map((p) => `${p.name}|${p.position}|${p.team}`.toLowerCase()).sort().join('::');
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0;
    }
    return `${prefix || 'lineup'}-${Math.abs(hash)}`;
  }

  function matchPlayerFromText(text, boardPlayers) {
    const match = global.FDSPlayerMatch;
    if (!match || !text) return null;
    const compact = match.normalizeName(text);
    const posHit = String(text).match(/\b(QB|RB|WR|TE)\b/i);
    const position = posHit ? posHit[1].toUpperCase() : '';
    let best = null;
    (boardPlayers || []).forEach((player) => {
      if (!SKILL.has(player.position)) return;
      if (position && player.position !== position) return;
      const hit = match.getNameMatchKeys(player.name).some((key) => key.length >= 5 && compact.includes(key));
      if (!hit) return;
      if (!best || player.name.length > best.name.length) best = player;
    });
    return best
      ? { name: best.name, position: best.position, team: best.team || '' }
      : null;
  }

  function uniquePicks(list) {
    const seen = new Set();
    const picks = [];
    list.forEach((player) => {
      if (!player?.name || !SKILL.has(player.position)) return;
      const key = `${player.name}|${player.position}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      picks.push({ name: player.name, position: player.position, team: player.team || '' });
    });
    return picks;
  }

  function parsePastedLineup(text, boardPlayers) {
    const raw = String(text || '').trim();
    if (!raw) return { picks: [], error: 'Paste a roster first.' };

    if (global.FDSCsvImport?.parseLineupCsv && /draft/i.test(raw.split(/\r?\n/)[0] || '') && raw.includes(',')) {
      const parsed = global.FDSCsvImport.parseLineupCsv(raw);
      if (!parsed.error && parsed.drafts?.length) {
        return { drafts: parsed.drafts, picks: parsed.drafts[0].picks, error: null };
      }
    }

    const fromLines = [];
    raw.split(/\r?\n/).forEach((line) => {
      const player = matchPlayerFromText(line, boardPlayers);
      if (player) fromLines.push(player);
    });
    let picks = uniquePicks(fromLines);

    if (picks.length < 8) {
      const blob = global.FDSPlayerMatch?.normalizeName(raw) || '';
      if (blob.length > 3500) {
        return { picks, error: `Found ${picks.length} skill players. Need 8+ (QB/RB/WR/TE).` };
      }
      const blobHits = [];
      (boardPlayers || [])
        .slice()
        .sort((a, b) => String(b.name || '').length - String(a.name || '').length)
        .forEach((player) => {
          const key = global.FDSPlayerMatch?.normalizeName(player.name) || '';
          if (key.length >= 6 && blob.includes(key)) blobHits.push(player);
        });
      const uniqueBlob = uniquePicks(blobHits);
      if (uniqueBlob.length > 20) {
        return { picks: uniqueBlob.slice(0, 20), error: 'Too many players on this view. Click one completed team.' };
      }
      picks = uniqueBlob.slice(0, 18);
    }

    if (picks.length < 8) {
      return { picks, error: `Found ${picks.length} skill players. Need 8+ (QB/RB/WR/TE).` };
    }
    return {
      picks,
      drafts: [{ id: lineupId(picks, 'paste'), savedAt: Date.now(), picks }],
      error: null
    };
  }

  function looksLikeBestBallRoster(picks) {
    if (!picks || picks.length < 8 || picks.length > 20) return false;
    const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
    picks.forEach((player) => {
      if (counts[player.position] != null) counts[player.position] += 1;
    });
    return counts.QB >= 1 && counts.RB >= 2 && counts.WR >= 3;
  }

  function scoreRoster(picks) {
    if (!looksLikeBestBallRoster(picks)) return 0;
    return 100 - Math.abs(18 - picks.length) * 4;
  }

  let lastClickText = '';
  let lastClickAt = 0;

  function rememberClickText(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (raw.length < 24 || raw.length > 20000) return;
    lastClickText = String(text || '').trim().slice(0, 12000);
    lastClickAt = Date.now();
  }

  function getLastClickText() {
    if (!lastClickText || Date.now() - lastClickAt > 90000) return '';
    return lastClickText;
  }

  function bindRosterClickCapture() {
    if (global.__FDS_ROSTER_CLICK_BOUND__ || typeof document === 'undefined') return;
    global.__FDS_ROSTER_CLICK_BOUND__ = true;
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('#fds-draft-assistant-root')) return;
      const hit = event.target?.closest?.(
        'button, a, li, article, tr, [role="button"], [role="row"], [role="listitem"], [class*="card" i], [class*="entry" i], [class*="team" i], [class*="draft" i], [class*="roster" i], [data-fds-completed-team]'
      ) || event.target;
      const node = hit && hit.nodeType === 1 ? hit : event.target;
      if (!node || node.nodeType !== 1) return;
      const block = node.closest?.('article, [role="dialog"], [aria-modal="true"], [class*="drawer" i], [class*="modal" i], [class*="sheet" i], [class*="panel" i], [data-fds-completed-team]') || node;
      const text = `${block.innerText || node.innerText || ''}`.trim();
      rememberClickText(text);
    }, true);
  }

  function parseRosterText(text, boardPlayers) {
    const parsed = parsePastedLineup(text, boardPlayers);
    if (!parsed.error && looksLikeBestBallRoster(parsed.picks)) {
      return parsed;
    }
    return parsed.error ? parsed : { ...parsed, error: parsed.picks?.length ? 'That view does not look like one completed team.' : parsed.error };
  }

  function visibleRosterRoots() {
    const selectors = [
      '[data-fds-completed-team]',
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[class*="drawer" i]',
      '[class*="modal" i]',
      '[class*="sheet" i]',
      '[class*="roster" i]',
      '[class*="lineup" i]',
      '[class*="MyTeam" i]',
      '[class*="your-team" i]',
      '[class*="completed" i]',
      '[class*="EntryDetail" i]',
      '[class*="entry-detail" i]',
      '[class*="DraftResults" i]',
      '[class*="draft-results" i]',
      '[aria-selected="true"]',
      '[class*="is-selected" i]',
      '[class*="isSelected"]',
      '[class*="selected-entry" i]',
      '.team-panel',
      '.roster-list',
      '#roster-list'
    ];
    const nodes = [];
    const seen = new Set();
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (seen.has(node) || node.closest?.('#fds-draft-assistant-root')) return;
        seen.add(node);
        nodes.push(node);
      });
    });
    return nodes;
  }

  function labeledBoardPicks(boardPlayers) {
    return uniquePicks([...document.querySelectorAll('[data-fds-player]')].map((node) => {
      const name = node.getAttribute('data-fds-player');
      const pos = String(node.getAttribute('data-pos') || '').toUpperCase();
      const player = (boardPlayers || []).find((p) =>
        global.FDSPlayerMatch?.namesMatch(p.name, name) && (!pos || p.position === pos)
      );
      return player || null;
    }).filter(Boolean));
  }

  function readVisibleRoster(boardPlayers, extraText) {
    const candidates = [];
    const clickText = extraText || getLastClickText();
    if (clickText) candidates.push(clickText);
    visibleRosterRoots().forEach((node) => {
      const text = `${node.innerText || ''}`.trim();
      if (text.length >= 40) candidates.push(text);
    });

    let best = null;
    let bestScore = 0;
    candidates.forEach((text) => {
      const parsed = parsePastedLineup(text, boardPlayers);
      if (parsed.error) return;
      const score = scoreRoster(parsed.picks);
      if (score > bestScore) {
        bestScore = score;
        best = parsed;
      }
    });
    if (best) {
      return {
        picks: best.picks,
        drafts: [{ id: lineupId(best.picks, 'page'), savedAt: Date.now(), picks: best.picks }],
        error: null,
        source: 'page'
      };
    }

    const fromLabels = labeledBoardPicks(boardPlayers);
    if (looksLikeBestBallRoster(fromLabels)) {
      return {
        picks: fromLabels,
        drafts: [{ id: lineupId(fromLabels, 'page'), savedAt: Date.now(), picks: fromLabels }],
        error: null,
        source: 'page'
      };
    }

    return {
      picks: [],
      error: 'No completed team found on this view. Click the team on Underdog, wait for the roster to show, then tap Save this team.'
    };
  }

  bindRosterClickCapture();

  global.FDSExposureSync = {
    scrapeVisibleExposure,
    scrapeTeamCount,
    pageLooksLikeExplorer,
    demoDrafts,
    parsePastedLineup,
    readVisibleRoster,
    looksLikeBestBallRoster,
    rememberClickText,
    getLastClickText,
    lineupId
  };
})(typeof window !== 'undefined' ? window : globalThis);
