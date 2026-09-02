(function (global) {
  const DEFAULT_SETTINGS = {
    format: 'bestball',
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function mergeSettings(partial) {
    const merged = { ...DEFAULT_SETTINGS, ...(partial || {}) };
    merged.posMax = { ...DEFAULT_SETTINGS.posMax, ...(partial?.posMax || {}) };
    merged.posTarget = { ...DEFAULT_SETTINGS.posTarget, ...(partial?.posTarget || {}) };
    merged.posBias = { ...DEFAULT_SETTINGS.posBias, ...(partial?.posBias || {}) };
    ['rankWeight', 'projectionWeight', 'adpWeight', 'stackWeight', 'week17Importance',
      'week16Importance', 'week15Importance', 'capitalWeight', 'contrarianWeight', 'portfolioWeight', 'duplicateWeight']
      .forEach((key) => {
        merged[key] = clamp(merged[key], 0, 100);
      });
    return merged;
  }

  global.FDSScoringSettings = {
    DEFAULT_SETTINGS,
    mergeSettings
  };
})(typeof window !== 'undefined' ? window : globalThis);
