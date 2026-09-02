(function (global) {
  const SOURCE = 'fds-underdog-hook';
  const PICK_LINE_WITH_NO = /^(\d{1,3}(?:\.\d{2})?)[\s.:-]+([A-Za-z][A-Za-z.'\-\s]+?)\s+(QB|RB|WR|TE)\s+([A-Z]{2,3})\b/;
  let latestNetworkSnapshot = null;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const payload = event.data;
    if (!payload || payload.source !== SOURCE || payload.kind !== 'snapshot') return;
    if (payload.data?.picks?.length) {
      latestNetworkSnapshot = {
        ...payload.data,
        source: 'network',
        capturedAt: Date.now()
      };
    }
  });

  function readTestRoom() {
    const root = document.querySelector('[data-fds-test-room]');
    if (!root) return null;
    try {
      const parsed = JSON.parse(root.getAttribute('data-fds-test-room') || '{}');
      return {
        isDraftRoom: true,
        source: 'test',
        picks: (parsed.picks || []).map((pick) => ({ ...pick, trusted: true })),
        onTheClock: Boolean(parsed.onTheClock),
        mySlot: parsed.mySlot || 1,
        draftId: parsed.draftId || 'test-room'
      };
    } catch (err) {
      return null;
    }
  }

  function normalizePickFromFeed(match) {
    return {
      pickNo: Number(String(match[1]).replace('.', '')),
      name: match[2].replace(/\s+/g, ' ').trim(),
      position: match[3],
      team: match[4],
      mine: false,
      trusted: true
    };
  }

  function readDomPicks() {
    if (document.querySelector('[data-fds-test-room]')) {
      return [];
    }

    const picks = [];
    const seen = new Set();
    const feedRoots = [
      ...document.querySelectorAll('#feed, [class*="pick-log"], [class*="pick-feed"], [class*="draft-board"], [class*="DraftBoard"]')
    ];
    const nodes = feedRoots.length
      ? feedRoots.flatMap((root) => [...root.querySelectorAll('li, tr, div, span, p')])
      : [];

    nodes.slice(0, 300).forEach((node) => {
      if (node.closest?.('#available, [class*="available"], [data-fds-player], .player-row')) {
        return;
      }
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 100) return;
      const match = text.match(PICK_LINE_WITH_NO);
      if (!match) return;
      const pick = normalizePickFromFeed(match);
      const key = `${pick.pickNo}:${pick.name}|${pick.position}|${pick.team}`;
      if (seen.has(key)) return;
      seen.add(key);
      picks.push(pick);
    });
    return picks;
  }

  function pageLooksLikeDraft() {
    const path = String(location.pathname || '').toLowerCase();
    if (document.querySelector('[data-fds-test-room]')) return true;
    if (path.includes('draft') && !path.includes('lobby')) return true;
    const bodyText = `${document.body?.innerText || ''}`.slice(0, 5000).toLowerCase();
    return (
      bodyText.includes('on the clock') ||
      bodyText.includes('draft board') ||
      bodyText.includes('your picks') ||
      bodyText.includes('available players')
    );
  }

  function onTheClockFromDom() {
    const selectors = [
      '[class*="on-the-clock" i]',
      '[class*="OnTheClock" i]',
      '[data-testid*="clock" i]',
      '[aria-live="polite"]'
    ];
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const text = `${node.textContent || ''}`.toLowerCase();
        if (text.includes("you're on the clock") || text.includes('you are on the clock') || text.includes('your pick')) {
          return true;
        }
      }
    }
    const text = `${document.body?.innerText || ''}`.slice(0, 6000).toLowerCase();
    if (text.includes("you're on the clock") || text.includes('you are on the clock') || text.includes('on the clock: you')) {
      return true;
    }
    return null;
  }

  function draftIdFromLocation() {
    const path = String(location.pathname || '');
    const match = path.match(/\/drafts?\/([a-f0-9-]{8,})/i);
    return match ? match[1] : null;
  }

  function read() {
    const testRoom = readTestRoom();
    if (testRoom) {
      return testRoom;
    }

    const network = latestNetworkSnapshot;
    const domPicks = readDomPicks();
    const networkPicks = (network?.picks || []).filter((pick) => Number(pick.pickNo) > 0);
    const picks = networkPicks.length ? networkPicks : domPicks;
    const isDraftRoom = pageLooksLikeDraft() || picks.length > 0;
    return {
      isDraftRoom,
      source: networkPicks.length ? 'network' : (domPicks.length ? 'dom' : 'none'),
      picks,
      onTheClock: network?.onTheClock ?? onTheClockFromDom(),
      mySlot: network?.mySlot || null,
      draftId: network?.draftId || draftIdFromLocation()
    };
  }

  global.FDSUnderdogAdapter = {
    read
  };
})(typeof window !== 'undefined' ? window : globalThis);
