(function () {
  if (window.__FDS_UNDERDOG_HOOK__) {
    return;
  }
  window.__FDS_UNDERDOG_HOOK__ = true;

  const SOURCE = 'fds-underdog-hook';
  const host = String(location.hostname || '').toLowerCase();
  if (!host.includes('underdog')) {
    return;
  }

  let cachedDraftId = null;
  let cachedMyUserId = null;
  let cachedMySlot = null;

  function emit(kind, data) {
    try {
      window.postMessage({ source: SOURCE, kind, data }, '*');
    } catch (err) {
      // Ignore isolated-world messaging failures.
    }
  }

  function asName(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
      return (
        value.fullName ||
        value.name ||
        value.displayName ||
        [value.firstName, value.lastName].filter(Boolean).join(' ') ||
        ''
      ).trim();
    }
    return '';
  }

  function pickNumber(value) {
    const raw = value?.pickNo ?? value?.pickNumber ?? value?.number ?? value?.overallPick ?? value?.pick ?? value?.overall;
    const number = Number(raw);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function extractPlayer(value, context) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const nested = value.player || value.appearance?.player || value.appearance || value.athlete || value;
    const name = asName(nested) || asName(value);
    if (!name || name.length < 3) {
      return null;
    }
    const position = nested.position || nested.slotName || value.position || value.pos || '';
    const team = nested.team || nested.teamAbbr || nested.teamName || value.team || value.teamAbbr || '';
    const slot = value.slot ?? value.draftSlot ?? value.userSlot ?? value.pickSlot ?? value.teamSlot;
    const drafterId = value.userId ?? value.drafterId ?? value.ownerId ?? value.pickedByUserId ?? value.user?.id;
    const mine = Boolean(
      value.isMine ||
      value.mine ||
      value.isUser ||
      nested.isMine ||
      value.isCurrentUser ||
      (context?.myUserId && drafterId && String(drafterId) === String(context.myUserId)) ||
      (context?.mySlot && Number(slot) === Number(context.mySlot))
    );
    return {
      name,
      position: String(position || '').toUpperCase(),
      team: String(team || '').toUpperCase().slice(0, 4),
      pickNo: pickNumber(value),
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
      value.status === 'picked' ||
      value.pickedAt ||
      value.selectedAt ||
      value.draftedAt
    );
  }

  function maybeDraftId(key, value, found) {
    const lower = String(key || '').toLowerCase();
    if (typeof value !== 'string' && typeof value !== 'number') return;
    const text = String(value);
    if (lower.includes('draftid') || lower === 'draft_id') {
      found.draftId = text;
      cachedDraftId = text;
      return;
    }
    if (!found.draftId && lower === 'id' && text.length >= 8 && /[a-f0-9-]/i.test(text)) {
      found.draftId = text;
      cachedDraftId = text;
    }
  }

  function maybeUserIdentity(key, value, found) {
    const lower = String(key || '').toLowerCase();
    if (lower === 'currentuserid' || lower === 'myuserid' || lower === 'userid' && value && !found.myUserId) {
      if (typeof value === 'string' || typeof value === 'number') {
        found.myUserId = String(value);
        cachedMyUserId = found.myUserId;
      }
    }
    if (lower.includes('userslot') || lower === 'myslot' || lower === 'draftslot') {
      const slot = Number(value);
      if (Number.isFinite(slot) && slot > 0) {
        found.mySlot = slot;
        cachedMySlot = slot;
      }
    }
    if (value === true && (lower.includes('iscurrentuser') || lower.includes('isme') || lower === 'isuser')) {
      found.isCurrentUserContext = true;
    }
  }

  function collect(value, found, depth) {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) {
      const pickLike = value.filter(looksLikePick);
      if (pickLike.length >= 2 && pickLike.length >= value.length * 0.45) {
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
      value.yourTurn ||
      value.isMyTurn;
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
      /\/drafts?\/([a-f0-9-]{8,})/i,
      /draft[_-]?id=([a-f0-9-]{8,})/i,
      /\/([a-f0-9]{8}-[a-f0-9-]{27,})/i
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
      if (rosterPicks.length >= 12 && rosterPicks.length <= 20 && rosterPicks.length >= value.length * 0.55) {
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
      if (/(mydraft|userdraft|myteam|myentrie|userentrie|completeddraft|userroster)/.test(lower)) {
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
      myUserId: cachedMyUserId
    };
    collectPortfolio(data, found, 0);
    if (!found.exposure.length && !found.rosters.length) return;

    let rosters = found.rosters;
    const openTeam = (found.rosters || []).find((row) =>
      row.picks.length >= 8 && row.picks.length <= 20
    );
    if (rosters.length === 1 && rosters[0].picks.length >= 8 && rosters[0].picks.length <= 20) {
      // One open completed team — keep it even if Underdog did not mark it as "mine".
    } else if (rosters.length >= 8 && rosters.length <= 14 && !found.isUserRosterContext) {
      rosters = rosters.filter((row) => row.mine);
    } else if (!found.isUserRosterContext) {
      rosters = rosters.filter((row) => row.mine);
    }

    const drafts = rosters.map((row, index) => ({
      id: `ud-${cachedDraftId || 'entry'}-${index}-${row.picks[0]?.name || index}`,
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
        id: `ud-visible-${cachedDraftId || 'entry'}-${openTeam.picks[0]?.name || 'team'}`,
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

  function inspect(data, url) {
    if (!data || typeof data !== 'object') return;
    inspectPortfolio(data);
    const found = {
      picks: [],
      onTheClock: null,
      mySlot: cachedMySlot,
      myUserId: cachedMyUserId,
      draftId: cachedDraftId || draftIdFromUrl(url) || draftIdFromUrl(location.href)
    };
    collect(data, found, 0);
    if (!found.picks.length) return;

    if (found.myUserId) cachedMyUserId = found.myUserId;
    if (found.mySlot) cachedMySlot = found.mySlot;
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
    const numbered = uniq.filter((pick) => Number(pick.pickNo) > 0);
    if (numbered.length < 2) {
      return;
    }

    if (!found.mySlot && cachedMySlot) found.mySlot = cachedMySlot;
    uniq.forEach((pick) => {
      if (pick.mine) return;
      if (found.mySlot && pick.slot === found.mySlot) pick.mine = true;
    });

    emit('snapshot', {
      picks: numbered,
      onTheClock: found.onTheClock,
      mySlot: found.mySlot,
      draftId: found.draftId,
      myUserId: found.myUserId
    });
  }

  function shouldInspect(url) {
    const text = String(url || '');
    return /underdog/i.test(text) && !/analytics|google-analytics|stripe|sentry|segment/i.test(text);
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        if (shouldInspect(url)) {
          const clone = response.clone();
          clone.json().then((data) => inspect(data, url)).catch(() => {});
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
    this.__fdsUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        if (!shouldInspect(this.__fdsUrl)) return;
        const contentType = this.getResponseHeader('content-type') || '';
        if (!contentType.includes('json')) return;
        inspect(JSON.parse(this.responseText), this.__fdsUrl);
      } catch (err) {
        // Ignore non-JSON XHR payloads.
      }
    });
    return originalSend.apply(this, args);
  };
})();
