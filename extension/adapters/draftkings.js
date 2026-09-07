(function (global) {
  const SOURCE = 'fds-draftkings-hook';
  const PICK_LINE_WITH_NO = /^(\d{1,3}(?:\.\d{2})?)[\s.:-]+([A-Za-z][A-Za-z.'\-\s]+?)\s+(QB|RB|WR|TE)\s+([A-Z]{2,3})\b/;
  const PICK_LINE_NAME_POS = /^([A-Za-z][A-Za-z.'\-\s]{2,40}?)\s+(QB|RB|WR|TE)\s+([A-Z]{2,3})\b/;
  const DK_TOTAL_PICKS = 20;
  let latestNetworkSnapshot = null;
  let latestPortfolioSnapshot = null;
  let latestVisibleRoster = null;

  window.addEventListener('message', (event) => {
    const payload = event.data;
    if (!payload || payload.source !== SOURCE) return;
    if (payload.kind === 'snapshot' && payload.data?.picks?.length) {
      latestNetworkSnapshot = {
        ...payload.data,
        source: 'network',
        capturedAt: Date.now()
      };
    }
    if (payload.kind === 'portfolio') {
      const drafts = payload.data?.drafts || [];
      const exposure = payload.data?.exposure || [];
      if (drafts.length || exposure.length) {
        latestPortfolioSnapshot = {
          drafts,
          exposure,
          capturedAt: Date.now()
        };
      }
      if (payload.data?.visibleDraft?.picks?.length) {
        latestVisibleRoster = {
          ...payload.data.visibleDraft,
          capturedAt: Date.now()
        };
      }
    }
  });

  function readTestRoom() {
    const root = document.querySelector('[data-fds-test-dk-room]');
    if (!root) return null;
    try {
      const parsed = JSON.parse(root.getAttribute('data-fds-test-dk-room') || '{}');
      return {
        isDraftRoom: true,
        source: 'test',
        picks: (parsed.picks || []).map((pick) => ({ ...pick, trusted: true })),
        onTheClock: Boolean(parsed.onTheClock),
        mySlot: parsed.mySlot || 1,
        draftId: parsed.draftId || 'dk-test-room',
        totalPicks: Number(parsed.totalPicks) || DK_TOTAL_PICKS
      };
    } catch (err) {
      return null;
    }
  }

  function parsePickLine(text, { requirePickNo } = {}) {
    let match = text.match(PICK_LINE_WITH_NO);
    if (match) {
      return {
        pickNo: Number(String(match[1]).replace('.', '')),
        name: match[2].replace(/\s+/g, ' ').trim(),
        position: match[3],
        team: match[4],
        mine: false,
        trusted: true
      };
    }
    if (requirePickNo) return null;
    match = text.match(PICK_LINE_NAME_POS);
    if (match) {
      return {
        pickNo: null,
        name: match[1].replace(/\s+/g, ' ').trim(),
        position: match[2],
        team: match[3],
        mine: false,
        trusted: true
      };
    }
    return null;
  }

  function documentsToScan() {
    const docs = [document];
    [...document.querySelectorAll('iframe')].forEach((frame) => {
      try {
        if (frame.contentDocument) docs.push(frame.contentDocument);
      } catch (err) {
        /* cross-origin iframe */
      }
    });
    return docs;
  }

  function addPick(picks, seen, pick, index) {
    if (!pick?.name) return;
    const key = `${pick.name}|${pick.position}|${pick.team}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    picks.push({
      ...pick,
      pickNo: Number(pick.pickNo) > 0 ? Number(pick.pickNo) : picks.length + 1 + (index || 0),
      trusted: true
    });
  }

  function readDomPicks() {
    if (document.querySelector('[data-fds-test-dk-room]')) {
      return [];
    }

    const picks = [];
    const seen = new Set();
    documentsToScan().forEach((doc) => {
      const feedRoots = [
        ...doc.querySelectorAll('#feed, [class*="pick-log"], [class*="pick-feed"], [class*="PickFeed"], [class*="PickHistory"], [class*="pick-history"], [class*="recent-pick"], [class*="RecentPick"], [class*="ticker"]')
      ];
      if (feedRoots.length) {
        feedRoots.flatMap((root) => [...root.querySelectorAll('li, tr, div, span, p')]).slice(0, 400).forEach((node, index) => {
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (!text || text.length > 140) return;
          addPick(picks, seen, parsePickLine(text), index);
        });
      }
      if (!picks.length) {
        `${doc.body?.innerText || ''}`.split('\n').slice(0, 400).forEach((line, index) => {
          const text = line.replace(/\s+/g, ' ').trim();
          if (!text || text.length > 80) return;
          addPick(picks, seen, parsePickLine(text, { requirePickNo: true }), index);
        });
      }
    });
    return picks;
  }

  function inactiveHost() {
    const host = String(location.hostname || '').toLowerCase();
    if (document.querySelector('[data-fds-test-dk-room]')) return false;
    if (host.includes('sportsbook') || host.includes('casino') || host.includes('poker')) return true;
    const path = String(location.pathname || '').toLowerCase();
    return /\/(sportsbook|casino|poker|dkcas|lotto)\b/.test(path);
  }

  function pageLooksLikeDraft() {
    const path = String(location.pathname || '').toLowerCase();
    const href = `${path} ${location.hash || ''} ${location.search || ''}`.toLowerCase();
    if (document.querySelector('[data-fds-test-dk-room]')) return true;
    if (/draft\/contest|snakedraft|live-draft|in-draft|\/drafts?\b/.test(href)) return true;
    if (path.includes('/draft') && !path.includes('lobby')) return true;
    if (/draft/.test(String(location.hash || '').toLowerCase())) return true;
    if (looksLikeDraftUi()) return true;
    const bodyText = `${document.body?.innerText || ''}`.slice(0, 8000).toLowerCase();
    return (
      bodyText.includes('on the clock') ||
      bodyText.includes('make your pick') ||
      bodyText.includes('your turn') ||
      bodyText.includes('draft board') ||
      bodyText.includes('available players') ||
      (bodyText.includes('queue') && bodyText.includes('your team'))
    );
  }

  function looksLikeDraftUi() {
    const text = `${document.body?.innerText || ''}`.slice(0, 8000);
    const skillHits = (text.match(/\b(QB|RB|WR|TE)\b/g) || []).length;
    return skillHits >= 12 && (
      /queue|on the clock|make your pick|your team|available/i.test(text)
    );
  }

  function pageLooksLikeExplorer() {
    if (document.querySelector('[data-fds-test-explorer]')) return true;
    if (pageLooksLikeDraft()) return false;
    const path = String(location.pathname || '').toLowerCase();
    if (/\/lobby|my-?lineups|mycontests/.test(path) && !/draft/.test(path)) return true;
    return Boolean(window.FDSExposureSync?.pageLooksLikeExplorer?.());
  }

  function onTheClockFromDom() {
    const selectors = [
      '[class*="on-the-clock" i]',
      '[class*="OnTheClock" i]',
      '[class*="your-turn" i]',
      '[data-testid*="clock" i]',
      '[aria-live="polite"]'
    ];
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const text = `${node.textContent || ''}`.toLowerCase();
        if (
          text.includes("you're on the clock") ||
          text.includes('you are on the clock') ||
          text.includes('your turn') ||
          text.includes('make your pick') ||
          text.includes('your pick')
        ) {
          return true;
        }
      }
    }
    const text = `${document.body?.innerText || ''}`.slice(0, 6000).toLowerCase();
    if (
      text.includes("you're on the clock") ||
      text.includes('you are on the clock') ||
      text.includes('on the clock: you') ||
      text.includes('make your pick')
    ) {
      return true;
    }
    return null;
  }

  function draftIdFromLocation() {
    const href = `${location.pathname || ''}${location.search || ''}${location.hash || ''}`;
    const match = href.match(/\/draft\/contest\/(\d+)/i)
      || href.match(/contest(?:id|key)?=(\d{6,})/i)
      || href.match(/draft(?:id)?=(\d{6,}|[a-f0-9-]{8,})/i);
    return match ? match[1] : null;
  }

  function read() {
    if (inactiveHost()) {
      return {
        inactive: true,
        isDraftRoom: false,
        isExplorer: false,
        source: 'none',
        picks: [],
        onTheClock: null,
        mySlot: null,
        draftId: null,
        totalPicks: DK_TOTAL_PICKS
      };
    }

    const testRoom = readTestRoom();
    if (testRoom) {
      return testRoom;
    }

    const network = latestNetworkSnapshot;
    const domPicks = readDomPicks();
    const networkPicks = (network?.picks || []).map((pick, index) => ({
      ...pick,
      pickNo: Number(pick.pickNo) > 0 ? Number(pick.pickNo) : index + 1,
      trusted: true
    }));
    const picks = networkPicks.length ? networkPicks : domPicks;
    const isDraftRoom = pageLooksLikeDraft() || picks.length > 0;
    const explorer = pageLooksLikeExplorer() && !isDraftRoom;
    return {
      isDraftRoom,
      isExplorer: explorer && !isDraftRoom,
      source: networkPicks.length ? 'network' : (domPicks.length ? 'dom' : 'none'),
      picks,
      onTheClock: network?.onTheClock ?? onTheClockFromDom(),
      mySlot: network?.mySlot || null,
      draftId: network?.draftId || draftIdFromLocation(),
      totalPicks: Number(network?.totalPicks) || DK_TOTAL_PICKS,
      portfolioCapture: latestPortfolioSnapshot,
      visibleRoster: latestVisibleRoster && (Date.now() - (latestVisibleRoster.capturedAt || 0) < 15000)
        ? latestVisibleRoster
        : null
    };
  }

  global.FDSDraftKingsAdapter = {
    read
  };
})(typeof window !== 'undefined' ? window : globalThis);
