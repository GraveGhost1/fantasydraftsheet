(function (global) {
  const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);
  const AUTH = {
    audience: 'https://api.underdogfantasy.com',
    apiBaseUrl: 'https://api.underdogfantasy.com',
    statsBaseUrl: 'https://stats.underdogfantasy.com/v1',
    tokenUrl: 'https://login.underdogsports.com/oauth/token',
    userUrl: 'https://api.underdogfantasy.com/v1/user',
    activeDraftsUrl: 'https://api.underdogfantasy.com/v4/user/active_drafts?product=fantasy',
    completedSlatesUrl: 'https://api.underdogfantasy.com/v2/user/completed_slates?product=fantasy',
    completedSlatesUrlV1: 'https://api.underdogfantasy.com/v1/user/completed_slates?product=fantasy',
    slateListUrls: [
      'https://api.underdogfantasy.com/v2/user/completed_slates?product=fantasy',
      'https://api.underdogfantasy.com/v1/user/completed_slates?product=fantasy',
      'https://api.underdogfantasy.com/v2/user/slates?product=fantasy',
      'https://api.underdogfantasy.com/v1/user/slates?product=fantasy',
      'https://api.underdogfantasy.com/v4/user/slates?product=fantasy',
      'https://api.underdogfantasy.com/v2/user/live_slates?product=fantasy',
      'https://api.underdogfantasy.com/v1/user/live_slates?product=fantasy',
      'https://api.underdogfantasy.com/v2/user/in_progress_slates?product=fantasy',
      'https://api.underdogfantasy.com/v1/user/in_progress_slates?product=fantasy',
      'https://api.underdogfantasy.com/v2/user/entered_slates?product=fantasy',
      'https://api.underdogfantasy.com/v1/user/entered_slates?product=fantasy'
    ],
    draftListUrls: [
      'https://api.underdogfantasy.com/v4/user/active_drafts?product=fantasy',
      'https://api.underdogfantasy.com/v1/user/drafts?product=fantasy',
      'https://api.underdogfantasy.com/v2/user/drafts?product=fantasy',
      'https://api.underdogfantasy.com/v4/user/drafts?product=fantasy',
      'https://api.underdogfantasy.com/v1/user/draft_entries?product=fantasy',
      'https://api.underdogfantasy.com/v2/user/draft_entries?product=fantasy'
    ],
    clientId: 'cQvYz1T2BAFbix4dYR37dyD9O0Thf1s6',
    cookieName: 'session_refresh',
    clientType: 'web',
    clientVersion: '20260511140701',
    cookieUrls: [
      'https://login.underdogsports.com/',
      'https://app.underdogsports.com/',
      'https://www.underdogsports.com/',
      'https://login.underdogfantasy.com/',
      'https://app.underdogfantasy.com/',
      'https://www.underdogfantasy.com/'
    ],
    cookieDomains: ['underdogsports.com', 'underdogfantasy.com']
  };
  const STORAGE_KEYS = {
    accessToken: 'fdsUdAccessToken',
    expiresAt: 'fdsUdAccessExpiresAt',
    deviceId: 'fdsUdClientDeviceId',
    progress: 'fdsUdSyncProgress',
    appearanceMap: 'fdsUdAppearanceMap',
    rememberedDrafts: 'fdsUdRememberedDrafts'
  };
  const BATCH = 20;
  const FETCH_GAP_MS = 80;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function asText(value, depth) {
    if (value == null || depth > 3) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (typeof value !== 'object') return '';
    const combined = [asText(value.firstName || value.first_name, depth + 1), asText(value.lastName || value.last_name, depth + 1)]
      .filter(Boolean)
      .join(' ');
    const fields = [value.fullName, value.full_name, value.displayName, value.display_name, value.playerName, value.player_name];
    for (let i = 0; i < fields.length; i += 1) {
      const text = asText(fields[i], depth + 1);
      if (text) return text;
    }
    if (typeof value.name === 'string') return value.name.trim();
    if (value.name && typeof value.name === 'object') return asText(value.name, depth + 1);
    return combined;
  }

  function asPosition(value) {
    if (!value) return '';
    if (typeof value === 'string' || typeof value === 'number') {
      const raw = String(value);
      const upper = raw.toUpperCase();
      if (SKILL.has(upper)) return upper;
      if (/quarterback|^qb$/i.test(raw)) return 'QB';
      if (/running.?back|^rb$/i.test(raw)) return 'RB';
      if (/wide.?receiver|^wr$/i.test(raw)) return 'WR';
      if (/tight.?end|^te$/i.test(raw)) return 'TE';
      return '';
    }
    if (typeof value === 'object') {
      return asPosition(value.abbr || value.abbreviation || value.name || value.kind || value.pos || value.id);
    }
    return '';
  }

  function asTeam(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      const text = value.trim();
      if (text.length > 4 && text.includes('-')) return '';
      return text.toUpperCase().slice(0, 4);
    }
    if (typeof value === 'object') {
      return asTeam(value.abbr || value.abbreviation || value.teamAbbr || value.code || '');
    }
    return '';
  }

  function asList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter((item) => item != null);
    if (typeof value === 'object') {
      return Object.values(value).filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    }
    return [];
  }

  function unwrap(payload) {
    if (!payload || typeof payload !== 'object') return {};
    if (Array.isArray(payload)) return payload;
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : null;
    return data ? { ...payload, ...data } : payload;
  }

  function readArray(payload, keys) {
    const root = unwrap(payload);
    if (Array.isArray(root)) return root;
    for (let i = 0; i < keys.length; i += 1) {
      const list = asList(root[keys[i]]);
      if (list.length) return list;
    }
    return asList(root.data);
  }

  function uniqueIds(values) {
    const seen = new Set();
    const out = [];
    (values || []).forEach((value) => {
      const id = String(value || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  function topKeys(value) {
    if (!value || typeof value !== 'object') return [];
    return Object.keys(value).slice(0, 16);
  }

  function entryId(value) {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    return String(value.draft_entry_id || value.draftEntryId || value.entry_id || value.entryId || value.draft_entry?.id || '');
  }

  function userIdsOf(value) {
    if (value == null) return [];
    if (typeof value !== 'object') return uniqueIds([value]);
    return uniqueIds([
      value.user_id, value.userId, value.ud_sub,
      value.user?.id, value.user?.user_id, value.user?.ud_sub
    ]);
  }

  function fetchDraftId(value) {
    if (!value || typeof value !== 'object') return '';
    return String(value.draft_id || value.draftId || value.draft?.id || value.id || '');
  }

  function rawUdDraftId(value) {
    return String(value || '').replace(/^ud-(daily-)?/i, '');
  }

  function looksLikeUdUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  function accountDraftKey(mode, draftId) {
    const id = rawUdDraftId(draftId);
    if (!id) return '';
    return mode === 'daily' ? `ud-daily-${id}` : `ud-${id}`;
  }

  function entryIdFromSummary(summary) {
    if (!summary || typeof summary !== 'object') return '';
    const explicit = summary.draft_entry_id || summary.draftEntryId || summary.entry_id || summary.entryId;
    if (explicit) return String(explicit);
    const draftId = String(summary.draft_id || summary.draftId || summary.draft?.id || '');
    const id = String(summary.id || '');
    if (draftId && id && draftId !== id) return id;
    return '';
  }

  function isNflSlate(slate) {
    if (!slate || typeof slate !== 'object') return true;
    const sport = String(slate.sport_id || slate.sportId || slate.sport?.id || slate.sport || '').toUpperCase();
    if (!sport) return true;
    if (sport === 'NFL' || sport === '1' || sport.includes('FOOTBALL')) return true;
    if (/NBA|MLB|NHL|MLS|SOCCER|CFB|NASCAR|GOLF|TENNIS|VALORANT|CSGO|MADDEN|PGA/.test(sport)) return false;
    return true;
  }

  function contextBlob(slate, round, summary) {
    return [
      slate?.title, slate?.name, slate?.label, slate?.description, slate?.display_name,
      slate?.slate_type, slate?.type, slate?.kind, slate?.style, slate?.format,
      slate?.contest_type, slate?.tournament_type, slate?.category,
      round?.title, round?.name, round?.label,
      summary?.title, summary?.name, summary?.slate?.title
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function slateDurationDays(slate) {
    const start = Date.parse(slate?.starts_at || slate?.start_at || slate?.startsAt || slate?.startTime || '');
    const end = Date.parse(slate?.ends_at || slate?.end_at || slate?.endsAt || slate?.endTime || '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return (end - start) / 86400000;
  }

  function inferMode(picks, slate, round, summary, rawCount, forcedMode) {
    if (forcedMode === 'daily' || forcedMode === 'season') return forcedMode;
    const blob = contextBlob(slate, round, summary);
    const days = slateDurationDays(slate);
    const count = Number(rawCount) > 0 ? Number(rawCount) : (picks || []).length;
    if (count >= 4 && count <= 10) return 'daily';
    const seasonNamed = /best ball mania|\bbbm\b|season.?long|playoff.?push|regular season|championship series|eliminator/.test(blob);
    const dailyNamed = /daily|showdown|primetime|thursday|\bthu\b|\bfri\b|friday night|\bmnf\b|\bsnf\b|sunday night|monday night|main slate|single.?week|one.?week|short.?slate/.test(blob);
    if (dailyNamed && !seasonNamed) return 'daily';
    if (seasonNamed && !dailyNamed) return 'season';
    if (days != null && days <= 10) return 'daily';
    if (days != null && days >= 40) return 'season';
    return 'season';
  }

  function hasPersonName(value) {
    return Boolean(value && (value.first_name || value.firstName || value.last_name || value.lastName || value.full_name || value.fullName));
  }

  function extractPlayer(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.name && value.position && SKILL.has(value.position)) {
      return { name: value.name, position: value.position, team: value.team || '' };
    }
    const nested = value.player || value.appearance?.player || value.unique_player || value;
    const name = asText(nested, 0) || asText(value, 0);
    if (!name || name.length < 3) return null;
    if (isPickRecord(value) && !hasPersonName(value) && !hasPersonName(nested)) return null;
    const position = asPosition(
      nested.position || nested.position_id || nested.positionName || value.position || value.position_id || value.pos
    );
    if (position && !SKILL.has(position)) return null;
    if (!position && !hasPersonName(value) && !hasPersonName(nested)) return null;
    return {
      name,
      position: position || '',
      team: asTeam(nested.teamAbbr || nested.team || nested.team_id || value.team || value.team_id)
    };
  }

  function slimPlayer(player) {
    if (!player?.name) return null;
    return {
      name: player.name,
      position: SKILL.has(player.position) ? player.position : '',
      team: player.team || ''
    };
  }

  function entityIds(value) {
    if (!value || typeof value !== 'object') return [];
    return uniqueIds([
      value.id,
      value.appearance_id,
      value.appearanceId,
      value.player_id,
      value.playerId,
      value.unique_player_id,
      value.uniquePlayerId,
      value.player?.id,
      value.appearance?.id
    ]);
  }

  function uniquePlayers(list) {
    const seen = new Set();
    const out = [];
    (list || []).forEach((player) => {
      if (!player?.name) return;
      const key = `${player.name}|${player.position}|${player.team}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const next = { name: player.name, position: player.position || '', team: player.team || '' };
      if (player.appearanceId) next.appearanceId = String(player.appearanceId);
      out.push(next);
    });
    return out;
  }

  function fillFromBoard(picks, boardPlayers) {
    const board = boardPlayers || [];
    return (picks || []).map((player) => {
      if (SKILL.has(player.position) && player.name) return player;
      const needle = String(player.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const hit = board.find((row) => {
        const name = String(row?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        return name && needle && (name === needle || name.includes(needle) || needle.includes(name));
      });
      if (!hit) return player;
      return {
        ...player,
        position: SKILL.has(player.position) ? player.position : (hit.position || player.position || ''),
        team: player.team || hit.team || ''
      };
    }).filter((player) => player.name && (SKILL.has(player.position) || player.appearanceId));
  }

  function findMyEntry(draft, me, summary) {
    const entries = asList(draft?.draft_entries);
    const summaryEntryId = entryIdFromSummary(summary);
    if (summaryEntryId) {
      return entries.find((entry) => String(entry?.id || '') === summaryEntryId) || { id: summaryEntryId };
    }
    const myIds = new Set(userIdsOf(me));
    const uname = String(me?.username || '').toLowerCase();
    return entries.find((entry) => (
      entry?.is_current_user ||
      entry?.isCurrentUser ||
      userIdsOf(entry).some((id) => myIds.has(id)) ||
      (uname && String(entry?.username || entry?.user?.username || '').toLowerCase() === uname)
    )) || null;
  }

  function normalizeDraftEnvelope(detail, summary) {
    const root = unwrap(detail);
    const draft = unwrap(root.draft || root);
    return {
      ...draft,
      id: fetchDraftId(draft) || fetchDraftId(root) || fetchDraftId(summary),
      picks: asList(draft.picks || root.picks),
      draft_entries: asList(draft.draft_entries || root.draft_entries)
    };
  }

  function myRawPicks(draft, me, summary) {
    const entryKey = String(findMyEntry(draft, me, summary)?.id || entryIdFromSummary(summary) || '');
    const raw = asList(draft.picks);
    const mine = raw.filter((pick) => entryKey && entryId(pick) === entryKey);
    return mine.length ? mine : [];
  }

  function isPickRecord(value) {
    return Boolean(
      value
      && (value.draft_entry_id || value.draftEntryId || value.drafted_percentage != null)
      && !value.first_name
      && !value.firstName
      && !value.player
    );
  }

  function lookupPlayer(map, id) {
    if (id == null || !map) return null;
    const key = String(id);
    const mapped = map[key] || map.get?.(key);
    return slimPlayer(extractPlayer(mapped) || mapped);
  }

  function rememberPlayer(map, player, ids) {
    const slim = slimPlayer(player);
    if (!slim) return;
    uniqueIds(ids).forEach((id) => {
      map[id] = slim;
    });
  }

  function playerFromMap(pick, appearanceMap) {
    const ids = [
      pick?.appearance_id,
      pick?.appearanceId,
      pick?.appearance?.id,
      pick?.player_id,
      pick?.playerId,
      pick?.unique_player_id
    ];
    for (let i = 0; i < ids.length; i += 1) {
      const player = lookupPlayer(appearanceMap, ids[i]);
      if (player) {
        return { ...player, appearanceId: String(pick?.appearance_id || pick?.appearanceId || ids[i]) };
      }
    }
    return null;
  }

  function looksLikeAppearance(value) {
    if (!value || typeof value !== 'object' || isPickRecord(value)) return false;
    if (value.player_id || value.playerId || value.unique_player_id || value.team_id || value.teamId || value.sport_id || value.position_id || value.match_id) {
      return value.id != null;
    }
    const keys = Object.keys(value);
    return value.id != null && keys.length <= 14 && !value.username && !value.email && !value.draft_entry_id;
  }

  function collectCatalog(payload, named, stubs, seen, depth, inherited) {
    if (!payload || depth > 8) return;
    if (typeof payload === 'object') {
      if (seen.has(payload)) return;
      seen.add(payload);
    }
    if (Array.isArray(payload)) {
      payload.slice(0, 2000).forEach((item) => collectCatalog(item, named, stubs, seen, depth + 1, inherited));
      return;
    }
    if (typeof payload !== 'object') return;
    let current = inherited || null;
    if (!isPickRecord(payload)) {
      const player = extractPlayer(payload) || extractPlayer(payload.player);
      if (player) {
        current = player;
        entityIds(payload).forEach((id) => {
          named[id] = player;
        });
      } else if (inherited && looksLikeAppearance(payload)) {
        entityIds(payload).forEach((id) => {
          named[id] = inherited;
        });
      } else if (payload.id != null && (payload.player_id || payload.playerId || payload.unique_player_id || payload.player)) {
        stubs.push({
          id: String(payload.id),
          playerId: String(payload.player_id || payload.playerId || payload.unique_player_id || payload.player?.id || '')
        });
      }
    }
    Object.keys(payload).slice(0, 90).forEach((key) => {
      if (/password|token|cookie|card/i.test(key)) return;
      const childInherited = /appearances?$/i.test(key) ? current : null;
      collectCatalog(payload[key], named, stubs, seen, depth + 1, childInherited);
    });
  }

  function ingestCatalog(payload, map) {
    if (!payload) return map;
    const named = {};
    const stubs = [];
    collectCatalog(payload, named, stubs, new WeakSet(), 0);
    Object.keys(named).forEach((id) => rememberPlayer(map, named[id], [id]));
    stubs.forEach((stub) => {
      const player = named[stub.playerId] || lookupPlayer(map, stub.playerId);
      if (player && stub.id) rememberPlayer(map, player, [stub.id, stub.playerId]);
    });
    const root = unwrap(payload);
    const players = asList(root.players || root.unique_players);
    const appearances = asList(root.appearances);
    if (players.length && appearances.length) {
      const byPlayerId = {};
      players.forEach((item) => {
        const player = extractPlayer(item);
        if (!player) return;
        entityIds(item).forEach((id) => {
          byPlayerId[id] = player;
          rememberPlayer(map, player, [id]);
        });
      });
      appearances.forEach((item) => {
        if (!item || item.id == null) return;
        const player = extractPlayer(item)
          || byPlayerId[String(item.player_id || item.playerId || item.unique_player_id || '')]
          || lookupPlayer(map, item.player_id || item.playerId || item.unique_player_id);
        if (player) rememberPlayer(map, player, entityIds(item));
      });
    }
    return map;
  }

  function slimAppearanceMap(map) {
    const out = {};
    Object.keys(map || {}).forEach((id) => {
      const player = slimPlayer(extractPlayer(map[id]) || map[id]);
      if (player) out[id] = player;
    });
    return out;
  }

  let appearanceFactory = null;

  function appearanceUrlFactories() {
    return [
      (id) => `${AUTH.apiBaseUrl}/v1/appearances/${id}`,
      (id) => `${AUTH.apiBaseUrl}/v1/appearances/${id}?product=fantasy`,
      (id) => `${AUTH.apiBaseUrl}/v1/unique_players/${id}`,
      (id) => `${AUTH.apiBaseUrl}/v1/players/${id}`,
      (id) => `${AUTH.statsBaseUrl}/appearances/${id}`,
      (id) => `${AUTH.statsBaseUrl}/appearances/${id}?product=fantasy`
    ];
  }

  async function rememberAppearancePayload(data, id, map, token, deviceId) {
    ingestCatalog(data, map);
    const root = unwrap(data);
    const appearance = root.appearance || root.unique_player || root.player || root;
    let player = extractPlayer(appearance)
      || extractPlayer(root.player)
      || lookupPlayer(map, appearance?.player_id || appearance?.playerId || appearance?.unique_player_id || root.player_id);
    const playerId = appearance?.player_id || appearance?.playerId || appearance?.unique_player_id || root.player_id;
    if (!player && playerId) {
      const extra = await udFetchSoft(`${AUTH.apiBaseUrl}/v1/unique_players/${playerId}`, token, deviceId)
        || await udFetchSoft(`${AUTH.apiBaseUrl}/v1/players/${playerId}`, token, deviceId);
      if (extra) {
        ingestCatalog(extra, map);
        player = extractPlayer(unwrap(extra).unique_player || unwrap(extra).player || extra) || lookupPlayer(map, playerId);
      }
    }
    if (player) {
      rememberPlayer(map, player, [id, appearance?.id, playerId]);
      return true;
    }
    return Boolean(lookupPlayer(map, id));
  }

  async function resolveAppearanceIds(ids, map, token, deviceId) {
    const missing = uniqueIds(ids).filter((id) => !lookupPlayer(map, id));
    if (!missing.length) return map;
    const factories = appearanceFactory ? [appearanceFactory, ...appearanceUrlFactories()] : appearanceUrlFactories();
    for (let i = 0; i < missing.length; i += 1) {
      const id = missing[i];
      if (lookupPlayer(map, id)) continue;
      let resolved = false;
      for (let f = 0; f < factories.length; f += 1) {
        const data = await udFetchSoft(factories[f](id), token, deviceId);
        if (!data) continue;
        if (await rememberAppearancePayload(data, id, map, token, deviceId)) {
          appearanceFactory = factories[f];
          resolved = true;
          break;
        }
      }
      if (!resolved && i === 0) break;
      await delay(40);
    }
    return map;
  }

  function lineupFromDraft(detail, summary, slate, round, me, appearanceMap, boardPlayers) {
    ingestCatalog(detail, appearanceMap);
    ingestCatalog(summary, appearanceMap);
    const draft = normalizeDraftEnvelope(detail, summary);
    const raw = myRawPicks(draft, me, summary);
    if (raw.length < 4) return null;
    const picks = fillFromBoard(
      uniquePlayers(raw.map((pick) => playerFromMap(pick, appearanceMap))),
      boardPlayers
    );
    const needed = raw.length >= 12 ? raw.length : 4;
    if (picks.length < needed) return null;
    const draftId = fetchDraftId(summary) || draft.id;
    if (!draftId) return null;
    const mode = inferMode(picks, slate, round, summary, raw.length, summary?.forcedMode);
    return {
      id: accountDraftKey(mode, draftId),
      savedAt: Date.now(),
      picks,
      mode,
      slateId: String(slate?.id || slate?.slate_id || summary?.slate_id || ''),
      slateTitle: slate?.title || slate?.name || summary?.slate?.title || '',
      resolved: picks.length,
      rawCount: raw.length
    };
  }

  async function setProgress(status, extra) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.progress]: { status, at: Date.now(), ...(extra || {}) }
    });
  }

  async function getProgress() {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.progress]);
    return stored[STORAGE_KEYS.progress] || null;
  }

  async function getDeviceId() {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.deviceId]);
    if (stored[STORAGE_KEYS.deviceId]) return stored[STORAGE_KEYS.deviceId];
    const deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ [STORAGE_KEYS.deviceId]: deviceId });
    return deviceId;
  }

  async function getRefreshCookie() {
    if (!chrome.cookies?.get) {
      throw new Error('Reload the extension so cookies permission can be applied, then try again.');
    }
    for (let i = 0; i < AUTH.cookieUrls.length; i += 1) {
      const cookie = await chrome.cookies.get({ url: AUTH.cookieUrls[i], name: AUTH.cookieName });
      if (cookie?.value) return cookie.value;
    }
    const all = await chrome.cookies.getAll({ name: AUTH.cookieName });
    const match = (all || []).find((cookie) => AUTH.cookieDomains.some((domain) => String(cookie.domain || '').includes(domain)));
    if (match?.value) return match.value;
    throw new Error('Log into Underdog in this Chrome profile, then click Sync again.');
  }

  async function exchangeToken(refreshToken) {
    const response = await fetch(AUTH.tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audience: AUTH.audience,
        client_id: AUTH.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'offline_access'
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Could not refresh the Underdog session. Log in again on underdogfantasy.com.');
    }
    const expiresIn = Number(data.expires_in || 0);
    await chrome.storage.local.set({
      [STORAGE_KEYS.accessToken]: data.access_token,
      [STORAGE_KEYS.expiresAt]: expiresIn > 0 ? Date.now() + expiresIn * 1000 : Date.now() + 10 * 60 * 1000
    });
    return data.access_token;
  }

  async function getAccessToken() {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.accessToken, STORAGE_KEYS.expiresAt]);
    if (stored[STORAGE_KEYS.accessToken] && Number(stored[STORAGE_KEYS.expiresAt]) > Date.now() + 60 * 1000) {
      return stored[STORAGE_KEYS.accessToken];
    }
    return exchangeToken(await getRefreshCookie());
  }

  async function udFetch(url, token, deviceId) {
    const headers = {
      Accept: 'application/json',
      Authorization: token,
      'client-device-id': deviceId,
      'client-request-id': crypto.randomUUID(),
      'client-type': AUTH.clientType,
      'client-version': AUTH.clientVersion,
      'referring-link': ''
    };
    let response = await fetch(url, { method: 'GET', headers });
    if (response.status === 401) {
      response = await fetch(url, { method: 'GET', headers: { ...headers, Authorization: `Bearer ${token}` } });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Underdog request failed (${response.status}).`);
    }
    return data;
  }

  async function udFetchSoft(url, token, deviceId) {
    try {
      return await udFetch(url, token, deviceId);
    } catch (err) {
      return null;
    }
  }

  function describePayload(data, status) {
    const root = unwrap(data || {});
    return {
      status,
      keys: topKeys(root).join('/'),
      players: asList(root.players || root.unique_players).length,
      appearances: asList(root.appearances).length,
      named: asList(root.players || root.unique_players).filter((item) => extractPlayer(item)).length
    };
  }

  async function fetchMeta(url, token, deviceId) {
    const headers = {
      Accept: 'application/json',
      Authorization: token,
      'client-device-id': deviceId,
      'client-request-id': crypto.randomUUID(),
      'client-type': AUTH.clientType,
      'client-version': AUTH.clientVersion,
      'referring-link': ''
    };
    try {
      const response = await fetch(url, { method: 'GET', headers });
      const data = await response.json().catch(() => ({}));
      return { url, data: response.ok ? data : null, ...describePayload(data, response.status) };
    } catch (err) {
      return { url, data: null, status: 'err', keys: '', players: 0, appearances: 0, named: 0 };
    }
  }

  function shortProbe(meta) {
    const path = String(meta.url || '').replace('https://api.underdogfantasy.com', 'api').replace('https://stats.underdogfantasy.com', 'stats');
    const tail = path.split('/').slice(-2).join('/');
    return `${tail}:${meta.status}${meta.named ? `n${meta.named}` : ''}${meta.appearances ? `a${meta.appearances}` : ''}${meta.keys ? `[${meta.keys}]` : ''}`;
  }

  async function loadPlayerCatalog(token, deviceId, slates, map, probe) {
    const slateId = slates?.[0]?.id || slates?.[0]?.slate_id;
    const urls = [
      `${AUTH.apiBaseUrl}/beta/v5/over_under_lines`,
      slateId ? `${AUTH.statsBaseUrl}/slates/${slateId}?product=fantasy` : ''
    ].filter(Boolean);
    for (let i = 0; i < urls.length; i += 1) {
      const meta = await fetchMeta(urls[i], token, deviceId);
      if (meta.data) ingestCatalog(meta.data, map);
      if (probe) probe.push(shortProbe(meta));
    }
    return map;
  }

  function nextPage(meta, page) {
    if (!meta || meta.next == null) return null;
    if (typeof meta.next === 'number') return meta.next;
    const numeric = Number(meta.next);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    return page + 1;
  }

  function readUser(payload) {
    const root = unwrap(payload);
    const user = root.user || root.current_user || root.currentUser || root;
    return {
      id: user?.id || user?.user_id || user?.ud_sub || root.id,
      user_id: user?.user_id || user?.id,
      ud_sub: user?.ud_sub || root.ud_sub,
      username: user?.username || user?.handle || user?.display_name || user?.name || ''
    };
  }

  async function fetchRoundDrafts(token, deviceId, roundId, knownIds) {
    const collected = [];
    let page = 1;
    while (page) {
      const payload = await udFetch(
        `${AUTH.apiBaseUrl}/v1/user/tournament_rounds/${roundId}/drafts?product=fantasy&page=${page}`,
        token,
        deviceId
      );
      const drafts = readArray(payload, ['drafts', 'user_drafts']);
      if (!drafts.length) break;
      drafts.forEach((draft) => {
        const id = fetchDraftId(draft);
        if (id && knownIds.has(`ud-${id}`)) return;
        collected.push(draft);
      });
      const nxt = nextPage(unwrap(payload).meta, page);
      if (!nxt || nxt === page) break;
      page = nxt;
      await delay(FETCH_GAP_MS);
    }
    return collected;
  }

  function rememberSlate(map, slate) {
    if (!slate || typeof slate !== 'object' || !isNflSlate(slate)) return;
    const id = String(slate.id || slate.slate_id || '');
    if (!id || map.has(id)) return;
    map.set(id, slate);
  }

  async function loadSlates(token, deviceId) {
    const byId = new Map();
    for (let i = 0; i < AUTH.slateListUrls.length; i += 1) {
      const payload = await udFetchSoft(AUTH.slateListUrls[i], token, deviceId);
      if (!payload) continue;
      readArray(payload, [
        'slates',
        'completed_slates',
        'live_slates',
        'entered_slates',
        'in_progress_slates',
        'active_slates'
      ]).forEach((slate) => rememberSlate(byId, slate));
    }
    return [...byId.values()];
  }

  async function loadLooseDrafts(token, deviceId, known) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < AUTH.draftListUrls.length; i += 1) {
      const payload = await udFetchSoft(AUTH.draftListUrls[i], token, deviceId);
      if (!payload) continue;
      readArray(payload, ['drafts', 'user_drafts', 'draft_entries', 'entries', 'active_drafts']).forEach((item) => {
        const id = fetchDraftId(item);
        if (!id || known.has(`ud-${id}`) || seen.has(id)) return;
        seen.add(id);
        out.push(item);
      });
    }
    return out;
  }

  async function loadAppearanceMap(incoming) {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.appearanceMap]);
    return { ...(stored[STORAGE_KEYS.appearanceMap] || {}), ...(incoming || {}) };
  }

  async function loadRememberedDrafts(extra) {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.rememberedDrafts]);
    const prev = Array.isArray(stored[STORAGE_KEYS.rememberedDrafts]) ? stored[STORAGE_KEYS.rememberedDrafts] : [];
    return [...prev, ...(extra || [])];
  }

  function slimRememberedPicks(picks) {
    return (picks || []).filter((pick) => pick?.name).map((pick) => ({
      name: pick.name,
      position: pick.position || '',
      team: pick.team || '',
      appearanceId: pick.appearanceId || pick.appearance_id || ''
    }));
  }

  async function rememberDrafts(entries) {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.rememberedDrafts]);
    const byKey = new Map();
    (stored[STORAGE_KEYS.rememberedDrafts] || []).concat(entries || []).forEach((row) => {
      const mode = row?.mode === 'daily' ? 'daily' : (row?.mode === 'season' ? 'season' : '');
      const incomingPicks = slimRememberedPicks(row?.picks);
      const draftId = rawUdDraftId(row?.draftId || row?.id)
        || (incomingPicks.length ? `local-${incomingPicks[0].name}-${incomingPicks.length}` : '');
      if (!draftId || !mode) return;
      const prev = byKey.get(`${mode}:${draftId}`);
      const picks = incomingPicks.length ? incomingPicks : (prev?.picks || []);
      byKey.set(`${mode}:${draftId}`, {
        draftId,
        mode,
        slateId: row.slateId || prev?.slateId || '',
        slateTitle: row.slateTitle || prev?.slateTitle || '',
        picks
      });
    });
    const next = [...byKey.values()].slice(-500);
    await chrome.storage.local.set({ [STORAGE_KEYS.rememberedDrafts]: next });
    return next;
  }

  async function syncAccount({ knownIds, onProgress, mergeBatch, boardPlayers, appearanceMap, resolveFromPage, scrapeDraft, rememberedDrafts } = {}) {
    const known = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
    const report = async (status, extra) => {
      await setProgress(status, extra);
      if (onProgress) onProgress(status, extra);
    };

    let added = 0;
    let skipped = 0;
    const remembered = await loadRememberedDrafts(rememberedDrafts);
    const rememberedMode = new Map(remembered.map((row) => [row.draftId, row.mode]));

    await report('Restoring clicked lineups…');
    const storedLineups = remembered.filter((row) => (row.picks || []).length >= 4);
    if (storedLineups.length && mergeBatch) {
      const restored = storedLineups.map((row) => ({
        id: accountDraftKey(row.mode || 'daily', row.draftId),
        savedAt: Date.now(),
        picks: slimRememberedPicks(row.picks),
        mode: row.mode || 'daily',
        slateId: row.slateId || '',
        slateTitle: row.slateTitle || (row.mode === 'daily' ? 'Daily' : 'Season')
      })).filter((draft) => !known.has(draft.id));
      if (restored.length) {
        const result = await mergeBatch(restored);
        added += Number(result?.added) || 0;
        skipped += Number(result?.skipped) || 0;
        restored.forEach((draft) => known.add(draft.id));
      }
    }

    let deviceId;
    let token;
    let me;
    try {
      await report('Connecting to Underdog…');
      deviceId = await getDeviceId();
      token = await getAccessToken();
      me = readUser(await udFetch(AUTH.userUrl, token, deviceId));
      if (!me.id) throw new Error('Underdog user profile did not include an account id.');
    } catch (err) {
      if (added) {
        const parseHint = `Restored ${added} clicked lineup${added === 1 ? '' : 's'} from the saved roster list.`;
        await report(parseHint, {
          added,
          skipped,
          skippedKnown: 0,
          skippedParse: 0,
          scanned: 0,
          listed: storedLineups.length,
          parsed: added,
          parseHint,
          done: true
        });
        return {
          added,
          skipped,
          skippedKnown: 0,
          skippedParse: 0,
          scanned: 0,
          listed: storedLineups.length,
          parsed: added,
          slateCount: 0,
          parseHint,
          username: ''
        };
      }
      throw err;
    }

    const appearances = await loadAppearanceMap(appearanceMap);
    if (Object.keys(appearances).length < 8) {
      const parseHint = added
        ? `Restored ${added} clicked lineup${added === 1 ? '' : 's'} from the saved roster list.`
        : `Player ID dictionary has ${Object.keys(appearances).length} names. Open completed Underdog teams or a live draft on that slate until IDs are learned, then Sync.`;
      await report(parseHint, { added, skipped, skippedKnown: 0, skippedParse: added ? 0 : 1, scanned: 0, listed: storedLineups.length, parsed: added, parseHint, done: true });
      return {
        added,
        skipped,
        skippedKnown: 0,
        skippedParse: added ? 0 : 1,
        scanned: 0,
        listed: storedLineups.length,
        parsed: added,
        slateCount: 0,
        parseHint,
        username: ''
      };
    }
    let skippedKnown = 0;
    let skippedParse = 0;
    let scanned = 0;
    let listed = 0;
    let parsed = 0;
    let parseHint = '';
    const probe = [];
    const pending = [];
    let extrasTried = false;
    let pageResolveTried = false;
    let scrapeTried = false;
    let skipSlate = false;
    let slateMisses = 0;

    const snapshot = () => ({ added, skipped, skippedKnown, skippedParse, scanned, listed, parsed });

    const flush = async () => {
      if (!pending.length || !mergeBatch) {
        pending.length = 0;
        return;
      }
      const batch = pending.splice(0, pending.length);
      const result = await mergeBatch(batch);
      added += Number(result?.added) || 0;
      skipped += Number(result?.skipped) || 0;
    };

    const ingest = async (summary, slate, round) => {
      if (skipSlate) return;
      listed += 1;
      const draftId = fetchDraftId(summary);
      if (!draftId) {
        skippedParse += 1;
        skipped += 1;
        if (!parseHint) parseHint = `Draft list keys: ${topKeys(summary).join(', ') || 'none'}`;
        return;
      }
      const forcedMode = rememberedMode.get(draftId) || summary?.forcedMode || '';
      if (summary && forcedMode && !summary.forcedMode) summary.forcedMode = forcedMode;
      const dailyKey = accountDraftKey('daily', draftId);
      const seasonKey = accountDraftKey('season', draftId);
      if (forcedMode && known.has(accountDraftKey(forcedMode, draftId))) {
        skippedKnown += 1;
        skipped += 1;
        return;
      }
      if (!forcedMode && known.has(dailyKey) && known.has(seasonKey)) {
        skippedKnown += 1;
        skipped += 1;
        return;
      }
      scanned += 1;
      await delay(FETCH_GAP_MS);
      try {
        const detail = await udFetch(`${AUTH.apiBaseUrl}/v2/drafts/${draftId}?product=fantasy`, token, deviceId);
        ingestCatalog(detail, appearances);
        ingestCatalog(await udFetchSoft(`${AUTH.apiBaseUrl}/v1/drafts/${draftId}?product=fantasy`, token, deviceId), appearances);
        const draft = normalizeDraftEnvelope(detail, summary);
        const raw = myRawPicks(draft, me, summary);
        const rawIds = raw.map((pick) => pick?.appearance_id || pick?.appearanceId);
        const entryKey = String(findMyEntry(draft, me, summary)?.id || entryIdFromSummary(summary) || '');
        const extraPayloads = [];
        if (!extrasTried) {
          extrasTried = true;
          const extraUrls = [
            `${AUTH.apiBaseUrl}/v1/drafts/${draftId}/appearances?product=fantasy`,
            `${AUTH.apiBaseUrl}/v1/drafts/${draftId}/players?product=fantasy`,
            `${AUTH.apiBaseUrl}/v2/drafts/${draftId}/appearances?product=fantasy`
          ];
          if (entryKey) {
            extraUrls.push(
              `${AUTH.apiBaseUrl}/v1/draft_entries/${entryKey}`,
              `${AUTH.apiBaseUrl}/v1/user/draft_entries/${entryKey}`
            );
          }
          for (let e = 0; e < extraUrls.length; e += 1) {
            const extra = await fetchMeta(extraUrls[e], token, deviceId);
            if (extra.data) {
              ingestCatalog(extra.data, appearances);
              extraPayloads.push(extra.data);
            }
            if (extra.status && extra.status !== 404) probe.push(shortProbe(extra));
          }
        }
        await resolveAppearanceIds(rawIds, appearances, token, deviceId);
        if (!pageResolveTried && resolveFromPage && rawIds.some((id) => id && !lookupPlayer(appearances, id))) {
          pageResolveTried = true;
          try {
            const page = await resolveFromPage(rawIds.filter(Boolean).slice(0, 3));
            Object.assign(appearances, page?.appearances || {});
            if (page?.probe) probe.push(page.probe);
          } catch (_err) {
            /* tab catalog optional */
          }
        }
        let lineup = lineupFromDraft(detail, summary, slate, round, me, appearances, boardPlayers);
        if (!lineup && scrapeDraft && !scrapeTried) {
          scrapeTried = true;
          await report('Reading one Underdog draft page…', snapshot());
          try {
            const scraped = await scrapeDraft({
              draftId,
              entryId: entryKey,
              boardPlayers,
              slateTitle: slate?.title || slate?.name || ''
            });
            Object.assign(appearances, scraped?.appearances || {});
            if (scraped?.probe) probe.push(scraped.probe);
            const roster = fillFromBoard(scraped?.picks || [], boardPlayers);
            const needed = raw.length >= 12 ? 12 : 4;
            if (roster.length >= needed) {
              lineup = {
                id: accountDraftKey(inferMode(roster, slate, round, summary, raw.length, summary?.forcedMode), draftId),
                savedAt: Date.now(),
                picks: roster,
                mode: inferMode(roster, slate, round, summary, raw.length, summary?.forcedMode),
                slateId: String(slate?.id || slate?.slate_id || summary?.slate_id || ''),
                slateTitle: slate?.title || slate?.name || summary?.slate?.title || '',
                resolved: roster.length,
                rawCount: raw.length
              };
            } else {
              lineup = lineupFromDraft(detail, summary, slate, round, me, appearances, boardPlayers);
            }
          } catch (err) {
            if (!parseHint) probe.push(`scrape:${err.message || 'fail'}`);
          }
        }
        if (!lineup) {
          skippedParse += 1;
          skipped += 1;
          const named = raw.filter((pick) => playerFromMap(pick, appearances)).length;
          if (!parseHint) {
            const sampleId = String(raw[0]?.appearance_id || raw[0]?.appearanceId || '');
            const appMeta = sampleId ? await fetchMeta(`${AUTH.apiBaseUrl}/v1/appearances/${sampleId}`, token, deviceId) : null;
            if (appMeta) probe.push(shortProbe(appMeta));
            parseHint = `v1.12.0 resolved ${named}/${raw.length} from Underdog IDs (${Object.keys(appearances).length} cached, id ${sampleId ? `${sampleId.slice(0, 8)}…` : 'missing'}). ${probe.slice(0, 10).join(' · ')}`;
          }
          if (named === 0) {
            slateMisses += 1;
            if (slateMisses >= 2) skipSlate = true;
            parseHint = `Resolved 0/${raw.length} picks. Dictionary has ${Object.keys(appearances).length} IDs but none matched this draft's appearance_ids. Open this completed team (or a live room on the same slate) so names can be paired, then Sync.`;
          }
          return;
        }
        if (known.has(lineup.id)) {
          skippedKnown += 1;
          skipped += 1;
          return;
        }
        known.add(lineup.id);
        rememberedMode.set(draftId, lineup.mode);
        await rememberDrafts([{
          draftId,
          mode: lineup.mode,
          slateId: lineup.slateId,
          slateTitle: lineup.slateTitle,
          picks: lineup.picks
        }]);
        parsed += 1;
        pending.push(lineup);
        if (pending.length >= BATCH) await flush();
      } catch (err) {
        skippedParse += 1;
        skipped += 1;
        if (!parseHint) parseHint = err.message || 'Draft fetch failed';
      }
    };

    await report('Reloading remembered daily drafts…', snapshot());
    const rememberedDaily = remembered.filter((row) => (
      row.mode === 'daily'
      && looksLikeUdUuid(row.draftId)
      && !(row.picks || []).length
      && !known.has(accountDraftKey('daily', row.draftId))
    ));
    for (let i = 0; i < rememberedDaily.length; i += 1) {
      const rec = rememberedDaily[i];
      await ingest(
        { id: rec.draftId, draft_id: rec.draftId, slate_id: rec.slateId, forcedMode: 'daily' },
        { id: rec.slateId, title: rec.slateTitle || 'Daily' },
        null
      );
    }

    await report('Loading completed slates…', snapshot());
    const slates = await loadSlates(token, deviceId);
    await report('Loading Underdog player list…', snapshot());
    await loadPlayerCatalog(token, deviceId, slates, appearances, probe);
    await chrome.storage.local.set({ [STORAGE_KEYS.appearanceMap]: slimAppearanceMap(appearances) });
    for (let s = 0; s < slates.length; s += 1) {
      skipSlate = false;
      slateMisses = 0;
      const slate = slates[s];
      const slateId = slate.id || slate.slate_id;
      await report(`Scanning slate ${s + 1}/${slates.length}: ${slate.title || slate.name || slateId}`, snapshot());
      if (!slateId) continue;
      const roundsPayload = await udFetchSoft(
        `${AUTH.apiBaseUrl}/v1/user/slates/${slateId}/tournament_rounds?product=fantasy`,
        token,
        deviceId
      );
      const rounds = readArray(roundsPayload, ['tournament_rounds', 'tournamentRounds', 'rounds']);
      if (!rounds.length) continue;
      for (let r = 0; r < rounds.length; r += 1) {
        const round = rounds[r];
        const roundId = round.id || round.tournament_round_id;
        if (!roundId) continue;
        const summaries = await fetchRoundDrafts(token, deviceId, roundId, known);
        for (let d = 0; d < summaries.length; d += 1) {
          if (skipSlate) break;
          await ingest(summaries[d], slate, round);
          if (scanned && scanned % 10 === 0) {
            await report(`Saved ${added} lineups · scanned ${scanned} drafts…`, snapshot());
          }
        }
        if (skipSlate) break;
      }
    }

    await report('Checking entered and live drafts…', snapshot());
    skipSlate = false;
    slateMisses = 0;
    const loose = await loadLooseDrafts(token, deviceId, known);
    for (let i = 0; i < loose.length; i += 1) {
      if (skipSlate) break;
      await ingest(loose[i], loose[i]?.slate || null, null);
    }

    await flush();
    await chrome.storage.local.set({ [STORAGE_KEYS.appearanceMap]: slimAppearanceMap(appearances) });
    if (!parseHint && parsed) {
      parseHint = `Each Underdog draft kept as its own team · ${Object.keys(appearances).length} player IDs cached`;
    }
    await report(`Done. Added ${added} lineup${added === 1 ? '' : 's'}.`, {
      ...snapshot(),
      slateCount: slates.length,
      parseHint,
      done: true
    });
    return {
      added,
      skipped,
      skippedKnown,
      skippedParse,
      scanned,
      listed,
      parsed,
      slateCount: slates.length,
      parseHint,
      username: me.username
    };
  }

  global.FDSUnderdogAccountSync = {
    syncAccount,
    getProgress,
    setProgress,
    rememberDrafts,
    accountDraftKey,
    rawUdDraftId,
    STORAGE_KEYS
  };
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
