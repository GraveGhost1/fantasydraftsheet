(function (global) {
  const SOURCE = 'fds-underdog-hook';
  let latestNetworkSnapshot = null;
  let latestPortfolioSnapshot = null;
  let latestVisibleRoster = null;
  let latestRawPicks = [];
  let latestFocusPicks = [];
  let latestFocusEntryId = '';
  let latestAppearances = {};
  let lastHookAsk = 0;
  let lastPairSig = '';

  function entryIdFromLocation() {
    const text = String(location.href || '');
    const match = text.match(/[?&](?:draft_)?entry(?:_id)?=([a-f0-9-]{8,})/i)
      || text.match(/\/entr(?:y|ies)\/([a-f0-9-]{8,})/i);
    return match ? match[1] : '';
  }

  function pairRawToNamed(rawPicks, namedPicks) {
    const out = {};
    const raw = (rawPicks || []).filter((pick) => pick && (pick.appearance_id || pick.appearanceId));
    const named = (namedPicks || []).filter((pick) => pick?.name && String(pick.name).length >= 3);
    if (!raw.length || !named.length) return out;
    const byNo = new Map();
    raw.forEach((pick) => {
      const n = Number(pick.number || pick.pickNo);
      if (Number.isFinite(n) && n > 0) byNo.set(n, pick);
    });
    named.forEach((pick) => {
      const matched = byNo.get(Number(pick.pickNo));
      const id = pick.appearanceId || pick.appearance_id || matched?.appearance_id || matched?.appearanceId;
      if (id) {
        out[String(id)] = { name: pick.name, position: pick.position || '', team: pick.team || '' };
      }
    });
    if (Object.keys(out).length >= Math.min(4, named.length)) return out;
    const groups = new Map();
    raw.forEach((pick) => {
      const entry = String(pick.draft_entry_id || pick.entryId || '');
      if (!entry) return;
      if (!groups.has(entry)) groups.set(entry, []);
      groups.get(entry).push(pick);
    });
    const sortedNamed = [...named].sort((a, b) => (Number(a.pickNo) || 999) - (Number(b.pickNo) || 999));
    const focusId = latestFocusEntryId || entryIdFromLocation();
    const mine = raw.filter((pick) => (
      pick.mine || (focusId && String(pick.draft_entry_id || pick.entryId) === String(focusId))
    ));
    const sameLength = [];
    groups.forEach((list) => {
      if (Math.abs(list.length - sortedNamed.length) <= 2 && list.length >= 4) sameLength.push(list);
    });
    const focused = focusId && groups.get(String(focusId));
    const best = mine.length >= 4 && Math.abs(mine.length - sortedNamed.length) <= 2
      ? mine
      : (focused && Math.abs(focused.length - sortedNamed.length) <= 2 ? focused : null)
        || (sameLength.length === 1 ? sameLength[0] : null)
        || (named.length >= 4 && named.length <= 10 && raw.length >= 4 && raw.length <= 10 ? raw : null);
    if (best) {
      const ordered = [...best].sort((a, b) => Number(a.number || a.pickNo) - Number(b.number || b.pickNo));
      const n = Math.min(ordered.length, sortedNamed.length);
      for (let i = 0; i < n; i += 1) {
        const id = ordered[i].appearance_id || ordered[i].appearanceId;
        if (id) {
          out[String(id)] = {
            name: sortedNamed[i].name,
            position: sortedNamed[i].position || '',
            team: sortedNamed[i].team || ''
          };
        }
      }
    }
    return out;
  }

  function storeAppearances(map) {
    if (!map || !Object.keys(map).length) return;
    latestAppearances = { ...latestAppearances, ...map };
    try {
      chrome.runtime.sendMessage({ type: 'STORE_UD_APPEARANCES', payload: map });
    } catch (err) {
      /* ignore */
    }
  }

  function learnFromVisible() {
    const named = latestVisibleRoster?.picks || [];
    const paired = pairRawToNamed(latestFocusPicks.length ? latestFocusPicks : latestRawPicks, named);
    const keys = Object.keys(paired).sort().join(',');
    if (!keys || keys === lastPairSig) return paired;
    lastPairSig = keys;
    storeAppearances(paired);
    const draftId = latestRawPicks[0]?.draftId || latestFocusPicks[0]?.draftId;
    if (draftId && named.length >= 4 && named.length <= 10) {
      try {
        chrome.runtime.sendMessage({
          type: 'REMEMBER_UD_DRAFT',
          payload: { draftId, mode: 'daily', picks: named }
        });
      } catch (err) {
        /* ignore */
      }
    }
    return paired;
  }

  function requestHookSnapshot() {
    const now = Date.now();
    if (now - lastHookAsk < 2000) return;
    lastHookAsk = now;
    const message = { source: SOURCE, kind: 'request' };
    try {
      window.postMessage(message, '*');
    } catch (err) {
      /* ignore */
    }
    [...document.querySelectorAll('iframe')].forEach((frame) => {
      try {
        frame.contentWindow?.postMessage(message, '*');
      } catch (err) {
        /* cross-origin iframe */
      }
    });
  }

  window.addEventListener('message', (event) => {
    const payload = event.data;
    if (!payload || payload.source !== SOURCE) return;
    if (payload.kind === 'appearances' && payload.data && typeof payload.data === 'object') {
      storeAppearances(payload.data);
    }
    if (payload.kind === 'raw-picks' && Array.isArray(payload.data?.picks)) {
      latestRawPicks = payload.data.picks;
      latestFocusPicks = payload.data.focusPicks || [];
      latestFocusEntryId = payload.data.entryId || latestFocusEntryId || '';
      learnFromVisible();
    }
    if (payload.kind === 'snapshot' && payload.data?.picks?.length) {
      latestNetworkSnapshot = {
        ...payload.data,
        source: 'network',
        capturedAt: Date.now()
      };
      const appearances = {};
      payload.data.picks.forEach((pick) => {
        if (pick?.appearanceId && pick.name && pick.position) {
          appearances[String(pick.appearanceId)] = {
            name: pick.name,
            position: pick.position,
            team: pick.team || ''
          };
        }
      });
      if (Object.keys(appearances).length) {
        try {
          chrome.runtime.sendMessage({ type: 'STORE_UD_APPEARANCES', payload: appearances });
        } catch (err) {
          /* ignore */
        }
      }
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
        learnFromVisible();
      }
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

  function toTrustedPick(pick) {
    if (!pick?.name) return null;
    return {
      ...pick,
      pickNo: Number(pick.pickNo) > 0 ? Number(pick.pickNo) : null,
      mine: Boolean(pick.mine),
      trusted: true
    };
  }

  function addPick(picks, seen, pick) {
    const next = toTrustedPick(pick);
    if (!next) return;
    const key = `${next.name}|${next.position}|${next.team}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    picks.push(next);
  }

  function parsePickLine(text, options) {
    const parsed = global.FDSPlayerMatch?.parsePickText?.(text, options);
    if (!parsed?.name) return null;
    return { ...parsed, mine: false, trusted: true };
  }

  function readPickCards() {
    const picks = [];
    const seen = new Set();
    const cards = document.querySelectorAll(
      '.pick-card, [class*="pick-card" i], [class*="PickCard"], [class*="recent-pick" i], [class*="RecentPick"], [class*="DraftPick"], [class*="draft-pick" i], [class*="PickRow"], [class*="pick-row" i]'
    );
    cards.forEach((card, index) => {
      if (card.closest?.('#available, [class*="available-player" i], [data-fds-player]')) return;
      const name = (card.querySelector('.name, [class*="player-name" i], [class*="PlayerName"], strong')?.textContent || '').trim();
      const sub = (card.querySelector('.sub, [class*="meta" i], [class*="position" i]')?.textContent || '').trim();
      const combined = `${card.textContent || ''}`.replace(/\s+/g, ' ').trim();
      const parsed = parsePickLine(`${name} ${sub}`) || parsePickLine(combined);
      if (!parsed) return;
      if (/upcoming|on the clock/i.test(name || combined)) return;
      addPick(picks, seen, parsed, index);
    });
    return picks;
  }

  function readDomPicks() {
    if (document.querySelector('[data-fds-test-room]')) {
      return [];
    }

    const picks = [];
    const seen = new Set();
    readPickCards().forEach((pick, index) => addPick(picks, seen, pick, index));

    const feedRoots = [
      ...document.querySelectorAll(
        '#feed, #ticker, .ticker, [class*="pick-log"], [class*="pick-feed"], [class*="PickFeed"], [class*="draft-board"], [class*="DraftBoard"], [class*="pick-history" i], [class*="ticker" i], [class*="PickHistory"], [class*="activity" i], [aria-label*="pick" i]'
      )
    ];
    const nodes = feedRoots.length
      ? feedRoots.flatMap((root) => [...root.querySelectorAll('li, tr, div, span, p, button')])
      : [];

    nodes.slice(0, 500).forEach((node, index) => {
      if (node.closest?.('#available, [class*="available-player" i], [data-fds-player], .player-row, .ud-player-row')) {
        return;
      }
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 200) return;
      addPick(picks, seen, parsePickLine(text), index);
    });

    if (!picks.length) {
      `${document.body?.innerText || ''}`.split('\n').slice(0, 500).forEach((line, index) => {
        const text = line.replace(/\s+/g, ' ').trim();
        if (!text || text.length > 90) return;
        addPick(picks, seen, parsePickLine(text, { requirePickNo: true }), index);
      });
    }
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

  function mergePickLists(...lists) {
    return global.FDSRankBoard?.mergePicks
      ? global.FDSRankBoard.mergePicks(...lists)
      : lists.flat().filter((pick) => pick?.name);
  }

  function mySlotFromDom() {
    const labeled = [
      ...document.querySelectorAll('[class*="draft-position" i], [class*="DraftPosition"], [class*="pick-position" i], [class*="your-pick" i], [data-testid*="slot" i], [data-testid*="position" i]')
    ];
    const texts = labeled.map((node) => `${node.textContent || ''}`.replace(/\s+/g, ' ').trim()).filter(Boolean);
    texts.push(`${document.body?.innerText || ''}`.slice(0, 4000));
    for (let i = 0; i < texts.length; i += 1) {
      const text = texts[i];
      const roundOne = text.match(/\byou(?:'re| are)?(?:\s+picking|\s+drafting)?(?:\s+at)?\s*1\.(\d{1,2})\b/i)
        || (i < texts.length - 1 ? text.match(/\b1\.(\d{1,2})\b/) : null);
      if (roundOne) {
        const slot = Number(roundOne[1]);
        if (slot >= 1 && slot <= 14) return slot;
      }
      const named = text.match(/\b(?:you(?:'re| are)?|your)\s+(?:pick|slot|position|spot)\s*(?:is|#|at)?\s*(\d{1,2})\b/i);
      if (named) {
        const slot = Number(named[1]);
        if (slot >= 1 && slot <= 14) return slot;
      }
    }
    return null;
  }

  function resolvedSlotState(picks, network) {
    const board = global.FDSRankBoard;
    const lifted = board?.liftZeroIndexedSlots
      ? board.liftZeroIndexedSlots(picks, network?.mySlot)
      : { picks, mySlot: network?.mySlot };
    const teamSize = board?.inferTeamSize
      ? board.inferTeamSize(lifted.picks, network?.teamSize)
      : (Number(network?.teamSize) || 12);
    const mySlot = board?.inferMySlot
      ? board.inferMySlot(lifted.picks, { mySlot: lifted.mySlot ?? mySlotFromDom(), teamSize })
      : (lifted.mySlot || mySlotFromDom());
    return { picks: lifted.picks, mySlot, teamSize };
  }

  function read() {
    const testRoom = readTestRoom();
    if (testRoom) {
      return testRoom;
    }

    if (!latestNetworkSnapshot) requestHookSnapshot();
    const network = latestNetworkSnapshot;
    const domPicks = readDomPicks();
    const networkPicks = (network?.picks || []).map((pick, index) => toTrustedPick(pick, index)).filter(Boolean);
    const picks = mergePickLists(networkPicks, domPicks);
    const slots = resolvedSlotState(picks, network);
    const isDraftRoom = pageLooksLikeDraft() || slots.picks.length > 0;
    const explorer = Boolean(
      document.querySelector('[data-fds-test-explorer]') ||
      window.FDSExposureSync?.pageLooksLikeExplorer?.()
    );
    return {
      isDraftRoom,
      isExplorer: explorer && !isDraftRoom,
      source: networkPicks.length ? 'network' : (domPicks.length ? 'dom' : 'none'),
      picks: slots.picks,
      onTheClock: network?.onTheClock ?? onTheClockFromDom(),
      mySlot: slots.mySlot,
      teamSize: slots.teamSize,
      draftId: network?.draftId || draftIdFromLocation(),
      portfolioCapture: latestPortfolioSnapshot,
      visibleRoster: latestVisibleRoster && (Date.now() - (latestVisibleRoster.capturedAt || 0) < 15000)
        ? latestVisibleRoster
        : null,
      rawPicks: latestFocusPicks.length ? latestFocusPicks : latestRawPicks
    };
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'FDS_SCRAPE_VISIBLE_ROSTER') {
        const boardPlayers = message.boardPlayers || [];
        const parsed = window.FDSExposureSync?.readVisibleRoster?.(boardPlayers) || {};
        const body = `${document.body?.innerText || ''}`;
        const yours = body.search(/your team|my team|your roster|my roster/i);
        let fromBody = parsed;
        if ((!fromBody.picks || fromBody.picks.length < 8) && yours >= 0 && window.FDSExposureSync?.parsePastedLineup) {
          const chunk = window.FDSExposureSync.parsePastedLineup(body.slice(yours, yours + 5000), boardPlayers);
          if (!chunk.error && (chunk.picks || []).length >= 8) fromBody = chunk;
        }
        if ((fromBody.picks || []).length) {
          storeAppearances(pairRawToNamed(latestRawPicks, fromBody.picks));
        }
        sendResponse({
          ok: true,
          picks: fromBody.picks || [],
          appearances: latestAppearances,
          href: location.href,
          textLen: body.length
        });
        return true;
      }
      if (message?.type === 'FDS_GET_UD_APPEARANCES') {
        requestHookSnapshot();
        sendResponse({ ok: true, appearances: latestAppearances });
        return true;
      }
      if (message?.type === 'FDS_BUILD_UD_CATALOG') {
        try {
          window.postMessage({ source: SOURCE, kind: 'fetch-catalog' }, '*');
        } catch (err) {
          /* ignore */
        }
        let sent = false;
        const finish = () => {
          if (sent) return;
          sent = true;
          sendResponse({
            ok: true,
            appearances: latestAppearances,
            count: Object.keys(latestAppearances).length
          });
        };
        const timer = setTimeout(finish, 1200);
        const onMsg = (event) => {
          if (event.data?.source !== SOURCE || event.data.kind !== 'appearances') return;
          latestAppearances = { ...latestAppearances, ...event.data.data };
          clearTimeout(timer);
          window.removeEventListener('message', onMsg);
          finish();
        };
        window.addEventListener('message', onMsg);
        return true;
      }
      if (message?.type === 'FDS_RESOLVE_UD_IDS') {
        try {
          window.postMessage({ source: SOURCE, kind: 'resolve-ids', ids: message.ids || [] }, '*');
        } catch (err) {
          /* ignore */
        }
        let sent = false;
        const finish = (payload) => {
          if (sent) return;
          sent = true;
          sendResponse({
            ok: true,
            appearances: payload?.appearances || latestAppearances,
            probe: payload?.probe || '',
            count: Object.keys(payload?.appearances || latestAppearances).length
          });
        };
        const timer = setTimeout(() => finish(null), 1500);
        const onMsg = (event) => {
          if (event.data?.source !== SOURCE) return;
          if (event.data.kind === 'id-probe') {
            latestAppearances = { ...latestAppearances, ...(event.data.data?.appearances || {}) };
            clearTimeout(timer);
            window.removeEventListener('message', onMsg);
            finish(event.data.data);
          }
          if (event.data.kind === 'appearances' && event.data.data) {
            latestAppearances = { ...latestAppearances, ...event.data.data };
          }
        };
        window.addEventListener('message', onMsg);
        return true;
      }
      return false;
    });
  }

  global.FDSUnderdogAdapter = {
    read,
    pairRawToNamed
  };
})(typeof window !== 'undefined' ? window : globalThis);
