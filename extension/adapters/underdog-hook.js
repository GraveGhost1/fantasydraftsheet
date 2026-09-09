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
  let cachedMyEntryId = null;
  let cachedMySlot = null;
  let cachedTeamSize = null;
  let accumulatedPicks = [];
  let accumulatedDraftId = null;
  let lastSnapshotData = null;
  let lastPortfolioData = null;
  let lastNamedRoster = [];
  let harvestLiveBoard = false;
  const rawPicksByDraft = {};
  const appearanceCatalog = {};
  let emitAppearancesTimer = null;
  const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

  function skillFrom(value) {
    const raw = String(value || '').toUpperCase();
    if (SKILL.has(raw)) return raw;
    if (/QUARTERBACK|(^|\b)QB(\b|$)/.test(raw)) return 'QB';
    if (/RUNNING.?BACK|(^|\b)RB(\b|$)/.test(raw)) return 'RB';
    if (/WIDE.?RECEIVER|(^|\b)WR(\b|$)/.test(raw)) return 'WR';
    if (/TIGHT.?END|(^|\b)TE(\b|$)/.test(raw)) return 'TE';
    return '';
  }

  function scheduleAppearancesEmit() {
    if (emitAppearancesTimer) return;
    emitAppearancesTimer = setTimeout(() => {
      emitAppearancesTimer = null;
      if (Object.keys(appearanceCatalog).length) emit('appearances', appearanceCatalog);
    }, 400);
  }

  function isUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
  }

  function trueAppearanceId(value) {
    if (!value || typeof value !== 'object') return null;
    const id = value.appearance_id || value.appearanceId || value.appearance?.id;
    return isUuid(id) ? String(id) : null;
  }

  function looksLikeAppearanceRecord(value) {
    if (!value || typeof value !== 'object') return false;
    if (value.draft_entry_id || value.drafted_percentage != null) return false;
    return value.id != null && (
      value.player_id ||
      value.playerId ||
      value.unique_player_id ||
      value.match_id ||
      value.position_id
    );
  }

  function appearanceIdsToStore(value, inherited) {
    const ids = [];
    const add = (id) => {
      if (isUuid(id)) ids.push(String(id));
    };
    add(value?.appearance_id);
    add(value?.appearanceId);
    add(value?.appearance?.id);
    if (inherited || looksLikeAppearanceRecord(value)) add(value?.id);
    return [...new Set(ids)];
  }

  function rememberAppearance(id, player) {
    if (!isUuid(id) || !player?.name || String(player.name).length < 3) return;
    const position = skillFrom(player.position);
    appearanceCatalog[String(id)] = {
      name: player.name,
      position,
      team: player.team || ''
    };
    scheduleAppearancesEmit();
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
    const focusId = cachedMyEntryId || entryIdFromUrl(location.href);
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

  function applyPairedAppearances(namedPicks, draftId, preferredRaw) {
    if (namedPicks?.length) lastNamedRoster = namedPicks;
    const all = rawPicksByDraft[draftId || cachedDraftId] || Object.values(rawPicksByDraft).flat();
    const paired = pairRawToNamed(preferredRaw?.length ? preferredRaw : all, lastNamedRoster);
    if (Object.keys(paired).length < 4 && preferredRaw?.length && all.length > preferredRaw.length) {
      Object.assign(paired, pairRawToNamed(all, lastNamedRoster));
    }
    Object.keys(paired).forEach((id) => rememberAppearance(id, paired[id]));
    return paired;
  }

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
    const combined = [
      asText(value.firstName || value.first_name, depth + 1),
      asText(value.lastName || value.last_name, depth + 1)
    ].filter(Boolean).join(' ');
    const fields = [
      value.fullName,
      value.full_name,
      value.displayName,
      value.display_name,
      value.playerName,
      value.player_name,
      value.preferredName,
      value.preferred_name
    ];
    for (let i = 0; i < fields.length; i += 1) {
      const text = asText(fields[i], depth + 1);
      if (text) return text;
    }
    if (typeof value.name === 'string' || typeof value.name === 'number') {
      return String(value.name).trim();
    }
    if (value.name && typeof value.name === 'object') {
      const nested = asText(value.name, depth + 1);
      if (nested) return nested;
    }
    return combined;
  }

  function asName(value) {
    return asText(value, 0);
  }

  function asCode(value, keys) {
    if (!value) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (typeof value !== 'object') return '';
    for (let i = 0; i < keys.length; i += 1) {
      const text = asText(value[keys[i]], 0);
      if (text) return text;
    }
    return '';
  }

  function pickNumber(value) {
    if (!value || typeof value !== 'object') return null;
    const raw =
      value.pickNo ??
      value.pick_no ??
      value.pickNumber ??
      value.pick_number ??
      value.overallPickNumber ??
      value.overall_pick_number ??
      value.overallPick ??
      value.overall_pick ??
      value.selectionNumber ??
      value.selection_number ??
      value.pickOrder ??
      value.pick_order ??
      value.overallNumber ??
      value.overall_number;
    if (typeof raw === 'string' && /^\d{1,2}\.\d{1,2}$/.test(raw.trim())) {
      const dotted = raw.trim().match(/^(\d{1,2})\.(\d{1,2})$/);
      const round = Number(dotted[1]);
      const slot = Number(dotted[2]);
      if (round > 0 && slot > 0) return (round - 1) * (cachedTeamSize || 12) + slot;
    }
    const number = Number(raw);
    if (Number.isFinite(number) && number > 0 && number < 400) return number;
    const loose = value.pick ?? value.overall;
    const looseNumber = Number(loose);
    if (
      Number.isFinite(looseNumber)
      && looseNumber > 0
      && looseNumber < 400
      && (value.userId || value.user_id || value.draftId || value.draft_id || value.pickedAt || value.picked_at || value.player || value.appearance)
    ) {
      return looseNumber;
    }
    const numbered = Number(value.number);
    if (
      Number.isFinite(numbered)
      && numbered > 0
      && numbered < 400
      && (value.player || value.appearance || value.appearanceId || value.appearance_id || value.pickedAt || value.picked_at)
    ) {
      return numbered;
    }
    return null;
  }

  function extractPlayer(value, context) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const nested =
      value.player ||
      value.appearance?.player ||
      value.appearance ||
      value.athlete ||
      value.selection?.player ||
      value.selection ||
      value;
    const name = asName(nested) || asName(value);
    if (!name || name.length < 3) {
      return null;
    }
    const position = asCode(
      nested.position || nested.position_id || nested.positionName || nested.slotName || nested.slot_name || value.position || value.position_id || value.pos,
      ['abbreviation', 'abbr', 'name', 'pos', 'positionName']
    );
    const team = asCode(
      nested.teamAbbr ||
      nested.team_abbr ||
      nested.teamAbbreviation ||
      nested.team ||
      nested.team_id ||
      nested.teamName ||
      nested.team_name ||
      value.team ||
      value.team_id ||
      value.teamAbbr ||
      value.team_abbr,
      ['abbr', 'abbreviation', 'teamAbbr', 'code', 'name']
    );
    const slotRaw =
      value.slot ??
      value.draftSlot ??
      value.draft_slot ??
      value.userSlot ??
      value.pickSlot ??
      value.teamSlot ??
      value.pickOrder ??
      value.pick_order ??
      value.draftPosition ??
      value.draft_position;
    const slotNum = Number(slotRaw);
    const slot = Number.isFinite(slotNum) && slotNum >= 0 && slotNum <= 14 ? slotNum : null;
    const drafterId = value.userId ?? value.drafterId ?? value.ownerId ?? value.pickedByUserId ?? value.user?.id;
    const mine = Boolean(
      value.isMine ||
      value.mine ||
      value.isUser ||
      nested.isMine ||
      value.isCurrentUser ||
      value.is_current_user ||
      nested.isCurrentUser ||
      (context?.myUserId && drafterId && String(drafterId) === String(context.myUserId)) ||
      (context?.mySlot != null && slot != null && Number(slot) === Number(context.mySlot))
    );
    return {
      name,
      position: skillFrom(position) || String(position || '').toUpperCase(),
      team: String(team || '').toUpperCase().slice(0, 4),
      pickNo: pickNumber(value) || pickNumber(nested),
      mine,
      slot: slot,
      appearanceId: trueAppearanceId(value) || trueAppearanceId(nested)
    };
  }

  function looksLikePick(value) {
    if (!value || typeof value !== 'object') return false;
    const player = extractPlayer(value, {});
    if (!player) return false;
    return Boolean(
      pickNumber(value) ||
      pickNumber(value.player) ||
      pickNumber(nestedPlayer(value)) ||
      /\b(picked|drafted|selected|taken)\b/i.test(String(value.status || value.pickStatus || value.state || '')) ||
      value.pickedAt ||
      value.picked_at ||
      value.selectedAt ||
      value.selected_at ||
      value.draftedAt ||
      value.drafted_at ||
      value.selectionTime ||
      value.madeAt
    );
  }

  function nestedPlayer(value) {
    return value?.player || value?.appearance?.player || value?.appearance || value?.selection?.player || null;
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

  function compactKey(key) {
    return String(key || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function isTruthyFlag(value) {
    return value === true || value === 1 || value === 'true' || value === '1';
  }

  function readSlotValue(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 14 ? n : null;
  }

  function objectLooksLikeMe(value) {
    if (!value || typeof value !== 'object') return false;
    return isTruthyFlag(
      value.isCurrentUser ||
      value.is_current_user ||
      value.isMe ||
      value.is_me ||
      value.isSelf ||
      value.isYou ||
      value.you ||
      value.isLoggedInUser
    );
  }

  function readIdentityFromObject(value, found, force) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (!force && !objectLooksLikeMe(value) && !found.isCurrentUserContext) return;
    const slot = readSlotValue(
      value.slot ??
      value.draftSlot ??
      value.draft_slot ??
      value.pickOrder ??
      value.pick_order ??
      value.draftPosition ??
      value.draft_position ??
      value.mySlot
    );
    if (slot != null) {
      found.mySlot = slot;
      cachedMySlot = slot;
    }
    const id = value.userId ?? value.user_id ?? value.user?.id ?? value.currentUserId;
    if (id != null && id !== '' && typeof id !== 'object') {
      found.myUserId = String(id);
      cachedMyUserId = found.myUserId;
    }
    if (objectLooksLikeMe(value) && value.id != null && isUuid(value.id)) {
      cachedMyEntryId = String(value.id);
      found.myEntryId = cachedMyEntryId;
    }
  }

  function looksLikeDraftEntry(value) {
    if (!value || typeof value !== 'object') return false;
    const slot = readSlotValue(
      value.slot ?? value.draftSlot ?? value.pickOrder ?? value.pick_order ?? value.draftPosition ?? value.draft_position
    );
    return slot != null && (value.userId || value.user_id || value.user || objectLooksLikeMe(value) || value.username);
  }

  function maybeTeamSize(key, value, found) {
    const compact = compactKey(key);
    if (Array.isArray(value) && value.length >= 6 && value.length <= 14 && /entr|team|participant|user/.test(compact)) {
      const entries = value.filter(looksLikeDraftEntry);
      if (entries.length === value.length || entries.length >= 6) {
        found.teamSize = value.length;
        cachedTeamSize = value.length;
      }
    }
    if (!/(teamsize|draftsize|leaguesize|numteams|numberofteams|participantcount|entrycount|teamcount|draftentries)/.test(compact)) {
      return;
    }
    const n = Number(value);
    if (n >= 6 && n <= 14) {
      found.teamSize = n;
      cachedTeamSize = n;
    }
  }

  function maybeUserIdentity(key, value, found) {
    const compact = compactKey(key);
    if (['currentuserid', 'myuserid', 'loggedinuserid', 'authenticateduserid', 'viewerid'].includes(compact)) {
      if (typeof value === 'string' || typeof value === 'number') {
        found.myUserId = String(value);
        cachedMyUserId = found.myUserId;
      }
    }
    if (['myslot', 'mydraftslot', 'mydraftposition', 'mypickslot', 'currentuserslot', 'currentuserdraftslot', 'yourslot', 'yourdraftslot', 'yourdraftposition'].includes(compact)) {
      const slot = readSlotValue(value);
      if (slot != null) {
        found.mySlot = slot;
        cachedMySlot = slot;
      }
    }
    if (['you', 'me', 'currentuser', 'currentuserentry', 'mydraftentry', 'self', 'viewer'].includes(compact) && value && typeof value === 'object' && !Array.isArray(value)) {
      found.isCurrentUserContext = true;
      readIdentityFromObject(value, found, true);
    }
  }

  function slotForPickLocal(pickNo, teamSize) {
    const pick = Number(pickNo);
    const size = Number(teamSize) || 12;
    if (!Number.isFinite(pick) || pick <= 0) return null;
    const round = Math.ceil(pick / size);
    const posInRound = ((pick - 1) % size) + 1;
    return round % 2 === 1 ? posInRound : size - posInRound + 1;
  }

  function finalizeIdentity(found, ready) {
    const slots = ready.map((pick) => Number(pick.slot)).filter((slot) => Number.isFinite(slot));
    if (slots.includes(0)) {
      ready.forEach((pick) => {
        if (Number.isFinite(Number(pick.slot))) pick.slot = Number(pick.slot) + 1;
      });
      if (found.mySlot != null) found.mySlot = Number(found.mySlot) + 1;
    }
    const sizeHint = Number(found.teamSize) >= 6 && Number(found.teamSize) <= 14
      ? Number(found.teamSize)
      : (cachedTeamSize >= 6 && cachedTeamSize <= 14 ? cachedTeamSize : 12);
    const liftedSlots = ready.map((pick) => Number(pick.slot)).filter((slot) => slot >= 1 && slot <= 14);
    if (liftedSlots.length) {
      const unique = new Set(liftedSlots).size;
      const max = Math.max(...liftedSlots);
      if (unique >= 8) found.teamSize = Math.max(max, unique, sizeHint);
      else found.teamSize = sizeHint;
    } else {
      found.teamSize = sizeHint;
    }
    if (found.teamSize >= 6 && found.teamSize <= 14) cachedTeamSize = found.teamSize;
    if (found.mySlot == null) {
      const mineSlots = ready.filter((pick) => pick.mine).map((pick) => Number(pick.slot)).filter((slot) => slot >= 1 && slot <= 14);
      if (mineSlots.length) found.mySlot = mineSlots[0];
    }
    if (found.mySlot == null) {
      const minePick = ready.find((pick) => pick.mine && Number(pick.pickNo) > 0);
      if (minePick) found.mySlot = slotForPickLocal(minePick.pickNo, found.teamSize);
    }
    if (found.mySlot != null) {
      cachedMySlot = found.mySlot;
      ready.forEach((pick) => {
        if (pick.mine) return;
        if (Number(pick.slot) === Number(found.mySlot)) pick.mine = true;
      });
    }
  }

  function collect(value, found, depth) {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) {
      const entries = value.filter(looksLikeDraftEntry);
      if (entries.length >= 6 && entries.length <= 14 && entries.length >= value.length * 0.5) {
        found.teamSize = entries.length;
        cachedTeamSize = entries.length;
        entries.forEach((entry) => readIdentityFromObject(entry, found));
      }
      const pickLike = value.filter(looksLikePick);
      if (pickLike.length >= 1 && pickLike.length >= value.length * 0.4) {
        pickLike.forEach((item) => {
          const player = extractPlayer(item, found);
          if (player) {
            found.picks.push(player);
            appearanceIdsToStore(item, false).forEach((id) => rememberAppearance(id, player));
          }
        });
        return;
      }
      value.slice(0, 250).forEach((item) => collect(item, found, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;

    readIdentityFromObject(value, found);

    if (looksLikePick(value)) {
      const player = extractPlayer(value, found);
      if (player) {
        found.picks.push(player);
        appearanceIdsToStore(value, false).forEach((id) => rememberAppearance(id, player));
      }
    }

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
      maybeTeamSize(key, value[key], found);
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

  function entryIdFromUrl(url) {
    const text = String(url || location.href || '');
    const patterns = [
      /[?&](?:draft_)?entry(?:_id)?=([a-f0-9-]{8,})/i,
      /\/entr(?:y|ies)\/([a-f0-9-]{8,})/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return '';
  }

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
        .filter((player) => player?.name);
      if (rosterPicks.length >= 4 && rosterPicks.length <= 20 && rosterPicks.length >= value.length * 0.55) {
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
      row.picks.length >= 4 && row.picks.length <= 20
    );
    if (rosters.length === 1 && rosters[0].picks.length >= 4 && rosters[0].picks.length <= 20) {
      // One open completed team — keep it even if Underdog did not mark it as "mine".
    } else if (rosters.length >= 8 && rosters.length <= 14 && !found.isUserRosterContext) {
      rosters = rosters.filter((row) => row.mine);
    } else if (!found.isUserRosterContext) {
      rosters = rosters.filter((row) => row.mine);
    }

    const slimNamed = (pick) => ({
      name: pick.name,
      position: pick.position,
      team: pick.team,
      pickNo: pick.pickNo || null,
      appearanceId: pick.appearanceId || null
    });

    const drafts = rosters.map((row, index) => ({
      id: `ud-${cachedDraftId || 'entry'}-${index}-${row.picks[0]?.name || index}`,
      savedAt: Date.now(),
      picks: row.picks.map(slimNamed)
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
        picks: openTeam.picks.map(slimNamed)
      }
      : null;
    if (openTeam?.picks?.length) applyPairedAppearances(openTeam.picks, cachedDraftId);
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
    if (data.result && typeof data.result === 'object') payloads.push(data.result);
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

  function mergeAccumulated(incoming, draftId) {
    if (draftId && accumulatedDraftId && draftId !== accumulatedDraftId) {
      accumulatedPicks = [];
    }
    if (draftId) accumulatedDraftId = draftId;
    const byName = new Map();
    const byNo = new Map();
    function add(pick) {
      if (!pick?.name) return;
      const nameKey = `${String(pick.name).toLowerCase()}|${String(pick.position || '').toUpperCase()}`;
      const no = Number(pick.pickNo);
      const prev = (Number.isFinite(no) && no > 0 && byNo.get(no)) || byName.get(nameKey) || {};
      const next = {
        ...prev,
        ...pick,
        name: pick.name || prev.name,
        position: pick.position || prev.position,
        team: pick.team || prev.team,
        pickNo: (Number.isFinite(no) && no > 0 ? no : prev.pickNo) || null,
        mine: Boolean(prev.mine || pick.mine),
        slot: pick.slot || prev.slot
      };
      byName.set(nameKey, next);
      if (Number(next.pickNo) > 0) byNo.set(Number(next.pickNo), next);
    }
    accumulatedPicks.forEach(add);
    incoming.forEach(add);
    accumulatedPicks = [...byName.values()].sort((a, b) => (a.pickNo || 999) - (b.pickNo || 999));
    return accumulatedPicks;
  }

  function isLiveDraftContext(url) {
    const href = `${url || ''} ${location.href || ''} ${location.pathname || ''}`.toLowerCase();
    if (/lobby/.test(href) && !/\/drafts?\/[a-z0-9-]{8,}/.test(href)) return false;
    if (/completed|recap|results|history|review/.test(href) && !/in-draft|live-draft|snakedraft/.test(href)) {
      return /in-draft|live-draft|snakedraft|draft-room/.test(href);
    }
    return /snakedraft|live-draft|in-draft|draft-room/.test(href)
      || /\/drafts?\/[a-z0-9-]{8,}/.test(href);
  }

  function harvestAppearances(value, seen, depth, inherited) {
    if (!value || depth > 7) return;
    if (typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
    }
    if (Array.isArray(value)) {
      value.slice(0, 2000).forEach((item) => harvestAppearances(item, seen, depth + 1, inherited));
      return;
    }
    if (typeof value !== 'object') return;
    const isPick = (value.draft_entry_id || value.drafted_percentage != null) && !value.first_name && !value.player;
    let current = inherited || null;
    if (!isPick) {
      const player = extractPlayer(value, {});
      if (player?.name) {
        current = { name: player.name, position: skillFrom(player.position) || player.position, team: player.team };
        const liveNamed = harvestLiveBoard && (
          looksLikeAppearanceRecord(value)
          || skillFrom(current.position)
          || value.position_id
          || value.player_id
        );
        appearanceIdsToStore(value, Boolean(inherited) || liveNamed).forEach((id) => rememberAppearance(id, current));
      } else if (inherited && looksLikeAppearanceRecord(value)) {
        rememberAppearance(value.id, inherited);
        rememberAppearance(value.appearance_id, inherited);
      } else if (looksLikeAppearanceRecord(value)) {
        const linked = appearanceCatalog[String(value.player_id || value.playerId || value.unique_player_id || '')];
        if (linked) rememberAppearance(value.id, linked);
      }
    }
    Object.keys(value).slice(0, 80).forEach((key) => {
      if (/password|token|cookie|card/i.test(key)) return;
      harvestAppearances(value[key], seen, depth + 1, /appearances?$/i.test(key) ? current : null);
    });
  }

  function isIdOnlyPick(value) {
    return Boolean(
      value
      && typeof value === 'object'
      && (value.appearance_id || value.appearanceId)
      && (value.number != null || value.pick_number != null || value.pickNumber != null)
      && (value.draft_entry_id || value.draftEntryId || value.drafted_percentage != null)
      && !value.first_name
      && !value.firstName
    );
  }

  function ingestRawPicks(value, draftId, seen, depth, bag) {
    if (!value || depth > 8) return;
    if (typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
    }
    if (Array.isArray(value)) {
      value.slice(0, 400).forEach((item) => ingestRawPicks(item, draftId, seen, depth + 1, bag));
      return;
    }
    if (typeof value !== 'object') return;
    if (isIdOnlyPick(value)) {
      const appearanceId = String(value.appearance_id || value.appearanceId);
      const entryId = String(value.draft_entry_id || value.draftEntryId || '');
      bag.push({
        number: Number(value.number || value.pick_number || value.pickNumber),
        appearance_id: appearanceId,
        draft_entry_id: entryId,
        mine: Boolean(cachedMyEntryId && entryId && entryId === String(cachedMyEntryId)),
        draftId
      });
    }
    if (objectLooksLikeMe(value) && value.id != null && isUuid(value.id)) {
      cachedMyEntryId = String(value.id);
    }
    Object.keys(value).slice(0, 40).forEach((key) => {
      if (/password|token|cookie|card/i.test(key)) return;
      ingestRawPicks(value[key], draftId, seen, depth + 1, bag);
    });
  }

  function storeRawPicks(payload, draftId) {
    const bag = [];
    ingestRawPicks(payload, draftId, new WeakSet(), 0, bag);
    if (!bag.length) return;
    const key = draftId || cachedDraftId || 'open';
    const entries = [...new Set(bag.map((pick) => pick.draft_entry_id).filter(Boolean))];
    if (bag.length >= 4 && bag.length <= 10 && entries.length === 1) {
      cachedMyEntryId = entries[0];
    }
    const fromUrl = entryIdFromUrl(location.href) || entryIdFromUrl(draftId);
    if (fromUrl) cachedMyEntryId = fromUrl;
    bag.forEach((pick) => {
      if (cachedMyEntryId && pick.draft_entry_id === String(cachedMyEntryId)) pick.mine = true;
    });
    const prev = rawPicksByDraft[key] || [];
    const byId = new Map(prev.map((pick) => [pick.appearance_id, pick]));
    bag.forEach((pick) => byId.set(pick.appearance_id, pick));
    rawPicksByDraft[key] = [...byId.values()];
    const focused = cachedMyEntryId
      ? rawPicksByDraft[key].filter((pick) => pick.draft_entry_id === String(cachedMyEntryId))
      : (bag.length >= 4 && bag.length <= 10 ? bag : rawPicksByDraft[key]);
    emit('raw-picks', { draftId: key, picks: rawPicksByDraft[key], focusPicks: focused, entryId: cachedMyEntryId || '' });
    applyPairedAppearances(lastNamedRoster, key, focused);
  }

  function inspect(data, url) {
    if (!data || typeof data !== 'object') return;
    unwrapPayloads(data).forEach((payload) => {
      if (!payload || typeof payload !== 'object') return;
      harvestLiveBoard = isLiveDraftContext(url);
      const fromUrl = entryIdFromUrl(url) || entryIdFromUrl(location.href);
      if (fromUrl) cachedMyEntryId = fromUrl;
      const draftId = cachedDraftId || draftIdFromUrl(url) || draftIdFromUrl(location.href);
      storeRawPicks(payload, draftId);
      const before = Object.keys(appearanceCatalog).length;
      harvestAppearances(payload, new WeakSet(), 0);
      inspectPortfolio(payload);
      const found = {
        picks: [],
        onTheClock: null,
        mySlot: cachedMySlot,
        myUserId: cachedMyUserId,
        teamSize: cachedTeamSize,
        draftId: draftId
      };
      collect(payload, found, 0);
      if (found.picks.length) applyPairedAppearances(found.picks, found.draftId || draftId);
      if (Object.keys(appearanceCatalog).length > before) {
        emit('appearances', appearanceCatalog);
      }
      if (!found.picks.length) return;
      const liveRoom = isLiveDraftContext(url);
      const maxPick = found.picks.reduce((max, pick) => Math.max(max, Number(pick.pickNo) || 0), 0);
      if (!liveRoom && found.picks.length >= 12 && found.picks.length <= 20 && maxPick <= 20) return;

      if (found.myUserId) cachedMyUserId = found.myUserId;
      if (found.draftId) cachedDraftId = found.draftId;

      const ready = found.picks.map((pick) => ({
        ...pick,
        pickNo: Number(pick.pickNo) > 0 ? Number(pick.pickNo) : null
      }));
      finalizeIdentity(found, ready);

      emit('snapshot', {
        picks: mergeAccumulated(ready, found.draftId),
        onTheClock: found.onTheClock,
        mySlot: found.mySlot,
        teamSize: found.teamSize || cachedTeamSize || 12,
        draftId: found.draftId,
        myUserId: found.myUserId
      });
    });
  }

  function shouldInspect(url) {
    const text = String(url || '');
    if (/analytics|google-analytics|stripe|sentry|segment|hotjar|fullstory|datadog|newrelic|doubleclick/i.test(text)) {
      return false;
    }
    if (!text || text.startsWith('/') || text.startsWith('./') || text.startsWith('?')) return true;
    return /underdog|graphql|pusher|ably|socket|draft|pick/i.test(text);
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
    this.__fdsUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        if (!shouldInspect(this.__fdsUrl)) return;
        const contentType = this.getResponseHeader('content-type') || '';
        if (!contentType.includes('json')) return;
        safeInspect(JSON.parse(this.responseText), this.__fdsUrl);
      } catch (err) {
        // Ignore non-JSON XHR payloads.
      }
    });
    return originalSend.call(this, ...args);
  };

  function parseSocketData(raw, url) {
    const parsed = parseSocketJson(raw);
    if (parsed) safeInspect(parsed, url);
  }

  const OriginalWebSocket = window.WebSocket;
  if (typeof OriginalWebSocket === 'function' && !OriginalWebSocket.__fdsUdWrapped) {
    function WrappedWebSocket(url, protocols) {
      const ws = protocols !== undefined
        ? new OriginalWebSocket(url, protocols)
        : new OriginalWebSocket(url);
      ws.addEventListener('message', (event) => {
        const text = String(url || '');
        if (!/analytics|google-analytics|stripe|sentry|segment/i.test(text)) {
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
    WrappedWebSocket.__fdsUdWrapped = true;
    window.WebSocket = WrappedWebSocket;
  }

  function parseMaybeJson(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text.startsWith('{') && !text.startsWith('[')) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }

  function harvestStorage(storage) {
    if (!storage) return;
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        harvestAppearances(parseMaybeJson(storage.getItem(key)), new WeakSet(), 0, null);
      }
    } catch (err) {
      /* storage blocked */
    }
  }

  function openIndexedDb(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        req.transaction.abort();
        reject(new Error('upgrade'));
      };
    });
  }

  function idbGetAll(store) {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function harvestIndexedDb() {
    if (!indexedDB.databases) return;
    const infos = await indexedDB.databases();
    for (let i = 0; i < (infos || []).length; i += 1) {
      const name = infos[i]?.name;
      if (!name) continue;
      try {
        const db = await openIndexedDb(name);
        const stores = [...db.objectStoreNames];
        for (let s = 0; s < stores.length; s += 1) {
          try {
            const tx = db.transaction(stores[s], 'readonly');
            const rows = await idbGetAll(tx.objectStore(stores[s]));
            harvestAppearances(rows, new WeakSet(), 0, null);
          } catch (err) {
            /* store unreadable */
          }
        }
        db.close();
      } catch (err) {
        /* db unreadable */
      }
    }
  }

  async function harvestPageCaches() {
    harvestStorage(window.localStorage);
    harvestStorage(window.sessionStorage);
    [
      window.__NEXT_DATA__,
      window.__PRELOADED_STATE__,
      window.__UD_STATE__,
      window.__APOLLO_STATE__
    ].forEach((value) => harvestAppearances(value, new WeakSet(), 0, null));
    await harvestIndexedDb();
  }

  async function fetchPlayerCatalog() {
    const urls = [
      'https://api.underdogfantasy.com/v1/unique_players?sport_id=NFL',
      'https://api.underdogfantasy.com/v1/unique_players?sport_id=NFL&product=fantasy',
      'https://api.underdogfantasy.com/v1/unique_players?sport_id=NFL&include=appearances',
      'https://api.underdogfantasy.com/beta/v5/over_under_lines',
      'https://api.underdogfantasy.com/beta/v6/over_under_lines'
    ];
    harvestStorage(window.localStorage);
    harvestStorage(window.sessionStorage);
    const fetchFn = originalFetch || window.fetch;
    for (let i = 0; i < urls.length; i += 1) {
      try {
        const response = await fetchFn(urls[i], {
          credentials: 'include',
          headers: { Accept: 'application/json' }
        });
        const data = await response.json();
        harvestAppearances(data, new WeakSet(), 0, null);
      } catch (err) {
        /* catalog endpoint may 404 */
      }
    }
    if (Object.keys(appearanceCatalog).length) emit('appearances', appearanceCatalog);
  }

  async function resolveAppearanceIds(ids) {
    const fetchFn = originalFetch || window.fetch;
    const factories = [
      (id) => `https://api.underdogfantasy.com/v1/appearances/${id}`,
      (id) => `https://api.underdogfantasy.com/v1/appearances/${id}?product=fantasy`,
      (id) => `https://api.underdogfantasy.com/v1/unique_players/${id}`,
      (id) => `https://api.underdogfantasy.com/v1/players/${id}`,
      (id) => `https://stats.underdogfantasy.com/v1/appearances/${id}`
    ];
    let probe = '';
    const list = (ids || []).slice(0, 18);
    for (let i = 0; i < list.length; i += 1) {
      const id = list[i];
      if (!id || appearanceCatalog[String(id)]) continue;
      for (let f = 0; f < factories.length; f += 1) {
        try {
          const response = await fetchFn(factories[f](id), {
            credentials: 'include',
            headers: { Accept: 'application/json' }
          });
          const data = await response.json().catch(() => ({}));
          if (i === 0) {
            probe += `page ${factories[f](id).replace('https://api.underdogfantasy.com/', 'api/').replace('https://stats.underdogfantasy.com/', 'stats/')}:${response.status}`;
          }
          if (response.ok) {
            harvestAppearances(data, new WeakSet(), 0, null);
            if (appearanceCatalog[String(id)]) break;
          }
        } catch (err) {
          /* ignore */
        }
      }
    }
    emit('id-probe', { appearances: appearanceCatalog, probe });
    if (Object.keys(appearanceCatalog).length) emit('appearances', appearanceCatalog);
  }

  window.addEventListener('message', (event) => {
    const payload = event.data;
    if (!payload || payload.source !== SOURCE) return;
    if (payload.kind === 'request') {
      if (lastSnapshotData) emit('snapshot', lastSnapshotData);
      if (lastPortfolioData) emit('portfolio', lastPortfolioData);
      if (Object.keys(appearanceCatalog).length) emit('appearances', appearanceCatalog);
      const raw = rawPicksByDraft[cachedDraftId] || Object.values(rawPicksByDraft).flat();
      if (raw.length) emit('raw-picks', { draftId: cachedDraftId, picks: raw });
      return;
    }
    if (payload.kind === 'fetch-catalog') {
      fetchPlayerCatalog();
      return;
    }
    if (payload.kind === 'resolve-ids' && Array.isArray(payload.ids)) {
      resolveAppearanceIds(payload.ids);
    }
  });
})();
