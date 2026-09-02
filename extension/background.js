const DEFAULT_API_BASE = 'http://127.0.0.1:8000';
const BOARD_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ASSISTANT_SETTINGS = {
  format: 'bestball',
  rankSource: 'expert',
  settingsVersion: 2,
  rankWeight: 85,
  projectionWeight: 35,
  adpWeight: 45,
  stackWeight: 55,
  week17Importance: 65,
  week16Importance: 25,
  week15Importance: 10,
  capitalWeight: 45,
  contrarianWeight: 10,
  portfolioWeight: 40,
  duplicateWeight: 35,
  clockAlert: true,
  posMax: { QB: 3, RB: 8, WR: 10, TE: 3 },
  posTarget: { QB: 2, RB: 6, WR: 8, TE: 2 },
  posBias: { QB: 'default', RB: 'default', WR: 'default', TE: 'default' }
};

let cachedBoard = null;
let cachedAt = 0;

function mergeAssistantSettings(partial) {
  const merged = { ...DEFAULT_ASSISTANT_SETTINGS, ...(partial || {}) };
  merged.posMax = { ...DEFAULT_ASSISTANT_SETTINGS.posMax, ...(partial?.posMax || {}) };
  merged.posTarget = { ...DEFAULT_ASSISTANT_SETTINGS.posTarget, ...(partial?.posTarget || {}) };
  merged.posBias = { ...DEFAULT_ASSISTANT_SETTINGS.posBias, ...(partial?.posBias || {}) };

  const storedVersion = Number(partial?.settingsVersion) || 0;
  if (storedVersion < DEFAULT_ASSISTANT_SETTINGS.settingsVersion) {
    merged.rankWeight = DEFAULT_ASSISTANT_SETTINGS.rankWeight;
    merged.projectionWeight = DEFAULT_ASSISTANT_SETTINGS.projectionWeight;
    merged.adpWeight = DEFAULT_ASSISTANT_SETTINGS.adpWeight;
    merged.contrarianWeight = DEFAULT_ASSISTANT_SETTINGS.contrarianWeight;
    merged.rankSource = partial?.rankSource || DEFAULT_ASSISTANT_SETTINGS.rankSource;
    merged.settingsVersion = DEFAULT_ASSISTANT_SETTINGS.settingsVersion;
  }

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

async function getPortfolio() {
  const stored = await chrome.storage.local.get(['assistantPortfolio']);
  return stored.assistantPortfolio || { drafts: [], playerCounts: {}, comboCounts: {}, totalDrafts: 0 };
}

async function savePortfolio(portfolio) {
  await chrome.storage.local.set({ assistantPortfolio: portfolio });
  return portfolio;
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
    throw new Error('Allow access to your Draft Sheet URL from the extension popup.');
  }
}

async function apiFetch(path, { method = 'GET', body, settings } = {}) {
  const config = settings || (await getSettings());
  const allowed = await ensureOriginPermission(config.apiBase);
  if (!allowed) {
    throw new Error('Permission to contact your Draft Sheet server was denied.');
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
        sendResponse({ ok: true, login, board });
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
    Promise.all([fetchBoard({ force: Boolean(message.payload?.force) }), getAssistantSettings(), getPortfolio()])
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
    getPortfolio().then((portfolio) => sendResponse({ ok: true, portfolio }));
    return true;
  }
  if (type === 'RECORD_PORTFOLIO_DRAFT') {
    getPortfolio().then(async (portfolio) => {
      const picks = message.payload?.picks || [];
      const draftId = message.payload?.draftId || `draft-${Date.now()}`;
      const exists = (portfolio.drafts || []).some((d) => d.id === draftId);
      if (exists) {
        sendResponse({ ok: true, portfolio });
        return;
      }
      const next = {
        drafts: [{ id: draftId, savedAt: Date.now(), picks }, ...(portfolio.drafts || [])].slice(0, 120),
        playerCounts: {},
        comboCounts: {},
        totalDrafts: 0
      };
      const keyFor = (p) => `${p.name}|${p.position}|${p.team}`.toLowerCase();
      const comboFor = (a, b) => [keyFor(a), keyFor(b)].sort().join('::');
      next.drafts.forEach((draft) => {
        (draft.picks || []).forEach((player) => {
          const key = keyFor(player);
          next.playerCounts[key] = (next.playerCounts[key] || 0) + 1;
        });
        const draftPicks = draft.picks || [];
        for (let i = 0; i < draftPicks.length; i += 1) {
          for (let j = i + 1; j < draftPicks.length; j += 1) {
            const ckey = comboFor(draftPicks[i], draftPicks[j]);
            next.comboCounts[ckey] = (next.comboCounts[ckey] || 0) + 1;
          }
        }
      });
      next.totalDrafts = next.drafts.length;
      await savePortfolio(next);
      sendResponse({ ok: true, portfolio: next });
    });
    return true;
  }
  if (type === 'CLEAR_PORTFOLIO') {
    savePortfolio({ drafts: [], playerCounts: {}, comboCounts: {}, totalDrafts: 0 })
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
    const portfolio = message.payload?.portfolio;
    if (!portfolio) {
      sendResponse({ ok: false, error: 'Missing exposure data' });
      return true;
    }
    savePortfolio(portfolio)
      .then((saved) => sendResponse({ ok: true, portfolio: saved }));
    return true;
  }
  sendResponse({ ok: false, error: 'Unknown message' });
  return false;
});
