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
let currentUsername = null;
let currentPassword = null;

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
    selectedPlayerId: null
  },
  draftedPlayerIds: [],
  autoTiering: false,
  positionFilter: 'ALL',
  adpSource: 'all'
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

// Check for saved username in localStorage
const savedUsername = localStorage.getItem('fantasy-draft-username');
const savedPassword = localStorage.getItem('fantasy-draft-password');

autoFillPlayers();

// Wait for DOM to be ready before accessing elements
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  
  const autoRankButton = document.getElementById('auto-rank');
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

  console.log('DOM elements:', {
    autoRankButton,
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
      // Sort by the selected ADP source when changed, always in ascending order
      if (state.adpSource === 'average') {
        state.sort = { key: 'averageAdp', direction: 'asc' };
      } else {
        state.sort = { key: 'adp', direction: 'asc' };
      }
      render();
    });
  }

  const toggleHelpButton = document.getElementById('toggle-help');
  if (toggleHelpButton) {
    toggleHelpButton.addEventListener('click', () => {
      const csvHelp = document.getElementById('csv-help');
      if (csvHelp) {
        csvHelp.style.display = csvHelp.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  const addTierButton = document.getElementById('add-tier');
  if (addTierButton) {
    addTierButton.addEventListener('click', handleTierAction);
  }

  const deleteTierButton = document.getElementById('delete-tier');
  if (deleteTierButton) {
    deleteTierButton.addEventListener('click', handleTierAction);
  }

  const submitSleeperIdButton = document.getElementById('submit-sleeper-id');
  if (submitSleeperIdButton) {
    submitSleeperIdButton.addEventListener('click', async () => {
      collectSettings();
      saveState();
      
      // Start Sleeper sync if draft ID is provided
      const draftId = state.sleeperSync?.draftId;
      if (draftId) {
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
      if (confirm('Reset the draft board? This will clear all drafted status but keep your player rankings and unmatched players.')) {
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

  // Handle login/logout
  if (savedUsername && savedPassword) {
    currentUsername = savedUsername;
    currentPassword = savedPassword;
    if (userDisplay) userDisplay.textContent = currentUsername;
    if (loginButton) loginButton.style.display = 'none';
    if (logoutButton) logoutButton.style.display = 'inline-block';
    
    // Show CSV upload button for logged-in users
    if (csvUploadLabel) csvUploadLabel.style.display = 'inline-block';
    
    // First load CSV data, then load saved state
    loadLiveRankings().then(() => {
      loadStateFromServer().then((loaded) => {
        render();
      });
    });
  } else {
    if (userDisplay) userDisplay.textContent = '';
    if (loginButton) loginButton.style.display = 'inline-block';
    if (logoutButton) logoutButton.style.display = 'none';
    
    // Hide CSV upload button for logged-out users
    if (csvUploadLabel) csvUploadLabel.style.display = 'none';
    
    loadLiveRankings().then(() => {
      render();
    });
  }

  if (loginButton) {
    loginButton.addEventListener('click', () => {
      showUsernameModal();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      currentUsername = null;
      currentPassword = null;
      localStorage.removeItem('fantasy-draft-username');
      localStorage.removeItem('fantasy-draft-password');
      if (userDisplay) userDisplay.textContent = '';
      if (loginButton) loginButton.style.display = 'inline-block';
      if (logoutButton) logoutButton.style.display = 'none';
      
      // Hide CSV upload button for logged-out users
      if (csvUploadLabel) csvUploadLabel.style.display = 'none';
      
      localStorage.removeItem(STORAGE_KEY);
      Object.assign(state, structuredClone(defaultState));
      autoFillPlayers();
      loadLiveRankings().then(() => {
        render();
      });
      
      // Don't delete from server - keep the data for next login
      console.log('[SERVER] Logged out, keeping server data intact');
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
      userDisplay.textContent = currentUsername;
      loginButton.style.display = 'none';
      logoutButton.style.display = 'inline-block';
      
      // Show CSV upload button for logged-in users
      if (csvUploadLabel) csvUploadLabel.style.display = 'inline-block';
      
      hideUsernameModal();
      
      const loaded = await loadStateFromServer();
      if (loaded) {
        showAppModal('Your saved rankings have been loaded!', { title: 'Rankings loaded', type: 'success' });
        render();
      } else {
        // No saved state on server, use current state (first time login)
        render();
        // Don't show alert for first-time login
      }
    });
  }

  if (usernameCancel) {
    usernameCancel.addEventListener('click', () => {
      hideUsernameModal();
    });
  }

  if (autoRankButton) {
    autoRankButton.addEventListener('click', () => {
      collectSettings();
      autoFillPlayers();
      saveState();
      render();
    });
  }

  if (saveRankingsButton) {
    saveRankingsButton.addEventListener('click', () => {
      saveCustomRankings();
    });
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

  // Auto-rank when any setting changes
  document.querySelectorAll('.compact-select, #superflex').forEach(el => {
    el.addEventListener('change', () => {
      collectSettings();
      autoFillPlayers();
      saveState();
      render();
    });
  });
  
  // Initial render
  render();
});

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

async function saveState() {
  console.log('[STATE] Saving state, user logged in:', !!currentUsername);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (currentUsername) {
    saveStateToServer().catch(error => {
      console.error('[SERVER] Failed to save state:', error);
      showAppModal('Failed to save to server. Your data is saved locally only.', { title: 'Save failed', type: 'error' });
    });
  }
}

async function saveStateToServer() {
  if (!currentUsername || !currentPassword) {
    console.log('[SERVER] Skipping server save - no credentials');
    return;
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
        state: JSON.stringify(state)
      })
    });
    console.log('[SERVER] Save response status:', response.status, 'ok:', response.ok);
    if (response.ok) {
      console.log('[SERVER] State saved successfully');
    } else {
      const errorText = await response.text();
      console.error('[SERVER] Save failed - status:', response.status, 'error:', errorText);
      showAppModal(`Failed to save to server: ${response.status} - ${errorText}\n\nAre you accessing the app on port 8000? Current URL: ${window.location.href}`, { title: 'Save failed', type: 'error' });
    }
  } catch (error) {
    console.error('[SERVER] Failed to save state:', error);
    showAppModal(`Failed to save to server: ${error.message}\n\nAre you accessing the app on port 8000? Current URL: ${window.location.href}`, { title: 'Save failed', type: 'error' });
  }
}

async function loadStateFromServer() {
  if (!currentUsername || !currentPassword) {
    console.log('[SERVER] Skipping server load - no credentials');
    return false;
  }

  console.log('[SERVER] Loading state from server for user:', currentUsername);
  try {
    const response = await fetch(`/api/user-state?username=${encodeURIComponent(currentUsername)}&password=${encodeURIComponent(currentPassword)}`);
    console.log('[SERVER] Load response status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('[SERVER] Load response data:', data);
      if (data.state) {
        try {
          const loadedState = JSON.parse(data.state);
          console.log('[SERVER] Parsed loaded state, players count:', loadedState.players?.length);
          
          // Merge loaded state with current state to preserve new fields
          // Save current players if they have new fields that old state doesn't
          const currentPlayersWithNewFields = state.players.filter(p => p.expertRank !== undefined || p.sosRank !== undefined);
          
          // Replace the entire state instead of shallow merge
          Object.keys(state).forEach(key => delete state[key]);
          Object.assign(state, loadedState);
          
          // Restore players that have new fields if they don't exist in loaded state
          if (currentPlayersWithNewFields.length > 0) {
            currentPlayersWithNewFields.forEach(currentPlayer => {
              const existsInLoaded = state.players.find(p => 
                normalizeName(p.name) === normalizeName(currentPlayer.name) && 
                normalizeName(p.position) === normalizeName(currentPlayer.position) &&
                normalizeName(p.team) === normalizeName(currentPlayer.team)
              );
              if (!existsInLoaded) {
                // Add player with new fields if not in loaded state
                state.players.push(currentPlayer);
              } else {
                // Update existing player with new fields if missing
                if (!existsInLoaded.expertRank && currentPlayer.expertRank) {
                  existsInLoaded.expertRank = currentPlayer.expertRank;
                }
                if (!existsInLoaded.sosRank && currentPlayer.sosRank) {
                  existsInLoaded.sosRank = currentPlayer.sosRank;
                }
                if (!existsInLoaded.rotoballer && currentPlayer.rotoballer) {
                  existsInLoaded.rotoballer = currentPlayer.rotoballer;
                }
                if (!existsInLoaded.ffpc && currentPlayer.ffpc) {
                  existsInLoaded.ffpc = currentPlayer.ffpc;
                }
              }
            });
          }
          
          // Disable auto-tiering to preserve manual tier assignments
          state.autoTiering = false;
          console.log('[SERVER] State loaded successfully, current players:', state.players?.length);
          return true;
        } catch (error) {
          console.error('[SERVER] Failed to parse state:', error);
          showAppModal('Failed to load saved data from server.', { title: 'Load failed', type: 'error' });
          return false;
        }
      } else {
        console.log('[SERVER] No saved state found (first time login)');
        return false; // First time login, no error
      }
    } else {
      const errorText = await response.text();
      console.log('[SERVER] Failed to load state - server returned', response.status, errorText);
      if (response.status === 401) {
        showAppModal('Invalid username or password', { title: 'Login failed', type: 'error' });
      } else {
        showAppModal(`Failed to load from server: ${response.status} - ${errorText}`, { title: 'Load failed', type: 'error' });
      }
      return false;
    }
  } catch (error) {
    console.error('[SERVER] Failed to load state:', error);
    showAppModal(`Failed to load from server: ${error.message}`, { title: 'Load failed', type: 'error' });
    return false;
  }
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

function calculatePositionalRanks() {
  const playersByPosition = {};
  
  // Group players by position
  state.players.forEach(player => {
    const position = player.position;
    if (!playersByPosition[position]) {
      playersByPosition[position] = [];
    }
    playersByPosition[position].push(player);
  });
  
  // Sort each position group by myRank and assign positional ranks
  Object.keys(playersByPosition).forEach(position => {
    playersByPosition[position].sort((a, b) => {
      // Handle players without ranks (put them at the end)
      if (!a.myRank && b.myRank) return 1;
      if (a.myRank && !b.myRank) return -1;
      if (!a.myRank && !b.myRank) return a.name.localeCompare(b.name);
      return a.myRank - b.myRank;
    });
    playersByPosition[position].forEach((player, index) => {
      player.posRank = index + 1;
    });
  });
  
  // Ensure all players have posRank field
  state.players.forEach(player => {
    if (!player.posRank) {
      player.posRank = 0;
    }
  });
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

  const existingById = new Map((state.players || []).map((player) => [player.id, player]));
  const sortedPlayers = [...state.players]
    .map((player) => ({ ...player }))
    .sort((a, b) => {
      // Handle players without ranks (put them at the end)
      if (!a.myRank && b.myRank) return 1;
      if (a.myRank && !b.myRank) return -1;
      if (!a.myRank && !b.myRank) return a.name.localeCompare(b.name);
      return scorePlayer(b, state.settings) - scorePlayer(a, state.settings);
    });

  state.players = sortedPlayers.map((player, index) => {
    const existing = existingById.get(player.id);
    return {
      ...player,
      drafted: Boolean(existing?.drafted),
      draftedAt: existing?.draftedAt || null,
      draftedSource: existing?.draftedSource ?? null,
      roomPickNo: Number.isFinite(existing?.roomPickNo) ? existing.roomPickNo : null,
      manualRank: existing?.manualRank === true,
      myRank: index + 1,
      tier: getTierForRank(index, sortedPlayers.length)
    };
  });

  state.players = state.players.sort((a, b) => {
    // Handle players without ranks (put them at the end)
    if (!a.myRank && b.myRank) return 1;
    if (a.myRank && !b.myRank) return -1;
    if (!a.myRank && !b.myRank) return a.name.localeCompare(b.name);
    return a.myRank - b.myRank;
  });
  calculatePositionalRanks();
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
  // More flexible tier sizing - no hard limits
  const sizes = [];
  let remaining = totalPlayers;

  // Use opening tier sizes as a guide, but don't enforce them strictly
  for (const openingSize of OPENING_TIER_SIZES) {
    if (remaining <= 0) {
      break;
    }

    const count = Math.min(openingSize, remaining);
    sizes.push(count);
    remaining -= count;
  }

  // For remaining players, use larger, more flexible chunks
  while (remaining > 0) {
    // Use progressively larger chunks as we go down the rankings
    const chunkSize = Math.min(remaining, Math.max(15, Math.floor(remaining / 4)));
    sizes.push(chunkSize);
    remaining -= chunkSize;
  }

  return sizes.length ? sizes : [1];
}

function collectSettings() {
  const scoringFormat = document.getElementById('scoring-format');
  const qbSlots = document.getElementById('qb-slots');
  const rbSlots = document.getElementById('rb-slots');
  const wrSlots = document.getElementById('wr-slots');
  const teSlots = document.getElementById('te-slots');
  const flexSlots = document.getElementById('flex-slots');
  const superflex = document.getElementById('superflex');
  const benchSlots = document.getElementById('bench-slots');
  const sleeperDraftId = document.getElementById('sleeper-draft-id');

  state.settings = {
    scoringFormat: scoringFormat?.value || 'standard',
    qbSlots: Number(qbSlots?.value) || 1,
    rbSlots: Number(rbSlots?.value) || 2,
    wrSlots: Number(wrSlots?.value) || 3,
    teSlots: Number(teSlots?.value) || 1,
    flexSlots: Number(flexSlots?.value) || 1,
    superflex: superflex?.checked || false,
    benchSlots: Number(benchSlots?.value) || 5
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

  applyAutoTiering();
  render();
}

async function render() {
  populateSettingsFields();
  renderPositionFilterChips();
  renderSortIndicators();
  renderRankingStatus();
  renderSummary();
  renderDataStatus();
  // Only apply auto-tiering if explicitly enabled
  if (state.autoTiering) {
    applyAutoTiering();
  }
  renderDraftBoard();
  saveState();
}

function populateSettingsFields() {
  const { settings } = state;
  
  const scoringFormat = document.getElementById('scoring-format');
  if (scoringFormat) scoringFormat.value = settings.scoringFormat;
  
  const qbSlots = document.getElementById('qb-slots');
  if (qbSlots) qbSlots.value = settings.qbSlots;
  
  const rbSlots = document.getElementById('rb-slots');
  if (rbSlots) rbSlots.value = settings.rbSlots;
  
  const wrSlots = document.getElementById('wr-slots');
  if (wrSlots) wrSlots.value = settings.wrSlots;
  
  const teSlots = document.getElementById('te-slots');
  if (teSlots) teSlots.value = settings.teSlots;
  
  const flexSlots = document.getElementById('flex-slots');
  if (flexSlots) flexSlots.value = settings.flexSlots;
  
  const superflex = document.getElementById('superflex');
  if (superflex) superflex.checked = settings.superflex || false;
  
  const benchSlots = document.getElementById('bench-slots');
  if (benchSlots) benchSlots.value = settings.benchSlots;
  
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
  settingsSummaryEl.innerHTML = `
    <strong>Current build:</strong> ${state.settings.scoringFormat.toUpperCase()} • ${state.settings.qbSlots} QB • ${state.settings.rbSlots} RB • ${state.settings.wrSlots} WR • ${state.settings.teSlots} TE • ${state.settings.flexSlots} FLEX • ${state.settings.benchSlots} bench 
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
    
    // Save all draft picks for Sleeper ADP calculation
    state.sleeperSync.allDraftPicks = pickedLookup.allRecords || [];
    
    const { newlyMarked, newlyCleared, matchedTotal, unmatchedRecords } = syncDraftedPlayersFromLookup(pickedLookup);
    recalculateRoomAdpShift();
    if (newlyMarked > 0 || newlyCleared > 0) {
      syncDraftedPlayerIds();
      calculatePositionalRanks();
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
      myRank: rank,
      manualRank: true
    };
  });

  if (!applied) {
    return false;
  }

  updatedPlayers.sort((a, b) => {
    // Handle players without ranks (put them at the end)
    if (!a.myRank && b.myRank) return 1;
    if (a.myRank && !b.myRank) return -1;
    if (!a.myRank && !b.myRank) return a.name.localeCompare(b.name);
    return a.myRank - b.myRank || a.name.localeCompare(b.name);
  });
  updatedPlayers.forEach((player, index) => {
    player.myRank = index + 1;
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
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function getDraftAdjustedAdp(player) {
  if (Number.isFinite(player?.roomPickNo)) {
    return player.roomPickNo;
  }

  // Return true average of ESPN + Yahoo + Sleeper (no shift)
  return getAverageAdp(player);
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
  
  // Show which ADP source is selected
  const adpSourceLabels = {
    all: 'All',
    espn: 'ESPN',
    yahoo: 'Yahoo',
    rotoballer: 'Underdog',
    ffpc: 'FFPC',
    average: 'Average'
  };
  const adpSourceLabel = adpSourceLabels[state.adpSource] || 'All';
  statusText += ` | ADP: ${adpSourceLabel}`;
  
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
  const activePlayers = [...state.players]
    .sort((a, b) => compareUserRankThenAdp(a, b));
  const tierById = new Map();

  activePlayers.forEach((player, index) => {
    tierById.set(player.id, getTierForRank(index, activePlayers.length));
  });

  state.players = state.players.map((player) => ({
    ...player,
    tier: tierById.get(player.id) ?? player.tier
  }));
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
      fetchJsonWithProxyFallback('/api/espn', 'ESPN rankings'),
      fetchJsonWithProxyFallback('/api/yahoo', 'Yahoo rankings'),
      fetchJsonWithProxyFallback('/api/rotoballer', 'Underdog rankings'),
      fetchJsonWithProxyFallback('/api/ffpc', 'FFPC rankings')
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
        const normalizedName = normalizeName(player.name);
        if (!allPlayers.has(normalizedName)) {
          allPlayers.set(normalizedName, {
            name: player.name,
            position: player.position,
            team: player.team,
            espn: player.adpESPN || player.rank,
            yahoo: null,
            rotoballer: null,
            ffpc: null,
            sosRank: player.sosRank || null,
            expertRank: player.expertRank || null
          });
        } else {
          allPlayers.get(normalizedName).espn = player.adpESPN || player.rank;
          if (player.sosRank) allPlayers.get(normalizedName).sosRank = player.sosRank;
          if (player.expertRank) allPlayers.get(normalizedName).expertRank = player.expertRank;
        }
      });
    }

    // Add Yahoo data
    if (yahooResponse && yahooResponse.players) {
      yahooResponse.players.forEach(player => {
        const normalizedName = normalizeName(player.name);
        if (!allPlayers.has(normalizedName)) {
          allPlayers.set(normalizedName, {
            name: player.name,
            position: player.position,
            team: player.team,
            espn: null,
            yahoo: player.adpYahoo || player.rank,
            rotoballer: null,
            ffpc: null,
            sosRank: player.sosRank || null,
            expertRank: player.expertRank || null
          });
        } else {
          allPlayers.get(normalizedName).yahoo = player.adpYahoo || player.rank;
          if (player.sosRank) allPlayers.get(normalizedName).sosRank = player.sosRank;
          if (player.expertRank) allPlayers.get(normalizedName).expertRank = player.expertRank;
        }
      });
    }

    // Add Underdog data
    if (rotoballerResponse && rotoballerResponse.players) {
      rotoballerResponse.players.forEach(player => {
        const normalizedName = normalizeName(player.name);
        if (!allPlayers.has(normalizedName)) {
          allPlayers.set(normalizedName, {
            name: player.name,
            position: player.position,
            team: player.team,
            espn: null,
            yahoo: null,
            rotoballer: player.adpUnderdog || player.rank,
            ffpc: null,
            sosRank: player.sosRank || null,
            expertRank: player.expertRank || null
          });
        } else {
          allPlayers.get(normalizedName).rotoballer = player.adpUnderdog || player.rank;
          if (player.sosRank) allPlayers.get(normalizedName).sosRank = player.sosRank;
          if (player.expertRank) allPlayers.get(normalizedName).expertRank = player.expertRank;
        }
      });
    }

    // Add FFPC data
    if (ffpcResponse && ffpcResponse.players) {
      ffpcResponse.players.forEach(player => {
        const normalizedName = normalizeName(player.name);
        if (!allPlayers.has(normalizedName)) {
          allPlayers.set(normalizedName, {
            name: player.name,
            position: player.position,
            team: player.team,
            espn: null,
            yahoo: null,
            rotoballer: null,
            ffpc: player.adpFFPC || player.rank,
            sosRank: player.sosRank || null,
            expertRank: player.expertRank || null
          });
        } else {
          allPlayers.get(normalizedName).ffpc = player.adpFFPC || player.rank;
          if (player.sosRank) allPlayers.get(normalizedName).sosRank = player.sosRank;
          if (player.expertRank) allPlayers.get(normalizedName).expertRank = player.expertRank;
        }
      });
    }

    // Convert to array and filter players that have at least one ranking
    const mergedPlayers = Array.from(allPlayers.values())
      .filter(player => player.espn || player.yahoo || player.rotoballer || player.ffpc)
      .map((player, index) => {
        // Use ESPN as primary if available, otherwise Yahoo, otherwise first available
        const primaryAdp = player.espn || player.yahoo || player.rotoballer || player.ffpc || 100;
        
        // Check if this player already exists in state (to preserve custom rankings, drafted status, etc.)
        const existingPlayer = state.players.find(p => 
          normalizeName(p.name) === normalizeName(player.name) && 
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
        
        // If existing player found, preserve their customizations
        if (existingPlayer) {
          mergedPlayer.tier = existingPlayer.tier ?? 1;
          mergedPlayer.myRank = existingPlayer.myRank ?? 0;
          mergedPlayer.manualRank = existingPlayer.manualRank === true;
          mergedPlayer.posRank = existingPlayer.posRank ?? 0;
          mergedPlayer.drafted = existingPlayer.drafted ?? false;
          mergedPlayer.draftedAt = existingPlayer.draftedAt ?? null;
          mergedPlayer.draftedSource = existingPlayer.draftedSource ?? null;
          mergedPlayer.roomPickNo = existingPlayer.roomPickNo ?? null;
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
    const rankedPlayers = mergedPlayers
      .sort((a, b) => {
        // Handle players without ranks (put them at the end)
        if (!a.myRank && b.myRank) return 1;
        if (a.myRank && !b.myRank) return -1;
        if (!a.myRank && !b.myRank) return a.name.localeCompare(b.name);
        return getAverageAdp(a) - getAverageAdp(b);
      })
      .map((player, index) => {
        // Live refreshes rebuild player IDs, so fall back to the merged
        // player's preserved fields when the old ID no longer matches.
        const existing = existingById.get(player.id) || player;
        return {
          ...player,
          drafted: Boolean(existing?.drafted),
          draftedAt: existing?.draftedAt || null,
          draftedSource: existing?.draftedSource ?? null,
          roomPickNo: Number.isFinite(existing?.roomPickNo) ? existing.roomPickNo : null,
          myRank: existing?.manualRank === true ? existing.myRank : index + 1,
          manualRank: existing?.manualRank === true,
          tier: existing?.tier ?? getTierForRank(index, mergedPlayers.length)
        };
      });

    // Completely replace state.players with merged data to ensure new fields are present
    state.players = rankedPlayers;
    calculatePositionalRanks();
    
    const espnCount = espnResponse && espnResponse.players ? espnResponse.players.length : 0;
    const yahooCount = yahooResponse && yahooResponse.players ? yahooResponse.players.length : 0;
    const underdogCount = rotoballerResponse && rotoballerResponse.players ? rotoballerResponse.players.length : 0;
    const ffpcCount = ffpcResponse && ffpcResponse.players ? ffpcResponse.players.length : 0;
    state.liveDataStatus = `Loaded ${state.players.length} players from local CSV files (${espnCount} ESPN, ${yahooCount} Yahoo, ${underdogCount} Underdog, ${ffpcCount} FFPC).`;
    
    console.log('[CSV] Sample player data:', {
      name: state.players[0]?.name,
      expertRank: state.players[0]?.expertRank,
      rotoballer: state.players[0]?.rotoballer,
      ffpc: state.players[0]?.ffpc
    });
  } catch (error) {
    console.error('[CSV] Error loading rankings:', error);
    state.liveDataStatus = `Error loading rankings: ${error.message}`;
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
        const normalizedName = normalizeName(ghostPlayer.name);
        ghostRankingsMap.set(normalizedName, ghostPlayer.personalRank);
        console.log(`[GHOST] Mapping ${ghostPlayer.name} -> ${ghostPlayer.personalRank}`);
      });
      
      let appliedGhostRanks = 0;
      state.players.forEach(player => {
        const normalizedName = normalizeName(player.name);
        const ghostRank = ghostRankingsMap.get(normalizedName);
        if (ghostRank) {
          player.myRank = Math.round(ghostRank);
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
  reader.onload = function(e) {
    try {
      const csvContent = e.target.result;
      const result = parseAndApplyCsvRankings(csvContent);
      
      if (result.success) {
        showAppModal(`Successfully imported ${result.applied} rankings!`, { title: 'Rankings imported', type: 'success' });
        saveState();
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
    
    // Remove duplicate players (same normalized name, position, team)
    const seenPlayers = new Map();
    const uniquePlayers = [];
    
    state.players.forEach(player => {
      const matchKey = getNameMatchKeys(player.name)[0] + player.position + player.team;
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
      // Handle players without CSV ranks (put them at the end)
      const aHasRank = a.myRank && a.myRank > 0;
      const bHasRank = b.myRank && b.myRank > 0;
      if (!aHasRank && bHasRank) return 1;
      if (aHasRank && !bHasRank) return -1;
      if (!aHasRank && !bHasRank) return a.name.localeCompare(b.name);
      
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
  
  // Always show tier dividers
  const tiersToRender = [...new Set(visiblePlayers.map((player) => Number(player.tier)).filter((tier) => Number.isFinite(tier) && tier > 0))]
    .sort((a, b) => a - b);

  tiersToRender.forEach((tier) => {
    const players = visiblePlayers.filter((player) => Number(player.tier) === tier);
    
    rows.push(`
      <tr class="tier-divider" data-tier="${tier}">
        <td colspan="9">
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
      const posRankDisplay = player.posRank ? `${player.position}${player.posRank}` : player.position;
      const normalizedPosition = normalizePositionForCss(player.position);
      
      rows.push(`
        <tr data-player-id="${player.id}" class="${player.drafted ? 'drafted-row' : ''} ${isSelected ? 'selected-row' : ''}" draggable="true">
          <td>
            <span class="drag-handle" data-player-id="${player.id}"></span>
            ${player.myRank}
          </td>
          <td>
            <div class="player-cell">
              <span class="player-name">${player.name}</span>
            </div>
          </td>
          <td><span class="pos-pill pos-${normalizedPosition}">${posRankDisplay}</span></td>
          <td>${player.team}</td>
          <td>${adpValue}</td>
          <td>${expertValue}</td>
          <td style="color: ${adpDiff.color}; font-weight: ${adpDiff.weight};">${adpDiff.display}</td>
          <td style="color: ${personalDiff.color}; font-weight: ${personalDiff.weight};">${personalDiff.display}</td>
          <td>${sosValue}</td>
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
    average: 'Average'
  };
  
  const currentLabel = adpLabels[state.adpSource] || 'ADP';
  
  headerRow.innerHTML = `
    <th data-key="myRank">Rank</th>
    <th data-key="player">Player</th>
    <th data-key="position">Pos</th>
    <th data-key="team">Team</th>
    <th data-key="adp">${currentLabel}</th>
    <th data-key="expertRank">Expert</th>
    <th data-key="adpDiff">Diff</th>
    <th data-key="personalDiff">My Diff</th>
    <th data-key="sosRank">SoS</th>
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
  const aHasUserRank = a.manualRank === true && Number(a.myRank) > 0;
  const bHasUserRank = b.manualRank === true && Number(b.myRank) > 0;

  if (aHasUserRank !== bHasUserRank) {
    return aHasUserRank ? -1 : 1;
  }

  const aValue = aHasUserRank ? Number(a.myRank) : getDraftAdjustedAdp(a);
  const bValue = bHasUserRank ? Number(b.myRank) : getDraftAdjustedAdp(b);
  const valueDifference = aValue - bValue;
  if (valueDifference !== 0) {
    return direction === 'asc' ? valueDifference : -valueDifference;
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
    case 'all':
    default:
      return getDraftAdjustedAdp(player);
  }
}

function calculateAdpDifference(player, adpSource) {
  // Get the current ADP value based on selected source
  let currentAdp = null;
  switch(adpSource) {
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
  switch(adpSource) {
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
  
  // Recalculate everything
  syncDraftedPlayerIds();
  calculatePositionalRanks();
  state.autoTiering = true;
  applyAutoTiering();
  
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
    player.drafted = true;
    player.draftedAt = Date.now();
    player.draftedSource = 'manual';
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

function handleTierAction(event) {
  const actionButton = event.target.closest('button');
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action || actionButton.id;
  
  console.log('Tier action clicked:', action, 'Button:', actionButton);
  
  if (action === 'add-tier' || actionButton.id === 'add-tier') {
    console.log('Add tier clicked');
    
    // Add a new empty tier at the bottom
    const maxTier = Math.max(...state.players.map(p => p.tier || 0), 0);
    const newTier = maxTier + 1;
    
    console.log('Adding new tier:', newTier);
    
    state.autoTiering = false;
    saveState();
    render();
    console.log('New tier added successfully');
  } else if (action === 'delete-tier' || actionButton.id === 'delete-tier') {
    // Check if a player is selected
    const selectedPlayerId = state.ui?.selectedPlayerId;
    
    if (selectedPlayerId) {
      const selectedPlayer = state.players.find(p => p.id === selectedPlayerId);
      if (selectedPlayer) {
        const selectedTier = selectedPlayer.tier || 1;
        
        // Don't allow deleting tier 1 (merge into nothing)
        if (selectedTier <= 1) {
          showAppModal('Cannot delete Tier 1. Select a player in a higher tier to delete it.', { title: 'Tier action unavailable', type: 'error' });
          return;
        }
        
        // Merge selected tier into the previous tier
        const previousTier = selectedTier - 1;
        
        // Move all players from selected tier to previous tier
        state.players.forEach(player => {
          if (player.tier === selectedTier) {
            player.tier = previousTier;
          } else if (player.tier > selectedTier) {
            player.tier = player.tier - 1;
          }
        });
        
        state.autoTiering = false;
        saveState();
        render();
        console.log('Tier deleted successfully');
      }
    } else {
      showAppModal('Select a player in the tier you want to delete.', { title: 'Select a player', type: 'error' });
    }
  }
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
    calculatePositionalRanks();
    saveState();
    render();
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
    player.drafted = false;
    player.draftedAt = null;
    player.draftedSource = null;
    player.roomPickNo = null;
    syncDraftedPlayerIds();
    calculatePositionalRanks();
    saveState();
    render();
  }
}

render();
loadLiveRankings();
initSleeperSyncFromState();
