(function () {
  if (window.__FDS_DRAFTKINGS_HOOK__) {
    return;
  }
  window.__FDS_DRAFTKINGS_HOOK__ = true;

  const SOURCE = 'fds-draftkings-hook';
  const host = String(location.hostname || '').toLowerCase();
  if (!host.includes('draftkings') && !document.querySelector('[data-fds-test-dk-room]')) {
    return;
  }

  let cachedDraftId = null;
  let cachedMyUserId = null;
  let cachedMySlot = null;
  let cachedMyEntryId = null;
  let lastSnapshotData = null;
  let lastPortfolioData = null;

  function emit(kind, data) {
    if (kind === 'snapshot') lastSnapshotData = data;
    if (kind === 'portfolio') lastPortfolioData = data;
    const message = { source: SOURCE, kind, data };
    try {
      window.postMessage(message, '*');
    } catch (err) {
      // Ignore isolated-world messaging failures.
    }
    try {
      if (window.top && window.top !== window) {
        window.top.postMessage(message, '*');
      }
    } catch (err) {
      /* cross-origin parent */
    }
  }

  function asText(value, depth) {
    if (value == null || depth > 3) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (typeof value !== 'object') return '';
    const combined = [asText(value.firstName, depth + 1), asText(value.lastName, depth + 1)].filter(Boolean).join(' ');
    const fields = [value.displayName, value.playerName, value.fullName, value.shortName];
    for (let i = 0; i < fields.length; i += 1) {
      const text = asText(fields[i], depth + 1);
      if (text) return text;
    }
    if (typeof value.name === 'string' || typeof value.name === 'number') return String(value.name).trim();
    if (value.name && typeof value.name === 'object') {
      const nested = asText(value.name, depth + 1);
      if (nested) return nested;
    }
    return combined;
  }

  function asName(value) {
    return asText(value, 0);
  }

  function pickNumber(value) {
    const raw =
      value?.overallPickNumber ??
      value?.overallPick ??
      value?.pickNumber ??
      value?.pickNo ??
      value?.number ??
      value?.overall ??
      value?.pick ??
      value?.pickIndex;
    const number = Number(raw);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function extractPlayer(value, context) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const nested =
      value.player ||
      value.draftable ||
      value.athlete ||
      value.appearance?.player ||
      value.appearance ||
      value.competitor ||
      value;
    const name = asName(nested) || asName(value);
    if (!name || name.length < 3) {
      return null;
    }
    const position =
      nested.position ||
      nested.positionName ||
      nested.rosterPosition ||
      nested.slotName ||
      value.position ||
      value.pos ||
      (Array.isArray(nested.eligiblePositions) ? nested.eligiblePositions[0] : '') ||
      '';
    const team =
      nested.teamAbbreviation ||
      nested.teamAbbr ||
      nested.competitionTeamAbbreviation ||
      nested.team ||
      nested.teamName ||
      value.teamAbbreviation ||
      value.team ||
      value.teamAbbr ||
      '';
    const slot =
      value.slot ??
      value.draftSlot ??
      value.rosterSlot ??
      value.userSlot ??
      value.pickSlot ??
      value.teamSlot ??
      value.draftPosition;
    const drafterId =
      value.userId ??
      value.drafterId ??
      value.ownerId ??
      value.pickedByUserId ??
      value.entryId ??
      value.draftedByEntryKey ??
      value.pickedByEntryId ??
      value.user?.id ??
      value.entry?.id;
    const mine = Boolean(
      value.isMine ||
      value.mine ||
      value.isUser ||
      value.isCurrentUser ||
      value.isUsersPick ||
      nested.isMine ||
      nested.isCurrentUser ||
      (context?.myUserId && drafterId && String(drafterId) === String(context.myUserId)) ||
      (context?.myEntryId && drafterId && String(drafterId) === String(context.myEntryId)) ||
      (context?.mySlot && Number(slot) === Number(context.mySlot))
    );
    return {
      name,
      position: String(position || '').toUpperCase(),
      team: String(team || '').toUpperCase().slice(0, 4),
      pickNo: pickNumber(value) || pickNumber(nested),
      mine,
      slot: Number.isFinite(Number(slot)) ? Number(slot) : null
    };
  }

  function looksLikePick(value) {
    if (!value || typeof value !== 'object') return false;
    const player = extractPlayer(value, {});
    if (!player) return false;
    return Boolean(
      pickNumber(value) ||
      pickNumber(value.player) ||
      value.status === 'picked' ||
      value.status === 'drafted' ||
      value.pickedAt ||
      value.selectedAt ||
      value.draftedAt ||
      value.isDrafted === true ||
      value.drafted === true
    );
  }

  function maybeDraftId(key, value, found) {
    const lower = String(key || '').toLowerCase();
    if (typeof value !== 'string' && typeof value !== 'number') return;
    const text = String(value);
    if (
      lower.includes('draftid') ||
      lower === 'draft_id' ||
      lower === 'contestid' ||
      lower === 'contestkey' ||
      lower === 'contest_key'
    ) {
      found.draftId = text;
      cachedDraftId = text;
      return;
    }
    if (!found.draftId && (lower === 'id' || lower === 'key') && /^\d{6,}$/.test(text)) {
      found.draftId = text;
      cachedDraftId = text;
    }
  }

  function maybeUserIdentity(key, value, found) {
    const compact = String(key || '').toLowerCase().replace(/[^a-z]/g, '');
    if (['currentuserid', 'myuserid', 'loggedinuserid', 'authenticateduserid', 'viewerid'].includes(compact)) {
      if (typeof value === 'string' || typeof value === 'number') {
        found.myUserId = String(value);
        cachedMyUserId = found.myUserId;
      }
    }
    if (['myentryid', 'currententryid', 'currentuserentryid', 'loggedinentryid', 'myentrykey'].includes(compact)) {
      if (typeof value === 'string' || typeof value === 'number') {
        found.myEntryId = String(value);
        cachedMyEntryId = found.myEntryId;
      }
    }
    if (['myslot', 'mydraftslot', 'mydraftposition', 'mypickslot', 'currentuserslot', 'yourslot', 'yourdraftslot', 'yourdraftposition'].includes(compact)) {
      const slot = Number(value);
      if (Number.isFinite(slot) && slot >= 0 && slot <= 14) {
        found.mySlot = slot;
        cachedMySlot = slot;
      }
    }
    if (value === true && (compact === 'iscurrentuser' || compact === 'isme' || compact === 'isuser' || compact === 'isself')) {
      found.isCurrentUserContext = true;
    }
    if (['you', 'me', 'currentuser', 'currentuserentry', 'mydraftentry', 'self', 'viewer'].includes(compact) && value && typeof value === 'object' && !Array.isArray(value)) {
      found.isCurrentUserContext = true;
      const slot = Number(value.slot ?? value.draftSlot ?? value.draftPosition ?? value.pickOrder);
      if (Number.isFinite(slot) && slot >= 0 && slot <= 14) {
        found.mySlot = slot;
        cachedMySlot = slot;
      }
      const id = value.userId ?? value.entryId ?? value.id;
      if (id != null && typeof id !== 'object') {
        found.myUserId = String(id);
        cachedMyUserId = found.myUserId;
        if (value.entryId || compact.includes('entry')) {
          found.myEntryId = String(value.entryId || id);
          cachedMyEntryId = found.myEntryId;
        }
      }
    }
  }

  function collect(value, found, depth) {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) {
      const pickLike = value.filter(looksLikePick);
      if (pickLike.length >= 1 && pickLike.length >= value.length * 0.4) {
        pickLike.forEach((item) => {
          const player = extractPlayer(item, found);
          if (player) found.picks.push(player);
        });
        return;
      }
      value.slice(0, 250).forEach((item) => collect(item, found, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;

    const maybeClock =
      value.onTheClock ||
      value.isOnTheClock ||
      value.currentUserOnClock ||
      value.isUsersTurn ||
      value.isYourTurn ||
      value.yourTurn ||
      value.isMyTurn ||
      value.currentUserIsOnClock;
    if (maybeClock === true) {
      found.onTheClock = true;
    } else if (maybeClock === false && found.onTheClock == null) {
      found.onTheClock = false;
    }

    Object.keys(value).slice(0, 90).forEach((key) => {
      const lower = key.toLowerCase();
      if (lower.includes('password') || lower.includes('token') || lower.includes('cookie') || lower.includes('card')) {
        return;
      }
      maybeDraftId(key, value[key], found);
      maybeUserIdentity(key, value[key], found);
      collect(value[key], found, depth + 1);
    });
  }

  function draftIdFromUrl(url) {
    const text = String(url || '');
    const patterns = [
      /\/draft\/contest\/(\d+)/i,
      /\/drafts?\/(\d{6,})/i,
      /contest(?:id|key)?=(\d{6,})/i,
      /draft(?:id)?=(\d{6,}|[a-f0-9-]{8,})/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

  function readExposurePct(value) {
    if (!value || typeof value !== 'object') return null;
    for (const key of Object.keys(value)) {
      const compact = key.replace(/[^a-z]/gi, '').toLowerCase();
      if (!/(exposure|ownership|draftedpct|percentdrafted|ownedpct|entryexposure|draftedpercent)/.test(compact)) continue;
      const n = Number(String(value[key]).replace('%', ''));
      if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    }
    return null;
  }

  function collectPortfolio(value, found, depth) {
    if (!value || depth > 7) return;
    if (Array.isArray(value)) {
      const exposureLike = [];
      value.forEach((item) => {
        const player = extractPlayer(item, found);
        const pct = readExposurePct(item) ?? readExposurePct(item?.player) ?? readExposurePct(item?.stats);
        if (player && SKILL.has(player.position) && pct != null) {
          exposureLike.push({
            name: player.name,
            position: player.position,
            team: player.team,
            exposurePct: pct
          });
        }
      });
      if (exposureLike.length >= 8 && exposureLike.length >= value.length * 0.35) {
        found.exposure.push(...exposureLike);
        return;
      }

      const rosterPicks = value
        .map((item) => extractPlayer(item, found))
        .filter((player) => player && SKILL.has(player.position));
      if (rosterPicks.length >= 12 && rosterPicks.length <= 24 && rosterPicks.length >= value.length * 0.55) {
        const mine = rosterPicks.some((player) => player.mine) || found.isUserRosterContext;
        found.rosters.push({ picks: rosterPicks, mine });
        return;
      }

      value.slice(0, 180).forEach((item) => collectPortfolio(item, found, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    Object.keys(value).slice(0, 80).forEach((key) => {
      const lower = key.toLowerCase();
      if (lower.includes('password') || lower.includes('token') || lower.includes('cookie') || lower.includes('card')) {
        return;
      }
      if (/(mydraft|userdraft|myteam|myentrie|userentrie|completeddraft|userroster|mylineup)/.test(lower)) {
        found.isUserRosterContext = true;
      }
      collectPortfolio(value[key], found, depth + 1);
    });
  }

  function inspectPortfolio(data) {
    if (!data || typeof data !== 'object') return;
    const found = {
      exposure: [],
      rosters: [],
      isUserRosterContext: false,
      myUserId: cachedMyUserId,
      myEntryId: cachedMyEntryId
    };
    collectPortfolio(data, found, 0);
    if (!found.exposure.length && !found.rosters.length) return;

    let rosters = found.rosters;
    const openTeam = (found.rosters || []).find((row) =>
      row.picks.length >= 8 && row.picks.length <= 24
    );
    if (rosters.length === 1 && rosters[0].picks.length >= 8 && rosters[0].picks.length <= 24) {
      // Keep a single open completed team.
    } else if (!found.isUserRosterContext) {
      rosters = rosters.filter((row) => row.mine);
    }

    const drafts = rosters.map((row, index) => ({
      id: `dk-${cachedDraftId || 'entry'}-${index}-${row.picks[0]?.name || index}`,
      savedAt: Date.now(),
      picks: row.picks.map((pick) => ({
        name: pick.name,
        position: pick.position,
        team: pick.team
      }))
    }));

    const seenExp = new Set();
    const exposure = [];
    found.exposure.forEach((entry) => {
      const key = `${entry.name}|${entry.position}|${entry.team}`.toLowerCase();
      if (seenExp.has(key)) return;
      seenExp.add(key);
      exposure.push(entry);
    });

    if (!drafts.length && !exposure.length && !openTeam) return;
    const visibleDraft = openTeam
      ? {
        id: `dk-visible-${cachedDraftId || 'entry'}-${openTeam.picks[0]?.name || 'team'}`,
        savedAt: Date.now(),
        picks: openTeam.picks.map((pick) => ({
          name: pick.name,
          position: pick.position,
          team: pick.team
        }))
      }
      : null;
    emit('portfolio', { drafts, exposure, visibleDraft });
  }

  function unwrapPayloads(data) {
    const payloads = [data];
    if (!data || typeof data !== 'object') return payloads;
    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (item && typeof item === 'object') payloads.push(item);
      });
      return payloads;
    }
    if (Array.isArray(data.arguments)) payloads.push(...data.arguments);
    if (data.payload && typeof data.payload === 'object') payloads.push(data.payload);
    if (data.message && typeof data.message === 'object') payloads.push(data.message);
    if (typeof data.data === 'string') {
      try {
        payloads.push(JSON.parse(data.data));
      } catch (err) {
        /* ignore nested parse errors */
      }
    } else if (data.data && typeof data.data === 'object') {
      payloads.push(data.data);
    }
    return payloads;
  }

  function inspect(data, url) {
    if (!data || typeof data !== 'object') return;
    unwrapPayloads(data).forEach((payload) => {
      if (!payload || typeof payload !== 'object') return;
      inspectPortfolio(payload);
      const found = {
        picks: [],
        onTheClock: null,
        mySlot: cachedMySlot,
        myUserId: cachedMyUserId,
        myEntryId: cachedMyEntryId,
        draftId: cachedDraftId || draftIdFromUrl(url) || draftIdFromUrl(location.href)
      };
      collect(payload, found, 0);
      if (!found.picks.length) return;

      if (found.myUserId) cachedMyUserId = found.myUserId;
      if (found.myEntryId) cachedMyEntryId = found.myEntryId;
      if (found.draftId) cachedDraftId = found.draftId;

      const uniq = [];
      const seen = new Set();
      found.picks.forEach((pick) => {
        const key = `${pick.pickNo || ''}:${pick.name}:${pick.position}:${pick.team}`;
        if (seen.has(key)) return;
        seen.add(key);
        uniq.push(pick);
      });
      uniq.sort((a, b) => (a.pickNo || 0) - (b.pickNo || 0));
      const ready = uniq.map((pick, index) => ({
        ...pick,
        pickNo: Number(pick.pickNo) > 0 ? Number(pick.pickNo) : index + 1
      }));
      if (!ready.length) {
        return;
      }

      const slots = ready.map((pick) => Number(pick.slot)).filter((slot) => Number.isFinite(slot));
      if (slots.includes(0)) {
        ready.forEach((pick) => {
          if (Number.isFinite(Number(pick.slot))) pick.slot = Number(pick.slot) + 1;
        });
        if (found.mySlot != null) found.mySlot = Number(found.mySlot) + 1;
      }
      if (found.mySlot == null && cachedMySlot != null) found.mySlot = cachedMySlot;
      if (found.mySlot != null) cachedMySlot = found.mySlot;
      ready.forEach((pick) => {
        if (pick.mine) return;
        if (found.mySlot != null && Number(pick.slot) === Number(found.mySlot)) pick.mine = true;
      });

      const maxSlot = slots.length ? Math.max(...slots.map((slot) => (slot === 0 ? 1 : slot))) : 12;
      emit('snapshot', {
        picks: ready,
        onTheClock: found.onTheClock,
        mySlot: found.mySlot,
        teamSize: maxSlot >= 6 && maxSlot <= 14 ? Math.max(maxSlot, 12) : 12,
        draftId: found.draftId,
        myUserId: found.myUserId,
        totalPicks: 20
      });
    });
  }

  function shouldInspect(url) {
    const text = String(url || '');
    if (/analytics|google-analytics|stripe|sentry|segment|optimizely|braze|snowplow|doubleclick/i.test(text)) {
      return false;
    }
    if (!text || text.startsWith('/') || text.startsWith('./') || text.startsWith('?')) return true;
    return /draftkings|gateway|graphql|signalr|pusher|ably|socket|draft|contest|draftable|lineup|pick/i.test(text);
  }

  function decodeSocketText(raw) {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw;
    if (raw instanceof ArrayBuffer) {
      try {
        return new TextDecoder().decode(raw);
      } catch (err) {
        return '';
      }
    }
    if (ArrayBuffer.isView(raw)) {
      try {
        return new TextDecoder().decode(raw);
      } catch (err) {
        return '';
      }
    }
    return '';
  }

  function parseSocketJson(raw) {
    if (raw && typeof raw === 'object' && !(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) {
      return raw;
    }
    const text = decodeSocketText(raw).trim();
    if (!text) return null;
    const startCandidates = [text.indexOf('{'), text.indexOf('[')].filter((index) => index >= 0);
    if (!startCandidates.length) return null;
    const slice = text.slice(Math.min(...startCandidates));
    try {
      return JSON.parse(slice);
    } catch (err) {
      return null;
    }
  }

  function safeInspect(data, url) {
    try {
      inspect(data, url);
    } catch (err) {
      /* ignore malformed live payloads */
    }
  }

  function parseSocketData(raw, url) {
    const parsed = parseSocketJson(raw);
    if (parsed) safeInspect(parsed, url);
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        if (shouldInspect(url)) {
          const clone = response.clone();
          clone.json().then((data) => safeInspect(data, url)).catch(() => {});
        }
      } catch (err) {
        // Ignore parse errors from non-JSON responses.
      }
      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__fdsDkUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        if (!shouldInspect(this.__fdsDkUrl)) return;
        const contentType = this.getResponseHeader('content-type') || '';
        if (!contentType.includes('json')) return;
        safeInspect(JSON.parse(this.responseText), this.__fdsDkUrl);
      } catch (err) {
        // Ignore non-JSON XHR payloads.
      }
    });
    return originalSend.apply(this, args);
  };

  const OriginalWebSocket = window.WebSocket;
  if (typeof OriginalWebSocket === 'function' && !OriginalWebSocket.__fdsDkWrapped) {
    function WrappedWebSocket(url, protocols) {
      const ws = protocols !== undefined
        ? new OriginalWebSocket(url, protocols)
        : new OriginalWebSocket(url);
      ws.addEventListener('message', (event) => {
        if (!/analytics|google-analytics|stripe|sentry|segment/i.test(String(url || ''))) {
          parseSocketData(event.data, url);
        }
      });
      return ws;
    }
    WrappedWebSocket.prototype = OriginalWebSocket.prototype;
    WrappedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    WrappedWebSocket.OPEN = OriginalWebSocket.OPEN;
    WrappedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    WrappedWebSocket.CLOSED = OriginalWebSocket.CLOSED;
    Object.assign(WrappedWebSocket, OriginalWebSocket);
    WrappedWebSocket.__fdsDkWrapped = true;
    window.WebSocket = WrappedWebSocket;
  }

  window.addEventListener('message', (event) => {
    const payload = event.data;
    if (!payload || payload.source !== SOURCE || payload.kind !== 'request') return;
    if (lastSnapshotData) emit('snapshot', lastSnapshotData);
    if (lastPortfolioData) emit('portfolio', lastPortfolioData);
  });
})();
