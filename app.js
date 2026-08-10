const STORAGE_KEY = 'fantasy-draft-sheet-state';
const MAX_TIER_SIZE = 25;
const OPENING_TIER_SIZES = [3, 8, 10, 12, 15];
const SLEEPER_SYNC_INTERVAL_MS = 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 12000;
const SLEEPER_PICKS_FETCH_TIMEOUT_MS = 5000;
const SLEEPER_PLAYERS_FETCH_TIMEOUT_MS = 7000;
const POSITION_ORDER = { QB: 1, RB: 2, WR: 3, TE: 4, FLEX: 5, K: 6, DEF: 7, DST: 7, D: 7 };
let sleeperSyncTimer = null;
let sleeperPlayersByIdCache = null;
let sleeperSyncInFlight = false;
let sleeperSyncLoopActive = false;

const basePlayers = [
  { id: 'allen', name: 'Josh Allen', position: 'QB', team: 'BUF', baseValue: 96, espn: 2.2, yahoo: 2.7 },
  { id: 'mcaffrey', name: 'Christian McCaffrey', position: 'RB', team: 'SF', baseValue: 98, espn: 1.2, yahoo: 1.4 },
  { id: 'hill', name: 'Tyreek Hill', position: 'WR', team: 'MIA', baseValue: 95, espn: 2.4, yahoo: 2.6 },
  { id: 'ekeler', name: 'Austin Ekeler', position: 'RB', team: 'WAS', baseValue: 90, espn: 3.5, yahoo: 3.8 },
  { id: 'lamb', name: 'CeeDee Lamb', position: 'WR', team: 'DAL', baseValue: 94, espn: 2.8, yahoo: 3.0 },
  { id: 'hurts', name: 'Jalen Hurts', position: 'QB', team: 'PHI', baseValue: 92, espn: 4.8, yahoo: 4.9 },
  { id: 'breece', name: 'Breece Hall', position: 'RB', team: 'NYJ', baseValue: 88, espn: 4.2, yahoo: 4.6 },
  { id: 'waller', name: 'Darren Waller', position: 'TE', team: 'MIA', baseValue: 85, espn: 5.1, yahoo: 5.3 },
  { id: 'murray', name: 'Kyler Murray', position: 'QB', team: 'ARI', baseValue: 89, espn: 6.5, yahoo: 6.7 },
  { id: 'achane', name: "De'Von Achane", position: 'RB', team: 'MIA', baseValue: 86, espn: 7.0, yahoo: 7.2 },
  { id: 'nabers', name: 'Malik Nabers', position: 'WR', team: 'NYG', baseValue: 87, espn: 7.3, yahoo: 7.6 },
  { id: 'puka', name: 'Puka Nacua', position: 'WR', team: 'LAR', baseValue: 84, espn: 8.1, yahoo: 8.3 },
  { id: 'kelce', name: 'Travis Kelce', position: 'TE', team: 'KC', baseValue: 91, espn: 4.1, yahoo: 4.3 },
  { id: 'diggs', name: 'Stefon Diggs', position: 'WR', team: 'HOU', baseValue: 83, espn: 8.8, yahoo: 9.0 },
  { id: 'gibbs', name: 'Jahmyr Gibbs', position: 'RB', team: 'DET', baseValue: 93, espn: 3.2, yahoo: 3.4 },
  { id: 'herbert', name: 'Justin Herbert', position: 'QB', team: 'LAC', baseValue: 82, espn: 9.6, yahoo: 9.7 },
  { id: 'kincaid', name: 'Dalton Kincaid', position: 'TE', team: 'BUF', baseValue: 81, espn: 9.8, yahoo: 10.0 },
  { id: 'dobbins', name: 'Gus Edwards', position: 'RB', team: 'LAC', baseValue: 79, espn: 10.2, yahoo: 10.4 },
  { id: 'rice', name: 'Rashee Rice', position: 'WR', team: 'KC', baseValue: 80, espn: 10.5, yahoo: 10.7 },
  { id: 'lawrence', name: 'Trevor Lawrence', position: 'QB', team: 'JAX', baseValue: 78, espn: 11.1, yahoo: 11.2 },
  { id: 'sam', name: 'Sam LaPorta', position: 'TE', team: 'DET', baseValue: 88, espn: 6.8, yahoo: 7.0 },
  { id: 'djk', name: 'D.J. Moore', position: 'WR', team: 'CHI', baseValue: 77, espn: 12.0, yahoo: 12.1 },
  { id: 'davis', name: 'Mike Davis', position: 'RB', team: 'FA', baseValue: 74, espn: 15.0, yahoo: 15.2 },
  { id: 'matt', name: 'Matthew Stafford', position: 'QB', team: 'LAR', baseValue: 76, espn: 13.2, yahoo: 13.3 }
];

const defaultState = {
  settings: {
    scoringFormat: 'ppr',
    qbSlots: 1,
    rbSlots: 2,
    wrSlots: 3,
    teSlots: 1,
    flexSlots: 1,
    benchSlots: 5,
    rosterSize: 16
  },
  sort: { key: 'myRank', direction: 'asc' },
  players: [],
  savedCustomRanks: null,
  sleeperSync: {
    draftId: '',
    enabled: false,
    lastPickCount: 0,
    lastSyncAt: null,
    lastResult: '',
    lastAttemptAt: null,
    lastDurationMs: null,
    consecutiveErrors: 0,
    adpShift: 0,
    draftProgress: {},
    acceptedUnmatchedByDraft: {},
    unmatchedCount: 0,
    unmatchedPicks: []
  },
  customAdpProfile: {
    totalSamples: 0,
    players: {}
  },
  ui: {
    selectedPlayerId: null
  },
  draftedPlayerIds: [],
  autoTiering: true,
  positionFilter: 'ALL'
};

const state = loadState();

if (typeof state.autoTiering !== 'boolean') {
  state.autoTiering = true;
}
if (!state.positionFilter) {
  state.positionFilter = 'ALL';
}
if (!state.sleeperSync || typeof state.sleeperSync !== 'object') {
  state.sleeperSync = structuredClone(defaultState.sleeperSync);
}
if (typeof state.sleeperSync.draftId !== 'string') {
  state.sleeperSync.draftId = '';
}
if (typeof state.sleeperSync.enabled !== 'boolean') {
  state.sleeperSync.enabled = false;
}
if (!Number.isFinite(state.sleeperSync.lastAttemptAt)) {
  state.sleeperSync.lastAttemptAt = null;
}
if (!Number.isFinite(state.sleeperSync.lastDurationMs)) {
  state.sleeperSync.lastDurationMs = null;
}
if (!Number.isFinite(state.sleeperSync.consecutiveErrors)) {
  state.sleeperSync.consecutiveErrors = 0;
}
if (!Number.isFinite(state.sleeperSync.adpShift)) {
  state.sleeperSync.adpShift = 0;
}
if (!state.sleeperSync.draftProgress || typeof state.sleeperSync.draftProgress !== 'object') {
  state.sleeperSync.draftProgress = {};
}
if (!state.sleeperSync.acceptedUnmatchedByDraft || typeof state.sleeperSync.acceptedUnmatchedByDraft !== 'object') {
  state.sleeperSync.acceptedUnmatchedByDraft = {};
}
if (!Number.isFinite(state.sleeperSync.unmatchedCount)) {
  state.sleeperSync.unmatchedCount = 0;
}
if (!Array.isArray(state.sleeperSync.unmatchedPicks)) {
  state.sleeperSync.unmatchedPicks = [];
}
if (!state.customAdpProfile || typeof state.customAdpProfile !== 'object') {
  state.customAdpProfile = structuredClone(defaultState.customAdpProfile);
}
if (!Number.isFinite(state.customAdpProfile.totalSamples)) {
  state.customAdpProfile.totalSamples = 0;
}
if (!state.customAdpProfile.players || typeof state.customAdpProfile.players !== 'object') {
  state.customAdpProfile.players = {};
}
if (!state.ui || typeof state.ui !== 'object') {
  state.ui = structuredClone(defaultState.ui);
}
if (typeof state.ui.selectedPlayerId !== 'string') {
  state.ui.selectedPlayerId = null;
}
if (state.sort?.key === 'sleeper') {
  state.sort.key = 'averageAdp';
}

autoFillPlayers();

const settingsForm = document.getElementById('settings-form');
const autoRankButton = document.getElementById('auto-rank');
const liveDataButton = document.getElementById('load-live-data');
const saveRankingsButton = document.getElementById('save-rankings');
const applySavedRankingsButton = document.getElementById('apply-saved-rankings');
const sleeperDraftIdInput = document.getElementById('sleeper-draft-id');
const sleeperSyncToggleButton = document.getElementById('toggle-sleeper-sync');
const sleeperSyncNowButton = document.getElementById('sync-sleeper-now');
const resetButton = document.getElementById('reset-data');
const rankingsBody = document.getElementById('rankings-body');
const positionFilters = document.getElementById('position-filters');
const settingsSummary = document.getElementById('settings-summary');
const dataStatus = document.getElementById('data-status');
const draftSignals = document.getElementById('draft-signals');
const draftedList = document.getElementById('drafted-list');
const remainingList = document.getElementById('remaining-list');
const unmatchedPicksPanel = document.getElementById('unmatched-picks-panel');

document.querySelectorAll('th[data-key]').forEach((header) => {
  header.addEventListener('click', () => sortBy(header.dataset.key));
});

rankingsBody.addEventListener('input', handleTableInput);
rankingsBody.addEventListener('change', handleTableInput);
rankingsBody.addEventListener('click', handleRankArrowClick);
positionFilters.addEventListener('click', handlePositionFilterClick);

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  collectSettings();
  state.autoTiering = true;
  autoFillPlayers();
  saveState();
  render();
});

autoRankButton.addEventListener('click', () => {
  collectSettings();
  state.autoTiering = true;
  autoFillPlayers();
  saveState();
  render();
});

liveDataButton.addEventListener('click', () => {
  collectSettings();
  loadLiveRankings();
});

saveRankingsButton.addEventListener('click', () => {
  saveCustomRankings();
});

applySavedRankingsButton.addEventListener('click', () => {
  const before = state.players.map((player) => player.myRank).join('|');
  const changed = applySavedCustomRanksToPlayers(state.players);
  if (changed) {
    state.autoTiering = true;
    applyAutoTiering();
  }
  const after = state.players.map((player) => player.myRank).join('|');
  state.liveDataStatus = changed || before !== after
    ? 'Applied your saved custom rankings.'
    : 'No saved custom rankings found for current players.';
  saveState();
  render();
});

sleeperSyncToggleButton.addEventListener('click', async () => {
  const draftId = normalizeSleeperDraftIdInput();
  if (draftId) {
    applySleeperDraftId(draftId);
  }

  if (state.sleeperSync.enabled) {
    stopSleeperSync('Sleeper sync stopped.');
    saveState();
    render();
    return;
  }

  if (!draftId) {
    state.sleeperSync.lastResult = 'Enter a Sleeper draft ID to start sync.';
    saveState();
    render();
    return;
  }

  state.sleeperSync.enabled = true;
  startSleeperSyncTimer();
  saveState();
  render();
  await syncSleeperDraft({ initiatedByUser: true });
});

sleeperSyncNowButton.addEventListener('click', async () => {
  const draftId = normalizeSleeperDraftIdInput();
  if (draftId) {
    applySleeperDraftId(draftId);
  }

  if (!state.sleeperSync.draftId) {
    state.sleeperSync.lastResult = 'Enter a Sleeper draft ID before syncing.';
    saveState();
    render();
    return;
  }

  sleeperSyncNowButton.disabled = true;
  try {
    state.sleeperSync.enabled = true;
    startSleeperSyncTimer();
    saveState();
    render();
    await syncSleeperDraft({ initiatedByUser: true });
  } finally {
    sleeperSyncNowButton.disabled = false;
  }
});

sleeperDraftIdInput.addEventListener('blur', () => {
  const draftId = normalizeSleeperDraftIdInput();
  if (draftId) {
    const changed = applySleeperDraftId(draftId);
    if (changed && state.sleeperSync.enabled) {
      syncSleeperDraft({ initiatedByUser: true });
    }
    saveState();
    render();
  }
});

sleeperDraftIdInput.addEventListener('change', () => {
  const draftId = normalizeSleeperDraftIdInput();
  if (draftId) {
    const changed = applySleeperDraftId(draftId);
    if (changed && state.sleeperSync.enabled) {
      syncSleeperDraft({ initiatedByUser: true });
    }
    saveState();
    render();
  }
});

sleeperDraftIdInput.addEventListener('input', () => {
  const value = `${sleeperDraftIdInput.value || ''}`;
  if (value.includes('sleeper.com/draft') || value.includes('draft_id=')) {
    normalizeSleeperDraftIdInput();
  }
});

sleeperDraftIdInput.addEventListener('paste', () => {
  setTimeout(() => {
    const draftId = normalizeSleeperDraftIdInput();
    if (draftId) {
      const changed = applySleeperDraftId(draftId);
      if (changed && state.sleeperSync.enabled) {
        syncSleeperDraft({ initiatedByUser: true });
      }
      saveState();
      render();
    }
  }, 0);
});

resetButton.addEventListener('click', () => {
  const preservedCustomAdpProfile = normalizeCustomAdpProfile(state.customAdpProfile);
  stopSleeperSync('Sleeper sync stopped.');
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(state, loadState());
  state.customAdpProfile = preservedCustomAdpProfile;
  state.autoTiering = true;
  autoFillPlayers();
  render();
});

rankingsBody.addEventListener('dragstart', handleDragStart);
rankingsBody.addEventListener('click', handleBoardClick);
rankingsBody.addEventListener('dragover', handleDragOver);
rankingsBody.addEventListener('drop', handleDrop);
draftedList.addEventListener('click', handleTrackerClick);
remainingList.addEventListener('click', handleTrackerClick);
draftedList.addEventListener('dragover', handleDragOver);
draftedList.addEventListener('drop', handleDrop);
remainingList.addEventListener('dragover', handleDragOver);
remainingList.addEventListener('drop', handleDrop);
if (unmatchedPicksPanel) {
  unmatchedPicksPanel.addEventListener('click', handleUnmatchedPicksPanelClick);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return structuredClone(defaultState);
    }
  }
  return structuredClone(defaultState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeCustomAdpProfile(profile) {
  const normalized = {
    totalSamples: 0,
    players: {}
  };

  if (!profile || typeof profile !== 'object' || !profile.players || typeof profile.players !== 'object') {
    return normalized;
  }

  normalized.totalSamples = Number.isFinite(profile.totalSamples) ? Number(profile.totalSamples) : 0;

  for (const [key, value] of Object.entries(profile.players)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const totalPickNo = Number.isFinite(value.totalPickNo) ? Number(value.totalPickNo) : 0;
    const count = Number.isFinite(value.count) ? Number(value.count) : 0;
    if (!count) {
      continue;
    }

    normalized.players[key] = {
      name: `${value.name || ''}`,
      position: normalizePositionCode(`${value.position || ''}`),
      team: normalizeSleeperTeamCode(`${value.team || ''}`),
      totalPickNo,
      count,
      averagePickNo: Math.round((totalPickNo / count) * 10) / 10,
      lastSeenAt: Number.isFinite(value.lastSeenAt) ? Number(value.lastSeenAt) : 0
    };
  }

  if (!normalized.totalSamples) {
    normalized.totalSamples = Object.values(normalized.players).reduce((total, entry) => total + entry.count, 0);
  }

  return normalized;
}

function mergeCustomAdpProfiles(baseProfile, incomingProfile) {
  const base = normalizeCustomAdpProfile(baseProfile);
  const incoming = normalizeCustomAdpProfile(incomingProfile);
  const merged = {
    totalSamples: 0,
    players: {}
  };

  const allKeys = new Set([
    ...Object.keys(base.players),
    ...Object.keys(incoming.players)
  ]);

  for (const key of allKeys) {
    const baseEntry = base.players[key];
    const incomingEntry = incoming.players[key];

    if (!baseEntry && incomingEntry) {
      merged.players[key] = { ...incomingEntry };
      continue;
    }

    if (baseEntry && !incomingEntry) {
      merged.players[key] = { ...baseEntry };
      continue;
    }

    // Prefer the profile entry with more samples to avoid double-counting
    // when local and server stores already represent the same underlying picks.
    const preferred = (incomingEntry.count > baseEntry.count)
      ? incomingEntry
      : baseEntry;
    merged.players[key] = { ...preferred };
  }

  merged.totalSamples = Object.values(merged.players).reduce((total, entry) => total + entry.count, 0);
  return merged;
}

function autoFillPlayers() {
  if (!state.players.length) {
    state.players = basePlayers.map((player) => ({
      ...player,
      myRank: 0,
      tier: 1,
      drafted: false,
      draftedSource: null,
      roomPickNo: null
    }));
  }

  const existingById = new Map((state.players || []).map((player) => [player.id, player]));
  const sortedPlayers = [...state.players]
    .map((player) => ({ ...player }))
    .sort((a, b) => (scorePlayer(b, state.settings) - scorePlayer(a, state.settings)));

  state.players = sortedPlayers.map((player, index) => {
    const existing = existingById.get(player.id);
    return {
      ...player,
      drafted: Boolean(existing?.drafted),
      draftedAt: existing?.draftedAt || null,
      draftedSource: existing?.draftedSource ?? null,
      roomPickNo: Number.isFinite(existing?.roomPickNo) ? existing.roomPickNo : null,
      myRank: index + 1,
      tier: getTierForRank(index, sortedPlayers.length)
    };
  });

  state.players = state.players.sort((a, b) => a.myRank - b.myRank);
  syncDraftedPlayerIds();
}

function getTierForRank(index, totalPlayers) {
  if (!totalPlayers) {
    return 1;
  }

  const tierSizes = getTierSizes(totalPlayers);
  let used = 0;

  for (let tier = 0; tier < tierSizes.length; tier += 1) {
    const count = tierSizes[tier];
    if (index < used + count) {
      return tier + 1;
    }

    used += count;
  }

  return tierSizes.length || 1;
}

function getTierSizes(totalPlayers) {
  const sizes = [];
  let remaining = totalPlayers;

  for (const openingSize of OPENING_TIER_SIZES) {
    if (remaining <= 0) {
      break;
    }

    const count = Math.min(openingSize, remaining);
    sizes.push(count);
    remaining -= count;
  }

  while (remaining > 0) {
    const count = remaining > MAX_TIER_SIZE ? 15 : remaining;
    sizes.push(count);
    remaining -= count;
  }

  return sizes.length ? sizes : [1];
}

function collectSettings() {
  state.settings = {
    scoringFormat: document.getElementById('scoring-format').value,
    qbSlots: Number(document.getElementById('qb-slots').value),
    rbSlots: Number(document.getElementById('rb-slots').value),
    wrSlots: Number(document.getElementById('wr-slots').value),
    teSlots: Number(document.getElementById('te-slots').value),
    flexSlots: Number(document.getElementById('flex-slots').value),
    benchSlots: Number(document.getElementById('bench-slots').value),
    rosterSize: Number(document.getElementById('roster-size').value)
  };
}

function scorePlayer(player, settings) {
  const positionWeight = { QB: 2.8, RB: 3.4, WR: 3.2, TE: 2.6 };
  const scoringMultiplier = settings.scoringFormat === 'ppr' ? 1.75 : settings.scoringFormat === 'half' ? 1.35 : 1;
  const lineupBoost = settings.rbSlots * 0.8 + settings.wrSlots * 0.7 + settings.teSlots * 0.6 + settings.qbSlots * 0.4;
  const benchBoost = settings.benchSlots * 0.35;
  const flexBoost = settings.flexSlots * 0.2;
  const rosterBoost = settings.rosterSize / 16;

  return player.baseValue * scoringMultiplier + positionWeight[player.position] + lineupBoost + benchBoost + flexBoost + rosterBoost;
}

function sortBy(key) {
  if (state.sort.key === key) {
    state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort.key = key;
    state.sort.direction = 'asc';
  }

  state.autoTiering = true;
  applyAutoTiering();
  render();
}

function render() {
  populateSettingsFields();
  renderPositionFilterChips();
  renderSummary();
  renderDataStatus();
  renderDraftSignals();
  if (state.autoTiering) {
    applyAutoTiering();
  }
  renderDraftBoard();
  renderDraftLists();
  renderUnmatchedPicksPanel();
  saveState();
}

function populateSettingsFields() {
  const { settings } = state;
  document.getElementById('scoring-format').value = settings.scoringFormat;
  document.getElementById('qb-slots').value = settings.qbSlots;
  document.getElementById('rb-slots').value = settings.rbSlots;
  document.getElementById('wr-slots').value = settings.wrSlots;
  document.getElementById('te-slots').value = settings.teSlots;
  document.getElementById('flex-slots').value = settings.flexSlots;
  document.getElementById('bench-slots').value = settings.benchSlots;
  document.getElementById('roster-size').value = settings.rosterSize;
  sleeperDraftIdInput.value = state.sleeperSync?.draftId || '';

  sleeperSyncToggleButton.textContent = state.sleeperSync?.enabled ? 'Stop Sleeper sync' : 'Start Sleeper sync';
}

function renderSummary() {
  settingsSummary.innerHTML = `
    <strong>Current build:</strong> ${state.settings.scoringFormat.toUpperCase()} • ${state.settings.qbSlots} QB • ${state.settings.rbSlots} RB • ${state.settings.wrSlots} WR • ${state.settings.teSlots} TE • ${state.settings.flexSlots} FLEX • ${state.settings.benchSlots} bench • ${state.settings.rosterSize} roster
  `;
}

function renderDataStatus() {
  const status = state.liveDataStatus || 'Starter board loaded. Use “Load live rankings” to pull public ranking data.';
  const sleeperStatus = state.sleeperSync?.lastResult
    ? `<br><strong>Sleeper sync:</strong> ${state.sleeperSync.lastResult}`
    : '';
  const hasDiagnostics = Number.isFinite(state.sleeperSync?.lastAttemptAt) || Number.isFinite(state.sleeperSync?.lastDurationMs);
  const customAdpPlayerCount = Object.keys(state.customAdpProfile?.players || {}).length;
  const sleeperDiagnostics = hasDiagnostics
    ? `<br><strong>Sleeper diagnostics:</strong> last attempt ${formatSleeperTime(state.sleeperSync.lastAttemptAt)} • duration ${formatSleeperDuration(state.sleeperSync.lastDurationMs)} • consecutive errors ${state.sleeperSync.consecutiveErrors || 0} • target cadence ${SLEEPER_SYNC_INTERVAL_MS}ms • room ADP shift ${formatSignedNumber(state.sleeperSync.adpShift)} picks • custom ADP model ${customAdpPlayerCount} players / ${state.customAdpProfile?.totalSamples || 0} samples`
    : '';
  dataStatus.innerHTML = `<strong>Live data:</strong> ${status}${sleeperStatus}${sleeperDiagnostics}`;
}

function formatSignedNumber(value) {
  if (!Number.isFinite(value)) {
    return '0.0';
  }

  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) {
    return `+${rounded.toFixed(1)}`;
  }
  return rounded.toFixed(1);
}

function formatSleeperTime(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return 'n/a';
  }
  return new Date(timestamp).toLocaleTimeString();
}

function formatSleeperDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return 'n/a';
  }
  return `${Math.max(0, Math.round(durationMs))}ms`;
}

function getSelectedPlayer() {
  if (!state.ui?.selectedPlayerId) {
    return null;
  }

  return state.players.find((player) => player.id === state.ui.selectedPlayerId) || null;
}

function setSelectedPlayer(playerId) {
  const exists = state.players.some((player) => player.id === playerId);
  state.ui.selectedPlayerId = exists ? playerId : null;
}

function renderDraftSignals() {
  if (!draftSignals) {
    return;
  }

  const draftedCount = state.players.filter((player) => player.drafted).length;
  const remainingCount = state.players.length - draftedCount;
  const unmatchedCount = Number.isFinite(state.sleeperSync?.unmatchedCount) ? state.sleeperSync.unmatchedCount : 0;
  const selectedPlayer = getSelectedPlayer();
  const selectedLabel = selectedPlayer
    ? `${selectedPlayer.name} (${selectedPlayer.position} - ${selectedPlayer.team})`
    : 'None';

  draftSignals.innerHTML = `
    <div class="signal-chip">
      <span class="signal-label">Remaining</span>
      <span class="signal-value">${remainingCount}</span>
    </div>
    <div class="signal-chip">
      <span class="signal-label">Drafted</span>
      <span class="signal-value">${draftedCount}</span>
    </div>
    <div class="signal-chip ${unmatchedCount ? 'signal-chip-warn' : ''}">
      <span class="signal-label">Unmatched</span>
      <span class="signal-value">${unmatchedCount}</span>
    </div>
    <div class="signal-chip signal-chip-selected">
      <span class="signal-label">Selected</span>
      <span class="signal-value">${selectedLabel}</span>
    </div>
  `;
}

function startSleeperSyncTimer() {
  if (sleeperSyncLoopActive) {
    return;
  }

  sleeperSyncLoopActive = true;

  const scheduleNext = (delayMs) => {
    if (!sleeperSyncLoopActive || !state.sleeperSync?.enabled) {
      return;
    }

    sleeperSyncTimer = setTimeout(async () => {
      if (!sleeperSyncLoopActive || !state.sleeperSync?.enabled) {
        return;
      }

      const startedAt = Date.now();
      await syncSleeperDraft();
      const elapsedMs = Date.now() - startedAt;
      const nextDelayMs = Math.max(0, SLEEPER_SYNC_INTERVAL_MS - elapsedMs);
      scheduleNext(nextDelayMs);
    }, Math.max(0, Number(delayMs) || 0));
  };

  scheduleNext(0);
}

function stopSleeperSyncTimer() {
  sleeperSyncLoopActive = false;
  if (sleeperSyncTimer) {
    clearTimeout(sleeperSyncTimer);
    sleeperSyncTimer = null;
  }
}

function stopSleeperSync(message) {
  state.sleeperSync.enabled = false;
  stopSleeperSyncTimer();
  if (message) {
    state.sleeperSync.lastResult = message;
  }
}

function clearSyncDraftedPlayers(includeManual = false) {
  let cleared = 0;
  state.players = state.players.map((player) => {
    const shouldClear = player.drafted && (includeManual || player.draftedSource !== 'manual');
    if (shouldClear) {
      cleared += 1;
      return {
        ...player,
        drafted: false,
        draftedAt: null,
        draftedSource: null,
        roomPickNo: null
      };
    }
    return player;
  });

  if (cleared > 0) {
    syncDraftedPlayerIds();
    state.autoTiering = true;
    applyAutoTiering();
  }

  return cleared;
}

function clearUnmatchedPicks() {
  state.sleeperSync.unmatchedCount = 0;
  state.sleeperSync.unmatchedPicks = [];
}

function applySleeperDraftId(nextDraftId) {
  const normalized = `${nextDraftId || ''}`.trim();
  if (!normalized) {
    return false;
  }

  if (state.sleeperSync.draftId === normalized) {
    return false;
  }

  const cleared = clearSyncDraftedPlayers(true);
  state.sleeperSync.draftId = normalized;
  state.sleeperSync.lastPickCount = 0;
  state.sleeperSync.lastSyncAt = null;
  state.sleeperSync.adpShift = 0;
  clearUnmatchedPicks();
  state.sleeperSync.lastResult = cleared > 0
    ? `Switched draft board. Cleared ${cleared} prior sync picks.`
    : 'Switched draft board.';
  return true;
}

function normalizeSleeperTeamCode(value) {
  return `${value || ''}`.toUpperCase();
}

function extractSleeperDraftId(value) {
  const raw = `${value || ''}`.trim();
  if (!raw) {
    return '';
  }

  const directId = raw.match(/^\d{8,}$/);
  if (directId) {
    return directId[0];
  }

  const pathMatch = raw.match(/\/draft\/(?:nfl\/)?(\d{8,})/i);
  if (pathMatch) {
    return pathMatch[1];
  }

  try {
    const parsed = new URL(raw);
    const fromQuery = parsed.searchParams.get('draft_id');
    if (fromQuery && /^\d{8,}$/.test(fromQuery)) {
      return fromQuery;
    }

    const parsedPathMatch = parsed.pathname.match(/\/draft\/(?:nfl\/)?(\d{8,})/i);
    if (parsedPathMatch) {
      return parsedPathMatch[1];
    }
  } catch {
    return '';
  }

  return '';
}

function normalizeSleeperDraftIdInput() {
  const extracted = extractSleeperDraftId(sleeperDraftIdInput.value);
  if (extracted) {
    sleeperDraftIdInput.value = extracted;
  }
  return extracted;
}

function buildPickedLookup(picks, sleeperPlayersById) {
  const byName = new Map();
  const byTeamPosition = new Map();
  const allRecords = [];

  for (const pick of picks) {
    const metadata = pick?.metadata || {};
    const playerId = pick?.player_id ? `${pick.player_id}` : '';
    const sleeperPlayer = playerId && sleeperPlayersById ? sleeperPlayersById.get(playerId) : null;
    const metadataName = `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim();
    const name = sleeperPlayer?.fullName || metadataName;

    if (!name) {
      continue;
    }

    const record = {
      playerId,
      name,
      pickNo: Number(pick?.pick_no || 0),
      round: Number(pick?.round || 0),
      team: normalizeSleeperTeamCode(sleeperPlayer?.team || metadata.team),
      position: normalizePositionCode(sleeperPlayer?.position || metadata.position || ''),
      pickedAt: Number(pick?.picked_at || pick?.timestamp || Date.now())
    };

    allRecords.push(record);

    for (const key of getNameMatchKeys(name)) {
      if (!byName.has(key)) {
        byName.set(key, []);
      }

      byName.get(key).push(record);
    }

    const teamPositionKey = getTeamPositionKey(record.team, record.position);
    if (teamPositionKey) {
      if (!byTeamPosition.has(teamPositionKey)) {
        byTeamPosition.set(teamPositionKey, []);
      }
      byTeamPosition.get(teamPositionKey).push(record);
    }
  }

  return { byName, byTeamPosition, allRecords };
}

function resolvePickedRecordForPlayer(player, records) {
  if (!records?.length) {
    return null;
  }

  const exactMatches = records.filter((record) => playerMatchesPickRecord(player, record));
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    const sameTeamAndPosition = exactMatches.filter((record) => {
      const sameTeam = record.team && normalizeSleeperTeamCode(player.team) === record.team;
      const samePosition = record.position && normalizePositionCode(player.position) === record.position;
      return sameTeam && samePosition;
    });

    if (sameTeamAndPosition.length === 1) {
      return sameTeamAndPosition[0];
    }

    return null;
  }

  return null;
}

function playerMatchesPickRecord(player, record) {
  if (!record) {
    return false;
  }

  const sameTeam = record.team && normalizeSleeperTeamCode(player.team) === record.team;
  const samePosition = record.position && normalizePositionCode(player.position) === record.position;

  if (record.team && record.position) {
    return sameTeam && samePosition;
  }
  if (record.team) {
    return sameTeam;
  }
  if (record.position) {
    return samePosition;
  }

  return true;
}

function syncDraftedPlayersFromLookup(pickedLookup) {
  let newlyMarked = 0;
  let newlyCleared = 0;
  let matchedTotal = 0;
  const usedPickRecordKeys = new Set();

  const updatedPlayers = state.players.map((player) => {
    const records = [];
    const seen = new Set();
    for (const key of getNameMatchKeys(player.name)) {
      const maybeRecords = pickedLookup.byName.get(key) || [];
      for (const record of maybeRecords) {
        const dedupeKey = getPickRecordKey(record);
        if (seen.has(dedupeKey)) {
          continue;
        }
        if (usedPickRecordKeys.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        records.push(record);
      }
    }

    if (!records.length && shouldUseTeamPositionFallback(player)) {
      const teamPositionKey = getTeamPositionKey(normalizeSleeperTeamCode(player.team), normalizePositionCode(player.position));
      const maybeTeamPositionRecords = pickedLookup.byTeamPosition.get(teamPositionKey) || [];
      const availableTeamPositionRecords = maybeTeamPositionRecords.filter((record) => !usedPickRecordKeys.has(getPickRecordKey(record)));
      if (availableTeamPositionRecords.length === 1) {
        records.push(availableTeamPositionRecords[0]);
      }
    }

    if (!records?.length) {
      if (player.drafted && player.draftedSource !== 'manual') {
        newlyCleared += 1;
        return {
          ...player,
          drafted: false,
          draftedAt: null,
          draftedSource: null,
          roomPickNo: null
        };
      }
      return player;
    }

    const matchedRecord = resolvePickedRecordForPlayer(player, records);
    if (!matchedRecord) {
      if (player.drafted && player.draftedSource !== 'manual') {
        newlyCleared += 1;
        return {
          ...player,
          drafted: false,
          draftedAt: null,
          draftedSource: null,
          roomPickNo: null
        };
      }
      return player;
    }

    matchedTotal += 1;
    usedPickRecordKeys.add(getPickRecordKey(matchedRecord));
    if (!player.drafted) {
      newlyMarked += 1;
    }

    return {
      ...player,
      drafted: true,
      draftedAt: player.draftedAt || matchedRecord.pickedAt || Date.now(),
      draftedSource: player.draftedSource === 'manual' ? 'manual' : 'sync',
      roomPickNo: Number.isFinite(matchedRecord.pickNo) ? matchedRecord.pickNo : player.roomPickNo ?? null
    };
  });

  state.players = updatedPlayers;
  const unmatchedRecords = (pickedLookup.allRecords || []).filter((record) => !usedPickRecordKeys.has(getPickRecordKey(record)));
  return { newlyMarked, newlyCleared, matchedTotal, unmatchedRecords };
}

function getPickRecordKey(record) {
  return `${record?.playerId || ''}-${record?.team || ''}-${record?.position || ''}-${record?.pickedAt || ''}`;
}

function getTeamPositionKey(team, position) {
  if (!team || !position) {
    return '';
  }
  return `${team}|${position}`;
}

function shouldUseTeamPositionFallback(player) {
  const normalizedPosition = normalizePositionCode(player?.position || '');
  return normalizedPosition === 'DEF' || normalizedPosition === 'TE';
}

function getCustomAdpProfileKey(name, position, team) {
  const normalizedPosition = normalizePositionCode(position || '');
  const normalizedTeam = normalizeSleeperTeamCode(team || '');
  if (normalizedPosition === 'DEF') {
    return `def-${normalizeName(normalizedTeam)}`;
  }
  return `${normalizeName(name)}-${normalizeName(normalizedPosition)}-${normalizeName(normalizedTeam)}`;
}

function getDraftProgressEntry(draftId) {
  if (!draftId) {
    return null;
  }

  if (!state.sleeperSync.draftProgress || typeof state.sleeperSync.draftProgress !== 'object') {
    state.sleeperSync.draftProgress = {};
  }

  if (!state.sleeperSync.draftProgress[draftId]) {
    state.sleeperSync.draftProgress[draftId] = { maxProcessedPickNo: 0 };
  }

  return state.sleeperSync.draftProgress[draftId];
}

function getAcceptedUnmatchedMapForDraft(draftId, create = false) {
  if (!draftId) {
    return null;
  }

  if (!state.sleeperSync.acceptedUnmatchedByDraft || typeof state.sleeperSync.acceptedUnmatchedByDraft !== 'object') {
    state.sleeperSync.acceptedUnmatchedByDraft = {};
  }

  if (!state.sleeperSync.acceptedUnmatchedByDraft[draftId] && create) {
    state.sleeperSync.acceptedUnmatchedByDraft[draftId] = {};
  }

  return state.sleeperSync.acceptedUnmatchedByDraft[draftId] || null;
}

function isAcceptedUnmatchedRecord(record, draftId) {
  const acceptedMap = getAcceptedUnmatchedMapForDraft(draftId, false);
  if (!acceptedMap) {
    return false;
  }

  const key = getPickRecordKey(record);
  return Boolean(acceptedMap[key]);
}

function updateCustomAdpProfileFromRecords(records, draftId) {
  if (!Array.isArray(records) || !draftId) {
    return 0;
  }

  const draftProgress = getDraftProgressEntry(draftId);
  const priorMaxPickNo = Number.isFinite(draftProgress?.maxProcessedPickNo)
    ? draftProgress.maxProcessedPickNo
    : 0;

  const newRecords = records
    .filter((record) => Number.isFinite(record?.pickNo) && record.pickNo > priorMaxPickNo)
    .sort((a, b) => a.pickNo - b.pickNo);

  if (!newRecords.length) {
    return 0;
  }

  let applied = 0;
  let maxPickNo = priorMaxPickNo;
  for (const record of newRecords) {
    const key = getCustomAdpProfileKey(record.name, record.position, record.team);
    if (!key) {
      continue;
    }

    const current = state.customAdpProfile.players[key] || {
      name: record.name,
      position: normalizePositionCode(record.position || ''),
      team: normalizeSleeperTeamCode(record.team || ''),
      totalPickNo: 0,
      count: 0,
      averagePickNo: 0,
      lastSeenAt: 0
    };

    const nextTotal = current.totalPickNo + record.pickNo;
    const nextCount = current.count + 1;
    state.customAdpProfile.players[key] = {
      ...current,
      name: record.name || current.name,
      position: normalizePositionCode(record.position || current.position || ''),
      team: normalizeSleeperTeamCode(record.team || current.team || ''),
      totalPickNo: nextTotal,
      count: nextCount,
      averagePickNo: Math.round((nextTotal / nextCount) * 10) / 10,
      lastSeenAt: Date.now()
    };

    if (record.pickNo > maxPickNo) {
      maxPickNo = record.pickNo;
    }

    applied += 1;
  }

  draftProgress.maxProcessedPickNo = maxPickNo;
  state.customAdpProfile.totalSamples += applied;
  return applied;
}

function recalculateRoomAdpShift() {
  const diffs = (state.players || [])
    .filter((player) => player.draftedSource === 'sync' && Number.isFinite(player.roomPickNo))
    .map((player) => player.roomPickNo - getAverageAdp(player))
    .filter((value) => Number.isFinite(value));

  if (!diffs.length) {
    state.sleeperSync.adpShift = 0;
    return;
  }

  const sum = diffs.reduce((total, value) => total + value, 0);
  state.sleeperSync.adpShift = Math.round((sum / diffs.length) * 10) / 10;
}

async function getSleeperPlayersById() {
  if (sleeperPlayersByIdCache) {
    return sleeperPlayersByIdCache;
  }

  const payload = await fetchJsonWithProxyFallback(
    'https://api.sleeper.app/v1/players/nfl',
    'Sleeper players metadata',
    { timeoutMs: SLEEPER_PLAYERS_FETCH_TIMEOUT_MS }
  );
  const byId = new Map();

  for (const [key, value] of Object.entries(payload || {})) {
    if (!value) {
      continue;
    }

    const playerId = `${value.player_id || key}`;
    const fullName = value.full_name || `${value.first_name || ''} ${value.last_name || ''}`.trim();
    if (!fullName) {
      continue;
    }

    byId.set(playerId, {
      fullName,
      team: value.team_abbr || value.team || '',
      position: value.position || ''
    });
  }

  sleeperPlayersByIdCache = byId;
  return sleeperPlayersByIdCache;
}

async function syncSleeperDraft({ initiatedByUser = false } = {}) {
  if (sleeperSyncInFlight) {
    return false;
  }

  let wasSuccessful = false;
  const draftId = `${state.sleeperSync?.draftId || ''}`.trim();
  if (!draftId) {
    if (initiatedByUser) {
      state.sleeperSync.lastResult = 'Enter a Sleeper draft ID before syncing.';
      saveState();
      render();
    }
    return false;
  }

  if (initiatedByUser) {
    clearSyncDraftedPlayers();
  }

  const syncStartedAt = Date.now();
  sleeperSyncInFlight = true;
  try {
    const picks = await fetchJsonWithProxyFallback(
      `https://api.sleeper.app/v1/draft/${draftId}/picks`,
      'Sleeper draft picks',
      { timeoutMs: SLEEPER_PICKS_FETCH_TIMEOUT_MS }
    );
    if (!Array.isArray(picks)) {
      throw new Error('Unexpected picks payload from Sleeper');
    }

    const hasIncompleteMetadata = picks.some((pick) => {
      const metadata = pick?.metadata || {};
      const metadataName = `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim();
      return !metadataName || !metadata.team || !metadata.position;
    });

    let sleeperPlayersById = null;
    if (hasIncompleteMetadata) {
      try {
        sleeperPlayersById = await getSleeperPlayersById();
      } catch {
        sleeperPlayersById = null;
      }
    }

    const pickedLookup = buildPickedLookup(picks, sleeperPlayersById);
    const learnedSamples = updateCustomAdpProfileFromRecords(pickedLookup.allRecords || [], draftId);
    const { newlyMarked, newlyCleared, matchedTotal, unmatchedRecords } = syncDraftedPlayersFromLookup(pickedLookup);
    recalculateRoomAdpShift();
    if (newlyMarked > 0 || newlyCleared > 0) {
      syncDraftedPlayerIds();
      state.autoTiering = true;
      applyAutoTiering();
    }

    const visibleUnmatchedRecords = unmatchedRecords.filter((record) => !isAcceptedUnmatchedRecord(record, draftId));
    state.sleeperSync.unmatchedCount = visibleUnmatchedRecords.length;
    state.sleeperSync.unmatchedPicks = [...visibleUnmatchedRecords]
      .sort((a, b) => (a.pickNo || 0) - (b.pickNo || 0))
      .slice(0, 50)
      .map((record) => ({
        pickNo: record.pickNo,
        name: record.name,
        position: record.position,
        team: record.team,
        playerId: record.playerId,
        pickedAt: record.pickedAt,
        acceptanceKey: getPickRecordKey(record)
      }));

    state.sleeperSync.lastPickCount = picks.length;
    state.sleeperSync.lastSyncAt = Date.now();
    state.sleeperSync.lastAttemptAt = state.sleeperSync.lastSyncAt;
    state.sleeperSync.lastDurationMs = state.sleeperSync.lastSyncAt - syncStartedAt;
    state.sleeperSync.consecutiveErrors = 0;
    state.sleeperSync.lastResult = `Synced ${picks.length} picks; matched ${matchedTotal} board players${newlyMarked ? `; +${newlyMarked}` : ''}${newlyCleared ? `; -${newlyCleared}` : ''}${learnedSamples ? `; learned ${learnedSamples} ADP samples` : ''}.`;
    wasSuccessful = true;
  } catch (error) {
    const failedAt = Date.now();
    state.sleeperSync.lastAttemptAt = failedAt;
    state.sleeperSync.lastDurationMs = failedAt - syncStartedAt;
    state.sleeperSync.consecutiveErrors = (state.sleeperSync.consecutiveErrors || 0) + 1;
    clearUnmatchedPicks();
    state.sleeperSync.lastResult = `Sync failed: ${error.message}`;
  } finally {
    sleeperSyncInFlight = false;
  }

  saveState();
  render();
  return wasSuccessful;
}

function initSleeperSyncFromState() {
  if (!state.sleeperSync?.enabled || !state.sleeperSync?.draftId) {
    stopSleeperSyncTimer();
    return;
  }

  startSleeperSyncTimer();
  syncSleeperDraft();
}

function getRankKey(player) {
  return `${normalizeName(player.name)}-${normalizeName(player.position)}-${normalizeName(player.team)}`;
}

function buildSavedCustomRanks() {
  const ranks = {};
  for (const player of state.players) {
    ranks[getRankKey(player)] = Number(player.myRank);
  }

  return {
    savedAt: Date.now(),
    scoringFormat: state.settings.scoringFormat,
    count: state.players.length,
    ranks
  };
}

function saveCustomRankings() {
  state.savedCustomRanks = buildSavedCustomRanks();
  state.liveDataStatus = `Saved custom rankings for ${state.savedCustomRanks.count} players.`;
  saveState();
  render();
}

function applySavedCustomRanksToPlayers(players) {
  const saved = state.savedCustomRanks;
  if (!saved?.ranks || !players.length) {
    return false;
  }

  let applied = 0;
  const updatedPlayers = players.map((player) => {
    const rank = saved.ranks[getRankKey(player)];
    if (!Number.isFinite(rank)) {
      return player;
    }

    applied += 1;
    return {
      ...player,
      myRank: rank
    };
  });

  if (!applied) {
    return false;
  }

  updatedPlayers.sort((a, b) => a.myRank - b.myRank || a.name.localeCompare(b.name));
  updatedPlayers.forEach((player, index) => {
    player.myRank = index + 1;
  });

  state.players = updatedPlayers;
  return true;
}

function getScoringApiType(scoringFormat) {
  if (scoringFormat === 'half') {
    return 'half-ppr';
  }
  if (scoringFormat === 'standard') {
    return 'standard';
  }
  return 'ppr';
}

function getScoringLabel(scoringFormat) {
  if (scoringFormat === 'half') {
    return 'Half-PPR';
  }
  if (scoringFormat === 'standard') {
    return 'Standard';
  }
  return 'PPR';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonWithProxyFallback(url, errorLabel, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  console.log(`[FETCH] Direct fetch for: ${errorLabel} - ${url}`);
  try {
    const response = await fetchWithTimeout(url, {}, timeoutMs);
    console.log(`[FETCH] Response status: ${response.status}`);
    if (!response.ok) {
      throw new Error(`${errorLabel} unavailable (${response.status})`);
    }
    return await response.json();
  } catch (error) {
    console.log(`[FETCH] Fetch failed for ${errorLabel}:`, error?.message || error);
    if (error?.name === 'AbortError') {
      throw new Error(`${errorLabel} timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`${errorLabel} unavailable. ${error.message}`);
  }
}

function getAverageAdp(player) {
  return (player.espn + player.yahoo) / 2;
}

function getDraftAdjustedAdp(player) {
  if (Number.isFinite(player?.roomPickNo)) {
    return player.roomPickNo;
  }

  const profileKey = getCustomAdpProfileKey(player?.name, player?.position, player?.team);
  const profile = profileKey ? state.customAdpProfile?.players?.[profileKey] : null;
  const baseline = Number.isFinite(profile?.averagePickNo)
    ? profile.averagePickNo
    : getAverageAdp(player);
  const shift = Number.isFinite(state.sleeperSync?.adpShift) ? state.sleeperSync.adpShift : 0;
  return Math.max(1, baseline + shift);
}

function renderPositionFilterChips() {
  positionFilters.querySelectorAll('button[data-filter]').forEach((button) => {
    const isActive = button.dataset.filter === state.positionFilter;
    button.classList.toggle('is-active', isActive);
  });
}

function handlePositionFilterClick(event) {
  const button = event.target.closest('button[data-filter]');
  if (!button) {
    return;
  }

  state.positionFilter = button.dataset.filter;
  render();
}

function applyAutoTiering() {
  const activePlayers = [...state.players]
    .sort((a, b) => a.myRank - b.myRank || a.name.localeCompare(b.name));
  const tierById = new Map();

  activePlayers.forEach((player, index) => {
    tierById.set(player.id, getTierForRank(index, activePlayers.length));
  });

  state.players = state.players.map((player) => ({
    ...player,
    tier: tierById.get(player.id) ?? player.tier
  }));
}

async function loadLiveRankings() {
  const selectedScoring = state.settings.scoringFormat;
  const selectedScoringApiType = getScoringApiType(selectedScoring);
  state.liveDataStatus = `Fetching ${getScoringLabel(selectedScoring)} rankings from Fantasy Football Calculator...`;
  render();

  try {
    const [selectedResponse, standardResponse] = await Promise.all([
      fetchJsonWithProxyFallback(`https://fantasyfootballcalculator.com/api/v1/adp/${selectedScoringApiType}`, `${getScoringLabel(selectedScoring)} ADP`),
      fetchJsonWithProxyFallback('https://fantasyfootballcalculator.com/api/v1/adp/standard', 'Standard ADP')
    ]);

    const mergedPlayers = (selectedResponse.players || [])
      .map((player) => {
        const standardMatch = (standardResponse.players || []).find((entry) => normalizeName(entry.name) === normalizeName(player.name));

        return {
          id: `live-${normalizeName(player.name)}-${normalizeName(player.position)}-${normalizeName(player.team)}`,
          rankKey: getRankKey(player),
          name: player.name,
          position: normalizePositionCode(player.position),
          team: player.team,
          espn: player.adp,
          yahoo: standardMatch?.adp ?? player.adp,
          baseValue: Math.max(70, 100 - player.adp * 4),
          tier: 1,
          myRank: 0
        };
      });

    const existingById = new Map((state.players || []).map((player) => [player.id, player]));
    const rankedPlayers = mergedPlayers
      .sort((a, b) => getAverageAdp(a) - getAverageAdp(b))
      .map((player, index) => {
        const existing = existingById.get(player.id);
        return {
          ...player,
          drafted: Boolean(existing?.drafted),
          draftedAt: existing?.draftedAt || null,
          draftedSource: existing?.draftedSource ?? null,
          roomPickNo: Number.isFinite(existing?.roomPickNo) ? existing.roomPickNo : null,
          myRank: index + 1,
          tier: getTierForRank(index, mergedPlayers.length)
        };
      });

    state.players = rankedPlayers;
    const appliedSavedRanks = applySavedCustomRanksToPlayers(state.players);
    state.autoTiering = true;
    state.liveDataStatus = `Loaded ${state.players.length} players from Fantasy Football Calculator (${getScoringLabel(selectedScoring)}/Standard). API type: ${selectedResponse?.meta?.type || getScoringLabel(selectedScoring)}.${appliedSavedRanks ? ' Applied saved custom rankings.' : ''}`;
    render();
  } catch (error) {
    state.liveDataStatus = `Live rankings unavailable. Using the starter board. ${error.message}`;
    render();
  }
}

function normalizeName(value) {
  return `${value || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeNameForMatch(value) {
  const raw = `${value || ''}`.toLowerCase();
  const withoutSuffix = raw
    .replace(/\b(jr|sr|ii|iii|iv|v|vi)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizeName(withoutSuffix || raw);
}

function getNameMatchKeys(value) {
  const base = normalizeName(value);
  const suffixNeutral = normalizeNameForMatch(value);
  return base === suffixNeutral ? [base] : [base, suffixNeutral];
}

function normalizePositionCode(value) {
  if (value === 'K') {
    return 'PK';
  }
  if (value === 'D' || value === 'DST') {
    return 'DEF';
  }
  return value;
}

function renderDraftBoard() {
  const sortedPlayers = [...state.players].sort(comparePlayers);
  const visiblePlayers = sortedPlayers.filter((player) => !player.drafted && matchesPositionFilter(player));
  const tiersToRender = [...new Set(visiblePlayers.map((player) => Number(player.tier)).filter((tier) => Number.isFinite(tier) && tier > 0))]
    .sort((a, b) => a - b);

  const tierTotalCounts = new Map();
  state.players
    .filter((player) => matchesPositionFilter(player))
    .forEach((player) => {
      const tier = Number(player.tier);
      if (!Number.isFinite(tier) || tier <= 0) {
        return;
      }
      tierTotalCounts.set(tier, (tierTotalCounts.get(tier) || 0) + 1);
    });

  const groupedRows = tiersToRender.flatMap((tier) => {
    const players = visiblePlayers.filter((player) => Number(player.tier) === tier);
    const tierCount = tierTotalCounts.get(tier) || players.length;

    return [
      `
        <tr class="tier-divider" data-tier="${tier}">
          <td colspan="7">
            <span class="tier-pill t${tier}">Tier ${tier}</span>
            <span class="tier-divider-count">${players.length}/${tierCount} players</span>
            <span class="tier-divider-hint">Drop here to move players into this tier</span>
          </td>
        </tr>
      `,
      ...players.map((player) => {
        const avgAdp = getDraftAdjustedAdp(player).toFixed(1);
        const isSelected = state.ui?.selectedPlayerId === player.id;
        const canMoveUp = player.myRank > 1;
        const canMoveDown = player.myRank < state.players.length;
        return `
          <tr data-player-id="${player.id}" draggable="true" class="${player.drafted ? 'drafted-row' : ''} ${isSelected ? 'selected-row' : ''}">
            <td>
              <div class="player-cell">
                <span class="player-name">${player.name}</span>
                ${player.draftedSource === 'manual' ? '<span class="table-tag table-tag-manual">MANUAL</span>' : ''}
              </div>
            </td>
            <td>
              <div class="rank-controls">
                <button class="rank-arrow rank-up" data-player-id="${player.id}" ${canMoveUp ? '' : 'disabled'}>↑</button>
                <input class="small" type="number" min="1" max="999" value="${player.myRank}" data-field="myRank" />
                <button class="rank-arrow rank-down" data-player-id="${player.id}" ${canMoveDown ? '' : 'disabled'}>↓</button>
              </div>
            </td>
            <td><span class="pos-pill">${player.position}</span></td>
            <td>${player.team}</td>
            <td>${player.espn.toFixed(1)}</td>
            <td>${player.yahoo.toFixed(1)}</td>
            <td>${avgAdp}</td>
          </tr>
        `;
      })
    ];
  });

  rankingsBody.innerHTML = groupedRows.join('');
}

function comparePlayers(a, b) {
  const { key, direction } = state.sort;
  let result = 0;

  if (key === 'player') {
    result = a.name.localeCompare(b.name);
  } else if (key === 'myRank') {
    result = a.myRank - b.myRank;
  } else if (key === 'position') {
    result = (POSITION_ORDER[a.position] || 99) - (POSITION_ORDER[b.position] || 99) || a.position.localeCompare(b.position);
  } else if (key === 'team') {
    result = a.team.localeCompare(b.team);
  } else if (key === 'espn') {
    result = a.espn - b.espn;
  } else if (key === 'yahoo') {
    result = a.yahoo - b.yahoo;
  } else if (key === 'averageAdp') {
    result = getDraftAdjustedAdp(a) - getDraftAdjustedAdp(b);
  }

  return direction === 'asc' ? result : -result;
}

function renderDraftLists() {
  const draftedPlayers = [...state.players]
    .filter((player) => player.drafted)
    .sort((a, b) => {
      const aHasRoomPick = Number.isFinite(a.roomPickNo);
      const bHasRoomPick = Number.isFinite(b.roomPickNo);

      if (aHasRoomPick && bHasRoomPick) {
        return b.roomPickNo - a.roomPickNo;
      }

      if (aHasRoomPick && !bHasRoomPick) {
        return -1;
      }

      if (!aHasRoomPick && bHasRoomPick) {
        return 1;
      }

      const draftedAtDiff = (b.draftedAt || 0) - (a.draftedAt || 0);
      if (draftedAtDiff !== 0) {
        return draftedAtDiff;
      }

      return b.myRank - a.myRank;
    });

  const remainingPlayers = [...state.players]
    .filter((player) => !player.drafted)
    .sort((a, b) => a.myRank - b.myRank);

  draftedList.innerHTML = draftedPlayers.length
    ? draftedPlayers.map((player, index) => `
        <div class="draft-item ${state.ui?.selectedPlayerId === player.id ? 'is-selected' : ''}" data-player-id="${player.id}">
          <span>${player.name} — ${player.position}</span>
          <div class="chip-actions">
            ${index < 3 ? '<span class="chip-tag chip-tag-recent">JUST IN</span>' : ''}
            ${Number.isFinite(player.roomPickNo) ? `<span class="chip-tag">Pick ${player.roomPickNo}</span>` : ''}
            ${player.draftedSource === 'sync' ? '<span class="chip-tag chip-tag-sync">SYNC</span>' : '<span class="chip-tag chip-tag-manual">MANUAL</span>'}
            <button type="button" class="chip-action" data-action="undraft" data-player-id="${player.id}">Undo</button>
          </div>
        </div>
      `).join('')
    : '<div class="empty-state">Drag players here when they are drafted</div>';

  remainingList.innerHTML = remainingPlayers.length
    ? remainingPlayers.map((player) => `
        <div class="draft-item ${state.ui?.selectedPlayerId === player.id ? 'is-selected' : ''}" data-player-id="${player.id}">
          <span>${player.name} — ${player.position}</span>
          <span class="chip-rank">#${player.myRank}</span>
        </div>
      `).join('')
    : '<div class="empty-state">All players drafted</div>';

}

function renderUnmatchedPicksPanel() {
  if (!unmatchedPicksPanel) {
    return;
  }

  const unmatchedPicks = state.sleeperSync?.unmatchedPicks || [];
  const unmatchedCount = Number.isFinite(state.sleeperSync?.unmatchedCount) ? state.sleeperSync.unmatchedCount : unmatchedPicks.length;

  if (!state.sleeperSync?.lastSyncAt && !unmatchedCount) {
    unmatchedPicksPanel.innerHTML = '<div class="empty-state">Unmatched picks will appear after Sleeper sync runs.</div>';
    return;
  }

  if (!unmatchedCount) {
    unmatchedPicksPanel.innerHTML = '<div class="empty-state">All synced Sleeper picks matched players on your board.</div>';
    return;
  }

  const actions = `
    <div class="unmatched-actions">
      <button type="button" class="chip-action" data-action="add-unmatched-to-board">Add unmatched to board</button>
    </div>
  `;

  const rows = unmatchedPicks.map((pick) => `
      <div class="unmatched-item">
        <span class="unmatched-pickno">#${pick.pickNo || '?'}</span>
        <span class="unmatched-name">${pick.name || 'Unknown player'}</span>
        <span class="unmatched-meta">${pick.position || '-'} • ${pick.team || '-'}</span>
      </div>
    `).join('');

  const overflow = unmatchedCount > unmatchedPicks.length
    ? `<div class="empty-state">Showing first ${unmatchedPicks.length} of ${unmatchedCount} unmatched picks.</div>`
    : '';

  unmatchedPicksPanel.innerHTML = `
    <div class="unmatched-summary">${unmatchedCount} unmatched picks</div>
    ${actions}
    <div class="unmatched-list">${rows}</div>
    ${overflow}
  `;
}

function buildUnmatchedImportId(pick) {
  const draftId = state.sleeperSync?.draftId || 'draft';
  const playerId = `${pick?.playerId || ''}`.trim();
  if (playerId) {
    return `sleeper-${draftId}-${playerId}`;
  }
  const nameKey = normalizeName(pick?.name || 'unknown');
  const teamKey = normalizeName(pick?.team || 'na');
  const posKey = normalizeName(pick?.position || 'na');
  const pickNoKey = Number.isFinite(Number(pick?.pickNo)) ? Number(pick.pickNo) : 'x';
  return `sleeper-${draftId}-${nameKey}-${posKey}-${teamKey}-${pickNoKey}`;
}

function addUnmatchedPicksToBoard() {
  const unmatchedPicks = state.sleeperSync?.unmatchedPicks || [];
  if (!unmatchedPicks.length) {
    return 0;
  }

  const currentDraftId = `${state.sleeperSync?.draftId || ''}`.trim();
  const acceptedMap = getAcceptedUnmatchedMapForDraft(currentDraftId, true);
  for (const pick of unmatchedPicks) {
    const acceptanceKey = `${pick?.acceptanceKey || ''}`.trim();
    if (acceptanceKey) {
      acceptedMap[acceptanceKey] = true;
    }
  }

  const currentCount = state.players.length;
  let added = 0;

  for (const pick of unmatchedPicks) {
    const normalizedPosition = normalizePositionCode(pick.position || '');
    const normalizedTeam = normalizeSleeperTeamCode(pick.team || 'FA') || 'FA';

    const alreadyExists = state.players.some((player) => {
      if (normalizedPosition === 'DEF') {
        return normalizePositionCode(player.position) === 'DEF'
          && normalizeSleeperTeamCode(player.team) === normalizedTeam;
      }

      return getRankKey(player) === `${normalizeName(pick.name)}-${normalizeName(normalizedPosition)}-${normalizeName(normalizedTeam)}`;
    });

    if (alreadyExists) {
      continue;
    }

    added += 1;
    const fallbackAdp = Number.isFinite(Number(pick.pickNo)) ? Number(pick.pickNo) : currentCount + added;
    const draftedAt = Number.isFinite(Number(pick.pickedAt)) ? Number(pick.pickedAt) : Date.now();
    state.players.push({
      id: buildUnmatchedImportId(pick),
      name: pick.name || 'Unknown player',
      position: normalizedPosition || 'FLEX',
      team: normalizedTeam,
      espn: fallbackAdp,
      yahoo: fallbackAdp,
      baseValue: Math.max(60, 100 - fallbackAdp * 0.5),
      tier: getTierForRank(state.players.length, state.players.length + 1),
      myRank: state.players.length + 1,
      drafted: true,
      draftedAt,
      draftedSource: 'sync',
      roomPickNo: fallbackAdp
    });
  }

  if (!added) {
    return 0;
  }

  for (const pick of unmatchedPicks) {
    if (!Number.isFinite(Number(pick.pickNo))) {
      continue;
    }

    const key = getCustomAdpProfileKey(pick.name, pick.position, pick.team);
    const existing = state.customAdpProfile.players[key] || {
      name: pick.name,
      position: normalizePositionCode(pick.position || ''),
      team: normalizeSleeperTeamCode(pick.team || ''),
      totalPickNo: 0,
      count: 0,
      averagePickNo: 0,
      lastSeenAt: 0
    };

    const nextTotal = existing.totalPickNo + Number(pick.pickNo);
    const nextCount = existing.count + 1;
    state.customAdpProfile.players[key] = {
      ...existing,
      totalPickNo: nextTotal,
      count: nextCount,
      averagePickNo: Math.round((nextTotal / nextCount) * 10) / 10,
      lastSeenAt: Date.now()
    };
    state.customAdpProfile.totalSamples += 1;
  }

  state.sort.key = 'myRank';
  state.sort.direction = 'asc';
  syncDraftedPlayerIds();
  state.autoTiering = true;
  applyAutoTiering();
  state.liveDataStatus = `Imported ${added} unmatched Sleeper picks into your board as drafted players.`;
  return added;
}

function handleUnmatchedPicksPanelClick(event) {
  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) {
    return;
  }

  if (actionButton.dataset.action !== 'add-unmatched-to-board') {
    return;
  }

  const added = addUnmatchedPicksToBoard();
  if (!added) {
    state.liveDataStatus = 'No unmatched picks were added (they may already exist on your board).';
    saveState();
    render();
    return;
  }

  saveState();
  render();
  syncSleeperDraft({ initiatedByUser: true });
}

function matchesPositionFilter(player) {
  if (state.positionFilter === 'ALL') {
    return true;
  }

  if (state.positionFilter === 'K') {
    return player.position === 'K' || player.position === 'PK';
  }

  if (state.positionFilter === 'DEF') {
    return player.position === 'DEF' || player.position === 'D' || player.position === 'DST';
  }

  return player.position === state.positionFilter;
}

function syncDraftedPlayerIds() {
  state.draftedPlayerIds = (state.players || []).filter((player) => player.drafted).map((player) => player.id);
}

function movePlayerToRank(playerId, requestedRank) {
  const rankedPlayers = [...state.players].sort((a, b) => a.myRank - b.myRank || a.name.localeCompare(b.name));
  const fromIndex = rankedPlayers.findIndex((player) => player.id === playerId);
  if (fromIndex < 0) {
    return false;
  }

  const clampedRank = Math.max(1, Math.min(rankedPlayers.length, Math.round(requestedRank)));
  const toIndex = clampedRank - 1;
  if (fromIndex === toIndex) {
    return false;
  }

  const [moving] = rankedPlayers.splice(fromIndex, 1);
  rankedPlayers.splice(toIndex, 0, moving);

  rankedPlayers.forEach((player, index) => {
    player.myRank = index + 1;
  });

  state.players = rankedPlayers;
  return true;
}

function handleDragStart(event) {
  const draggable = event.target.closest('[data-player-id]');
  if (!draggable) {
    return;
  }

  state.draggedPlayerId = draggable.dataset.playerId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggable.dataset.playerId);
  }
}

function handleDragOver(event) {
  if (event.target.closest('.tier-divider') || event.target.closest('tr[data-player-id]') || event.target.closest('.draft-bin')) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }
}

function handleDrop(event) {
  event.preventDefault();
  const playerId = state.draggedPlayerId;
  if (!playerId) {
    return;
  }

  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  const targetTierRow = event.target.closest('.tier-divider');
  const targetPlayerRow = event.target.closest('tr[data-player-id]');
  const targetDraftBin = event.target.closest('.draft-bin');

  if (targetTierRow) {
    player.tier = Number(targetTierRow.dataset.tier);
    state.autoTiering = false;
  } else if (targetPlayerRow) {
    const targetPlayer = state.players.find((entry) => entry.id === targetPlayerRow.dataset.playerId);
    if (targetPlayer) {
      player.tier = Number(targetPlayer.tier);
      state.autoTiering = false;
    }
  } else if (targetDraftBin?.dataset.action === 'draft') {
    player.drafted = true;
    player.draftedAt = Date.now();
    player.draftedSource = 'manual';
  }

  syncDraftedPlayerIds();
  saveState();
  render();
}

function handleBoardClick(event) {
  const clickedControl = event.target.closest('input, button, select, textarea');
  const playerRow = !clickedControl ? event.target.closest('tr[data-player-id]') : null;
  if (playerRow) {
    setSelectedPlayer(playerRow.dataset.playerId);
    render();
  }

  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) {
    return;
  }

  const chip = actionButton.closest('.player-chip');
  if (!chip) {
    return;
  }

  const player = state.players.find((entry) => entry.id === chip.dataset.playerId);
  if (!player) {
    return;
  }

  if (actionButton.dataset.action === 'draft') {
    player.drafted = true;
    player.draftedAt = Date.now();
    player.draftedSource = 'manual';
    player.roomPickNo = null;
    syncDraftedPlayerIds();
    saveState();
    render();
  }
}

function handleTableInput(event) {
  const target = event.target;
  if (!target.dataset.field) {
    return;
  }

  const row = target.closest('tr[data-player-id]');
  if (!row) {
    return;
  }

  const player = state.players.find((entry) => entry.id === row.dataset.playerId);
  if (!player) {
    return;
  }

  if (target.dataset.field === 'myRank') {
    const requestedRank = Number(target.value);
    if (!Number.isFinite(requestedRank)) {
      return;
    }

    movePlayerToRank(player.id, requestedRank);
    state.sort.key = 'myRank';
    state.sort.direction = 'asc';
    state.autoTiering = true;
    applyAutoTiering();
  }

  saveState();
  render();
}

function handleRankArrowClick(event) {
  const target = event.target;
  if (!target.classList.contains('rank-arrow')) {
    return;
  }

  const row = target.closest('tr[data-player-id]');
  if (!row) {
    return;
  }

  const player = state.players.find((entry) => entry.id === row.dataset.playerId);
  if (!player) {
    return;
  }

  if (target.classList.contains('rank-up')) {
    movePlayerToRank(player.id, player.myRank - 1);
  } else if (target.classList.contains('rank-down')) {
    movePlayerToRank(player.id, player.myRank + 1);
  }

  state.sort.key = 'myRank';
  state.sort.direction = 'asc';
  state.autoTiering = true;
  applyAutoTiering();
  saveState();
  render();
}

function handleTrackerClick(event) {
  const actionButton = event.target.closest('button[data-action]');
  const draftItem = !actionButton ? event.target.closest('.draft-item[data-player-id]') : null;
  if (draftItem) {
    setSelectedPlayer(draftItem.dataset.playerId);
    render();
  }
  if (!actionButton) {
    return;
  }

  const player = state.players.find((entry) => entry.id === actionButton.dataset.playerId);
  if (!player) {
    return;
  }

  if (actionButton.dataset.action === 'undraft') {
    player.drafted = false;
    player.draftedAt = null;
    player.draftedSource = null;
    player.roomPickNo = null;
    syncDraftedPlayerIds();
    saveState();
    render();
  }
}

render();
loadLiveRankings();
initSleeperSyncFromState();
