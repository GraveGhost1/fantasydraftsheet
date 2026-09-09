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

function send(type, payload, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    const timer = Number(timeoutMs) > 0
      ? setTimeout(() => finish({ ok: false, error: 'Sync timed out. Reload the extension and try again.' }), timeoutMs)
      : null;
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (timer) clearTimeout(timer);
      if (chrome.runtime.lastError) {
        finish({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      finish(response || { ok: false, error: 'No response' });
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

function dictLabel(count) {
  const n = Number(count) || 0;
  if (n >= 40) return `Player IDs learned: ${n}. Ready to Sync teams on slates you have opened.`;
  if (n > 0) return `Player IDs learned: ${n}. Open more completed teams or a live room on that slate.`;
  return 'Player IDs learned: 0. Open a completed Underdog team or a live draft room to start the ID sheet.';
}

async function refreshDictStatus() {
  const el = document.getElementById('ud-dict-status');
  if (!el) return;
  const response = await send('GET_UD_PLAYER_DICT');
  el.textContent = dictLabel(response?.count);
}

async function refreshPortfolioStatus() {
  const el = document.getElementById('portfolio-status');
  if (!el) return;
  await refreshDictStatus();
  const response = await send('GET_PORTFOLIO');
  const summary = window.FDSPortfolio?.summarize(response?.portfolio);
  if (!summary?.playerCount && !summary?.lineupCount) {
    el.textContent = response?.cloud
      ? 'Logged in. No lineups saved to this account yet.'
      : 'No portfolio loaded. Log in to sync lineups across devices.';
    return;
  }
  const season = Number(summary.seasonLineups) || 0;
  const daily = Number(summary.dailyLineups) || 0;
  const parts = [];
  if (season) parts.push(`${season} season`);
  if (daily) parts.push(`${daily} daily`);
  const lineupText = parts.length
    ? `${parts.join(' · ')} lineup${summary.lineupCount === 1 ? '' : 's'}`
    : `${summary.lineupCount} lineups`;
  el.textContent = `${lineupText}${response?.cloud ? ' · saved to your account' : ' · this browser'}`;
}

document.getElementById('sync-underdog')?.addEventListener('click', async () => {
  const button = document.getElementById('sync-underdog');
  if (button) button.disabled = true;
  setStatus('Connecting to Underdog…', '');
  const poll = setInterval(async () => {
    const status = await send('GET_UNDERDOG_SYNC_STATUS');
    if (status?.status) setStatus(status.status, '');
    if (status?.dictCount != null) {
      const dictEl = document.getElementById('ud-dict-status');
      if (dictEl) dictEl.textContent = dictLabel(status.dictCount);
    }
  }, 800);
  try {
    const response = await send('SYNC_UNDERDOG_PORTFOLIO', null, 90000);
    if (response?.ok) {
      const added = Number(response.added) || 0;
      const skippedKnown = Number(response.skippedKnown) || 0;
      const skippedParse = Number(response.skippedParse) || 0;
      const skipped = Number(response.skipped) || 0;
      const listed = Number(response.listed) || 0;
      if (response.parseHint && /dictionary|learned IDs|appearance_ids/i.test(response.parseHint)) {
        setStatus(response.parseHint, 'err');
      } else if (added) {
        setStatus(`Imported ${added} Underdog lineup${added === 1 ? '' : 's'}${skippedKnown ? ` · ${skippedKnown} already saved` : ''}.`, 'ok');
      } else if (skippedParse || (listed && !skippedKnown)) {
        const found = listed || skippedParse || skipped;
        const hint = response.parseHint ? ` (${response.parseHint})` : '';
        setStatus(`Found ${found} Underdog draft${found === 1 ? '' : 's'} but could not read your players.${hint}`, 'err');
      } else if (skippedKnown || skipped) {
        setStatus('Underdog lineups already up to date.', 'ok');
      } else {
        setStatus('No completed Underdog lineups found.', 'ok');
      }
    } else {
      setStatus(response?.error || 'Underdog sync failed.', 'err');
    }
    await refreshPortfolioStatus();
  } catch (err) {
    setStatus(err.message || 'Underdog sync failed.', 'err');
  }
  clearInterval(poll);
  if (button) button.disabled = false;
});

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

document.getElementById('open-dk-test').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('test-dk-draft-room.html') });
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
