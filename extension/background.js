importScripts('lib/portfolio.js', 'lib/underdog-account-sync.js');

const DEFAULT_API_BASE = 'http://127.0.0.1:8000';
const BOARD_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ASSISTANT_SETTINGS = {
  format: 'bestball',
  mode: 'season',
  slatePreset: 'sunday',
  slateWeek: 0,
  rankSource: 'expert',
  settingsVersion: 3,
  rankWeight: 85,
  projectionWeight: 35,
  adpWeight: 45,
  stackWeight: 55,
  week17Importance: 65,
  week16Importance: 25,
  week15Importance: 10,
  slateImportance: 70,
  capitalWeight: 45,
  contrarianWeight: 10,
  portfolioWeight: 40,
  duplicateWeight: 35,
  clockAlert: true,
  posMax: { QB: 3, RB: 6, WR: 9, TE: 3 },
  posTarget: { QB: 2, RB: 4, WR: 6, TE: 2 },
  posBias: { QB: 'default', RB: 'default', WR: 'default', TE: 'default' }
};

const UD_APPEARANCE_SCHEMA = 2;

function isAppearanceUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
}

async function loadAppearanceStore() {
  const stored = await chrome.storage.local.get(['fdsUdAppearanceMap', 'fdsUdAppearanceMeta']);
  if (Number(stored.fdsUdAppearanceMeta?.schema) >= UD_APPEARANCE_SCHEMA) {
    return {
      map: stored.fdsUdAppearanceMap || {},
      meta: stored.fdsUdAppearanceMeta
    };
  }
  await chrome.storage.local.set({
    fdsUdAppearanceMap: {},
    fdsUdAppearanceMeta: { count: 0, updatedAt: Date.now(), schema: UD_APPEARANCE_SCHEMA }
  });
  return { map: {}, meta: { count: 0, updatedAt: Date.now(), schema: UD_APPEARANCE_SCHEMA } };
}

async function rememberUnderdogDrafts(entries) {
  const sync = self.FDSUnderdogAccountSync;
  if (sync?.rememberDrafts) return sync.rememberDrafts(entries);
  return [];
}

function draftsToRemember(drafts, fallbackMode) {
  return (drafts || []).map((draft) => {
    const draftId = self.FDSUnderdogAccountSync?.rawUdDraftId
      ? self.FDSUnderdogAccountSync.rawUdDraftId(draft.id)
      : String(draft.id || '').replace(/^ud-(daily-)?/i, '');
    const mode = draft.mode || fallbackMode;
    const picks = (draft.picks || []).filter((pick) => pick?.name).map((pick) => ({
      name: pick.name,
      position: pick.position || '',
      team: pick.team || '',
      appearanceId: pick.appearanceId || pick.appearance_id || ''
    }));
    if ((mode !== 'daily' && mode !== 'season') || (!draftId && picks.length < 4)) return null;
    return {
      draftId,
      mode,
      slateId: draft.slateId || '',
      slateTitle: draft.slateTitle || '',
      picks
    };
  }).filter(Boolean);
}

let cachedBoard = null;
let cachedAt = 0;
let underdogSyncRunning = false;
let underdogScrapeTabId = null;
let underdogScrapePattern = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForTabLoad(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(true);
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab?.status === 'complete') finish();
    }).catch(() => {});
    setTimeout(finish, timeoutMs);
  });
}

function underdogDraftUrls(draftId, entryId) {
  const id = encodeURIComponent(draftId);
  const entry = entryId ? `?entry=${encodeURIComponent(entryId)}` : '';
  return [
    `https://app.underdogsports.com/draft/${id}${entry}`,
    `https://app.underdogfantasy.com/draft/${id}${entry}`,
    `https://app.underdogsports.com/drafts/${id}${entry}`,
    `https://app.underdogfantasy.com/drafts/${id}${entry}`,
    `https://app.underdogsports.com/draft/${id}`,
    `https://app.underdogfantasy.com/draft/${id}`
  ];
}

async function messageTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function scrapeRosterFromTab(tabId, boardPlayers) {
  try {
    await messageTab(tabId, { type: 'FDS_BUILD_UD_CATALOG' });
  } catch (_err) {
    /* catalog optional */
  }
  await sleep(400);
  try {
    return await messageTab(tabId, { type: 'FDS_SCRAPE_VISIBLE_ROSTER', boardPlayers });
  } catch (err) {
    return { picks: [], appearances: {}, error: err.message };
  }
}

async function withTimeout(promise, ms, fallback) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function scrapeUnderdogDraft({ draftId, entryId, boardPlayers }) {
  return withTimeout((async () => {
    const existing = await chrome.tabs.query({
      url: ['https://*.underdogfantasy.com/*', 'https://*.underdogsports.com/*']
    });
    const alreadyOpen = (existing || []).find((tab) => String(tab.url || '').includes(String(draftId)));
    if (alreadyOpen?.id) {
      const scraped = await withTimeout(scrapeRosterFromTab(alreadyOpen.id, boardPlayers), 2500, { picks: [] });
      if ((scraped?.picks || []).length >= 8) {
        return { ...scraped, probe: `open-tab:${scraped.picks.length}` };
      }
    }

    const url = underdogDraftUrls(draftId, entryId)[0];
    if (!underdogScrapeTabId) {
      const tab = await chrome.tabs.create({ url, active: false });
      underdogScrapeTabId = tab.id;
    } else {
      await chrome.tabs.update(underdogScrapeTabId, { url });
    }
    await waitForTabLoad(underdogScrapeTabId, 8000);
    await sleep(2000);
    const scraped = await withTimeout(scrapeRosterFromTab(underdogScrapeTabId, boardPlayers), 2500, { picks: [] });
    const count = (scraped?.picks || []).length;
    return { ...(scraped || {}), picks: scraped?.picks || [], probe: `opened:${count}` };
  })(), 12000, { picks: [], appearances: {}, probe: 'opened:timeout' });
}

async function closeUnderdogScrapeTab() {
  if (!underdogScrapeTabId) return;
  try {
    await chrome.tabs.remove(underdogScrapeTabId);
  } catch (_err) {
    /* already closed */
  }
  underdogScrapeTabId = null;
}

function samePosMap(a, b) {
  if (!a || !b) return false;
  return ['QB', 'RB', 'WR', 'TE'].every((pos) => Number(a[pos]) === Number(b[pos]));
}

function mergeAssistantSettings(partial) {
  const merged = { ...DEFAULT_ASSISTANT_SETTINGS, ...(partial || {}) };
  merged.posMax = { ...DEFAULT_ASSISTANT_SETTINGS.posMax, ...(partial?.posMax || {}) };
  merged.posTarget = { ...DEFAULT_ASSISTANT_SETTINGS.posTarget, ...(partial?.posTarget || {}) };
  merged.posBias = { ...DEFAULT_ASSISTANT_SETTINGS.posBias, ...(partial?.posBias || {}) };

  const storedVersion = Number(partial?.settingsVersion) || 0;
  if (storedVersion < 2) {
    merged.rankWeight = DEFAULT_ASSISTANT_SETTINGS.rankWeight;
    merged.projectionWeight = DEFAULT_ASSISTANT_SETTINGS.projectionWeight;
    merged.adpWeight = DEFAULT_ASSISTANT_SETTINGS.adpWeight;
    merged.contrarianWeight = DEFAULT_ASSISTANT_SETTINGS.contrarianWeight;
    merged.rankSource = partial?.rankSource || DEFAULT_ASSISTANT_SETTINGS.rankSource;
  }
  if (storedVersion < 3) {
    const oldMax = { QB: 3, RB: 8, WR: 10, TE: 3 };
    const oldTarget = { QB: 2, RB: 6, WR: 8, TE: 2 };
    if (!partial?.posMax || samePosMap(partial.posMax, oldMax)) {
      merged.posMax = { ...DEFAULT_ASSISTANT_SETTINGS.posMax };
    }
    if (!partial?.posTarget || samePosMap(partial.posTarget, oldTarget)) {
      merged.posTarget = { ...DEFAULT_ASSISTANT_SETTINGS.posTarget };
    }
  }
  if (storedVersion < DEFAULT_ASSISTANT_SETTINGS.settingsVersion) {
    merged.settingsVersion = DEFAULT_ASSISTANT_SETTINGS.settingsVersion;
  }

  merged.mode = merged.mode === 'daily' ? 'daily' : 'season';
  const week = Number(merged.slateWeek);
  merged.slateWeek = Number.isFinite(week) && week >= 0 ? Math.round(week) : 0;
  if (!merged.slatePreset) merged.slatePreset = DEFAULT_ASSISTANT_SETTINGS.slatePreset;
  if (merged.slateImportance == null) merged.slateImportance = DEFAULT_ASSISTANT_SETTINGS.slateImportance;

  return merged;
}

async function getAssistantSettings() {
  const stored = await chrome.storage.local.get(['assistantSettings']);
  return mergeAssistantSettings(stored.assistantSettings);
}

async function saveAssistantSettings(settings) {
  const merged = mergeAssistantSettings(settings);
  await chrome.storage.local.set({ assistantSettings: merged });
  return merged;
}

async function stashPortfolio(username, portfolio) {
  if (!username || !self.FDSPortfolio?.serializeForCloud) return;
  const stored = await chrome.storage.local.get(['assistantPortfolioCache']);
  const cache = stored.assistantPortfolioCache || {};
  cache[username] = self.FDSPortfolio.serializeForCloud(portfolio);
  await chrome.storage.local.set({ assistantPortfolioCache: cache });
}

async function cachedPortfolioFor(username) {
  if (!username) return self.FDSPortfolio.emptyStats();
  const stored = await chrome.storage.local.get(['assistantPortfolioCache']);
  return self.FDSPortfolio.fromCloud(stored.assistantPortfolioCache?.[username]);
}

async function pushPortfolioToCloud(portfolio) {
  const settings = await getSettings();
  if (!settings.username || !settings.password) return;
  await apiFetch('/api/assistant/portfolio', {
    method: 'POST',
    body: {
      username: settings.username,
      password: settings.password,
      portfolio: self.FDSPortfolio.serializeForCloud(portfolio)
    },
    settings
  });
}

async function pullPortfolioFromCloud() {
  const settings = await getSettings();
  if (!settings.username || !settings.password) return null;
  const data = await apiFetch(
    `/api/assistant/portfolio?username=${encodeURIComponent(settings.username)}&password=${encodeURIComponent(settings.password)}`,
    { settings }
  );
  return self.FDSPortfolio.fromCloud(data.portfolio);
}

async function getPortfolio() {
  try {
    const stored = await chrome.storage.local.get(['assistantPortfolio']);
    const raw = self.FDSPortfolio?.loadFromStorage(stored.assistantPortfolio) || stored.assistantPortfolio || {
      drafts: [],
      playerCounts: {},
      comboCounts: {},
      totalDrafts: 0
    };
    const compacted = self.FDSPortfolio?.compactDuplicateDrafts
      ? self.FDSPortfolio.compactDuplicateDrafts(raw)
      : { stats: raw, removed: 0 };
    if (compacted.removed) {
      return savePortfolio(compacted.stats, { syncCloud: true });
    }
    return compacted.stats;
  } catch (err) {
    console.error('FDS getPortfolio failed', err);
    return self.FDSPortfolio?.emptyStats?.() || { drafts: [], playerCounts: {}, comboCounts: {}, totalDrafts: 0 };
  }
}

async function savePortfolio(portfolio, { syncCloud = true } = {}) {
  const settings = await getSettings();
  const compacted = self.FDSPortfolio?.compactDuplicateDrafts
    ? self.FDSPortfolio.compactDuplicateDrafts(portfolio)
    : { stats: portfolio, removed: 0 };
  const next = compacted.stats;
  await chrome.storage.local.set({
    assistantPortfolio: next,
    assistantPortfolioOwner: settings.username || ''
  });
  if (settings.username) {
    await stashPortfolio(settings.username, next);
  }
  if (syncCloud && settings.username && settings.password) {
    clearTimeout(savePortfolio.timer);
    savePortfolio.timer = setTimeout(() => {
      pushPortfolioToCloud(next).catch(() => {});
    }, 500);
  }
  return next;
}

async function syncPortfolioWithAccount() {
  const settings = await getSettings();
  const stored = await chrome.storage.local.get(['assistantPortfolio', 'assistantPortfolioOwner']);
  const prevOwner = stored.assistantPortfolioOwner || '';
  const current = self.FDSPortfolio.loadFromStorage(stored.assistantPortfolio);
  if (prevOwner && settings.username && prevOwner !== settings.username) {
    await stashPortfolio(prevOwner, current);
  }

  let seed = current;
  if (prevOwner && settings.username && prevOwner !== settings.username) {
    seed = await cachedPortfolioFor(settings.username);
  }

  let remote = self.FDSPortfolio.emptyStats();
  try {
    remote = (await pullPortfolioFromCloud()) || remote;
  } catch (_err) {
    // Keep local teams if the account server is unreachable.
  }

  const merged = self.FDSPortfolio.mergeDrafts(remote, seed.drafts || [], { source: settings.username ? 'account' : 'local' });
  const withImported = self.FDSPortfolio.mergeImportedByMode
    ? self.FDSPortfolio.mergeImportedByMode(merged.stats, seed)
    : merged.stats;
  return savePortfolio(withImported, { syncCloud: Boolean(settings.username && settings.password) });
}

async function getSettings() {
  const stored = await chrome.storage.local.get(['apiBase', 'username', 'password']);
  return {
    apiBase: String(stored.apiBase || DEFAULT_API_BASE).replace(/\/$/, ''),
    username: stored.username || '',
    password: stored.password || ''
  };
}

async function ensureOriginPermission(apiBase) {
  let origin;
  try {
    origin = new URL(apiBase).origin;
  } catch (err) {
    throw new Error('Enter a valid API URL, like http://127.0.0.1:8000');
  }
  const pattern = `${origin}/*`;
  const already = await chrome.permissions.contains({ origins: [pattern] });
  if (already) return true;
  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch (err) {
    throw new Error('Allow access to your Ghost FF URL from the extension popup.');
  }
}

async function apiFetch(path, { method = 'GET', body, settings } = {}) {
  const config = settings || (await getSettings());
  const allowed = await ensureOriginPermission(config.apiBase);
  if (!allowed) {
    throw new Error('Permission to contact your Ghost FF server was denied.');
  }
  const url = `${config.apiBase}${path}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

async function getCsvBoard() {
  const stored = await chrome.storage.local.get(['assistantCsvBoard']);
  return stored.assistantCsvBoard || null;
}

async function saveCsvBoard(board) {
  if (!board) {
    await chrome.storage.local.remove(['assistantCsvBoard']);
    return null;
  }
  await chrome.storage.local.set({ assistantCsvBoard: board });
  return board;
}

function normalizeCsvName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function applyCsvRanks(board, csvBoard) {
  if (!board?.players?.length || !csvBoard?.players?.length) {
    return board;
  }
  const overrides = new Map();
  const byName = new Map();
  csvBoard.players.forEach((row) => {
    const key = `${row.name}|${row.position}|${row.team}`.toLowerCase();
    overrides.set(key, row.myRank);
    const nameKey = `${normalizeCsvName(row.name)}|${row.position}`;
    if (!byName.has(nameKey)) byName.set(nameKey, row.myRank);
  });
  const players = board.players.map((player) => {
    const directKey = `${player.name}|${player.position}|${player.team}`.toLowerCase();
    let rank = overrides.get(directKey);
    if (rank == null) {
      rank = byName.get(`${normalizeCsvName(player.name)}|${player.position}`);
    }
    if (rank == null) return player;
    return { ...player, myRank: rank, hasCustomRank: true };
  });
  players.sort((a, b) => (a.myRank || 9999) - (b.myRank || 9999));
  return { ...board, players, rankSource: 'csv', csvRankCount: csvBoard.players.length };
}

async function fetchBoard({ force = false } = {}) {
  if (!force && cachedBoard && Date.now() - cachedAt < BOARD_TTL_MS) {
    return cachedBoard;
  }
  const settings = await getSettings();
  const assistantSettings = await getAssistantSettings();
  let rankSource = assistantSettings.rankSource || 'expert';
  const hasAuth = Boolean(settings.username && settings.password);
  let data = hasAuth
    ? await apiFetch('/api/assistant/board', {
      method: 'POST',
      body: { username: settings.username, password: settings.password, rankSource: rankSource === 'csv' ? 'expert' : rankSource },
      settings
    })
    : await apiFetch(`/api/assistant/board?rankSource=${encodeURIComponent(rankSource === 'csv' ? 'expert' : rankSource)}`, { settings });

  if (rankSource === 'csv') {
    const csvBoard = await getCsvBoard();
    if (csvBoard?.players?.length) {
      data = applyCsvRanks(data, csvBoard);
    }
  }

  cachedBoard = data;
  cachedAt = Date.now();
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (type === 'GET_SETTINGS') {
    getSettings().then((settings) => sendResponse({ ok: true, settings: { ...settings, password: settings.password ? '••••' : '' } }));
    return true;
  }
  if (type === 'SAVE_SETTINGS') {
    const payload = message.payload || {};
    getSettings().then((existing) => chrome.storage.local.set({
      apiBase: payload.apiBase || existing.apiBase || DEFAULT_API_BASE,
      username: payload.username ?? existing.username,
      password: payload.password === undefined || payload.password === ''
        ? (payload.clearAuth ? '' : existing.password)
        : payload.password
    })).then(async () => {
      cachedBoard = null;
      try {
        const board = await fetchBoard({ force: true });
        sendResponse({ ok: true, board });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }
  if (type === 'LOGIN') {
    const payload = message.payload || {};
    getSettings().then((existing) => chrome.storage.local.set({
      apiBase: payload.apiBase || existing.apiBase || DEFAULT_API_BASE,
      username: payload.username || existing.username,
      password: payload.password || existing.password
    })).then(async () => {
      cachedBoard = null;
      try {
        const settings = await getSettings();
        const login = await apiFetch('/api/assistant/login', {
          method: 'POST',
          body: { username: settings.username, password: settings.password },
          settings
        });
        const board = await fetchBoard({ force: true });
        const portfolio = await syncPortfolioWithAccount();
        sendResponse({ ok: true, login, board, portfolio });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }
  if (type === 'LOGOUT') {
    cachedBoard = null;
    chrome.storage.local.remove(['username', 'password']).then(() => {
      fetchBoard({ force: true })
        .then((board) => sendResponse({ ok: true, board }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    });
    return true;
  }
  if (type === 'GET_BOARD') {
    Promise.all([
      fetchBoard({ force: Boolean(message.payload?.force) }),
      getAssistantSettings(),
      getPortfolio().catch(() => null)
    ])
      .then(([board, settings, portfolio]) => sendResponse({ ok: true, board, settings, portfolio }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (type === 'GET_ASSISTANT_SETTINGS') {
    getAssistantSettings().then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }
  if (type === 'SAVE_ASSISTANT_SETTINGS') {
    saveAssistantSettings(message.payload || {})
      .then(async (settings) => {
        cachedBoard = null;
        try {
          await fetchBoard({ force: true });
        } catch (_err) {
          // Board refresh is best-effort after settings change.
        }
        sendResponse({ ok: true, settings });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (type === 'GET_PORTFOLIO') {
    getPortfolio().then(async (local) => {
      await rememberUnderdogDrafts(draftsToRemember(local?.drafts || []));
      const settings = await getSettings();
      if (!settings.username || !settings.password) {
        sendResponse({ ok: true, portfolio: local, cloud: false });
        return;
      }
      try {
        const portfolio = await syncPortfolioWithAccount();
        await rememberUnderdogDrafts(draftsToRemember(portfolio?.drafts || []));
        sendResponse({ ok: true, portfolio, cloud: true });
      } catch (_err) {
        sendResponse({ ok: true, portfolio: local, cloud: false });
      }
    });
    return true;
  }
  if (type === 'RECORD_PORTFOLIO_DRAFT') {
    getPortfolio().then(async (portfolio) => {
      const picks = message.payload?.picks || [];
      const next = self.FDSPortfolio.recordDraft(portfolio, picks, {
        draftId: message.payload?.draftId || `draft-${Date.now()}`,
        source: 'live',
        mode: message.payload?.mode
      });
      await savePortfolio(next);
      await rememberUnderdogDrafts(draftsToRemember([{
        id: message.payload?.draftId,
        mode: message.payload?.mode,
        picks
      }], message.payload?.mode));
      sendResponse({ ok: true, portfolio: next });
    });
    return true;
  }
  if (type === 'MERGE_PORTFOLIO_DRAFTS') {
    getPortfolio().then(async (portfolio) => {
      const incoming = message.payload?.drafts || [];
      if (!incoming.length) {
        sendResponse({ ok: false, error: 'No lineups to merge' });
        return;
      }
      const merged = self.FDSPortfolio.mergeDrafts(portfolio, incoming, {
        source: message.payload?.source || 'sync',
        mode: message.payload?.mode
      });
      await savePortfolio(merged.stats);
      await rememberUnderdogDrafts(draftsToRemember(incoming, message.payload?.mode));
      sendResponse({
        ok: true,
        portfolio: merged.stats,
        added: merged.added,
        skipped: merged.skipped
      });
    });
    return true;
  }
  if (type === 'CLEAR_PORTFOLIO') {
    const mode = message.payload?.mode;
    if ((mode === 'daily' || mode === 'season') && self.FDSPortfolio.clearMode) {
      getPortfolio().then(async (portfolio) => {
        const next = self.FDSPortfolio.clearMode(portfolio, mode);
        await savePortfolio(next);
        sendResponse({ ok: true, portfolio: next });
      });
      return true;
    }
    savePortfolio(self.FDSPortfolio.emptyStats())
      .then((portfolio) => sendResponse({ ok: true, portfolio }));
    return true;
  }
  if (type === 'IMPORT_RANK_CSV') {
    saveCsvBoard(message.payload || null)
      .then(async (csvBoard) => {
        cachedBoard = null;
        await saveAssistantSettings({ ...(await getAssistantSettings()), rankSource: 'csv' });
        try {
          const board = await fetchBoard({ force: true });
          sendResponse({ ok: true, csvBoard, board });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      });
    return true;
  }
  if (type === 'CLEAR_RANK_CSV') {
    saveCsvBoard(null)
      .then(async () => {
        cachedBoard = null;
        const settings = await getAssistantSettings();
        if (settings.rankSource === 'csv') {
          await saveAssistantSettings({ ...settings, rankSource: 'expert' });
        }
        const board = await fetchBoard({ force: true });
        sendResponse({ ok: true, board });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (type === 'IMPORT_EXPOSURE_CSV') {
    const incoming = message.payload?.portfolio;
    if (!incoming) {
      sendResponse({ ok: false, error: 'Missing exposure data' });
      return true;
    }
    Promise.all([getPortfolio(), getAssistantSettings()]).then(async ([existing, settings]) => {
      const mode = message.payload?.mode === 'daily' || message.payload?.mode === 'season'
        ? message.payload.mode
        : settings.mode;
      const next = self.FDSPortfolio.applyImportedExposure
        ? self.FDSPortfolio.applyImportedExposure(existing, incoming, {
          mode,
          source: incoming.source || message.payload?.source || 'csv'
        })
        : incoming;
      const saved = await savePortfolio(next);
      sendResponse({ ok: true, portfolio: saved });
    });
    return true;
  }
  if (type === 'STORE_UD_APPEARANCES') {
    const incoming = message.payload && typeof message.payload === 'object' ? message.payload : {};
    loadAppearanceStore().then((stored) => {
      const next = { ...stored.map };
      Object.keys(incoming).forEach((id) => {
        const player = incoming[id];
        if (!isAppearanceUuid(id) || !player?.name) return;
        next[id] = {
          name: player.name,
          position: player.position || '',
          team: player.team || ''
        };
      });
      return chrome.storage.local.set({
        fdsUdAppearanceMap: next,
        fdsUdAppearanceMeta: {
          count: Object.keys(next).length,
          updatedAt: Date.now(),
          schema: UD_APPEARANCE_SCHEMA
        }
      }).then(() => ({ count: Object.keys(next).length }));
    }).then((result) => sendResponse({ ok: true, count: result?.count || 0 }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (type === 'GET_UD_PLAYER_DICT') {
    loadAppearanceStore().then((stored) => {
      sendResponse({
        ok: true,
        count: Object.keys(stored.map).length,
        updatedAt: stored.meta?.updatedAt || 0
      });
    });
    return true;
  }
  if (type === 'REMEMBER_UD_DRAFT') {
    const row = message.payload || {};
    rememberUnderdogDrafts(draftsToRemember([{
      id: row.draftId || row.id,
      mode: row.mode,
      slateId: row.slateId,
      slateTitle: row.slateTitle,
      picks: row.picks
    }], row.mode)).then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (type === 'GET_UNDERDOG_SYNC_STATUS') {
    const sync = self.FDSUnderdogAccountSync;
    if (!sync?.getProgress) {
      sendResponse({ ok: true, running: underdogSyncRunning, status: '' });
      return true;
    }
    Promise.all([
      sync.getProgress(),
      getPortfolio().catch(() => null),
      loadAppearanceStore()
    ]).then(([progress, portfolio, stored]) => {
      sendResponse({
        ok: true,
        running: underdogSyncRunning,
        status: progress?.status || '',
        added: progress?.added || 0,
        skipped: progress?.skipped || 0,
        done: Boolean(progress?.done),
        dictCount: Object.keys(stored.map || {}).length,
        portfolio
      });
    });
    return true;
  }
  if (type === 'SYNC_UNDERDOG_PORTFOLIO') {
    if (underdogSyncRunning) {
      sendResponse({ ok: false, error: 'An Underdog sync is already running.' });
      return true;
    }
    const sync = self.FDSUnderdogAccountSync;
    if (!sync?.syncAccount) {
      sendResponse({ ok: false, error: 'Account sync is not available. Reload the extension.' });
      return true;
    }
    underdogSyncRunning = true;
    (async () => {
      try {
        const [storedPortfolio, stored, board, csvBoard] = await Promise.all([
          getPortfolio(),
          loadAppearanceStore(),
          fetchBoard().catch(() => null),
          getCsvBoard().catch(() => null)
        ]);
        const staleUd = (storedPortfolio.drafts || []).filter((draft) => (
          /^ud-/i.test(String(draft.id || ''))
          && !(draft.picks || []).every((pick) => pick?.appearanceId && pick?.name)
        ));
        const portfolio = staleUd.length
          ? await savePortfolio(self.FDSPortfolio.rebuildCounts({
            ...storedPortfolio,
            drafts: (storedPortfolio.drafts || []).filter((draft) => !staleUd.includes(draft))
          }, { source: storedPortfolio.source, importedExposure: false }))
          : storedPortfolio;
        const fromTabs = {};
        try {
          const tabs = await chrome.tabs.query({
            url: ['https://*.underdogfantasy.com/*', 'https://*.underdogsports.com/*']
          });
          await withTimeout(Promise.all((tabs || []).slice(0, 2).map(async (tab) => {
            try {
              const resp = await chrome.tabs.sendMessage(tab.id, { type: 'FDS_GET_UD_APPEARANCES' });
              Object.assign(fromTabs, resp?.appearances || {});
            } catch (_err) {
              /* tab may not have the overlay */
            }
          })), 2000, null);
        } catch (_err) {
          /* no Underdog tabs */
        }
        const knownIds = new Set((portfolio.drafts || []).map((draft) => String(draft.id)));
        await rememberUnderdogDrafts(draftsToRemember(portfolio.drafts || []));
        const result = await sync.syncAccount({
          knownIds,
          rememberedDrafts: draftsToRemember(portfolio.drafts || []),
          appearanceMap: { ...(stored.map || {}), ...fromTabs },
          boardPlayers: board?.players?.length ? board.players : (csvBoard?.players || []),
          scrapeDraft: null,
          resolveFromPage: async (ids) => {
            const tabs = await chrome.tabs.query({
              url: ['https://*.underdogfantasy.com/*', 'https://*.underdogsports.com/*']
            });
            for (let t = 0; t < (tabs || []).length; t += 1) {
              try {
                const resp = await chrome.tabs.sendMessage(tabs[t].id, {
                  type: 'FDS_RESOLVE_UD_IDS',
                  ids: (ids || []).slice(0, 18)
                });
                if (resp?.appearances || resp?.probe) return resp;
              } catch (_err) {
                /* tab may not have the overlay */
              }
            }
            return { appearances: {}, probe: 'page:none' };
          },
          mergeBatch: async (drafts) => {
            const current = await getPortfolio();
            const merged = self.FDSPortfolio.mergeDrafts(current, drafts, { source: 'underdog' });
            await savePortfolio(merged.stats);
            return merged;
          }
        });
        const next = await getPortfolio();
        sendResponse({
          ok: true,
          portfolio: next,
          added: result.added,
          skipped: result.skipped,
          skippedKnown: result.skippedKnown,
          skippedParse: result.skippedParse,
          scanned: result.scanned,
          listed: result.listed,
          parsed: result.parsed,
          slateCount: result.slateCount,
          parseHint: result.parseHint || ''
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || 'Underdog sync failed.' });
      } finally {
        underdogSyncRunning = false;
        await closeUnderdogScrapeTab();
        underdogScrapePattern = null;
      }
    })();
    return true;
  }
  sendResponse({ ok: false, error: 'Unknown message' });
  return false;
});
