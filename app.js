// API Configuration
const API_CONFIG = {
  fantasyPros: {
    baseUrl: 'https://api.fantasypros.com/public/v2/json',
    apiKey: 'PNnzNP9Brm5ZdldankRwc8l6Z1z9HpJR1KKEQTjF'
  },
  sleeper: {
    baseUrl: 'https://api.sleeper.com',
    apiKey: '' // No key required
  }
};

const STORAGE_KEY = 'fantasy-draft-sheet-state';

function getUserStorageKey(username) {
  return `${STORAGE_KEY}-${username}`;
}

function parseStoredState(raw) {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getStateTimestamp(savedState) {
  if (!savedState || typeof savedState !== 'object') {
    return 0;
  }
  if (Number.isFinite(savedState.updatedAt)) {
    return savedState.updatedAt;
  }
  if (Number.isFinite(savedState.savedCustomRanks?.savedAt)) {
    return savedState.savedCustomRanks.savedAt;
  }
  return 0;
}

function pickNewestState(...candidates) {
  let best = null;
  let bestTime = -1;
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const timestamp = getStateTimestamp(candidate);
    if (timestamp >= bestTime) {
      bestTime = timestamp;
      best = candidate;
    }
  }
  return best;
}

function syncSavedCustomRanksSnapshot() {
  if (!Array.isArray(state.players) || !state.players.length) {
    return;
  }
  const hasManualRanks = state.players.some(
    (player) => player.manualRank === true && Number(player.myRank) > 0
  );
  if (hasManualRanks || state.savedCustomRanks?.ranks) {
    state.savedCustomRanks = buildSavedCustomRanks();
  }
}

function prepareAccountStateBeforeLiveLoad() {
  if (!currentUsername) {
    return null;
  }

  const accountState = parseStoredState(localStorage.getItem(getUserStorageKey(currentUsername)));
  if (!accountState) {
    return null;
  }

  if (accountState.savedCustomRanks) {
    state.savedCustomRanks = accountState.savedCustomRanks;
  }
  if (Array.isArray(accountState.players) && accountState.players.length) {
    state.players = accountState.players;
  }

  return accountState;
}

function findSavedRankForPlayer(player, savedCustomRanks = null) {
  const ranks = savedCustomRanks?.ranks || state.savedCustomRanks?.ranks || {};
  const directRank = ranks[getRankKey(player)];
  if (Number.isFinite(directRank) && directRank > 0) {
    return directRank;
  }

  const playerName = normalizeName(player.name);
  const playerPosition = normalizeName(player.position);
  const playerTeam = normalizeName(player.team);

  for (const [key, rank] of Object.entries(ranks)) {
    if (!Number.isFinite(rank) || rank <= 0) {
      continue;
    }
    const parts = key.split('-');
    if (parts.length < 3) {
      continue;
    }
    const savedTeam = parts.pop();
    const savedPosition = parts.pop();
    const savedName = parts.join('-');
    if (savedName === playerName && savedPosition === playerPosition && savedTeam === playerTeam) {
      return rank;
    }
  }

  return null;
}
const OPENING_TIER_SIZES = [3, 8, 10, 12, 12];
const TIER_MIN_SIZE = 3;
const TIER_TARGET_SIZE = 8;
const TIER_HARD_MAX = 12;
const ADP_SOFT_CUT_GAP = 1.75;
const POSITIONAL_CLIFF_WEIGHT = 0.35;
const POSITIONAL_POINT_MIN_DROP = {
  QB: 10,
  RB: 7,
  WR: 9,
  TE: 6,
  PK: 4,
  K: 4,
  DEF: 4
};

const SLEEPER_SYNC_INTERVAL_MS = 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 12000;
const SLEEPER_PICKS_FETCH_TIMEOUT_MS = 5000;
const SLEEPER_PLAYERS_FETCH_TIMEOUT_MS = 7000;
const POSITION_ORDER = { QB: 1, RB: 2, WR: 3, TE: 4, FLEX: 5, K: 6, DEF: 7, DST: 7, D: 7 };
let sleeperSyncTimer = null;
let sleeperPlayersByIdCache = null;
let sleeperSyncInFlight = false;
let sleeperSyncLoopActive = false;
let currentUsername = null;
let currentPassword = null;
let isHydratingAccountState = false;

function isUserLoggedIn() {
  return Boolean(currentUsername && currentPassword);
}

function updateAuthUi() {
  const loggedIn = isUserLoggedIn();
  const loginDisplay = loggedIn ? 'none' : 'inline-flex';
  const logoutDisplay = loggedIn ? 'inline-flex' : 'none';

  const userDisplay = document.getElementById('user-display');
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');

  if (userDisplay) userDisplay.textContent = loggedIn ? currentUsername : '';
  if (loginButton) loginButton.style.display = loginDisplay;
  if (logoutButton) logoutButton.style.display = logoutDisplay;
}

const basePlayers = [
  { id: 'allen', name: 'Josh Allen', position: 'QB', team: 'BUF', baseValue: 96, espn: 2.2, yahoo: 2.7, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'mcaffrey', name: 'Christian McCaffrey', position: 'RB', team: 'SF', baseValue: 98, espn: 1.2, yahoo: 1.4, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'hill', name: 'Tyreek Hill', position: 'WR', team: 'MIA', baseValue: 95, espn: 2.4, yahoo: 2.6, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'ekeler', name: 'Austin Ekeler', position: 'RB', team: 'WAS', baseValue: 90, espn: 3.5, yahoo: 3.8, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'lamb', name: 'CeeDee Lamb', position: 'WR', team: 'DAL', baseValue: 94, espn: 2.8, yahoo: 3.0, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'hurts', name: 'Jalen Hurts', position: 'QB', team: 'PHI', baseValue: 92, espn: 4.8, yahoo: 4.9, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'breece', name: 'Breece Hall', position: 'RB', team: 'NYJ', baseValue: 88, espn: 4.2, yahoo: 4.6, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'waller', name: 'Darren Waller', position: 'TE', team: 'MIA', baseValue: 85, espn: 5.1, yahoo: 5.3, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'murray', name: 'Kyler Murray', position: 'QB', team: 'ARI', baseValue: 89, espn: 6.5, yahoo: 6.7, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'achane', name: "De'Von Achane", position: 'RB', team: 'MIA', baseValue: 86, espn: 7.0, yahoo: 7.2, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'nabers', name: 'Malik Nabers', position: 'WR', team: 'NYG', baseValue: 87, espn: 7.3, yahoo: 7.6, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'puka', name: 'Puka Nacua', position: 'WR', team: 'LAR', baseValue: 84, espn: 8.1, yahoo: 8.3, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'kelce', name: 'Travis Kelce', position: 'TE', team: 'KC', baseValue: 91, espn: 4.1, yahoo: 4.3, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'diggs', name: 'Stefon Diggs', position: 'WR', team: 'HOU', baseValue: 83, espn: 8.8, yahoo: 9.0, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'gibbs', name: 'Jahmyr Gibbs', position: 'RB', team: 'DET', baseValue: 93, espn: 3.2, yahoo: 3.4, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'herbert', name: 'Justin Herbert', position: 'QB', team: 'LAC', baseValue: 82, espn: 9.6, yahoo: 9.7, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'kincaid', name: 'Dalton Kincaid', position: 'TE', team: 'BUF', baseValue: 81, espn: 9.8, yahoo: 10.0, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'dobbins', name: 'Gus Edwards', position: 'RB', team: 'LAC', baseValue: 79, espn: 10.2, yahoo: 10.4, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'rice', name: 'Rashee Rice', position: 'WR', team: 'KC', baseValue: 80, espn: 10.5, yahoo: 10.7, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'lawrence', name: 'Trevor Lawrence', position: 'QB', team: 'JAX', baseValue: 78, espn: 11.1, yahoo: 11.2, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'sam', name: 'Sam LaPorta', position: 'TE', team: 'DET', baseValue: 88, espn: 6.8, yahoo: 7.0, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'djk', name: 'D.J. Moore', position: 'WR', team: 'CHI', baseValue: 77, espn: 12.0, yahoo: 12.1, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'davis', name: 'Mike Davis', position: 'RB', team: 'FA', baseValue: 74, espn: 15.0, yahoo: 15.2, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null },
  { id: 'matt', name: 'Matthew Stafford', position: 'QB', team: 'LAR', baseValue: 76, espn: 13.2, yahoo: 13.3, posRank: 0, sleeperAdp: null, rotoballer: null, ffpc: null, sosRank: null, expertRank: null }
];

const defaultState = {
  settings: {
    scoringFormat: 'standard',
    qbSlots: 1,
    rbSlots: 2,
    wrSlots: 3,
    teSlots: 1,
    flexSlots: 1,
    superflex: false,
    benchSpots: 5
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
    unmatchedPicks: [],
    // Store all Sleeper draft picks for ADP calculation
    allDraftPicks: []
  },
  customAdpProfile: {
    totalSamples: 0,
    players: {}
  },
  ui: {
    selectedPlayerId: null,
    selectedTier: null
  },
  draftedPlayerIds: [],
  autoTiering: false,
  positionFilter: 'ALL',
  adpSource: 'all',
  draftMode: 'manual'
};

const state = loadState();

// Older saved states do not have a way to distinguish an auto/CSV rank from a
// rank deliberately set by the user. New and updated rankings use this flag so
// CSV imports can preserve manual ranks and leave unmatched players unranked.
if (Array.isArray(state.players)) {
  state.players.forEach((player) => {
    player.manualRank = player.manualRank === true;
  });
}

if (typeof state.autoTiering !== 'boolean') {
  state.autoTiering = false;
}
if (!state.positionFilter) {
  state.positionFilter = 'ALL';
}
const VALID_ADP_SOURCES = new Set(['all', 'espn', 'yahoo', 'rotoballer', 'ffpc', 'average', 'expert']);
if (!VALID_ADP_SOURCES.has(state.adpSource)) {
  state.adpSource = 'all';
}
if (state.draftMode !== 'sleeper' && state.draftMode !== 'manual') {
  state.draftMode = 'manual';
}
if (!state.sleeperSync || typeof state.sleeperSync !== 'object') {
  state.sleeperSync = structuredClone(defaultState.sleeperSync);
}
if (typeof state.sleeperSync.draftId !== 'string') {
  state.sleeperSync.draftId = '';
}
state.sleeperSync.draftId = '';
state.sleeperSync.enabled = false;
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
if (!Number.isFinite(state.ui.selectedTier)) {
  state.ui.selectedTier = null;
}
if (state.sort?.key === 'sleeper') {
  state.sort.key = 'averageAdp';
}

// Check for saved username in localStorage
const savedUsername = localStorage.getItem('fantasy-draft-username');
const savedPassword = localStorage.getItem('fantasy-draft-password');

autoFillPlayers();

// Wait for DOM to be ready before accessing elements
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  
  const saveRankingsButton = document.getElementById('save-rankings');
  const applySavedRankingsButton = document.getElementById('apply-saved-rankings');
  const rankingsBody = document.getElementById('rankings-body');
  const positionFilters = document.getElementById('position-filters');
  const settingsSummary = document.getElementById('settings-summary');
  const dataStatus = document.getElementById('data-status');
  const rankingStatus = document.getElementById('ranking-status');
  const usernameModal = document.getElementById('username-modal');
  const usernameInput = document.getElementById('username-input');
  const passwordInput = document.getElementById('password-input');
  const usernameSubmit = document.getElementById('username-submit');
  const usernameCancel = document.getElementById('username-cancel');
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');
  const userDisplay = document.getElementById('user-display');
  const csvUploadLabel = document.getElementById('csv-upload-label');
  const sleeperDraftIdInput = document.getElementById('sleeper-draft-id');
  const draftModeToggle = document.getElementById('manual-mode-toggle');
  const manualPlayerSearch = document.getElementById('manual-player-search');
  const manualDraftBtn = document.getElementById('manual-draft-btn');
  const manualUndoBtn = document.getElementById('manual-undo-btn');
  const draftedPlayersList = document.getElementById('drafted-players-list');
  const manualSearchSuggestions = document.getElementById('manual-search-suggestions');

  console.log('DOM elements:', {
    saveRankingsButton,
    rankingsBody,
    positionFilters
  });

  document.querySelectorAll('th[data-key]').forEach((header) => {
    header.addEventListener('click', () => sortBy(header.dataset.key));
  });

  // The header is rebuilt when the ADP source changes, so restore the active
  // sort styling after the new cells have been inserted.
  renderSortIndicators();

  const adpSourceSelector = document.getElementById('adp-source');
  if (adpSourceSelector) {
    adpSourceSelector.addEventListener('change', (e) => {
      state.adpSource = e.target.value;
      if (state.adpSource === 'expert') {
        state.sort = { key: 'expertRank', direction: 'asc' };
      } else if (state.adpSource === 'average') {
        state.sort = { key: 'averageAdp', direction: 'asc' };
      } else {
        state.sort = { key: 'adp', direction: 'asc' };
      }
      updateCompactMetricMode();
      render();
    });
  }

  const toggleHelpButton = document.getElementById('toggle-help');
  const csvHelpDismiss = document.getElementById('csv-help-dismiss');
  const csvHelp = document.getElementById('csv-help');

  const setCsvHelpVisible = (visible) => {
    if (csvHelp) {
      csvHelp.style.display = visible ? 'flex' : 'none';
    }
    const helpLabel = visible ? 'Hide CSV Help' : 'CSV Help';
    if (toggleHelpButton) {
      toggleHelpButton.textContent = helpLabel;
    }
  };

  if (toggleHelpButton) {
    toggleHelpButton.addEventListener('click', () => {
      const isHidden = csvHelp && csvHelp.style.display === 'none';
      setCsvHelpVisible(isHidden || !csvHelp);
    });
  }

  if (csvHelpDismiss) {
    csvHelpDismiss.addEventListener('click', () => setCsvHelpVisible(false));
  }

  const headerCluster = document.querySelector('.header-cluster');
  const navExpandToggle = document.getElementById('nav-expand-toggle');
  const mainContent = document.querySelector('.main-content');
  const topBarNav = document.getElementById('top-bar-nav');
  const topBarAccount = document.querySelector('.top-bar-account');
  const draftDocks = Array.from(document.querySelectorAll('.draft-dock'));
  const placeDraftDocks = () => {
    if (!headerCluster || !mainContent) return;
    const wide = window.matchMedia('(min-width: 1101px)').matches;
    draftDocks.forEach((dock) => {
      if (wide && topBarNav && topBarAccount) {
        // Desktop: logo | scoring | manual | search | account (right edge)
        topBarNav.insertBefore(dock, topBarAccount);
      } else if (dock.parentElement !== mainContent.parentElement || dock.nextElementSibling !== mainContent) {
        mainContent.parentNode.insertBefore(dock, mainContent);
      }
    });
  };
  const setNavExpanded = (open) => {
    if (!headerCluster || !navExpandToggle) return;
    headerCluster.classList.toggle('is-nav-open', open);
    navExpandToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = navExpandToggle.querySelector('.nav-expand-label');
    if (label) label.textContent = open ? 'Close' : 'Menu';
  };
  if (navExpandToggle && headerCluster) {
    navExpandToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setNavExpanded(!headerCluster.classList.contains('is-nav-open'));
    });
    window.addEventListener('resize', () => {
      placeDraftDocks();
      if (window.matchMedia('(min-width: 1101px)').matches) setNavExpanded(false);
    });
  }
  placeDraftDocks();

  const addTierButton = document.getElementById('add-tier');
  if (addTierButton) {
    addTierButton.addEventListener('click', handleTierAction);
  }

  const deleteTierButton = document.getElementById('delete-tier');
  if (deleteTierButton) {
    deleteTierButton.addEventListener('click', handleTierAction);
  }

  if (draftModeToggle) {
    draftModeToggle.addEventListener('click', () => {
      setDraftMode(isManualDraftMode() ? 'sleeper' : 'manual');
    });
  }

  if (manualDraftBtn) {
    manualDraftBtn.addEventListener('click', () => {
      draftFromManualSearch();
    });
  }

  if (manualUndoBtn) {
    manualUndoBtn.addEventListener('click', () => {
      undoLastManualDraft();
    });
  }

  if (manualPlayerSearch) {
    manualPlayerSearch.addEventListener('input', () => {
      updateManualSearchSuggestions(manualPlayerSearch.value);
    });
    manualPlayerSearch.addEventListener('focus', () => {
      updateManualSearchSuggestions(manualPlayerSearch.value);
    });
    manualPlayerSearch.addEventListener('keydown', (event) => {
      handleManualSearchKeydown(event);
    });
  }

  if (manualSearchSuggestions) {
    manualSearchSuggestions.addEventListener('mousedown', (event) => {
      const suggestion = event.target.closest('[data-player-id]');
      if (!suggestion) {
        return;
      }
      event.preventDefault();
      draftPlayerById(suggestion.dataset.playerId);
    });
  }

  document.addEventListener('click', (event) => {
    const wrap = event.target.closest('.manual-search-wrap');
    if (!wrap) {
      hideManualSearchSuggestions();
    }
  });

  if (draftedPlayersList) {
    draftedPlayersList.addEventListener('click', handleDraftedListClick);
  }

  document.addEventListener('keydown', handleManualDraftHotkeys);

  const submitSleeperIdButton = document.getElementById('submit-sleeper-id');
  if (submitSleeperIdButton) {
    submitSleeperIdButton.addEventListener('click', async () => {
      collectSettings();
      saveState();
      
      // Start Sleeper sync if draft ID is provided
      const draftId = state.sleeperSync?.draftId;
      if (draftId) {
        state.draftMode = 'sleeper';
        state.sleeperSync.enabled = true;
        startSleeperSyncTimer();
        await syncSleeperDraft({ initiatedByUser: true });
      }
      
      render();
      showAppModal('Sleeper draft ID updated! Sync started.', { title: 'Sync started', type: 'success' });
    });
  }

  const addUnmatchedButton = document.getElementById('add-unmatched-to-board');
  if (addUnmatchedButton) {
    addUnmatchedButton.addEventListener('click', async () => {
      console.log('Add unmatched button clicked');
      const added = addUnmatchedPicksToBoard();
      if (!added) {
        state.liveDataStatus = 'No unmatched picks were added (they may already exist on your board).';
        saveState();
        render();
        return;
      }

      saveState();
      render();
      await syncSleeperDraft({ initiatedByUser: true });
      console.log('Added', added, 'unmatched picks');
    });
  }

  const resetBoardButton = document.getElementById('reset-board');
  if (resetBoardButton) {
    resetBoardButton.addEventListener('click', () => {
      if (confirm('Refresh the board? This clears drafted status (except manual picks) and rebuilds tiers from projected-point cliffs.')) {
        resetDraftBoard();
      }
    });
  }

  if (sleeperDraftIdInput) {
    sleeperDraftIdInput.addEventListener('blur', () => normalizeSleeperDraftIdInput(sleeperDraftIdInput));
    sleeperDraftIdInput.addEventListener('change', () => normalizeSleeperDraftIdInput(sleeperDraftIdInput));
    sleeperDraftIdInput.addEventListener('input', () => {
      // Auto-normalize on any input change
      const current = sleeperDraftIdInput.value;
      const normalized = extractSleeperDraftId(current);
      if (normalized && normalized !== current) {
        sleeperDraftIdInput.value = normalized;
      }
    });
    sleeperDraftIdInput.addEventListener('paste', () => {
      setTimeout(() => normalizeSleeperDraftIdInput(sleeperDraftIdInput), 0);
    });
    sleeperDraftIdInput.addEventListener('keypress', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        collectSettings();
        saveState();
        
        // Start Sleeper sync if draft ID is provided
        const draftId = state.sleeperSync?.draftId;
        if (draftId) {
          state.draftMode = 'sleeper';
          state.sleeperSync.enabled = true;
          startSleeperSyncTimer();
          await syncSleeperDraft({ initiatedByUser: true });
        }
        
        render();
        showAppModal('Sleeper draft ID updated! Sync started.', { title: 'Sync started', type: 'success' });
      }
    });
  }

  // Load API keys from localStorage (if user wants to add their own keys later)
  const savedApiConfig = localStorage.getItem('fantasy-api-config');
  if (savedApiConfig) {
    try {
      const config = JSON.parse(savedApiConfig);
      if (config.fantasyPros?.apiKey) {
        API_CONFIG.fantasyPros.apiKey = config.fantasyPros.apiKey;
      }
      if (config.moneyLine?.apiKey) {
        API_CONFIG.moneyLine.apiKey = config.moneyLine.apiKey;
      }
    } catch (error) {
      console.error('Failed to load API config:', error);
    }
  }

  // Add drag and drop event listeners after DOM is ready
  setTimeout(() => {
    const rankingsBodyEl = document.getElementById('rankings-body');
    if (rankingsBodyEl) {
      rankingsBodyEl.addEventListener('dragstart', handleDragStart);
      rankingsBodyEl.addEventListener('dragover', handleDragOver);
      rankingsBodyEl.addEventListener('drop', handleDrop);
      rankingsBodyEl.addEventListener('dragend', handleDragEnd);
      rankingsBodyEl.addEventListener('click', handleBoardClick);
    }
  }, 100);

  // Handle login/logout and initial data load.
  // Must finish loading saved rankings before rendering, or refresh can overwrite server data.
  (async () => {
    if (savedUsername && savedPassword) {
      currentUsername = savedUsername;
      currentPassword = savedPassword;
      updateAuthUi();
      await initializeBoardData({ loadServerState: true });
      return;
    }

    currentUsername = null;
    currentPassword = null;
    updateAuthUi();
    await initializeBoardData({ loadServerState: false });
  })();

  if (loginButton) {
    loginButton.addEventListener('click', () => {
      showUsernameModal();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      if (currentUsername) {
        await saveState({ awaitServer: true });
      }

      currentUsername = null;
      currentPassword = null;
      localStorage.removeItem('fantasy-draft-username');
      localStorage.removeItem('fantasy-draft-password');
      updateAuthUi();

      localStorage.removeItem(STORAGE_KEY);
      Object.assign(state, structuredClone(defaultState));
      autoFillPlayers();
      initializeBoardData({ loadServerState: false });

      console.log('[SERVER] Logged out, account rankings kept for next login');
    });
  }

  if (usernameSubmit) {
    usernameSubmit.addEventListener('click', async () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();
      if (!username || !password) {
        return;
      }

      currentUsername = username;
      currentPassword = password;
      localStorage.setItem('fantasy-draft-username', username);
      localStorage.setItem('fantasy-draft-password', password);
      updateAuthUi();
      hideUsernameModal();

      prepareAccountStateBeforeLiveLoad();
      const prefetched = await fetchAccountState();
      if (prefetched.source === 'auth-error') {
        return;
      }

      isHydratingAccountState = true;
      let loaded = false;
      try {
        await loadLiveRankings();
        loaded = await restoreAccountStateAfterLiveLoad(prefetched);
      } finally {
        isHydratingAccountState = false;
      }
      render();
      initSleeperSyncFromState();
      if (loaded) {
        showAppModal('Your saved rankings have been loaded!', { title: 'Rankings loaded', type: 'success' });
      }
    });
  }

  if (usernameCancel) {
    usernameCancel.addEventListener('click', () => {
      hideUsernameModal();
    });
  }

  if (saveRankingsButton) {
    saveRankingsButton.addEventListener('click', async () => {
      const saved = await saveCustomRankings();
      if (!saved) {
        return;
      }
      showAppModal('Your rankings have been saved and will sync across phones when you log in.', {
        title: 'Rankings saved',
        type: 'success'
      });
    });
  }

  const exportRankingsButton = document.getElementById('export-rankings');
  const exportRankingsNavButton = document.getElementById('export-rankings-nav');
  const handleExportClick = () => exportRankingsToCsv();
  if (exportRankingsButton) {
    exportRankingsButton.addEventListener('click', handleExportClick);
  }
  if (exportRankingsNavButton) {
    exportRankingsNavButton.addEventListener('click', handleExportClick);
  }

  // CSV upload functionality
  const csvUpload = document.getElementById('csv-upload');
  
  if (csvUpload && csvUploadLabel) {
    csvUpload.addEventListener('change', handleCsvUpload);
  }

  if (applySavedRankingsButton) {
    applySavedRankingsButton.addEventListener('click', () => {
      const before = state.players.map((player) => player.myRank).join('|');
      const changed = applySavedCustomRanksToPlayers(state.players);
      if (changed) {
        applyAutoTiering();
        render();
      }
    });
  }

  if (positionFilters) {
    positionFilters.addEventListener('click', handlePositionFilterClick);
  }

  const scoringFormatSelect = document.getElementById('scoring-format');
  if (scoringFormatSelect) {
    scoringFormatSelect.addEventListener('change', () => {
      collectSettings();
      saveState();
      render();
    });
  }
});

async function initializeBoardData({ loadServerState = false } = {}) {
  isHydratingAccountState = true;
  let prefetched = null;
  try {
    if (loadServerState) {
      prepareAccountStateBeforeLiveLoad();
      prefetched = await fetchAccountState();
    }
    await loadLiveRankings();
    if (loadServerState) {
      await restoreAccountStateAfterLiveLoad(prefetched);
    } else {
      restorePersistedRankings();
    }
  } finally {
    isHydratingAccountState = false;
  }
  render();
  initSleeperSyncFromState();
}

function findSavedPlayerByIdentity(savedByKey, savedList, livePlayer) {
  const key = getRankKey(livePlayer);
  const directMatch = savedByKey.get(key);
  if (directMatch) {
    return directMatch;
  }

  return savedList.find(
    (savedPlayer) =>
      namesMatch(savedPlayer.name, livePlayer.name) &&
      normalizeName(savedPlayer.position) === normalizeName(livePlayer.position)
  ) || null;
}

function mergeLivePlayersWithSavedPlayers(livePlayers, savedPlayers, savedCustomRanks = null) {
  const liveList = Array.isArray(livePlayers) ? livePlayers : [];
  const savedList = Array.isArray(savedPlayers) ? savedPlayers : [];
  const customRanks = savedCustomRanks?.ranks || {};
  const savedByKey = new Map();

  savedList.forEach((player) => {
    savedByKey.set(getRankKey(player), player);
  });

  const usedKeys = new Set();
  const merged = liveList.map((livePlayer) => {
    const key = getRankKey(livePlayer);
    usedKeys.add(key);
    const savedPlayer = findSavedPlayerByIdentity(savedByKey, savedList, livePlayer);
    if (!savedPlayer) {
      const snapshotRank = findSavedRankForPlayer(livePlayer, savedCustomRanks);
      if (Number.isFinite(snapshotRank) && snapshotRank > 0) {
        return {
          ...livePlayer,
          myRank: snapshotRank,
          manualRank: true
        };
      }
      return livePlayer;
    }

    const savedSnapshotRank = customRanks[key] ?? findSavedRankForPlayer(livePlayer, savedCustomRanks);
    const hasSavedSnapshotRank = Number.isFinite(savedSnapshotRank) && savedSnapshotRank > 0;
    const keepManualRank =
      (savedPlayer.manualRank === true && Number(savedPlayer.myRank) > 0) || hasSavedSnapshotRank;

    return {
      ...livePlayer,
      id: savedPlayer.id || livePlayer.id,
      // Only keep personal/CSV ranks. Otherwise keep the live ADP-based rank.
      myRank: keepManualRank
        ? (hasSavedSnapshotRank ? savedSnapshotRank : savedPlayer.myRank)
        : livePlayer.myRank,
      manualRank: keepManualRank,
      tier: savedPlayer.tier ?? livePlayer.tier,
      posRank: savedPlayer.posRank ?? livePlayer.posRank,
      drafted: Boolean(savedPlayer.drafted),
      draftedAt: savedPlayer.draftedAt ?? null,
      draftedSource: savedPlayer.draftedSource ?? null,
      roomPickNo: Number.isFinite(savedPlayer.roomPickNo) ? savedPlayer.roomPickNo : livePlayer.roomPickNo ?? null,
      projectedPoints: livePlayer.projectedPoints ?? savedPlayer.projectedPoints ?? null
    };
  });

  savedList.forEach((savedPlayer) => {
    const key = getRankKey(savedPlayer);
    if (!usedKeys.has(key)) {
      merged.push(savedPlayer);
    }
  });

  const hasSavedRankSnapshot = Object.values(customRanks).some((rank) => Number.isFinite(rank) && rank > 0);
  if (hasSavedRankSnapshot) {
    return merged;
  }

  return assignDefaultRanksByAdp(merged);
}

async function fetchAccountState() {
  let serverState = null;

  if (currentUsername && currentPassword) {
    try {
      const response = await fetch(
        `/api/user-state?username=${encodeURIComponent(currentUsername)}&password=${encodeURIComponent(currentPassword)}`
      );
      console.log('[SERVER] Fetch account state status:', response.status);
      if (response.ok) {
        const data = await response.json();
        if (data.state) {
          serverState = JSON.parse(data.state);
        }
      } else if (response.status === 401) {
        return { loadedState: null, serverState: null, source: 'auth-error' };
      }
    } catch (error) {
      console.warn('[SERVER] Failed to fetch account state:', error);
    }
  }

  const backupState = currentUsername
    ? parseStoredState(localStorage.getItem(getUserStorageKey(currentUsername)))
    : null;
  const sessionState = parseStoredState(localStorage.getItem(STORAGE_KEY));
  const loadedState = pickNewestState(serverState, backupState, sessionState);

  let source = 'none';
  if (loadedState && loadedState === serverState) {
    source = 'server';
  } else if (loadedState && loadedState === backupState) {
    source = 'backup';
  } else if (loadedState && loadedState === sessionState) {
    source = 'session';
  }

  return { loadedState, serverState, source };
}

async function restoreAccountStateAfterLiveLoad(prefetched = null) {
  const { loadedState, serverState, source } = prefetched || (await fetchAccountState());

  if (source === 'auth-error') {
    showAppModal('Invalid username or password', { title: 'Login failed', type: 'error' });
    return false;
  }

  if (!loadedState) {
    console.log('[STATE] No saved account state found');
    return restorePersistedRankings();
  }

  try {
    const livePlayersSnapshot = Array.isArray(state.players) ? [...state.players] : [];
    applyLoadedUserState(loadedState, livePlayersSnapshot);
    console.log('[STATE] Restored account state from', source, 'players:', state.players?.length);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistableState()));
    if (currentUsername) {
      localStorage.setItem(getUserStorageKey(currentUsername), JSON.stringify(getPersistableState()));
    }

    const serverTimestamp = getStateTimestamp(serverState);
    const loadedTimestamp = getStateTimestamp(loadedState);
    if (currentUsername && loadedTimestamp > serverTimestamp) {
      await saveState({ awaitServer: true, silent: true });
    }

    return true;
  } catch (error) {
    console.error('[STATE] Failed to restore account state:', error);
    showAppModal('Failed to load saved data.', { title: 'Load failed', type: 'error' });
    return false;
  }
}

async function verifyServerSavedRankings(expectedCount = 0) {
  if (!currentUsername || !currentPassword) {
    return false;
  }

  try {
    const response = await fetch(
      `/api/user-state?username=${encodeURIComponent(currentUsername)}&password=${encodeURIComponent(currentPassword)}`
    );
    if (!response.ok) {
      console.warn('[SERVER] Verify save failed - status:', response.status);
      return false;
    }

    const data = await response.json();
    if (!data.state) {
      console.warn('[SERVER] Verify save failed - empty server state');
      return false;
    }

    const loadedState = JSON.parse(data.state);
    const savedRanks = loadedState?.savedCustomRanks?.ranks || {};
    const savedCount = Object.values(savedRanks).filter((rank) => Number.isFinite(rank) && rank > 0).length;
    console.log('[SERVER] Verify save on server - savedCount:', savedCount, 'expected:', expectedCount);

    if (savedCount === 0) {
      return false;
    }

    if (expectedCount > 0 && savedCount < Math.min(expectedCount, 5)) {
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[SERVER] Verify save failed:', error);
    return false;
  }
}

function assignDefaultRanksByAdp(players) {
  const list = Array.isArray(players) ? [...players] : [];
  const manualPlayers = list.filter((player) => player.manualRank === true && Number(player.myRank) > 0);
  const autoPlayers = list
    .filter((player) => !(player.manualRank === true && Number(player.myRank) > 0))
    .sort((a, b) => {
      const adpDiff = getAverageAdpForSort(a) - getAverageAdpForSort(b);
      if (adpDiff !== 0) return adpDiff;
      return a.name.localeCompare(b.name);
    })
    .map((player, index) => ({
      ...player,
      myRank: index + 1,
      manualRank: false
    }));

  // Keep manual/CSV ranks as-is; auto players get dense ADP ranks.
  // Board order is handled by compareUserRankThenAdp (manual first, then ADP).
  return [...manualPlayers, ...autoPlayers];
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

function getPersistableState() {
  const persistable = structuredClone(state);
  if (persistable.sleeperSync && typeof persistable.sleeperSync === 'object') {
    persistable.sleeperSync.draftId = '';
    persistable.sleeperSync.enabled = false;
  }
  return persistable;
}

async function saveState({ awaitServer = false, silent = false } = {}) {
  if (isHydratingAccountState && !awaitServer) {
    return true;
  }

  console.log('[STATE] Saving state, user logged in:', !!currentUsername);
  state.updatedAt = Date.now();
  syncSavedCustomRanksSnapshot();
  const persistable = getPersistableState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  if (currentUsername) {
    localStorage.setItem(getUserStorageKey(currentUsername), JSON.stringify(persistable));
    if (isHydratingAccountState && !awaitServer) {
      return true;
    }
    const serverSave = saveStateToServer({ silent: silent || !awaitServer }).catch((error) => {
      console.error('[SERVER] Failed to save state:', error);
      return false;
    });
    if (awaitServer) {
      return await serverSave;
    }
  }
  return true;
}

async function saveStateToServer({ silent = false } = {}) {
  if (!currentUsername || !currentPassword) {
    console.log('[SERVER] Skipping server save - no credentials');
    return false;
  }

  console.log('[SERVER] Saving state to server for user:', currentUsername);
  console.log('[SERVER] Current page URL:', window.location.href);
  console.log('[SERVER] API URL:', '/api/user-state');
  console.log('[SERVER] Full API URL:', window.location.origin + '/api/user-state');
  console.log('[SERVER] State to save - players count:', state.players?.length);
  console.log('[SERVER] State to save - first player myRank:', state.players?.[0]?.myRank);
  
  try {
    const response = await fetch('/api/user-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUsername,
        password: currentPassword,
        state: JSON.stringify(getPersistableState())
      })
    });
    console.log('[SERVER] Save response status:', response.status, 'ok:', response.ok);
    if (response.ok) {
      console.log('[SERVER] State saved successfully');
      return true;
    }
    const errorText = await response.text();
    console.error('[SERVER] Save failed - status:', response.status, 'error:', errorText);
    if (!silent) {
      showAppModal(
        `Failed to save to server: ${response.status} - ${errorText}\n\nCurrent URL: ${window.location.href}`,
        { title: 'Save failed', type: 'error' }
      );
    }
    return false;
  } catch (error) {
    console.error('[SERVER] Failed to save state:', error);
    if (!silent) {
      showAppModal(
        `Failed to save to server: ${error.message}\n\nCurrent URL: ${window.location.href}`,
        { title: 'Save failed', type: 'error' }
      );
    }
    return false;
  }
}

function restorePersistedRankings() {
  if (!state.savedCustomRanks?.ranks || !state.players?.length) {
    return false;
  }
  return applySavedCustomRanksToPlayers(state.players);
}

function applyLoadedUserState(loadedState, livePlayersSnapshot) {
  console.log('[STATE] Applying loaded state, players count:', loadedState.players?.length);

  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, loadedState);

  state.players = mergeLivePlayersWithSavedPlayers(
    livePlayersSnapshot,
    state.players,
    state.savedCustomRanks
  );
  restorePersistedRankings();

  if (!state.sleeperSync || typeof state.sleeperSync !== 'object') {
    state.sleeperSync = structuredClone(defaultState.sleeperSync);
  }
  state.sleeperSync.draftId = '';
  state.sleeperSync.enabled = false;
  state.autoTiering = false;
}

async function loadStateFromServer() {
  if (!currentUsername || !currentPassword) {
    console.log('[SERVER] Skipping server load - no credentials');
    return false;
  }

  const prefetched = await fetchAccountState();
  return restoreAccountStateAfterLiveLoad(prefetched);
}

function showUsernameModal() {
  const modal = document.getElementById('username-modal');
  modal.style.display = 'flex';
}

function hideUsernameModal() {
  const modal = document.getElementById('username-modal');
  modal.style.display = 'none';
}

function showAppModal(message, { title = 'Notice', type = 'info' } = {}) {
  const modal = document.getElementById('notice-modal');
  const content = modal?.querySelector('.notice-modal');
  const icon = document.getElementById('notice-modal-icon');
  const titleElement = document.getElementById('notice-modal-title');
  const messageElement = document.getElementById('notice-modal-message');
  const closeButton = document.getElementById('notice-modal-close');

  if (!modal || !content || !icon || !titleElement || !messageElement || !closeButton) {
    console.error('[UI] Notice modal is unavailable:', message);
    return;
  }

  titleElement.textContent = title;
  messageElement.textContent = message;
  content.classList.toggle('is-error', type === 'error');
  icon.textContent = type === 'error' ? '!' : '✓';
  modal.style.display = 'flex';
  closeButton.focus();

  closeButton.onclick = () => {
    modal.style.display = 'none';
  };
  modal.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
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

function compareActiveRankingOrder(a, b) {
  const sortKey = state.sort?.key;

  // Prefer the sort key when it is a ranking metric; otherwise use the
  // ADP/expert source currently selected in the toolbar.
  if (sortKey === 'expertRank') {
    return compareExpertRank(a, b, 'asc');
  }

  if (
    sortKey === 'adp'
    || sortKey === 'averageAdp'
    || sortKey === 'espn'
    || sortKey === 'yahoo'
    || sortKey === 'rotoballer'
    || sortKey === 'ffpc'
  ) {
    const adpDiff = getAdpValueForSort(a) - getAdpValueForSort(b);
    if (adpDiff !== 0) {
      return adpDiff;
    }
    return a.name.localeCompare(b.name);
  }

  if (sortKey === 'myRank') {
    return compareUserRankThenAdp(a, b, 'asc');
  }

  // Non-ranking column sorts (name, team, diffs, etc.): keep Pos tied to the
  // selected ranking source so labels stay meaningful.
  if (state.adpSource === 'expert') {
    return compareExpertRank(a, b, 'asc');
  }

  if (state.adpSource && state.adpSource !== 'all') {
    const adpDiff = getAdpValueForSort(a) - getAdpValueForSort(b);
    if (adpDiff !== 0) {
      return adpDiff;
    }
    return a.name.localeCompare(b.name);
  }

  return compareUserRankThenAdp(a, b, 'asc');
}

function calculatePositionalRanks() {
  const players = state.players || [];
  const ordered = [...players].sort(compareActiveRankingOrder);
  const countsByPosition = Object.create(null);

  ordered.forEach((player) => {
    const position = normalizePositionCode(player.position) || player.position || '';
    if (!position) {
      player.posRank = 0;
      return;
    }
    countsByPosition[position] = (countsByPosition[position] || 0) + 1;
    player.posRank = countsByPosition[position];
  });
}

function formatPosRankDisplay(player) {
  const position = player?.position || '';
  const raw = player?.posRank;
  if (raw == null || raw === '' || raw === 0) {
    return position;
  }
  // Legacy / CSV values sometimes store the full label (e.g. "RB2").
  if (typeof raw === 'string' && /[A-Za-z]/.test(raw)) {
    return raw;
  }
  const rankNumber = Number(raw);
  if (!Number.isFinite(rankNumber) || rankNumber <= 0) {
    return position;
  }
  return `${position}${rankNumber}`;
}

function autoFillPlayers() {
  if (!state.players.length) {
    state.players = basePlayers.map((player) => ({
      ...player,
      myRank: 0,
      manualRank: false,
      posRank: 0,
      tier: 1,
      drafted: false,
      draftedSource: null,
      roomPickNo: null
    }));
  }

  // Never reshuffle personal/CSV ranks here. Default ranks follow ADP.
  state.players = assignDefaultRanksByAdp(state.players).map((player) => ({
    ...player,
    tier: Number(player.tier) > 0 ? player.tier : 1
  }));

  // Only invent opening tiers when nothing has been tiered yet.
  const hasTiers = state.players.some((player) => Number(player.tier) > 1);
  if (!hasTiers) {
    const ordered = [...state.players].sort(compareUserRankThenAdp);
    ordered.forEach((player, index) => {
      player.tier = getTierForRank(index, ordered.length);
    });
  }

  calculatePositionalRanks();
  syncDraftedPlayerIds();
  restorePersistedRankings();
}

function getTierCapacity(tierNumber) {
  const tier = Number(tierNumber);
  if (!Number.isFinite(tier) || tier <= 1) {
    return OPENING_TIER_SIZES[0];
  }
  if (tier <= OPENING_TIER_SIZES.length) {
    return Math.min(OPENING_TIER_SIZES[tier - 1], TIER_HARD_MAX);
  }
  return TIER_HARD_MAX;
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
  let remaining = Math.max(0, Number(totalPlayers) || 0);
  let tier = 1;

  while (remaining > 0) {
    const take = Math.min(getTierCapacity(tier), remaining);
    sizes.push(take);
    remaining -= take;
    tier += 1;
  }

  return sizes.length ? sizes : [1];
}

function getTierBreakValue(player, mode = 'default') {
  if (mode === 'expertRank') {
    const expert = Number(player?.expertRank);
    if (Number.isFinite(expert) && expert > 0) {
      return expert;
    }
  }

  const adp = getAverageAdp(player);
  if (Number.isFinite(adp) && adp > 0) {
    return adp;
  }

  const rank = Number(player?.myRank);
  if (Number.isFinite(rank) && rank > 0) {
    return rank;
  }

  const expert = Number(player?.expertRank);
  if (Number.isFinite(expert) && expert > 0) {
    return expert;
  }

  return Number.POSITIVE_INFINITY;
}

function getProjectedPoints(player) {
  const points = Number(player?.projectedPoints ?? player?.points);
  return Number.isFinite(points) && points > 0 ? points : null;
}

function mergeProjectedPoints(existing, incoming) {
  const next = Number(incoming);
  if (!Number.isFinite(next) || next <= 0) {
    return Number.isFinite(existing) && existing > 0 ? existing : null;
  }
  if (!Number.isFinite(existing) || existing <= 0) {
    return next;
  }
  return Math.max(existing, next);
}

function applyCsvPlayerFields(allPlayers, player, sourceFields = {}) {
  const nameKeys = getNameMatchKeys(player.name);
  if (!nameKeys.length) {
    return;
  }

  const points = mergeProjectedPoints(null, player.points);
  const existingKey = nameKeys.find((key) => allPlayers.has(key));

  if (!existingKey) {
    const entry = {
      name: player.name,
      position: player.position,
      team: player.team,
      espn: null,
      yahoo: null,
      rotoballer: null,
      ffpc: null,
      sosRank: player.sosRank || null,
      expertRank: player.expertRank || null,
      projectedPoints: points,
      ...sourceFields
    };
    // Register every alias key to the same object so Kenny/Kenneth merge.
    nameKeys.forEach((key) => allPlayers.set(key, entry));
    return;
  }

  const entry = allPlayers.get(existingKey);
  Object.assign(entry, sourceFields);
  if (player.sosRank) entry.sosRank = player.sosRank;
  if (player.expertRank) entry.expertRank = player.expertRank;
  entry.projectedPoints = mergeProjectedPoints(entry.projectedPoints, player.points);
  if (!entry.position && player.position) entry.position = player.position;
  if (!entry.team && player.team) entry.team = player.team;
  nameKeys.forEach((key) => allPlayers.set(key, entry));
}

function buildPositionalCliffByPlayerId(players) {
  const byPosition = {};
  (players || []).forEach((player) => {
    const position = normalizePositionCode(player.position);
    if (!byPosition[position]) {
      byPosition[position] = [];
    }
    byPosition[position].push(player);
  });

  const cliffGapById = new Map();

  Object.keys(byPosition).forEach((position) => {
    const ranked = byPosition[position]
      .filter((player) => getProjectedPoints(player) != null)
      .sort((a, b) => getProjectedPoints(b) - getProjectedPoints(a) || (a.myRank || 0) - (b.myRank || 0));

    if (ranked.length < 2) {
      return;
    }

    const gaps = [];
    for (let index = 0; index < ranked.length - 1; index += 1) {
      gaps.push(getProjectedPoints(ranked[index]) - getProjectedPoints(ranked[index + 1]));
    }

    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + ((gap - mean) ** 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);
    const minDrop = POSITIONAL_POINT_MIN_DROP[position] ?? 6;
    const threshold = Math.max(minDrop, mean + stdDev);

    for (let index = 0; index < ranked.length - 1; index += 1) {
      const gap = gaps[index];
      if (gap >= threshold) {
        cliffGapById.set(ranked[index].id, gap);
      }
    }
  });

  return cliffGapById;
}

function findBestTierBreakIndex(players, start, maxCount, cliffGapById = null) {
  const remaining = players.length - start;
  const cap = Math.min(maxCount, remaining);
  if (remaining <= cap) {
    return start + remaining;
  }

  const minSize = Math.min(TIER_MIN_SIZE, cap);
  const earliest = start + minSize;
  const latest = start + cap;
  let bestIndex = latest;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = earliest; index <= latest && index < players.length; index += 1) {
    const previous = players[index - 1];
    const adpGap = getTierBreakValue(players[index]) - getTierBreakValue(previous);
    const positionalGap = cliffGapById?.get(previous.id) || 0;
    const size = index - start;
    const score = adpGap
      + (POSITIONAL_CLIFF_WEIGHT * positionalGap)
      - (Math.abs(size - Math.min(TIER_TARGET_SIZE, cap)) * 0.2);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function splitPlayerGroupByBreaks(players, capacity, cliffGapById = null) {
  if (!players.length) {
    return [];
  }
  if (players.length <= capacity) {
    return [players];
  }

  const groups = [];
  let start = 0;
  while (start < players.length) {
    const remaining = players.length - start;
    if (remaining <= capacity) {
      groups.push(players.slice(start));
      break;
    }

    let cap = capacity;
    const leftover = remaining - capacity;
    if (leftover > 0 && leftover < TIER_MIN_SIZE) {
      cap = Math.max(TIER_MIN_SIZE, remaining - TIER_MIN_SIZE);
      cap = Math.min(cap, capacity);
    }

    const end = findBestTierBreakIndex(players, start, cap, cliffGapById);
    groups.push(players.slice(start, end));
    start = end;
  }

  return groups;
}

function compareExpertRank(a, b, direction = 'asc') {
  const aRank = Number(a?.expertRank);
  const bRank = Number(b?.expertRank);
  const aHas = Number.isFinite(aRank) && aRank > 0;
  const bHas = Number.isFinite(bRank) && bRank > 0;

  if (aHas !== bHas) {
    return aHas ? -1 : 1;
  }

  if (aHas && bHas && aRank !== bRank) {
    return direction === 'asc' ? aRank - bRank : bRank - aRank;
  }

  const adpDiff = getAverageAdpForSort(a) - getAverageAdpForSort(b);
  if (adpDiff !== 0) {
    return direction === 'asc' ? adpDiff : -adpDiff;
  }

  return a.name.localeCompare(b.name);
}

function applySmartTiering({ mode = null } = {}) {
  const tierMode = mode || (state.sort?.key === 'expertRank' ? 'expertRank' : 'default');
  const activePlayers = [...(state.players || [])]
    .filter((player) => !player.drafted)
    .sort((a, b) => {
      if (tierMode === 'expertRank') {
        return compareExpertRank(a, b, 'asc');
      }
      return compareUserRankThenAdp(a, b);
    });
  const draftedPlayers = (state.players || []).filter((player) => player.drafted);
  const cliffGapById = buildPositionalCliffByPlayerId(activePlayers);
  const tierById = new Map();

  let currentTier = 1;
  let playersInTier = 0;

  activePlayers.forEach((player, index) => {
    if (playersInTier > 0) {
      const previous = activePlayers[index - 1];
      const capacity = getTierCapacity(currentTier);
      const adpGap = getTierBreakValue(player, tierMode) - getTierBreakValue(previous, tierMode);
      const positionalGap = cliffGapById.get(previous.id) || 0;
      const forcedCut = playersInTier >= capacity;
      const cliffCut = playersInTier >= TIER_MIN_SIZE && positionalGap > 0;
      const softAdpCut = playersInTier >= TIER_TARGET_SIZE && adpGap >= ADP_SOFT_CUT_GAP;

      if (forcedCut || cliffCut || softAdpCut) {
        currentTier += 1;
        playersInTier = 0;
      }
    }

    tierById.set(player.id, currentTier);
    playersInTier += 1;
  });

  draftedPlayers.forEach((player) => {
    if (!tierById.has(player.id)) {
      const nearby = Number(player.tier);
      tierById.set(player.id, Number.isFinite(nearby) && nearby > 0 ? nearby : currentTier);
    }
  });

  state.players = state.players.map((player) => ({
    ...player,
    tier: tierById.get(player.id) ?? player.tier ?? 1
  }));
  state.autoTiering = false;
}

function rebalanceFloodedTiers() {
  const players = state.players || [];
  if (!players.length) {
    return false;
  }

  const usedTiers = [...new Set(players.map((player) => Number(player.tier)).filter((tier) => Number.isFinite(tier) && tier > 0))]
    .sort((a, b) => a - b);

  if (!usedTiers.length) {
    return false;
  }

  const cliffGapById = buildPositionalCliffByPlayerId(players.filter((player) => !player.drafted));
  const nextGroups = [];
  let changed = false;

  usedTiers.forEach((tier) => {
    const inTier = players.filter((player) => Number(player.tier) === tier);
    const activePlayers = inTier.filter((player) => !player.drafted).sort(comparePlayers);
    const draftedPlayers = inTier.filter((player) => player.drafted);
    const pieces = splitPlayerGroupByBreaks(activePlayers, getTierCapacity(tier), cliffGapById);

    if (pieces.length > 1) {
      changed = true;
    }

    if (!pieces.length && draftedPlayers.length) {
      nextGroups.push(draftedPlayers);
      return;
    }

    pieces.forEach((piece, index) => {
      nextGroups.push(index === 0 ? piece.concat(draftedPlayers) : piece);
    });
  });

  if (!changed) {
    return false;
  }

  nextGroups.forEach((group, index) => {
    const nextTier = index + 1;
    group.forEach((player) => {
      player.tier = nextTier;
    });
  });

  return true;
}

function collectSettings() {
  const scoringFormat = document.getElementById('scoring-format');
  const sleeperDraftId = document.getElementById('sleeper-draft-id');

  state.settings = {
    ...state.settings,
    scoringFormat: scoringFormat?.value || state.settings?.scoringFormat || 'standard'
  };
  
  // Update Sleeper draft ID
  if (sleeperDraftId) {
    const normalized = extractSleeperDraftId(sleeperDraftId.value);
    if (normalized && normalized !== state.sleeperSync.draftId) {
      state.sleeperSync.draftId = normalized;
      state.sleeperSync.lastPickCount = 0;
      state.sleeperSync.lastSyncAt = null;
      state.sleeperSync.adpShift = 0;
    }
  }
}

function scorePlayer(player, settings) {
  const positionWeight = { QB: 2.8, RB: 3.4, WR: 3.2, TE: 2.6 };
  const scoringMultiplier = settings.scoringFormat === 'ppr' ? 1.75 : settings.scoringFormat === 'half' ? 1.35 : 1;
  const lineupBoost = settings.rbSlots * 0.8 + settings.wrSlots * 0.7 + settings.teSlots * 0.6 + settings.qbSlots * 0.4;
  const benchBoost = settings.benchSpots * 0.35;
  const flexBoost = settings.flexSlots * 0.2;
  const superflexBoost = settings.superflex && player.position === 'QB' ? settings.flexSlots * 1.5 : 0;

  return player.baseValue * scoringMultiplier + positionWeight[player.position] + lineupBoost + benchBoost + flexBoost + superflexBoost;
}

function sortBy(key) {
  if (state.sort.key === key) {
    state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort.key = key;
    state.sort.direction = 'asc';
  }

  // Rebuild tiers to match the active ranking view.
  if (key === 'expertRank') {
    applySmartTiering({ mode: 'expertRank' });
  } else if (key === 'myRank') {
    applySmartTiering({ mode: 'default' });
  }

  render();
}

async function render() {
  populateSettingsFields();
  updateDraftModeControls();
  updateCompactMetricMode();
  renderPositionFilterChips();
  renderSortIndicators();
  renderRankingStatus();
  renderSummary();
  renderDataStatus();
  // Only apply auto-tiering if explicitly enabled (Refresh Board / first load)
  if (state.autoTiering) {
    applyAutoTiering();
  }
  // Keep Pos labels (RB1, RB2, ...) aligned with the active ranking order.
  calculatePositionalRanks();
  renderDraftBoard();
  renderDraftedPlayersSection();
  saveState({ silent: true });
}

function isExpertMetricSelected() {
  return state.adpSource === 'expert';
}

function updateCompactMetricMode() {
  const showExpert = isExpertMetricSelected();
  document.body.classList.toggle('compact-metric-expert', showExpert);
  document.body.classList.toggle('compact-metric-adp', !showExpert);
}

function populateSettingsFields() {
  const { settings } = state;
  
  const scoringFormat = document.getElementById('scoring-format');
  if (scoringFormat) scoringFormat.value = settings.scoringFormat;

  const adpSourceSelector = document.getElementById('adp-source');
  if (adpSourceSelector && typeof state.adpSource === 'string') {
    adpSourceSelector.value = state.adpSource;
  }

  updateAuthUi();
  
  const sleeperDraftId = document.getElementById('sleeper-draft-id');
  if (sleeperDraftId) {
    const draftId = state.sleeperSync?.draftId || '';
    // Only set if it's not "Ghost" (this shouldn't happen but acts as a safety check)
    if (draftId !== 'Ghost') {
      sleeperDraftId.value = draftId;
    } else {
      sleeperDraftId.value = '';
    }
  }

}

function renderSummary() {
  const settingsSummaryEl = document.getElementById('settings-summary');
  if (!settingsSummaryEl) return;
  const modeLabel = state.draftMode === 'sleeper' ? 'Sleeper sync' : 'Manual mode';
  const draftedCount = state.players.filter((player) => player.drafted).length;
  settingsSummaryEl.innerHTML = `
    <strong>Scoring:</strong> ${getScoringLabel(state.settings.scoringFormat)}
    &nbsp;•&nbsp; <strong>Tracking:</strong> ${modeLabel}
    &nbsp;•&nbsp; <strong>Drafted:</strong> ${draftedCount}
  `;
}

function renderDataStatus() {
  const dataStatusEl = document.getElementById('data-status');
  if (!dataStatusEl) return;
  const status = state.liveDataStatus || 'Starter board loaded. Use "Load live rankings" to pull public ranking data.';
  const sleeperStatus = state.sleeperSync?.lastResult
    ? `<br><strong>Sleeper sync:</strong> ${state.sleeperSync.lastResult}`
    : '';
  const hasDiagnostics = Number.isFinite(state.sleeperSync?.lastAttemptAt) || Number.isFinite(state.sleeperSync?.lastDurationMs);
  const customAdpPlayerCount = Object.keys(state.customAdpProfile?.players || {}).length;
  const sleeperDiagnostics = hasDiagnostics
    ? `<br><strong>Sleeper diagnostics:</strong> last attempt ${formatSleeperTime(state.sleeperSync.lastAttemptAt)} • duration ${formatSleeperDuration(state.sleeperSync.lastDurationMs)} • consecutive errors ${state.sleeperSync.consecutiveErrors || 0} • target cadence ${SLEEPER_SYNC_INTERVAL_MS}ms • room ADP shift ${formatSignedNumber(state.sleeperSync.adpShift)} picks • custom ADP model ${customAdpPlayerCount} players / ${state.customAdpProfile?.totalSamples || 0} samples`
    : '';
  dataStatusEl.innerHTML = `<strong>Live data:</strong> ${status}${sleeperStatus}${sleeperDiagnostics}`;
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
  if (exists) {
    state.ui.selectedTier = null;
  }
}

function compactPlayerTiers() {
  const usedTiers = [...new Set((state.players || []).map((player) => Number(player.tier)).filter((tier) => Number.isFinite(tier) && tier > 0))]
    .sort((a, b) => a - b);

  if (!usedTiers.length) {
    return;
  }

  const remap = new Map(usedTiers.map((tier, index) => [tier, index + 1]));
  state.players.forEach((player) => {
    const nextTier = remap.get(Number(player.tier));
    if (nextTier) {
      player.tier = nextTier;
    }
  });

  if (Number.isFinite(state.ui?.selectedTier)) {
    state.ui.selectedTier = remap.get(state.ui.selectedTier) ?? null;
  }
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

function isManualDraftMode() {
  return state.draftMode !== 'sleeper';
}

function setDraftMode(mode) {
  const nextMode = mode === 'sleeper' ? 'sleeper' : 'manual';
  const previousMode = state.draftMode;
  state.draftMode = nextMode;

  if (nextMode === 'manual') {
    stopSleeperSync(previousMode === 'sleeper' ? 'Switched to manual mode. Sleeper sync paused.' : state.sleeperSync?.lastResult);
    state.liveDataStatus = 'Manual mode: mark players off yourself as they are drafted.';
  } else {
    state.liveDataStatus = 'Sleeper sync mode: paste a draft ID and click Sync.';
  }

  updateDraftModeControls();
  saveState();
  render();
}

function updateDraftModeControls() {
  const manualControls = document.getElementById('manual-draft-controls');
  const sleeperControls = document.getElementById('sleeper-sync-controls');
  const draftModeToggle = document.getElementById('manual-mode-toggle');
  const modeHint = document.getElementById('draft-mode-hint');
  const isManual = isManualDraftMode();

  if (draftModeToggle) {
    draftModeToggle.classList.toggle('is-enabled', isManual);
    draftModeToggle.setAttribute('aria-pressed', isManual ? 'true' : 'false');
    draftModeToggle.title = isManual
      ? 'Manual mode on — click to switch to Sleeper sync'
      : 'Manual mode off — click to mark players yourself';
  }
  if (manualControls) {
    manualControls.hidden = !isManual;
  }
  if (sleeperControls) {
    sleeperControls.hidden = isManual;
  }
  document.body.classList.toggle('draft-dock-manual', isManual);
  document.body.classList.toggle('draft-dock-sleeper', !isManual);
  if (!isManual) {
    hideManualSearchSuggestions();
  }
  if (modeHint) {
    modeHint.textContent = isManual
      ? 'Manual mode: mark players off as they come off the board. Use search, the Mark button, or press Enter on a selected row.'
      : 'Sleeper sync mode: live picks are applied automatically. You can still undo or mark players manually if needed.';
  }
}

function getNextManualPickNo() {
  let maxPick = 0;
  state.players.forEach((player) => {
    if (player.drafted && Number.isFinite(player.roomPickNo)) {
      maxPick = Math.max(maxPick, player.roomPickNo);
    }
  });
  return maxPick + 1;
}

function markPlayerDrafted(player, { source = 'manual', pickNo = null } = {}) {
  if (!player || player.drafted) {
    return false;
  }

  player.drafted = true;
  player.draftedAt = Date.now();
  player.draftedSource = source === 'sync' ? 'sync' : 'manual';
  player.roomPickNo = Number.isFinite(pickNo) ? pickNo : getNextManualPickNo();
  syncDraftedPlayerIds();
  calculatePositionalRanks();
  return true;
}

function undraftPlayer(player) {
  if (!player || !player.drafted) {
    return false;
  }

  player.drafted = false;
  player.draftedAt = null;
  player.draftedSource = null;
  player.roomPickNo = null;
  syncDraftedPlayerIds();
  calculatePositionalRanks();
  return true;
}

function findAvailablePlayersByQuery(query) {
  const rawQuery = `${query || ''}`.trim();
  const normalizedQuery = normalizeName(rawQuery);
  if (!normalizedQuery) {
    return [];
  }

  const collapsedTokens = rawQuery
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v|vi)\b\.?/gi, '')
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean);

  return state.players
    .filter((player) => !player.drafted)
    .map((player) => {
      const normalizedName = normalizeName(player.name);
      const nameParts = `${player.name || ''}`
        .toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv|v|vi)\b\.?/gi, '')
        .split(/\s+/)
        .map((part) => part.replace(/[^a-z0-9]+/g, ''))
        .filter(Boolean);
      const lastName = nameParts[nameParts.length - 1] || '';
      const firstName = nameParts[0] || '';

      let score = 0;
      if (normalizedName === normalizedQuery) {
        score = 100;
      } else if (lastName === normalizedQuery || firstName === normalizedQuery) {
        score = 92;
      } else if (normalizedName.startsWith(normalizedQuery)) {
        score = 85;
      } else if (lastName.startsWith(normalizedQuery) || firstName.startsWith(normalizedQuery)) {
        score = 78;
      } else if (normalizedName.includes(normalizedQuery)) {
        score = 65;
      } else if (lastName.includes(normalizedQuery) || firstName.includes(normalizedQuery)) {
        score = 58;
      } else if (
        collapsedTokens.length > 1 &&
        collapsedTokens.every((token) => normalizedName.includes(token) || nameParts.some((part) => part.includes(token)))
      ) {
        score = 55;
      }

      return { player, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (a.player.myRank || 999) - (b.player.myRank || 999));
}

let manualSuggestionActiveIndex = -1;

function hideManualSearchSuggestions() {
  const suggestionsEl = document.getElementById('manual-search-suggestions');
  if (!suggestionsEl) {
    return;
  }
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = '';
  manualSuggestionActiveIndex = -1;
}

function updateManualSearchSuggestions(query, { activeIndex = 0 } = {}) {
  const suggestionsEl = document.getElementById('manual-search-suggestions');
  const searchInput = document.getElementById('manual-player-search');
  if (!suggestionsEl || !searchInput || !isManualDraftMode()) {
    hideManualSearchSuggestions();
    return;
  }

  const trimmed = `${query || ''}`.trim();
  if (trimmed.length < 1) {
    hideManualSearchSuggestions();
    return;
  }

  const matches = findAvailablePlayersByQuery(trimmed).slice(0, 8);
  if (!matches.length) {
    suggestionsEl.innerHTML = `<div class="manual-search-empty">No similar players found for "${trimmed}"</div>`;
    suggestionsEl.hidden = false;
    manualSuggestionActiveIndex = -1;
    return;
  }

  const safeIndex = Math.max(0, Math.min(activeIndex, matches.length - 1));
  manualSuggestionActiveIndex = safeIndex;

  suggestionsEl.innerHTML = matches.map(({ player }, index) => `
    <button
      type="button"
      class="manual-search-suggestion${index === safeIndex ? ' is-active' : ''}"
      role="option"
      aria-selected="${index === safeIndex ? 'true' : 'false'}"
      data-player-id="${player.id}"
      data-suggestion-index="${index}"
    >
      <span class="manual-search-suggestion-name">${player.name}</span>
      <span class="manual-search-suggestion-meta">${player.position} · ${player.team}${player.myRank ? ` · #${player.myRank}` : ''}</span>
    </button>
  `).join('');
  suggestionsEl.hidden = false;
}

function setManualSuggestionActive(index) {
  const suggestionsEl = document.getElementById('manual-search-suggestions');
  if (!suggestionsEl || suggestionsEl.hidden) {
    return;
  }

  const options = [...suggestionsEl.querySelectorAll('[data-player-id]')];
  if (!options.length) {
    manualSuggestionActiveIndex = -1;
    return;
  }

  const nextIndex = ((index % options.length) + options.length) % options.length;
  manualSuggestionActiveIndex = nextIndex;
  options.forEach((option, optionIndex) => {
    const isActive = optionIndex === nextIndex;
    option.classList.toggle('is-active', isActive);
    option.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  options[nextIndex].scrollIntoView({ block: 'nearest' });
}

function handleManualSearchKeydown(event) {
  const suggestionsEl = document.getElementById('manual-search-suggestions');
  const options = suggestionsEl && !suggestionsEl.hidden
    ? [...suggestionsEl.querySelectorAll('[data-player-id]')]
    : [];

  if (event.key === 'ArrowDown' && options.length) {
    event.preventDefault();
    setManualSuggestionActive(manualSuggestionActiveIndex + 1);
    return;
  }

  if (event.key === 'ArrowUp' && options.length) {
    event.preventDefault();
    setManualSuggestionActive(manualSuggestionActiveIndex <= 0 ? options.length - 1 : manualSuggestionActiveIndex - 1);
    return;
  }

  if (event.key === 'Escape') {
    hideManualSearchSuggestions();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    if (options.length && manualSuggestionActiveIndex >= 0) {
      const active = options[manualSuggestionActiveIndex];
      if (active?.dataset.playerId) {
        draftPlayerById(active.dataset.playerId);
        return;
      }
    }
    draftFromManualSearch();
  }
}

function draftPlayerById(playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const searchInput = document.getElementById('manual-player-search');

  if (!player || player.drafted) {
    showAppModal('That player could not be drafted. They may already be marked off.', {
      title: 'Player not available',
      type: 'error'
    });
    hideManualSearchSuggestions();
    return;
  }

  markPlayerDrafted(player);
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  hideManualSearchSuggestions();
  state.ui.selectedPlayerId = null;
  state.liveDataStatus = `Marked ${player.name} as drafted (pick ${player.roomPickNo}).`;
  saveState();
  render();
}

function draftFromManualSearch() {
  const searchInput = document.getElementById('manual-player-search');
  const query = searchInput?.value?.trim() || '';
  if (!query) {
    const selected = getSelectedPlayer();
    if (selected && !selected.drafted) {
      draftPlayerById(selected.id);
      return;
    }
    showAppModal('Type a player name to search, or select a row and press Draft / Enter.', {
      title: 'No player selected',
      type: 'info'
    });
    return;
  }

  const matches = findAvailablePlayersByQuery(query);
  if (!matches.length) {
    showAppModal(`No available player matched "${query}". Check the spelling or try a last name.`, {
      title: 'Player not found',
      type: 'error'
    });
    updateManualSearchSuggestions(query);
    return;
  }

  draftPlayerById(matches[0].player.id);
}

function undoLastManualDraft() {
  const lastManual = [...state.players]
    .filter((player) => player.drafted && player.draftedSource === 'manual')
    .sort((a, b) => (b.draftedAt || 0) - (a.draftedAt || 0))[0];

  if (!lastManual) {
    state.liveDataStatus = 'No manual picks to undo.';
    render();
    return;
  }

  undraftPlayer(lastManual);
  state.liveDataStatus = `Undid manual pick: ${lastManual.name}.`;
  saveState();
  render();
}

function handleManualDraftHotkeys(event) {
  const target = event.target;
  const tagName = target?.tagName?.toLowerCase();
  const isTypingField = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;

  if (event.key === 'Enter' && !isTypingField) {
    const selected = getSelectedPlayer();
    if (selected && !selected.drafted) {
      event.preventDefault();
      markPlayerDrafted(selected);
      state.ui.selectedPlayerId = null;
      state.liveDataStatus = `Marked ${selected.name} as drafted.`;
      saveState();
      render();
    }
    return;
  }

  if ((event.key === 'z' || event.key === 'Z') && (event.ctrlKey || event.metaKey) && !isTypingField) {
    event.preventDefault();
    undoLastManualDraft();
  }
}

function handleDraftedListClick(event) {
  const actionButton = event.target.closest('button[data-action="undraft"]');
  if (!actionButton) {
    return;
  }

  const player = state.players.find((entry) => entry.id === actionButton.dataset.playerId);
  if (!player) {
    return;
  }

  undraftPlayer(player);
  state.liveDataStatus = `Returned ${player.name} to the board.`;
  saveState();
  render();
}

function renderDraftedPlayersSection() {
  const listEl = document.getElementById('drafted-players-list');
  const countEl = document.getElementById('drafted-count');
  if (!listEl) {
    return;
  }

  const draftedPlayers = [...state.players]
    .filter((player) => player.drafted)
    .sort((a, b) => {
      const aPick = Number.isFinite(a.roomPickNo) ? a.roomPickNo : 0;
      const bPick = Number.isFinite(b.roomPickNo) ? b.roomPickNo : 0;
      if (aPick !== bPick) {
        return bPick - aPick;
      }
      return (b.draftedAt || 0) - (a.draftedAt || 0);
    });

  if (countEl) {
    countEl.textContent = String(draftedPlayers.length);
  }

  if (!draftedPlayers.length) {
    listEl.innerHTML = '<div class="drafted-empty">No players marked drafted yet.</div>';
    return;
  }

  listEl.innerHTML = draftedPlayers.map((player) => {
    const sourceClass = player.draftedSource === 'manual' ? 'is-manual' : '';
    const sourceLabel = player.draftedSource === 'sync' ? 'Sync' : 'Manual';
    const pickLabel = Number.isFinite(player.roomPickNo) ? `Pick ${player.roomPickNo}` : 'No pick #';
    return `
      <div class="drafted-chip" data-player-id="${player.id}">
        <span>${player.name}</span>
        <span class="drafted-chip-meta">${player.position} · ${pickLabel}</span>
        <span class="drafted-chip-source ${sourceClass}">${sourceLabel}</span>
        <button type="button" class="drafted-chip-undo" data-action="undraft" data-player-id="${player.id}">Undo</button>
      </div>
    `;
  }).join('');
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

function normalizeSleeperDraftIdInput(inputElement) {
  const extracted = extractSleeperDraftId(inputElement.value);
  if (extracted) {
    inputElement.value = extracted;
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
  
  // Check name matching with suffix handling
  const playerNames = getNameMatchKeys(player.name);
  const recordNames = getNameMatchKeys(record.name);
  const nameMatches = playerNames.some(pn => recordNames.includes(pn));

  if (record.team && record.position) {
    return nameMatches && sameTeam && samePosition;
  }
  if (record.team) {
    return nameMatches && sameTeam;
  }
  if (record.position) {
    return nameMatches && samePosition;
  }

  return nameMatches;
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

function calculateSleeperAdp() {
  // Calculate Sleeper ADP from all saved draft picks
  const picksByPlayer = {};
  
  if (!state.sleeperSync?.allDraftPicks || !Array.isArray(state.sleeperSync.allDraftPicks)) {
    return {};
  }
  
  state.sleeperSync.allDraftPicks.forEach(pick => {
    // Store multiple normalized name keys for each pick
    const nameKeys = getNameMatchKeys(pick.name);
    nameKeys.forEach(key => {
      if (!picksByPlayer[key]) {
        picksByPlayer[key] = { totalPickNo: 0, count: 0 };
      }
      picksByPlayer[key].totalPickNo += pick.pickNo;
      picksByPlayer[key].count += 1;
    });
  });
  
  const sleeperAdpByPlayer = {};
  Object.keys(picksByPlayer).forEach(key => {
    const data = picksByPlayer[key];
    sleeperAdpByPlayer[key] = data.totalPickNo / data.count;
  });
  
  return sleeperAdpByPlayer;
}

function recalculateRoomAdpShift() {
  const diffs = (state.players || [])
    .filter((player) => player.draftedSource === 'sync' && Number.isFinite(player.roomPickNo) && Number.isFinite(getAverageAdp(player)))
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
    
    // Save all draft picks for Sleeper ADP calculation
    state.sleeperSync.allDraftPicks = pickedLookup.allRecords || [];
    
    const { newlyMarked, newlyCleared, matchedTotal, unmatchedRecords } = syncDraftedPlayersFromLookup(pickedLookup);
    recalculateRoomAdpShift();
    if (newlyMarked > 0 || newlyCleared > 0) {
      syncDraftedPlayerIds();
      calculatePositionalRanks();
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
    
    // Update Sleeper ADP for all players based on saved draft picks
    const sleeperAdpByPlayer = calculateSleeperAdp();
    (state.players || []).forEach(player => {
      const playerNames = getNameMatchKeys(player.name);
      // Check if any of the player's name keys match Sleeper ADP data
      const matchingKey = playerNames.find(nameKey => sleeperAdpByPlayer[nameKey]);
      if (matchingKey) {
        player.sleeperAdp = sleeperAdpByPlayer[matchingKey];
      }
    });
    
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
  if (state.draftMode !== 'sleeper' || !state.sleeperSync?.enabled || !state.sleeperSync?.draftId) {
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
    const rank = Number(player.myRank);
    if (player.manualRank === true && Number.isFinite(rank) && rank > 0) {
      ranks[getRankKey(player)] = rank;
    }
  }

  return {
    savedAt: Date.now(),
    scoringFormat: state.settings.scoringFormat,
    count: Object.keys(ranks).length,
    ranks
  };
}

async function saveCustomRankings() {
  if (!isUserLoggedIn()) {
    showAppModal('Log in first so your rankings sync across phones and browsers.', {
      title: 'Login required',
      type: 'error'
    });
    return false;
  }

  state.savedCustomRanks = buildSavedCustomRanks();
  if (!state.savedCustomRanks.count) {
    showAppModal('No custom rankings to save yet. Upload a CSV or drag players to reorder first.', {
      title: 'Nothing to save',
      type: 'error'
    });
    return false;
  }

  for (const player of state.players) {
    if (Number.isFinite(Number(player.myRank)) && Number(player.myRank) > 0) {
      player.manualRank = true;
    }
  }
  state.liveDataStatus = `Saved custom rankings for ${state.savedCustomRanks.count} players.`;
  const saved = await saveState({ awaitServer: true });
  if (!saved) {
    return false;
  }

  const verified = await verifyServerSavedRankings(state.savedCustomRanks.count);
  if (!verified) {
    showAppModal(
      'The server did not confirm your save. Check that Render has a persistent disk at /var/data and DB_PATH=/var/data/adp_profile.db, then try again.',
      { title: 'Save not confirmed', type: 'error' }
    );
    return false;
  }

  render();
  return true;
}

function applySavedCustomRanksToPlayers(players) {
  const saved = state.savedCustomRanks;
  if (!saved?.ranks || !players.length) {
    return false;
  }

  let applied = 0;
  const updatedPlayers = players.map((player) => {
    const rank = saved.ranks[getRankKey(player)] ?? findSavedRankForPlayer(player, saved);
    if (!Number.isFinite(rank) || rank <= 0) {
      return player;
    }

    applied += 1;
    return {
      ...player,
      myRank: rank,
      manualRank: true
    };
  });

  if (!applied) {
    return false;
  }

  updatedPlayers.sort((a, b) => {
    const aHasRank = a.manualRank === true && Number(a.myRank) > 0;
    const bHasRank = b.manualRank === true && Number(b.myRank) > 0;
    if (!aHasRank && bHasRank) return 1;
    if (aHasRank && !bHasRank) return -1;
    if (!aHasRank && !bHasRank) {
      const adpDiff = getAverageAdpForSort(a) - getAverageAdpForSort(b);
      if (adpDiff !== 0) return adpDiff;
      return a.name.localeCompare(b.name);
    }
    return a.myRank - b.myRank || a.name.localeCompare(b.name);
  });

  state.players = updatedPlayers;
  calculatePositionalRanks();
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

async function fetchLocalRankingsApi(endpoint, label) {
  const embedded = typeof window !== 'undefined' ? window.EMBEDDED_RANKINGS?.[endpoint] : null;
  if (embedded?.players) {
    console.log(`[CSV] Using embedded ${label}`);
    return embedded;
  }

  try {
    return await fetchJsonWithProxyFallback(`/api/${endpoint}`, label);
  } catch (error) {
    if (embedded?.players) {
      console.log(`[CSV] Falling back to embedded ${label} after API failure`);
      return embedded;
    }
    throw error;
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
    console.log(`[FETCH] Direct fetch failed for ${errorLabel}:`, error?.message || error);
    
    // Try local server proxy first (since we're running python server.py)
    const localProxyUrl = `/proxy?url=${encodeURIComponent(url)}`;
    console.log(`[FETCH] Trying local server proxy for: ${errorLabel}`);
    try {
      const localResponse = await fetchWithTimeout(localProxyUrl, {}, timeoutMs);
      console.log(`[FETCH] Local proxy response status: ${localResponse.status}`);
      if (!localResponse.ok) {
        throw new Error(`Local proxy returned ${localResponse.status}`);
      }
      const data = await localResponse.json();
      console.log(`[FETCH] Local proxy success for: ${errorLabel}`);
      return data;
    } catch (localError) {
      console.log(`[FETCH] Local proxy failed:`, localError?.message || localError);
    }
    
    // Try multiple CORS proxies as fallbacks
    const proxies = [
      { name: 'corsproxy.io', url: `https://corsproxy.io/?${encodeURIComponent(url)}` },
      { name: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
      { name: 'thingproxy', url: `https://thingproxy.freeboard.io/fetch/${url}` }
    ];

    for (const proxy of proxies) {
      console.log(`[FETCH] Trying ${proxy.name} for: ${errorLabel}`);
      try {
        const proxyResponse = await fetchWithTimeout(proxy.url, {}, timeoutMs);
        console.log(`[FETCH] ${proxy.name} response status: ${proxyResponse.status}`);
        if (!proxyResponse.ok) {
          throw new Error(`${proxy.name} returned ${proxyResponse.status}`);
        }
        const data = await proxyResponse.json();
        console.log(`[FETCH] ${proxy.name} success for: ${errorLabel}`);
        return data;
      } catch (proxyError) {
        console.log(`[FETCH] ${proxy.name} failed:`, proxyError?.message || proxyError);
        continue;
      }
    }

    console.log(`[FETCH] All CORS proxies failed`);
    if (error?.name === 'AbortError') {
      throw new Error(`${errorLabel} timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`${errorLabel} unavailable. All CORS proxies failed. Try using a local server (python server.py).`);
  }
}

function getAverageAdp(player) {
  const values = [];
  if (player.espn !== null && player.espn !== undefined) {
    values.push(player.espn);
  }
  if (player.yahoo !== null && player.yahoo !== undefined) {
    values.push(player.yahoo);
  }
  if (player.sleeperAdp !== null && player.sleeperAdp !== undefined) {
    values.push(player.sleeperAdp);
  }
  if (player.rotoballer !== null && player.rotoballer !== undefined) {
    values.push(player.rotoballer);
  }
  if (player.ffpc !== null && player.ffpc !== undefined) {
    values.push(player.ffpc);
  }
  if (values.length === 0) return null;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function getAverageAdpForSort(player) {
  const adp = getAverageAdp(player);
  return Number.isFinite(adp) ? adp : Number.POSITIVE_INFINITY;
}

function getDraftAdjustedAdp(player) {
  if (Number.isFinite(player?.roomPickNo)) {
    return player.roomPickNo;
  }

  // Return true average of ESPN + Yahoo + Sleeper (no shift)
  const average = getAverageAdp(player);
  return Number.isFinite(average) ? average : 999;
}

function renderPositionFilterChips() {
  const positionFiltersEl = document.getElementById('position-filters');
  if (!positionFiltersEl) return;
  
  positionFiltersEl.querySelectorAll('button[data-filter]').forEach((button) => {
    const isActive = button.dataset.filter === state.positionFilter;
    button.classList.toggle('is-active', isActive);
  });
}

function renderSortIndicators() {
  // Average ADP is represented by the visible ADP column as well.
  const activeKey = state.sort.key === 'averageAdp' ? 'adp' : state.sort.key;
  document.querySelectorAll('th[data-key]').forEach((th) => {
    const isActive = th.dataset.key === activeKey;
    th.classList.toggle('is-sorted', isActive);
    th.classList.toggle('asc', isActive && state.sort.direction === 'asc');
    th.setAttribute('aria-sort', isActive
      ? (state.sort.direction === 'asc' ? 'ascending' : 'descending')
      : 'none');
  });
}

function renderRankingStatus() {
  const rankingStatus = document.getElementById('ranking-status');
  if (!rankingStatus) return;
  
  let statusText = '';
  
  // Show what's being sorted by
  const sortLabels = {
    myRank: 'My Rankings',
    adp: 'ADP',
    expertRank: 'Expert Ranking',
    adpDiff: 'ADP Difference',
    sosRank: 'Strength of Schedule',
    averageAdp: 'Average ADP',
    player: 'Player Name',
    position: 'Position',
    team: 'Team'
  };
  
  const currentSort = sortLabels[state.sort.key] || state.sort.key;
  const direction = state.sort.direction === 'asc' ? '↑' : '↓';
  statusText = `Sort: ${currentSort} ${direction}`;
  
  // Show which ADP / expert metric is selected
  const adpSourceLabels = {
    all: 'All ADP',
    espn: 'ESPN',
    yahoo: 'Yahoo',
    rotoballer: 'Underdog',
    ffpc: 'FFPC',
    average: 'Average ADP',
    expert: 'Expert'
  };
  const adpSourceLabel = adpSourceLabels[state.adpSource] || 'All ADP';
  statusText += ` | Metric: ${adpSourceLabel}`;
  statusText += ` | Mode: ${state.draftMode === 'sleeper' ? 'Sleeper' : 'Manual'}`;
  
  // Show if custom rankings are applied
  const hasCustomRanks = state.players.some(p => p.customRank !== undefined);
  if (hasCustomRanks) {
    statusText += ' | Custom: Applied';
  }
  
  rankingStatus.textContent = statusText;
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
  applySmartTiering();
}

async function fetchFantasyProsRankings(season) {
  console.log('[FantasyPros] Fetching from server endpoint');
  
  try {
    // Use server-side endpoint to bypass CORS
    const response = await fetch(`/api/fantasypros?season=${season}`);
    console.log('[FantasyPros] Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[FantasyPros] Rankings loaded successfully, players:', data.players?.length || 0);
      console.log('[FantasyPros] Sample data:', data.players?.[0]);
      return data;
    }
    
    console.error('[FantasyPros] Failed to load rankings:', response.status, response.statusText);
    return null;
  } catch (error) {
    console.error('[FantasyPros] Error fetching rankings:', error);
    return null;
  }
}

async function fetchSleeperProjections(season) {
  console.log('[Sleeper] Fetching projections for season:', season);
  try {
    const response = await fetch(`${API_CONFIG.sleeper.baseUrl}/projections/nfl/${season}?season_type=regular`);
    console.log('[Sleeper] Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[Sleeper] Projections loaded successfully, type:', typeof data);
      console.log('[Sleeper] Sample data:', Object.values(data)?.[0]);
      return data;
    }
    console.error('[Sleeper] Failed to load projections:', response.status, response.statusText);
    return null;
  } catch (error) {
    console.error('[Sleeper] Error fetching projections:', error);
    return null;
  }
}

async function fetchMoneyLineProps() {
  // Skip if no API key
  const apiKey = API_CONFIG.moneyLine.apiKey;
  if (!apiKey) {
    console.log('[MoneyLine] No API key, skipping Vegas props');
    return null;
  }

  try {
    const response = await fetch(`${API_CONFIG.moneyLine.baseUrl}/v1/player-props?league=nfl`, {
      headers: { 'x-api-key': apiKey }
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[MoneyLine] Props loaded successfully');
      return data;
    }
    console.error('[MoneyLine] Failed to load props:', response.status);
    return null;
  } catch (error) {
    console.error('[MoneyLine] Error fetching props:', error);
    return null;
  }
}

async function fetchTheOddsData() {
  console.log('[TheOdds] Fetching from server endpoint');
  try {
    // Use server-side endpoint to bypass CORS
    const response = await fetch('/api/theodds');
    console.log('[TheOdds] Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[TheOdds] Data loaded successfully');
      console.log('[TheOdds] Sample data:', data[0]);
      return data;
    }
    console.error('[TheOdds] Failed to load data:', response.status, response.statusText);
    return null;
  } catch (error) {
    console.error('[TheOdds] Error fetching data:', error);
    return null;
  }
}

async function fetchFantasyNerdsProjections() {
  console.log('[FantasyNerds] Disabled - not needed for now');
  return null;
}

async function fetchFantasyNerdsProjections() {
  console.log('[FantasyNerds] Fetching from server endpoint');
  try {
    // Use server-side endpoint to bypass CORS
    const response = await fetch('/api/fantasynerds');
    console.log('[FantasyNerds] Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[FantasyNerds] Projections loaded successfully, data keys:', Object.keys(data));
      console.log('[FantasyNerds] Full data structure:', JSON.stringify(data, null, 2));
      
      // Check if projections is an array
      if (data.projections && Array.isArray(data.projections)) {
        console.log('[FantasyNerds] Projections is array, length:', data.projections.length);
        console.log('[FantasyNerds] First projection:', data.projections[0]);
      } else {
        console.log('[FantasyNerds] Projections is not an array or is undefined');
      }
      
      return data;
    }
    console.error('[FantasyNerds] Failed to load projections:', response.status, response.statusText);
    return null;
  } catch (error) {
    console.error('[FantasyNerds] Error fetching projections:', error);
    return null;
  }
}

async function loadLiveRankings() {
  state.liveDataStatus = `Loading rankings from local CSV files...`;
  render();

  try {
    // Fetch local CSV rankings for ESPN, Yahoo, Underdog, and FFPC
    const [espnResponse, yahooResponse, rotoballerResponse, ffpcResponse] = await Promise.all([
      fetchLocalRankingsApi('espn', 'ESPN rankings'),
      fetchLocalRankingsApi('yahoo', 'Yahoo rankings'),
      fetchLocalRankingsApi('rotoballer', 'Underdog rankings'),
      fetchLocalRankingsApi('ffpc', 'FFPC rankings')
    ]);

    // Don't fetch Ghost rankings here - they will be applied after login
    let ghostResponse = null;

    // Create a map of ESPN rankings by normalized name for quick lookup
    const espnMap = new Map();
    if (espnResponse && espnResponse.players) {
      espnResponse.players.forEach(espnPlayer => {
        const normalizedName = normalizeName(espnPlayer.name);
        espnMap.set(normalizedName, espnPlayer.adpESPN || espnPlayer.rank);
      });
    }

    // Create a map of Yahoo rankings by normalized name for quick lookup
    const yahooMap = new Map();
    if (yahooResponse && yahooResponse.players) {
      yahooResponse.players.forEach(yahooPlayer => {
        const normalizedName = normalizeName(yahooPlayer.name);
        yahooMap.set(normalizedName, yahooPlayer.adpYahoo || yahooPlayer.rank);
      });
    }

    // Create a map of Underdog rankings by normalized name for quick lookup
    const rotoballerMap = new Map();
    if (rotoballerResponse && rotoballerResponse.players) {
      rotoballerResponse.players.forEach(rbPlayer => {
        const normalizedName = normalizeName(rbPlayer.name);
        rotoballerMap.set(normalizedName, rbPlayer.adpUnderdog || rbPlayer.rank);
      });
    }

    // Create a map of FFPC rankings by normalized name for quick lookup
    const ffpcMap = new Map();
    if (ffpcResponse && ffpcResponse.players) {
      ffpcResponse.players.forEach(ffpcPlayer => {
        const normalizedName = normalizeName(ffpcPlayer.name);
        ffpcMap.set(normalizedName, ffpcPlayer.adpFFPC || ffpcPlayer.rank);
      });
    }

    // Create a combined player list from all CSV sources
    const allPlayers = new Map();
    
    // Add players from ESPN data
    if (espnResponse && espnResponse.players) {
      espnResponse.players.forEach(player => {
        applyCsvPlayerFields(allPlayers, player, {
          espn: player.adpESPN || player.rank
        });
      });
    }

    // Add Yahoo data
    if (yahooResponse && yahooResponse.players) {
      yahooResponse.players.forEach(player => {
        applyCsvPlayerFields(allPlayers, player, {
          yahoo: player.adpYahoo || player.rank
        });
      });
    }

    // Add Underdog data
    if (rotoballerResponse && rotoballerResponse.players) {
      rotoballerResponse.players.forEach(player => {
        applyCsvPlayerFields(allPlayers, player, {
          rotoballer: player.adpUnderdog || player.rank
        });
      });
    }

    // Add FFPC data
    if (ffpcResponse && ffpcResponse.players) {
      ffpcResponse.players.forEach(player => {
        applyCsvPlayerFields(allPlayers, player, {
          ffpc: player.adpFFPC || player.rank
        });
      });
    }

    // Convert to array and filter players that have at least one ranking
    const mergedPlayers = Array.from(new Set(allPlayers.values()))
      .filter(player => player.espn || player.yahoo || player.rotoballer || player.ffpc)
      .map((player, index) => {
        // Use ESPN as primary if available, otherwise Yahoo, otherwise first available
        const primaryAdp = player.espn || player.yahoo || player.rotoballer || player.ffpc || 100;
        
        // Check if this player already exists in state (to preserve custom rankings, drafted status, etc.)
        const existingPlayer = state.players.find(p => 
          namesMatch(p.name, player.name) && 
          normalizeName(p.position) === normalizeName(player.position) &&
          normalizeName(p.team) === normalizeName(player.team)
        );
        
        // Build the player object, starting with CSV data
        const mergedPlayer = {
          id: `live-${normalizeName(player.name)}-${normalizeName(player.position)}-${normalizeName(player.team)}`,
          rankKey: getRankKey(player),
          name: player.name,
          position: normalizePositionCode(player.position),
          team: player.team,
          espn: player.espn || null,
          yahoo: player.yahoo || null,
          sleeperAdp: null,
          rotoballer: player.rotoballer || null,
          ffpc: player.ffpc || null,
          sosRank: player.sosRank || null,
          expertRank: player.expertRank || null,
          projectedPoints: Number.isFinite(player.projectedPoints) ? player.projectedPoints : null,
          baseValue: Math.max(70, 100 - primaryAdp * 4),
          tier: 1,
          myRank: 0,
          manualRank: false,
          posRank: 0,
          drafted: false,
          draftedAt: null,
          draftedSource: null,
          roomPickNo: null
        };
        
        // If existing player found, preserve draft status and personal ranks only
        if (existingPlayer) {
          mergedPlayer.tier = existingPlayer.tier ?? 1;
          if (existingPlayer.manualRank === true && Number(existingPlayer.myRank) > 0) {
            mergedPlayer.myRank = existingPlayer.myRank;
            mergedPlayer.manualRank = true;
          }
          mergedPlayer.posRank = existingPlayer.posRank ?? 0;
          mergedPlayer.drafted = existingPlayer.drafted ?? false;
          mergedPlayer.draftedAt = existingPlayer.draftedAt ?? null;
          mergedPlayer.draftedSource = existingPlayer.draftedSource ?? null;
          mergedPlayer.roomPickNo = existingPlayer.roomPickNo ?? null;
        } else {
          const snapshotRank = findSavedRankForPlayer(player);
          if (Number.isFinite(snapshotRank) && snapshotRank > 0) {
            mergedPlayer.myRank = snapshotRank;
            mergedPlayer.manualRank = true;
          }
        }
        
        return mergedPlayer;
      });

    // Calculate Sleeper ADP from saved draft picks
    const sleeperAdpByPlayer = calculateSleeperAdp();
    mergedPlayers.forEach(player => {
      const playerNames = getNameMatchKeys(player.name);
      // Check if any of the player's name keys match Sleeper ADP data
      const matchingKey = playerNames.find(nameKey => sleeperAdpByPlayer[nameKey]);
      if (matchingKey) {
        player.sleeperAdp = sleeperAdpByPlayer[matchingKey];
      }
    });

    const existingById = new Map((state.players || []).map((player) => [player.id, player]));
    const hasSavedTierLayout = (state.players || []).some((player) => Number(player.tier) > 1);
    const rankedPlayers = assignDefaultRanksByAdp(mergedPlayers).map((player) => {
      // Live refreshes rebuild player IDs, so fall back to the merged
      // player's preserved fields when the old ID no longer matches.
      const existing = existingById.get(player.id) || player;
      return {
        ...player,
        drafted: Boolean(existing?.drafted) || Boolean(player.drafted),
        draftedAt: existing?.draftedAt || player.draftedAt || null,
        draftedSource: existing?.draftedSource ?? player.draftedSource ?? null,
        roomPickNo: Number.isFinite(player.roomPickNo)
          ? player.roomPickNo
          : (Number.isFinite(existing?.roomPickNo) ? existing.roomPickNo : null),
        tier: hasSavedTierLayout ? (existing?.tier ?? player.tier ?? 1) : 1,
        projectedPoints: player.projectedPoints ?? existing?.projectedPoints ?? null
      };
    });

    // Completely replace state.players with merged data to ensure new fields are present
    state.players = rankedPlayers;
    restorePersistedRankings();
    calculatePositionalRanks();
    if (!hasSavedTierLayout) {
      applySmartTiering();
    }
    
    const espnCount = espnResponse && espnResponse.players ? espnResponse.players.length : 0;
    const yahooCount = yahooResponse && yahooResponse.players ? yahooResponse.players.length : 0;
    const underdogCount = rotoballerResponse && rotoballerResponse.players ? rotoballerResponse.players.length : 0;
    const ffpcCount = ffpcResponse && ffpcResponse.players ? ffpcResponse.players.length : 0;
    state.liveDataStatus = `Loaded ${state.players.length} players from local CSV files (${espnCount} ESPN, ${yahooCount} Yahoo, ${underdogCount} Underdog, ${ffpcCount} FFPC).`;
    
    console.log('[CSV] Sample player data:', {
      name: state.players[0]?.name,
      expertRank: state.players[0]?.expertRank,
      projectedPoints: state.players[0]?.projectedPoints,
      rotoballer: state.players[0]?.rotoballer,
      ffpc: state.players[0]?.ffpc
    });
    render();
  } catch (error) {
    console.error('[CSV] Error loading rankings:', error);
    state.liveDataStatus = `Error loading rankings: ${error.message}`;
    render();
  }
}

async function applyGhostRankings() {
  console.log('[GHOST] Applying Ghost personal rankings...');
  
  try {
    const ghostResponse = await fetchJsonWithProxyFallback('/api/ghost', 'Ghost personal rankings');
    
    if (ghostResponse && ghostResponse.players) {
      console.log('[GHOST] Found Ghost rankings data:', ghostResponse.players.length, 'players');
      
      const ghostRankingsMap = new Map();
      ghostResponse.players.forEach(ghostPlayer => {
        getNameMatchKeys(ghostPlayer.name).forEach((key) => {
          ghostRankingsMap.set(key, ghostPlayer.personalRank);
        });
        console.log(`[GHOST] Mapping ${ghostPlayer.name} -> ${ghostPlayer.personalRank}`);
      });
      
      let appliedGhostRanks = 0;
      state.players.forEach(player => {
        const ghostRank = getNameMatchKeys(player.name)
          .map((key) => ghostRankingsMap.get(key))
          .find((rank) => rank !== undefined);
        if (ghostRank) {
          player.myRank = Math.round(ghostRank);
          player.manualRank = true;
          appliedGhostRanks++;
          console.log(`[GHOST] Applied rank ${player.myRank} to ${player.name}`);
        }
      });
      
      // Re-sort by myRank after applying Ghost's rankings
      state.players.sort((a, b) => {
        // Handle players without ranks (put them at the end)
        if (!a.myRank && b.myRank) return 1;
        if (a.myRank && !b.myRank) return -1;
        if (!a.myRank && !b.myRank) return a.name.localeCompare(b.name);
        return a.myRank - b.myRank || a.name.localeCompare(b.name);
      });
      state.players.forEach((player, index) => {
        player.myRank = index + 1;
      });
      
      console.log(`[GHOST] Applied ${appliedGhostRanks} personal rankings for Ghost user`);
      saveState();
    } else {
      console.log('[GHOST] No Ghost rankings data found');
    }
  } catch (error) {
    console.error('[GHOST] Error applying Ghost rankings:', error);
  }
}

function escapeCsvField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportRankingsToCsv() {
  const rankedPlayers = state.players
    .filter((player) => Number.isFinite(Number(player.myRank)) && Number(player.myRank) > 0)
    .sort((a, b) => a.myRank - b.myRank || a.name.localeCompare(b.name));

  if (!rankedPlayers.length) {
    showAppModal('No rankings to export yet. Upload a CSV or drag players to reorder first.', {
      title: 'Nothing to export',
      type: 'error'
    });
    return false;
  }

  const header = ['RK', 'Player', 'Pos', 'Team'];
  const rows = rankedPlayers.map((player, index) => [
    index + 1,
    player.name,
    player.position || '',
    player.team || ''
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\n');

  const dateStamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fantasy-rankings-${dateStamp}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showAppModal(
    `Exported ${rankedPlayers.length} players to fantasy-rankings-${dateStamp}.csv. Save the file and use Import next time to restore your rankings.`,
    { title: 'Rankings exported', type: 'success' }
  );
  return true;
}

// CSV upload handling
function handleCsvUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Security checks
  if (!file.name.endsWith('.csv')) {
    showAppModal('Please upload a CSV file only.', { title: 'Invalid file', type: 'error' });
    event.target.value = '';
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    showAppModal('File is too large. Maximum size is 5MB.', { title: 'File too large', type: 'error' });
    event.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const csvContent = e.target.result;
      const result = parseAndApplyCsvRankings(csvContent);
      
      if (result.success) {
        state.savedCustomRanks = buildSavedCustomRanks();
        if (isUserLoggedIn()) {
          const saved = await saveState({ awaitServer: true });
          if (!saved) {
            showAppModal('CSV imported on this device, but the server save failed. Click Save after checking Render settings.', {
              title: 'Imported locally only',
              type: 'error'
            });
          } else {
            showAppModal(`Successfully imported and saved ${result.applied} rankings!`, {
              title: 'Rankings imported',
              type: 'success'
            });
          }
        } else {
          saveState();
          showAppModal(`Successfully imported ${result.applied} rankings! Use Export to save a copy for next time.`, {
            title: 'Rankings imported',
            type: 'success'
          });
        }
        render();
      } else {
        showAppModal(`Error: ${result.error}`, { title: 'Import failed', type: 'error' });
      }
    } catch (error) {
      showAppModal('Error reading CSV file: ' + error.message, { title: 'Import failed', type: 'error' });
    }
    
    // Reset file input
    event.target.value = '';
  };
  
  reader.onerror = function() {
    showAppModal('Error reading file.', { title: 'Import failed', type: 'error' });
    event.target.value = '';
  };
  
  reader.readAsText(file);
}

function parseAndApplyCsvRankings(csvContent) {
  try {
    // Integrity check: validate CSV structure
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return { success: false, error: 'CSV file is empty or has no data rows.' };
    }
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    console.log('[CSV] Headers found:', headers);
    
    // Required columns: at minimum, we need player name and some form of ranking
    const nameIndex = headers.findIndex(h => h.includes('name') || h.includes('player'));
    
    // Prioritize "RK" column first (this is the actual ranking order), then "Personal Rank"
    const rkIndex = headers.findIndex(h => h === 'rk');
    const personalRankIndex = headers.findIndex(h => h.includes('personal') && h.includes('rank'));
    const rankIndex = rkIndex !== -1 ? rkIndex : (personalRankIndex !== -1 ? personalRankIndex : headers.findIndex(h => h.includes('rank') && !h.includes('personal')));
    const adpIndex = rankIndex === -1 ? headers.findIndex(h => h.includes('adp')) : -1;
    const valueIndex = rankIndex === -1 && adpIndex === -1 ? headers.findIndex(h => h.includes('value')) : -1;
    
    const finalRankIndex = rkIndex !== -1 ? rkIndex : (personalRankIndex !== -1 ? personalRankIndex : (rankIndex !== -1 ? rankIndex : (adpIndex !== -1 ? adpIndex : valueIndex)));
    
    console.log('[CSV] Using column index', finalRankIndex, 'for rankings:', headers[finalRankIndex]);
    
    if (nameIndex === -1) {
      return { success: false, error: 'CSV must contain a "Name" or "Player" column.' };
    }
    
    if (finalRankIndex === -1) {
      return { success: false, error: 'CSV must contain a "RK", "Personal Rank", "Rank", "ADP", or "Value" column.' };
    }
    
    // Parse data rows
    let appliedCount = 0;
    const rankingsMap = new Map();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Handle CSV with quoted fields containing commas
      const columns = [];
      let current = '';
      let inQuotes = false;
      
      for (let char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          columns.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      columns.push(current.trim());
      
      if (columns.length <= nameIndex || columns.length <= finalRankIndex) {
        continue; // Skip malformed rows
      }
      
      const playerName = columns[nameIndex].replace(/"/g, '').trim();
      const rankValue = parseFloat(columns[finalRankIndex].replace(/"/g, '').trim());
      
      if (playerName && !isNaN(rankValue)) {
        // Use getNameMatchKeys to handle suffixes like III, Jr., etc.
        const nameKeys = getNameMatchKeys(playerName);
        nameKeys.forEach(key => {
          rankingsMap.set(key, rankValue);
        });
        
        if (i <= 5) { // Log first 5 players for debugging
          console.log('[CSV] Parsed:', playerName, '->', rankValue, 'keys:', nameKeys);
        }
      }
    }
    
    if (rankingsMap.size === 0) {
      return { success: false, error: 'No valid rankings found in CSV.' };
    }
    
    console.log('[CSV] Parsed', rankingsMap.size, 'rankings from CSV');
    
    // Apply rankings to existing players
    state.players.forEach(player => {
      // Use getNameMatchKeys to handle suffixes like III, Jr., etc.
      const playerKeys = getNameMatchKeys(player.name);
      let csvRank = undefined;
      
      // Check if any of the player's name keys match the CSV
      for (const key of playerKeys) {
        if (rankingsMap.has(key)) {
          csvRank = rankingsMap.get(key);
          break;
        }
      }
      
      if (csvRank !== undefined) {
        // An imported ranking file represents the user's rankings, so these
        // players must take priority over the ADP-only section.
        player.myRank = csvRank; // Use exact value from CSV, don't round
        player.manualRank = true;
        appliedCount++;
        if (appliedCount <= 5) { // Log first 5 applications for debugging
          console.log('[CSV] Applied:', player.name, 'rank', player.myRank, 'from CSV value', csvRank, 'keys:', playerKeys);
        }
      } else if (!player.manualRank) {
        // A player absent from the imported file has no imported rank. Keep
        // those players below every ranked player instead of inheriting an
        // old auto-generated rank.
        player.myRank = 0;
      }
    });
    
    console.log('[CSV] Applied', appliedCount, 'rankings out of', state.players.length, 'players');
    
    // Remove duplicate players (same name aliases + position + team)
    const seenPlayers = new Map();
    const uniquePlayers = [];
    
    state.players.forEach(player => {
      const canonicalName = [...getNameMatchKeys(player.name)].sort()[0] || normalizeName(player.name);
      const matchKey = `${canonicalName}-${normalizeName(player.position)}-${normalizeName(player.team)}`;
      if (!seenPlayers.has(matchKey)) {
        seenPlayers.set(matchKey, true);
        uniquePlayers.push(player);
      } else {
        console.log('[CSV] Removed duplicate:', player.name, player.position, player.team);
      }
    });
    
    state.players = uniquePlayers;
    console.log('[CSV] Removed duplicates, now have', state.players.length, 'unique players');
    
    // Sort by myRank (use exact CSV values)
    state.players.sort((a, b) => {
      // After CSV import only: players with no imported rank go to the end.
      const aHasRank = a.manualRank === true && Number(a.myRank) > 0;
      const bHasRank = b.manualRank === true && Number(b.myRank) > 0;
      if (!aHasRank && bHasRank) return 1;
      if (aHasRank && !bHasRank) return -1;
      if (!aHasRank && !bHasRank) {
        const adpDiff = getAverageAdpForSort(a) - getAverageAdpForSort(b);
        if (adpDiff !== 0) return adpDiff;
        return a.name.localeCompare(b.name);
      }

      // Sort by CSV rank
      const rankDiff = a.myRank - b.myRank;
      if (rankDiff !== 0) return rankDiff;

      // Tie-breaker by name
      return a.name.localeCompare(b.name);
    });
    
    // Log top 10 players after sorting
    console.log('[CSV] Top 10 players after CSV import:');
    state.players.slice(0, 10).forEach((player, index) => {
      console.log(`  ${index + 1}. ${player.name} (${player.position}) - Rank: ${player.myRank}`);
    });
    
    // Recalculate positional ranks and tiers
    calculatePositionalRanks();
    applyAutoTiering();
    
    console.log('[CSV] Applied', appliedCount, 'rankings and recalculated tiers/positions');
    
    return { success: true, applied: appliedCount };
    
  } catch (error) {
    console.error('[CSV] Error parsing CSV:', error);
    return { success: false, error: 'Error parsing CSV: ' + error.message };
  }
}

function normalizeName(value) {
  // Remove common suffixes for better matching
  let name = `${value || ''}`.toLowerCase();
  
  // Remove common suffixes like Jr., Sr., II, III, IV, etc.
  name = name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|vi|vii|viii|ix|x)$/g, '');
  
  // Remove non-alphanumeric characters
  name = name.replace(/[^a-z0-9]+/g, '');
  
  return name;
}

function normalizeNameForMatch(value) {
  const raw = `${value || ''}`.toLowerCase();
  const withoutSuffix = raw
    .replace(/\b(jr|sr|ii|iii|iv|v|vi)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizeName(withoutSuffix || raw);
}

// Common fantasy first-name nicknames so "Kenny Gainwell" matches "Kenneth Gainwell".
const FIRST_NAME_ALIASES = {
  kenny: ['kenneth'],
  kenneth: ['kenny'],
  ken: ['kenneth', 'kenny'],
  josh: ['joshua'],
  joshua: ['josh'],
  rob: ['robert'],
  robbie: ['robert'],
  bob: ['robert'],
  bobby: ['robert'],
  robert: ['rob', 'robbie', 'bob', 'bobby'],
  mike: ['michael'],
  michael: ['mike'],
  matt: ['matthew'],
  matthew: ['matt'],
  chris: ['christopher'],
  christopher: ['chris'],
  jon: ['jonathan', 'john'],
  john: ['jonathan', 'jon'],
  jonathan: ['jon', 'john'],
  joe: ['joseph'],
  joseph: ['joe'],
  cam: ['cameron'],
  cameron: ['cam'],
  will: ['william'],
  william: ['will', 'bill'],
  bill: ['william']
};

function getFirstNameAliasVariants(fullName) {
  const parts = `${fullName || ''}`
    .toLowerCase()
    .replace(/\./g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) {
    return [];
  }

  const first = parts[0].replace(/[^a-z]/g, '');
  const rest = parts.slice(1).join(' ');
  const aliases = FIRST_NAME_ALIASES[first] || [];
  return aliases.map((alias) => `${alias} ${rest}`);
}

function getNameMatchKeys(value) {
  const keys = new Set();
  const base = normalizeName(value);
  const suffixNeutral = normalizeNameForMatch(value);
  if (base) keys.add(base);
  if (suffixNeutral) keys.add(suffixNeutral);

  getFirstNameAliasVariants(value).forEach((variant) => {
    const variantBase = normalizeName(variant);
    const variantSuffixNeutral = normalizeNameForMatch(variant);
    if (variantBase) keys.add(variantBase);
    if (variantSuffixNeutral) keys.add(variantSuffixNeutral);
  });

  return [...keys];
}

function namesMatch(a, b) {
  const aKeys = new Set(getNameMatchKeys(a));
  return getNameMatchKeys(b).some((key) => aKeys.has(key));
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

function normalizePositionForCss(value) {
  const normalized = normalizePositionCode(value).toLowerCase();
  if (normalized === 'pk') return 'k';
  if (normalized === 'd' || normalized === 'dst') return 'def';
  return normalized;
}

function renderDraftBoard() {
  const rankingsBodyEl = document.getElementById('rankings-body');
  if (!rankingsBodyEl) {
    console.error('rankingsBody element not found');
    return;
  }
  
  console.log('Rendering draft board, players:', state.players.length);
  
  const sortedPlayers = [...state.players].sort(comparePlayers);
  const visiblePlayers = sortedPlayers.filter((player) => !player.drafted && matchesPositionFilter(player));

  let rows = [];
  const showMarkButtons = isManualDraftMode();
  const columnCount = showMarkButtons ? 10 : 9;
  
  // Always show tier dividers
  const tiersToRender = [...new Set(visiblePlayers.map((player) => Number(player.tier)).filter((tier) => Number.isFinite(tier) && tier > 0))]
    .sort((a, b) => a - b);

  tiersToRender.forEach((tier) => {
    const players = visiblePlayers.filter((player) => Number(player.tier) === tier);
    
    rows.push(`
      <tr class="tier-divider${Number(state.ui?.selectedTier) === tier ? ' is-selected' : ''}" data-tier="${tier}">
        <td colspan="${columnCount}">
          <div class="tier-bar">
            <span class="tier-pill t${tier}">Tier ${tier}</span>
            <span class="tier-divider-count">${players.length} players</span>
          </div>
        </td>
      </tr>
    `);
    
    players.forEach((player) => {
      const adpValue = getAdpValue(player, state.adpSource);
      const expertValue = player.expertRank ? player.expertRank : '-';
      const adpDiff = calculateAdpDifference(player, state.adpSource);
      const personalDiff = calculatePersonalDifference(player, state.adpSource);
      const sosValue = player.sosRank ? player.sosRank : '-';
      const isSelected = state.ui?.selectedPlayerId === player.id;
      const posRankDisplay = formatPosRankDisplay(player);
      const normalizedPosition = normalizePositionForCss(player.position);
      const markCell = showMarkButtons
        ? `<td class="col-draft-action">
            <button type="button" class="row-draft-btn" data-action="draft" data-player-id="${player.id}" title="Mark drafted">Mark</button>
          </td>`
        : '';
      
      rows.push(`
        <tr data-player-id="${player.id}" class="${player.drafted ? 'drafted-row' : ''} ${isSelected ? 'selected-row' : ''}" draggable="true">
          <td class="col-rank">
            <span class="drag-handle" data-player-id="${player.id}"></span>
            ${player.myRank}
          </td>
          <td class="col-player">
            <div class="player-cell">
              <span class="player-name">${player.name}</span>
            </div>
          </td>
          <td class="col-pos"><span class="pos-pill pos-${normalizedPosition}">${posRankDisplay}</span></td>
          <td class="col-team">${player.team}</td>
          <td class="col-adp">${adpValue}</td>
          <td class="col-expert">${expertValue}</td>
          <td class="col-adp-diff" style="color: ${adpDiff.color}; font-weight: ${adpDiff.weight};">${adpDiff.display}</td>
          <td class="col-personal-diff" style="color: ${personalDiff.color}; font-weight: ${personalDiff.weight};">${personalDiff.display}</td>
          <td class="col-sos">${sosValue}</td>
          ${markCell}
        </tr>
      `);
    });
  });

  rankingsBodyEl.innerHTML = rows.join('');
  console.log('Rendered', rows.length, 'rows');
  
  // Update table header based on selected ADP source
  updateTableHeader();
  
  // Render unmatched picks section
  renderUnmatchedPicksSection();
}

function getAdpValue(player, source) {
  switch(source) {
    case 'espn':
      return player.espn ? player.espn.toFixed(1) : '-';
    case 'yahoo':
      return player.yahoo ? player.yahoo.toFixed(1) : '-';
    case 'rotoballer':
      return player.rotoballer ? player.rotoballer.toFixed(1) : '-';
    case 'ffpc':
      return player.ffpc ? player.ffpc.toFixed(1) : '-';
    case 'average':
      return getDraftAdjustedAdp(player).toFixed(1);
    case 'expert':
      // Desktop still shows an ADP column; keep average ADP there while Expert is selected.
      return getDraftAdjustedAdp(player).toFixed(1);
    case 'all':
    default:
      return getDraftAdjustedAdp(player).toFixed(1);
  }
}

function updateTableHeader() {
  const headerRow = document.getElementById('table-header');
  if (!headerRow) return;
  
  const adpLabels = {
    all: 'ADP',
    espn: 'ESPN',
    yahoo: 'Yahoo', 
    rotoballer: 'Underdog',
    ffpc: 'FFPC',
    average: 'Average',
    expert: 'ADP'
  };
  
  const currentLabel = adpLabels[state.adpSource] || 'ADP';
  const markHeader = isManualDraftMode() ? '<th class="col-draft-action">Mark</th>' : '';
  const expertHeaderClass = isExpertMetricSelected() ? 'col-expert is-compact-metric' : 'col-expert';
  const adpHeaderClass = isExpertMetricSelected() ? 'col-adp' : 'col-adp is-compact-metric';
  
  headerRow.innerHTML = `
    <th class="col-rank" data-key="myRank">Rank</th>
    <th class="col-player" data-key="player">Player</th>
    <th class="col-pos" data-key="position">Pos</th>
    <th class="col-team" data-key="team">Team</th>
    <th class="${adpHeaderClass}" data-key="adp">${currentLabel}</th>
    <th class="${expertHeaderClass}" data-key="expertRank">Expert</th>
    <th class="col-adp-diff" data-key="adpDiff">Diff</th>
    <th class="col-personal-diff" data-key="personalDiff">My Diff</th>
    <th class="col-sos" data-key="sosRank">SoS</th>
    ${markHeader}
  `;
  
  // Re-attach event listeners to the new header
  document.querySelectorAll('th[data-key]').forEach((header) => {
    header.addEventListener('click', () => sortBy(header.dataset.key));
  });

  renderSortIndicators();
}

function comparePlayers(a, b) {
  const { key, direction } = state.sort;
  let result = 0;

  if (key === 'player') {
    result = a.name.localeCompare(b.name);
  } else if (key === 'myRank') {
    // User rankings always come first. Players without a user ranking are
    // then ordered by ADP, regardless of any imported/reference rank value.
    return compareUserRankThenAdp(a, b, direction);
  } else if (key === 'position') {
    result = (POSITION_ORDER[a.position] || 99) - (POSITION_ORDER[b.position] || 99) || a.position.localeCompare(b.position);
  } else if (key === 'team') {
    result = a.team.localeCompare(b.team);
  } else if (key === 'adp') {
    result = getAdpValueForSort(a) - getAdpValueForSort(b);
  } else if (key === 'expertRank') {
    result = (a.expertRank || 999) - (b.expertRank || 999);
  } else if (key === 'adpDiff') {
    const diffA = calculateAdpDifference(a, state.adpSource);
    const diffB = calculateAdpDifference(b, state.adpSource);
    // Parse the numeric value from the display string
    const numA = parseFloat(diffA.display) || 0;
    const numB = parseFloat(diffB.display) || 0;
    result = numA - numB;
  } else if (key === 'personalDiff') {
    const diffA = calculatePersonalDifference(a, state.adpSource);
    const diffB = calculatePersonalDifference(b, state.adpSource);
    // Parse the numeric value from the display string
    const numA = parseFloat(diffA.display) || 0;
    const numB = parseFloat(diffB.display) || 0;
    result = numA - numB;
  } else if (key === 'sosRank') {
    result = (a.sosRank || 999) - (b.sosRank || 999);
  } else if (key === 'espn') {
    result = (a.espn || 999) - (b.espn || 999);
  } else if (key === 'yahoo') {
    result = (a.yahoo || 999) - (b.yahoo || 999);
  } else if (key === 'rotoballer') {
    result = (a.rotoballer || 999) - (b.rotoballer || 999);
  } else if (key === 'ffpc') {
    result = (a.ffpc || 999) - (b.ffpc || 999);
  } else if (key === 'averageAdp') {
    result = getDraftAdjustedAdp(a) - getDraftAdjustedAdp(b);
  }

  return direction === 'asc' ? result : -result;
}

function compareUserRankThenAdp(a, b, direction = 'asc') {
  const importedMode = (state.players || []).some(
    (player) => player?.manualRank === true && Number(player.myRank) > 0
  );

  if (importedMode) {
    // CSV / saved custom ranks: ranked imports first, everyone else at the end.
    const aHasUserRank = a.manualRank === true && Number(a.myRank) > 0;
    const bHasUserRank = b.manualRank === true && Number(b.myRank) > 0;

    if (aHasUserRank !== bHasUserRank) {
      return aHasUserRank ? -1 : 1;
    }

    if (aHasUserRank && bHasUserRank) {
      const rankDifference = Number(a.myRank) - Number(b.myRank);
      if (rankDifference !== 0) {
        return direction === 'asc' ? rankDifference : -rankDifference;
      }
      return a.name.localeCompare(b.name);
    }

    const adpDiff = getAverageAdpForSort(a) - getAverageAdpForSort(b);
    if (adpDiff !== 0) {
      return direction === 'asc' ? adpDiff : -adpDiff;
    }
    return a.name.localeCompare(b.name);
  }

  // Standard rankings (no CSV): use assigned ranks, fall back to ADP.
  const aRank = Number(a.myRank);
  const bRank = Number(b.myRank);
  const aHasRank = Number.isFinite(aRank) && aRank > 0;
  const bHasRank = Number.isFinite(bRank) && bRank > 0;

  if (aHasRank && bHasRank && aRank !== bRank) {
    return direction === 'asc' ? aRank - bRank : bRank - aRank;
  }

  const adpDiff = getAverageAdpForSort(a) - getAverageAdpForSort(b);
  if (adpDiff !== 0) {
    return direction === 'asc' ? adpDiff : -adpDiff;
  }

  return a.name.localeCompare(b.name);
}

function getAdpValueForSort(player) {
  switch(state.adpSource) {
    case 'espn':
      return player.espn || 999;
    case 'yahoo':
      return player.yahoo || 999;
    case 'rotoballer':
      return player.rotoballer || 999;
    case 'ffpc':
      return player.ffpc || 999;
    case 'average':
      return getDraftAdjustedAdp(player);
    case 'expert':
      return Number.isFinite(player.expertRank) ? player.expertRank : 999;
    case 'all':
    default:
      return getDraftAdjustedAdp(player);
  }
}

function getAdpSourceForDiff(adpSource) {
  return adpSource === 'expert' ? 'all' : adpSource;
}

function calculateAdpDifference(player, adpSource) {
  // Get the current ADP value based on selected source
  let currentAdp = null;
  switch(getAdpSourceForDiff(adpSource)) {
    case 'espn':
      currentAdp = player.espn;
      break;
    case 'yahoo':
      currentAdp = player.yahoo;
      break;
    case 'rotoballer':
      currentAdp = player.rotoballer;
      break;
    case 'ffpc':
      currentAdp = player.ffpc;
      break;
    case 'average':
      currentAdp = getDraftAdjustedAdp(player);
      break;
    case 'all':
    default:
      currentAdp = getDraftAdjustedAdp(player);
  }

  // If no ADP or no expert rank, return empty
  if (!currentAdp || !player.expertRank) {
    return { display: '-', color: '#666', weight: 'normal' };
  }

  // Calculate difference: ADP - Rank (flipped for user intuition)
  // If expert rank is 7 and ADP is 9.2, difference is 9.2 - 7 = +2.2 (rank higher = undervalued)
  // If expert rank is 8 and ADP is 5, difference is 5 - 8 = -3 (rank lower = overvalued)
  const difference = currentAdp - player.expertRank;
  
  // Format the display
  const diffFormatted = difference >= 0 ? `+${difference.toFixed(1)}` : difference.toFixed(1);
  
  // Color coding:
  // Green (undervalued): difference > 0 (rank higher/lower number than ADP = good value)
  // Red (overvalued): difference < 0 (rank lower/higher number than ADP = bad value)
  // Neutral: difference close to 0
  let color = '#666';
  let weight = 'normal';
  
  if (difference > 1) {
    color = '#28a745'; // Green - significantly undervalued
    weight = 'bold';
  } else if (difference > 0) {
    color = '#90EE90'; // Light green - slightly undervalued
  } else if (difference < -1) {
    color = '#dc3545'; // Red - significantly overvalued
    weight = 'bold';
  } else if (difference < 0) {
    color = '#FF6B6B'; // Light red - slightly overvalued
  }
  
  return { display: diffFormatted, color, weight };
}

function calculatePersonalDifference(player, adpSource) {
  // Calculate difference between the selected ADP source and your personal ranking (myRank)
  let currentAdp = null;
  switch(getAdpSourceForDiff(adpSource)) {
    case 'espn':
      currentAdp = player.espn;
      break;
    case 'yahoo':
      currentAdp = player.yahoo;
      break;
    case 'rotoballer':
      currentAdp = player.rotoballer;
      break;
    case 'ffpc':
      currentAdp = player.ffpc;
      break;
    case 'average':
      currentAdp = getDraftAdjustedAdp(player);
      break;
    case 'all':
    default:
      currentAdp = getDraftAdjustedAdp(player);
  }

  // If no ADP or no personal rank, return empty
  if (!currentAdp || !player.myRank) {
    return { display: '-', color: '#666', weight: 'normal' };
  }

  // Calculate difference: ADP - My Rank (flipped for user intuition)
  // If my rank is 5 and ADP is 6.5, difference is 6.5 - 5 = +1.5 (rank higher = undervalued)
  // If my rank is 8 and ADP is 5.5, difference is 5.5 - 8 = -2.5 (rank lower = overvalued)
  const difference = currentAdp - player.myRank;
  
  // Format the display
  const diffFormatted = difference >= 0 ? `+${difference.toFixed(1)}` : difference.toFixed(1);
  
  // Color coding:
  // Teal (undervalued): difference > 0 (rank higher/lower number than ADP = good value)
  // Magenta (overvalued): difference < 0 (rank lower/higher number than ADP = bad value)
  // Neutral: difference close to 0
  let color = '#666';
  let weight = 'normal';
  
  if (difference > 1) {
    color = '#008080'; // Teal - significantly undervalued by you
    weight = 'bold';
  } else if (difference > 0) {
    color = '#00CED1'; // Light teal - slightly undervalued by you
  } else if (difference < -1) {
    color = '#FF00FF'; // Magenta - significantly overvalued by you
    weight = 'bold';
  } else if (difference < 0) {
    color = '#FF77FF'; // Light magenta - slightly overvalued by you
  }
  
  return { display: diffFormatted, color, weight };
}

function resetDraftBoard() {
  // Clear drafted status from all players except manually drafted
  state.players = state.players.map((player) => {
    // Keep manually drafted players as is
    if (player.draftedSource === 'manual') {
      return player;
    }
    
    // For unmatched Sleeper imports, make them undrafted but preserve their rank
    if (player.draftedSource === 'sync' && player.id?.startsWith('sleeper-')) {
      return {
        ...player,
        drafted: false,
        draftedAt: null,
        draftedSource: null,
        roomPickNo: null,
        // Keep their myRank as their draft position
        myRank: player.roomPickNo || player.myRank
      };
    }
    
    // Clear drafted status for all other players
    return {
      ...player,
      drafted: false,
      draftedAt: null,
      draftedSource: null,
      roomPickNo: null
    };
  });
  
  // Clear Sleeper sync state
  state.sleeperSync = {
    ...state.sleeperSync,
    enabled: false,
    lastPickCount: 0,
    lastSyncAt: null,
    lastResult: 'Draft board reset. Ready for new draft.',
    unmatchedCount: 0,
    unmatchedPicks: []
  };
  
  stopSleeperSync('Draft board reset.');
  
  // Recalculate everything without wiping custom rankings.
  syncDraftedPlayerIds();
  restorePersistedRankings();
  calculatePositionalRanks();
  applySmartTiering();
  
  saveState();
  render();
  console.log('Draft board reset complete');
}

function renderUnmatchedPicksSection() {
  const unmatchedSection = document.getElementById('unmatched-picks-section');
  const unmatchedList = document.getElementById('unmatched-picks-list');
  
  if (!unmatchedSection || !unmatchedList) {
    return;
  }
  
  const unmatchedPicks = state.sleeperSync?.unmatchedPicks || [];
  
  if (unmatchedPicks.length === 0) {
    unmatchedSection.style.display = 'none';
    return;
  }
  
  unmatchedSection.style.display = 'block';
  
  const items = unmatchedPicks.map((pick) => {
    const pickNo = pick.pickNo || '?';
    const name = pick.name || 'Unknown';
    const position = pick.position || '?';
    const team = pick.team || '?';
    
    return `
      <div class="unmatched-item">
        <div class="player-info">
          <span class="pick-no">Pick ${pickNo}</span>
          <span>${name}</span>
          <span>(${position} - ${team})</span>
        </div>
      </div>
    `;
  }).join('');
  
  unmatchedList.innerHTML = items;
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

      // Handle players without ranks (put them at the end)
      if (!a.myRank && b.myRank) return 1;
      if (a.myRank && !b.myRank) return -1;
      if (!a.myRank && !b.myRank) return a.name.localeCompare(b.name);
      return b.myRank - a.myRank;
    });

  const remainingPlayers = [...state.players]
    .filter((player) => !player.drafted)
    .sort((a, b) => {
      // Handle players without ranks (put them at the end)
      if (!a.myRank && b.myRank) return 1;
      if (a.myRank && !b.myRank) return -1;
      if (!a.myRank && !b.myRank) return a.name.localeCompare(b.name);
      return a.myRank - b.myRank;
    });

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
      posRank: 0,
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
  calculatePositionalRanks();
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



function handleDragStart(event) {
  // Find the player row - drag can start from anywhere in the row
  const playerRow = event.target.closest('tr[data-player-id]');
  if (!playerRow) {
    console.log('Drag start: no player row found, target:', event.target);
    return;
  }

  // Check if the drag started from the first column (rank column with drag handle)
  const firstCell = event.target.closest('td');
  if (firstCell && firstCell.cellIndex !== 0) {
    console.log('Drag start: not from first column, ignoring');
    return;
  }

  state.draggedPlayerId = playerRow.dataset.playerId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', playerRow.dataset.playerId);
  
  console.log('Drag started for player:', state.draggedPlayerId);
  
  // Add visual feedback
  playerRow.style.opacity = '0.5';
}

function handleDragOver(event) {
  const playerRow = event.target.closest('tr[data-player-id]');
  const tierRow = event.target.closest('.tier-divider');
  const draftBin = event.target.closest('.draft-bin');
  
  if (playerRow || tierRow || draftBin) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleDrop(event) {
  event.preventDefault();
  const playerId = state.draggedPlayerId;
  console.log('Drop event, dragged player:', playerId);
  
  if (!playerId) {
    console.log('Drop: no dragged player ID');
    return;
  }

  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    console.log('Drop: player not found');
    return;
  }

  const targetPlayerRow = event.target.closest('tr[data-player-id]');
  const targetTierRow = event.target.closest('.tier-divider');
  const targetDraftBin = event.target.closest('.draft-bin');

  console.log('Drop targets - player row:', !!targetPlayerRow, 'tier row:', !!targetTierRow, 'draft bin:', !!targetDraftBin);

  if (targetPlayerRow) {
    const targetPlayer = state.players.find((entry) => entry.id === targetPlayerRow.dataset.playerId);
    if (targetPlayer && targetPlayer.id !== player.id) {
      console.log('Reordering players, from:', player.name, 'to:', targetPlayer.name);
      
      // Reorder players based on visible list (not just myRank)
      const sortedPlayers = [...state.players].sort(comparePlayers);
      const visiblePlayers = sortedPlayers.filter((p) => !p.drafted && matchesPositionFilter(p));
      
      const fromIndex = visiblePlayers.findIndex((p) => p.id === player.id);
      const toIndex = visiblePlayers.findIndex((p) => p.id === targetPlayer.id);
      
      console.log('Reorder indices - from:', fromIndex, 'to:', toIndex);
      
      if (fromIndex !== -1 && toIndex !== -1) {
        // Reorder in the visible list
        const [moving] = visiblePlayers.splice(fromIndex, 1);
        visiblePlayers.splice(toIndex, 0, moving);
        
        // Reassign myRank based on new order
        visiblePlayers.forEach((p, index) => {
          p.myRank = index + 1;
          p.manualRank = true;
        });
        
        // Update the moved player's tier to match the target position's tier
        if (targetPlayer) {
          moving.tier = targetPlayer.tier;
        }
        
        // Update myRank for drafted players to maintain gaps
        const draftedPlayers = sortedPlayers.filter(p => p.drafted);
        draftedPlayers.forEach((p, index) => {
          p.myRank = visiblePlayers.length + index + 1;
        });
        
        calculatePositionalRanks();
        state.autoTiering = false; // Don't auto-tier after manual reordering
        
        console.log('Reorder complete');
      }
    }
  } else if (targetTierRow) {
    // Move player to this tier
    const targetTier = Number(targetTierRow.dataset.tier);
    console.log('Moving player to tier:', targetTier);
    if (Number.isFinite(targetTier)) {
      player.tier = targetTier;
      state.autoTiering = false;
    }
  } else if (targetDraftBin?.dataset.action === 'draft') {
    markPlayerDrafted(player);
  }

  syncDraftedPlayerIds();
  saveState();
  render();
}

function handleDragEnd(event) {
  // Clean up visual effects
  document.querySelectorAll('tr[data-player-id]').forEach(row => {
    row.style.opacity = '';
    row.style.background = '';
  });
  state.draggedPlayerId = null;
}

function handleTierSelect(event) {
  const target = event.target;
  if (!target.classList.contains('tier-select')) {
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

  const newTier = Number(target.value);
  if (Number.isFinite(newTier)) {
    player.tier = newTier;
    state.autoTiering = false;
    saveState();
    render();
  }
}

function addTierAboveSelectedPlayer() {
  const selectedPlayer = getSelectedPlayer();
  if (!selectedPlayer) {
    showAppModal('Select a player first. The new tier will start at that player.', { title: 'Select a player', type: 'error' });
    return;
  }

  const currentTier = Number(selectedPlayer.tier);
  if (!Number.isFinite(currentTier) || currentTier <= 0) {
    selectedPlayer.tier = 1;
  }

  const splitTier = Number(selectedPlayer.tier);
  const sameTierPlayers = [...state.players]
    .filter((player) => Number(player.tier) === splitTier)
    .sort(comparePlayers);
  const splitIndex = sameTierPlayers.findIndex((player) => player.id === selectedPlayer.id);

  if (splitIndex <= 0) {
    showAppModal('That player is already at the top of a tier. Select a player further down to add a break above them.', { title: 'Tier already starts here', type: 'error' });
    return;
  }

  const movingIds = new Set(sameTierPlayers.slice(splitIndex).map((player) => player.id));
  state.players.forEach((player) => {
    const tier = Number(player.tier);
    if (movingIds.has(player.id)) {
      player.tier = splitTier + 1;
    } else if (tier > splitTier) {
      player.tier = tier + 1;
    }
  });

  state.autoTiering = false;
  state.ui.selectedTier = splitTier + 1;
  compactPlayerTiers();
  saveState();
  render();
}

function deleteSelectedTier() {
  const selectedTier = Number(state.ui?.selectedTier);
  if (!Number.isFinite(selectedTier) || selectedTier <= 0) {
    showAppModal('Click a tier bar to highlight it, then delete.', { title: 'Select a tier', type: 'error' });
    return;
  }

  const usedTiers = [...new Set((state.players || []).map((player) => Number(player.tier)).filter((tier) => Number.isFinite(tier) && tier > 0))]
    .sort((a, b) => a - b);

  if (!usedTiers.includes(selectedTier)) {
    state.ui.selectedTier = null;
    showAppModal('That tier is no longer on the board. Click a tier bar and try again.', { title: 'Select a tier', type: 'error' });
    render();
    return;
  }

  if (usedTiers.length <= 1) {
    showAppModal('You need at least one tier on the board.', { title: 'Cannot delete tier', type: 'error' });
    return;
  }

  const selectedIndex = usedTiers.indexOf(selectedTier);
  const mergeInto = selectedIndex > 0 ? usedTiers[selectedIndex - 1] : usedTiers[selectedIndex + 1];

  state.players.forEach((player) => {
    if (Number(player.tier) === selectedTier) {
      player.tier = mergeInto;
    }
  });

  state.autoTiering = false;
  state.ui.selectedTier = null;
  compactPlayerTiers();
  saveState();
  render();
}

function handleTierAction(event) {
  const actionButton = event.target.closest('button');
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action || actionButton.id;
  if (action === 'add-tier' || actionButton.id === 'add-tier') {
    addTierAboveSelectedPlayer();
    return;
  }

  if (action === 'delete-tier' || actionButton.id === 'delete-tier') {
    deleteSelectedTier();
  }
}

function handleBoardClick(event) {
  const actionButton = event.target.closest('button[data-action]');
  if (actionButton?.dataset.action === 'draft') {
    event.preventDefault();
    event.stopPropagation();
    const playerId = actionButton.dataset.playerId || actionButton.closest('tr[data-player-id]')?.dataset.playerId;
    const player = state.players.find((entry) => entry.id === playerId);
    if (player && markPlayerDrafted(player)) {
      state.ui.selectedPlayerId = null;
      state.liveDataStatus = `Marked ${player.name} as drafted.`;
      saveState();
      render();
    }
    return;
  }

  const clickedControl = event.target.closest('input, button, select, textarea');
  if (!clickedControl) {
    const tierRow = event.target.closest('.tier-divider');
    if (tierRow) {
      const tier = Number(tierRow.dataset.tier);
      if (Number.isFinite(tier)) {
        state.ui.selectedTier = state.ui.selectedTier === tier ? null : tier;
        state.ui.selectedPlayerId = null;
        saveState();
        render();
      }
      return;
    }

    const playerRow = event.target.closest('tr[data-player-id]');
    if (playerRow) {
      setSelectedPlayer(playerRow.dataset.playerId);
      render();
    }
  }
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
    undraftPlayer(player);
    saveState();
    render();
  }
}
