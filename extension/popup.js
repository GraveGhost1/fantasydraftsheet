const apiBaseInput = document.getElementById('api-base');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rankSourceInput = document.getElementById('rank-source');
const rankCsvInput = document.getElementById('rank-csv');
const exposureCsvInput = document.getElementById('exposure-csv');
const statusEl = document.getElementById('status');

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = `status-banner ${kind || ''}`;
}

function send(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: 'No response' });
    });
  });
}

function boardSummary(board) {
  if (!board?.ok) return 'Board loaded.';
  if (board.rankSource === 'csv') {
    return `${board.playerCount} players · ${board.csvRankCount || 0} CSV ranks`;
  }
  if (board.rankSource === 'custom') {
    return `${board.playerCount} players · ${board.savedRankCount || 0} saved ranks`;
  }
  return `${board.playerCount} players · expert best ball ranks`;
}

async function requestApiAccess(apiBase) {
  const url = apiBase || 'http://127.0.0.1:8000';
  const origin = `${new URL(url).origin}/*`;
  const already = await chrome.permissions.contains({ origins: [origin] });
  if (already) return true;
  return chrome.permissions.request({ origins: [origin] });
}

async function hydrate() {
  const [settingsResponse, assistantResponse] = await Promise.all([
    send('GET_SETTINGS'),
    send('GET_ASSISTANT_SETTINGS')
  ]);
  if (settingsResponse?.settings) {
    apiBaseInput.value = settingsResponse.settings.apiBase || 'http://127.0.0.1:8000';
    usernameInput.value = settingsResponse.settings.username || '';
  }
  if (assistantResponse?.settings?.rankSource) {
    rankSourceInput.value = assistantResponse.settings.rankSource;
  }
}

async function saveRankSource() {
  const rankSource = rankSourceInput.value || 'expert';
  await send('SAVE_ASSISTANT_SETTINGS', { rankSource });
  return rankSource;
}

rankSourceInput.addEventListener('change', async () => {
  setStatus('Updating ranking source…');
  await saveRankSource();
  const boardResponse = await send('GET_BOARD', { force: true });
  if (!boardResponse.ok) {
    setStatus(boardResponse.error || 'Could not reload board', 'err');
    return;
  }
  setStatus(`Using ${boardSummary(boardResponse.board)}`, 'ok');
});

rankCsvInput.addEventListener('change', async () => {
  const file = rankCsvInput.files?.[0];
  if (!file) return;
  setStatus('Importing rank CSV…');
  const text = await file.text();
  const parsed = window.FDSCsvImport.parseRankCsv(text);
  if (parsed.error) {
    setStatus(parsed.error, 'err');
    rankCsvInput.value = '';
    return;
  }
  const response = await send('IMPORT_RANK_CSV', {
    players: parsed.players,
    importedAt: Date.now(),
    fileName: file.name
  });
  rankCsvInput.value = '';
  if (!response.ok) {
    setStatus(response.error || 'Import failed', 'err');
    return;
  }
  rankSourceInput.value = 'csv';
  setStatus(`Imported ${parsed.players.length} ranks from ${file.name}`, 'ok');
});

exposureCsvInput.addEventListener('change', async () => {
  const file = exposureCsvInput.files?.[0];
  if (!file) return;
  setStatus('Importing portfolio CSV…');
  const text = await file.text();
  const parsed = window.FDSCsvImport.parsePortfolioCsv(text);
  if (parsed.error) {
    setStatus(parsed.error, 'err');
    exposureCsvInput.value = '';
    return;
  }
  if (parsed.kind === 'lineups') {
    const response = await send('MERGE_PORTFOLIO_DRAFTS', { drafts: parsed.drafts, source: 'csv' });
    exposureCsvInput.value = '';
    if (!response.ok) {
      setStatus(response.error || 'Lineup import failed', 'err');
      return;
    }
    setStatus(
      `Imported ${response.added || 0} new lineups${response.skipped ? `, skipped ${response.skipped} duplicate${response.skipped === 1 ? '' : 's'}` : ''} from ${file.name}`,
      'ok'
    );
    await refreshPortfolioStatus();
    return;
  }
  const teamGuess = Math.max(...parsed.entries.map((e) => e.exposurePct), 1) > 0 ? 100 : 100;
  const portfolio = window.FDSCsvImport.exposureToPortfolio(parsed.entries, { totalDrafts: teamGuess, source: 'csv' });
  const response = await send('IMPORT_EXPOSURE_CSV', { portfolio });
  exposureCsvInput.value = '';
  if (!response.ok) {
    setStatus(response.error || 'Exposure import failed', 'err');
    return;
  }
  setStatus(`Imported exposure for ${parsed.entries.length} players (no combos without lineups)`, 'ok');
  await refreshPortfolioStatus();
});

document.getElementById('clear-csv').addEventListener('click', async () => {
  setStatus('Clearing imported ranks…');
  const response = await send('CLEAR_RANK_CSV');
  if (!response.ok) {
    setStatus(response.error || 'Could not clear CSV ranks', 'err');
    return;
  }
  rankSourceInput.value = 'expert';
  setStatus(`Back to ${boardSummary(response.board)}`, 'ok');
});

document.getElementById('login').addEventListener('click', async () => {
  setStatus('Signing in…');
  try {
    const allowed = await requestApiAccess(apiBaseInput.value.trim());
    if (!allowed) {
      setStatus('Permission to contact your Draft Sheet URL was denied.', 'err');
      return;
    }
  } catch (err) {
    setStatus(err.message || 'Invalid Draft Sheet URL', 'err');
    return;
  }
  await saveRankSource();
  const response = await send('LOGIN', {
    apiBase: apiBaseInput.value.trim(),
    username: usernameInput.value.trim(),
    password: passwordInput.value
  });
  if (!response.ok) {
    setStatus(response.error || 'Login failed', 'err');
    return;
  }
  setStatus(`Logged in. ${boardSummary(response.board)}${response.portfolio?.drafts?.length ? ` · ${response.portfolio.drafts.length} saved lineups` : ''}`, 'ok');
  await refreshPortfolioStatus();
});

document.getElementById('public').addEventListener('click', async () => {
  setStatus('Loading public ranks…');
  try {
    const allowed = await requestApiAccess(apiBaseInput.value.trim());
    if (!allowed) {
      setStatus('Permission to contact your Draft Sheet URL was denied.', 'err');
      return;
    }
  } catch (err) {
    setStatus(err.message || 'Invalid Draft Sheet URL', 'err');
    return;
  }
  await saveRankSource();
  await send('LOGOUT');
  const response = await send('SAVE_SETTINGS', {
    apiBase: apiBaseInput.value.trim(),
    username: '',
    password: '',
    clearAuth: true
  });
  if (!response.ok) {
    setStatus(response.error || 'Could not load board', 'err');
    return;
  }
  usernameInput.value = '';
  passwordInput.value = '';
  setStatus(`Public board ready. ${boardSummary(response.board)}`, 'ok');
});

document.getElementById('logout').addEventListener('click', async () => {
  const response = await send('LOGOUT');
  usernameInput.value = '';
  passwordInput.value = '';
  if (!response.ok) {
    setStatus(response.error || 'Logged out locally', 'err');
    return;
  }
  setStatus('Logged out. Using public best-ball ranks.', 'ok');
});

async function refreshPortfolioStatus() {
  const el = document.getElementById('portfolio-status');
  if (!el) return;
  const response = await send('GET_PORTFOLIO');
  const summary = window.FDSPortfolio?.summarize(response?.portfolio);
  if (!summary?.playerCount && !summary?.lineupCount) {
    el.textContent = response?.cloud
      ? 'Logged in. No lineups saved to this account yet.'
      : 'No portfolio loaded. Log in to sync lineups across devices.';
    return;
  }
  el.textContent = `${summary.lineupCount} lineups${response?.cloud ? ' · saved to your account' : ' · this browser'}`;
}

async function openLocalPage(path) {
  const base = (apiBaseInput.value.trim() || 'http://127.0.0.1:8000').replace(/\/$/, '');
  try {
    const allowed = await requestApiAccess(base);
    if (!allowed) {
      setStatus('Allow site access to open the test page.', 'err');
      return;
    }
  } catch (err) {
    setStatus(err.message || 'Invalid Draft Sheet URL', 'err');
    return;
  }
  chrome.tabs.create({ url: `${base}${path}` });
}

document.getElementById('open-test').addEventListener('click', () => {
  openLocalPage('/extension/test-draft-room.html');
});

document.getElementById('open-explorer').addEventListener('click', () => {
  openLocalPage('/extension/test-explorer.html');
});

hydrate().then(async () => {
  const boardResponse = await send('GET_BOARD');
  if (boardResponse?.ok && boardResponse.board?.playerCount) {
    setStatus(`Ready · ${boardSummary(boardResponse.board)}`, 'ok');
  }
  await refreshPortfolioStatus();
});
