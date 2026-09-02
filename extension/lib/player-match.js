(function (global) {
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

  function normalizeName(value) {
    let name = `${value || ''}`.toLowerCase();
    name = name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|vi|vii|viii|ix|x)$/g, '');
    return name.replace(/[^a-z0-9]+/g, '');
  }

  function normalizeNameForMatch(value) {
    const raw = `${value || ''}`.toLowerCase();
    const withoutSuffix = raw
      .replace(/\b(jr|sr|ii|iii|iv|v|vi)\b\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return normalizeName(withoutSuffix || raw);
  }

  function normalizePosition(value) {
    const pos = `${value || ''}`.toUpperCase().trim();
    if (pos === 'K' || pos === 'PK') return 'K';
    if (pos === 'D' || pos === 'DST' || pos === 'DEF') return 'DEF';
    return pos;
  }

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
    return (FIRST_NAME_ALIASES[first] || []).map((alias) => `${alias} ${rest}`);
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

  function rankKey(player) {
    return `${normalizeName(player?.name)}-${normalizeName(player?.position)}-${normalizeName(player?.team)}`;
  }

  function extractNameFromText(value) {
    return `${value || ''}`
      .replace(/\s+/g, ' ')
      .replace(/\b(QB|RB|WR|TE|PK|K|DEF|DST)\b/g, '')
      .replace(/\b[A-Z]{2,3}\b/g, (token, offset, full) => {
        // Keep likely last names; strip trailing team codes at the end.
        if (offset > full.length - 5) return '';
        return token;
      })
      .replace(/\d+\.\d+|\b\d+\b/g, '')
      .trim();
  }

  global.FDSPlayerMatch = {
    normalizeName,
    normalizeNameForMatch,
    normalizePosition,
    getNameMatchKeys,
    namesMatch,
    rankKey,
    extractNameFromText
  };
})(typeof window !== 'undefined' ? window : globalThis);
