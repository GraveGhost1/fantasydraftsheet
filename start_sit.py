"""Multi-source Start/Sit projections with matchup-adjusted scores."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GAMES_PATH = ROOT / 'extension' / 'data' / 'nfl-games-2026.json'
SEASON = 2026
CACHE_TTL = {
    'sleeper_proj': 30 * 60,
    'sleeper_stats': 30 * 60,
    'sleeper_state': 10 * 60,
    'sleeper_players': 12 * 60 * 60,
    'espn': 30 * 60,
    'odds': 15 * 60,
    'games': 5 * 60,
}

TEAM_ALIASES = {'WSH': 'WAS', 'JAC': 'JAX', 'LA': 'LAR', 'GNB': 'GB', 'KCC': 'KC', 'SFO': 'SF', 'TAM': 'TB', 'NOR': 'NO', 'NWE': 'NE', 'LVR': 'LV'}
TEAM_SEARCH_KEYS = {
    'ARI': {'ari', 'arizona', 'cardinals', 'arizonacardinals', 'cardinalsdst', 'aridst'},
    'ATL': {'atl', 'atlanta', 'falcons', 'atlantafalcons', 'falconsdst', 'atldst'},
    'BAL': {'bal', 'baltimore', 'ravens', 'baltimoreravens', 'ravensdst', 'baldst'},
    'BUF': {'buf', 'buffalo', 'bills', 'buffalobills', 'billsdst', 'bufdst'},
    'CAR': {'car', 'carolina', 'panthers', 'carolinapanthers', 'panthersdst', 'cardst'},
    'CHI': {'chi', 'chicago', 'bears', 'chicagobears', 'bearsdst', 'chidst'},
    'CIN': {'cin', 'cincinnati', 'bengals', 'cincinnatibengals', 'bengalsdst', 'cindst'},
    'CLE': {'cle', 'cleveland', 'browns', 'clevelandbrowns', 'brownsdst', 'cledst'},
    'DAL': {'dal', 'dallas', 'cowboys', 'dallascowboys', 'cowboysdst', 'daldst'},
    'DEN': {'den', 'denver', 'broncos', 'denverbroncos', 'broncosdst', 'dendst'},
    'DET': {'det', 'detroit', 'lions', 'detroitlions', 'lionsdst', 'detdst'},
    'GB': {'gb', 'gnb', 'greenbay', 'packers', 'greenbaypackers', 'packersdst', 'gbdst'},
    'HOU': {'hou', 'houston', 'texans', 'houstontexans', 'texansdst', 'houdst'},
    'IND': {'ind', 'indianapolis', 'colts', 'indianapoliscolts', 'coltsdst', 'inddst'},
    'JAX': {'jax', 'jac', 'jacksonville', 'jaguars', 'jacksonvillejaguars', 'jaguarsdst', 'jaxdst'},
    'KC': {'kc', 'kcc', 'kansascity', 'chiefs', 'kansascitychiefs', 'chiefsdst', 'kcdst'},
    'LAC': {'lac', 'chargers', 'losangeleschargers', 'chargersdst', 'lacdst'},
    'LAR': {'lar', 'la', 'rams', 'losangelesrams', 'ramsdst', 'lardst'},
    'LV': {'lv', 'lvr', 'lasvegas', 'raiders', 'lasvegasraiders', 'raidersdst', 'lvdst'},
    'MIA': {'mia', 'miami', 'dolphins', 'miamidolphins', 'dolphinsdst', 'miadst'},
    'MIN': {'min', 'minnesota', 'vikings', 'minnesotavikings', 'vikingsdst', 'mindst'},
    'NE': {'ne', 'nwe', 'newengland', 'patriots', 'newenglandpatriots', 'patriotsdst', 'nedst'},
    'NO': {'no', 'nor', 'neworleans', 'saints', 'neworleanssaints', 'saintsdst', 'nodst'},
    'NYG': {'nyg', 'giants', 'newyorkgiants', 'giantsdst', 'nygdst'},
    'NYJ': {'nyj', 'jets', 'newyorkjets', 'jetsdst', 'nyjdst'},
    'PHI': {'phi', 'philadelphia', 'eagles', 'philadelphiaeagles', 'eaglesdst', 'phidst'},
    'PIT': {'pit', 'pittsburgh', 'steelers', 'pittsburghsteelers', 'steelersdst', 'pitdst'},
    'SEA': {'sea', 'seattle', 'seahawks', 'seattleseahawks', 'seahawksdst', 'seadst'},
    'SF': {'sf', 'sfo', 'sanfrancisco', '49ers', 'niners', 'sanfrancisco49ers', '49ersdst', 'sfdst'},
    'TB': {'tb', 'tam', 'tampabay', 'buccaneers', 'bucs', 'tampabaybuccaneers', 'buccaneersdst', 'tbdst'},
    'TEN': {'ten', 'tennessee', 'titans', 'tennesseetitans', 'titansdst', 'tendst'},
    'WAS': {'was', 'wsh', 'washington', 'commanders', 'washingtoncommanders', 'commandersdst', 'wasdst'},
}
TEAM_NICKNAMES = {
    'ARI': 'Cardinals', 'ATL': 'Falcons', 'BAL': 'Ravens', 'BUF': 'Bills', 'CAR': 'Panthers',
    'CHI': 'Bears', 'CIN': 'Bengals', 'CLE': 'Browns', 'DAL': 'Cowboys', 'DEN': 'Broncos',
    'DET': 'Lions', 'GB': 'Packers', 'HOU': 'Texans', 'IND': 'Colts', 'JAX': 'Jaguars',
    'KC': 'Chiefs', 'LAC': 'Chargers', 'LAR': 'Rams', 'LV': 'Raiders', 'MIA': 'Dolphins',
    'MIN': 'Vikings', 'NE': 'Patriots', 'NO': 'Saints', 'NYG': 'Giants', 'NYJ': 'Jets',
    'PHI': 'Eagles', 'PIT': 'Steelers', 'SEA': 'Seahawks', 'SF': '49ers', 'TB': 'Buccaneers',
    'TEN': 'Titans', 'WAS': 'Commanders',
}
SKILL_POS = {'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST'}
SIT_INJURIES = {'OUT', 'IR', 'PUP', 'DOUBTFUL', 'SUSPENDED', 'NACT', 'COVID-19'}
SOURCE_WEIGHTS = {
    'sleeper': 1.0,
    'espn': 1.0,
}
SOURCE_LABELS = {
    'sleeper': 'Sleeper',
    'espn': 'ESPN',
}
ODDS_TEAM_NAMES = {
    'Arizona Cardinals': 'ARI',
    'Atlanta Falcons': 'ATL',
    'Baltimore Ravens': 'BAL',
    'Buffalo Bills': 'BUF',
    'Carolina Panthers': 'CAR',
    'Chicago Bears': 'CHI',
    'Cincinnati Bengals': 'CIN',
    'Cleveland Browns': 'CLE',
    'Dallas Cowboys': 'DAL',
    'Denver Broncos': 'DEN',
    'Detroit Lions': 'DET',
    'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU',
    'Indianapolis Colts': 'IND',
    'Jacksonville Jaguars': 'JAX',
    'Kansas City Chiefs': 'KC',
    'Las Vegas Raiders': 'LV',
    'Los Angeles Chargers': 'LAC',
    'Los Angeles Rams': 'LAR',
    'Miami Dolphins': 'MIA',
    'Minnesota Vikings': 'MIN',
    'New England Patriots': 'NE',
    'New Orleans Saints': 'NO',
    'New York Giants': 'NYG',
    'New York Jets': 'NYJ',
    'Philadelphia Eagles': 'PHI',
    'Pittsburgh Steelers': 'PIT',
    'San Francisco 49ers': 'SF',
    'Seattle Seahawks': 'SEA',
    'Tampa Bay Buccaneers': 'TB',
    'Tennessee Titans': 'TEN',
    'Washington Commanders': 'WAS',
}
FIRST_NAME_ALIASES = {
    'kenny': ['kenneth'],
    'kenneth': ['kenny'],
    'josh': ['joshua'],
    'joshua': ['josh'],
    'rob': ['robert'],
    'robert': ['rob', 'robbie'],
    'mike': ['michael'],
    'michael': ['mike'],
    'matt': ['matthew'],
    'matthew': ['matt'],
    'chris': ['christopher'],
    'christopher': ['chris'],
    'jon': ['jonathan', 'john'],
    'john': ['jonathan', 'jon'],
    'jonathan': ['jon', 'john'],
    'joe': ['joseph'],
    'joseph': ['joe'],
    'cam': ['cameron'],
    'cameron': ['cam'],
    'will': ['william'],
    'william': ['will'],
    'dj': ['djohnson'],
}

_cache: dict[str, tuple[float, object]] = {}


def _now() -> float:
    return time.time()


def cache_get(key: str):
    row = _cache.get(key)
    if not row:
        return None
    expires, value = row
    if expires < _now():
        _cache.pop(key, None)
        return None
    return value


def cache_set(key: str, value, ttl: int):
    _cache[key] = (_now() + ttl, value)
    return value


def to_float(value, default=None):
    if value in (None, '', '-', 'NA'):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def round1(value):
    if value is None:
        return None
    return round(float(value), 1)


def round2(value):
    if value is None:
        return None
    return round(float(value), 2)


def normalize_team(raw: str) -> str:
    token = str(raw or '').strip().upper()
    if token in {'DST', 'DEF', 'D/ST'}:
        return token
    return TEAM_ALIASES.get(token, token)


def normalize_pos(raw: str) -> str:
    pos = str(raw or '').strip().upper()
    if pos in {'DST', 'D/ST', 'D', 'DEF'}:
        return 'DEF'
    if pos in {'PK'}:
        return 'K'
    return pos


def normalize_name(value: str) -> str:
    name = str(value or '').lower()
    name = re.sub(r'\s+(jr\.?|sr\.?|ii|iii|iv|v|vi)$', '', name)
    return re.sub(r'[^a-z0-9]+', '', name)


def name_keys(value: str) -> set[str]:
    keys = set()
    base = normalize_name(value)
    if base:
        keys.add(base)
    parts = re.sub(r'\.', '', str(value or '').lower()).split()
    if len(parts) >= 2:
        first = re.sub(r'[^a-z]', '', parts[0])
        rest = ' '.join(parts[1:])
        for alias in FIRST_NAME_ALIASES.get(first, []):
            keys.add(normalize_name(f'{alias} {rest}'))
    return keys


def dst_display_name(name: str, team: str = '') -> str:
    code = normalize_team(team)
    nick = TEAM_NICKNAMES.get(code)
    if nick:
        return f'{nick} D/ST'
    cleaned = re.sub(r'\s*(d/?st|defense|def)\s*$', '', str(name or ''), flags=re.I).strip()
    if cleaned:
        return f'{cleaned} D/ST'
    return f'{code} D/ST' if code else (name or 'D/ST')


def lookup_keys(name: str, team: str = '', pos: str = '') -> set[str]:
    keys = name_keys(name)
    pos = normalize_pos(pos)
    code = normalize_team(team)
    lowered = str(name or '').lower()
    is_dst = pos == 'DEF' or 'dst' in normalize_name(name) or 'defense' in lowered
    if is_dst and code:
        keys.add(code.lower())
        keys.update(TEAM_SEARCH_KEYS.get(code, set()))
    for team_code, aliases in TEAM_SEARCH_KEYS.items():
        if keys.intersection(aliases) or normalize_name(name) in aliases:
            keys.update(aliases)
            keys.add(team_code.lower())
    return keys


def names_match(a: str, b: str, team_a: str = '', team_b: str = '', pos_a: str = '', pos_b: str = '') -> bool:
    left = lookup_keys(a, team_a, pos_a)
    return bool(left and left.intersection(lookup_keys(b, team_b, pos_b)))


def scoring_field(scoring: str) -> str:
    key = (scoring or 'half').lower()
    if key in {'ppr'}:
        return 'pts_ppr'
    if key in {'standard', 'std'}:
        return 'pts_std'
    return 'pts_half_ppr'


def parse_te_premium(value) -> float:
    premium = to_float(value, 0) or 0
    return clamp(premium, 0, 2.0)


def _headers(extra=None):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
    }
    if extra:
        headers.update(extra)
    return headers


def http_json(url: str, headers=None, timeout=12):
    req = urllib.request.Request(url, headers=_headers(headers))
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8', errors='replace'))


def _api_keys():
    try:
        from server import THE_ODDS_API_KEY
        return THE_ODDS_API_KEY
    except Exception:
        return ''


def implied_from_spread(total, home_spread):
    if total is None or home_spread is None:
        return None, None
    return round2((total - home_spread) / 2), round2((total + home_spread) / 2)


def load_games_file() -> list[dict]:
    cached = cache_get('games-file')
    if cached is not None:
        return cached
    if not GAMES_PATH.exists():
        return cache_set('games-file', [], CACHE_TTL['games'])
    payload = json.loads(GAMES_PATH.read_text(encoding='utf-8'))
    games = payload.get('games') or []
    return cache_set('games-file', games, CACHE_TTL['games'])


def sleeper_state() -> dict:
    cached = cache_get('sleeper-state')
    if cached is not None:
        return cached
    try:
        data = http_json('https://api.sleeper.app/v1/state/nfl')
    except Exception:
        data = {}
    return cache_set('sleeper-state', data if isinstance(data, dict) else {}, CACHE_TTL['sleeper_state'])


def current_week(requested=None) -> int:
    week = to_float(requested)
    if week and 1 <= week <= 18:
        return int(week)
    state = sleeper_state()
    for key in ('display_week', 'week'):
        value = to_float(state.get(key))
        if value and 1 <= value <= 18:
            return int(value)
    games = load_games_file()
    horizon = time.time() - 12 * 60 * 60
    upcoming = []
    for game in games:
        try:
            kick = str(game.get('kickoff') or '').replace('Z', '+00:00')
            stamp = time.mktime(time.strptime(kick[:19], '%Y-%m-%dT%H:%M:%S')) if kick else 0
        except Exception:
            stamp = 0
        if stamp > horizon:
            upcoming.append(game)
    if upcoming:
        return int(upcoming[0].get('week') or 1)
    return 1


def fetch_live_odds() -> dict:
    cached = cache_get('live-odds')
    if cached is not None:
        return cached
    odds_key = _api_keys()
    result = {}
    if not odds_key:
        return cache_set('live-odds', result, CACHE_TTL['odds'])
    url = (
        'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds'
        f'?regions=us&markets=spreads,totals&oddsFormat=american&apiKey={urllib.parse.quote(odds_key)}'
    )
    try:
        events = http_json(url, timeout=15)
    except Exception:
        return cache_set('live-odds', result, 120)
    if not isinstance(events, list):
        return cache_set('live-odds', result, CACHE_TTL['odds'])
    for event in events:
        home = ODDS_TEAM_NAMES.get(event.get('home_team'), '')
        away = ODDS_TEAM_NAMES.get(event.get('away_team'), '')
        if not home or not away:
            continue
        home_spread = None
        total = None
        for book in event.get('bookmakers') or []:
            for market in book.get('markets') or []:
                if market.get('key') == 'spreads' and home_spread is None:
                    for outcome in market.get('outcomes') or []:
                        if ODDS_TEAM_NAMES.get(outcome.get('name')) == home:
                            home_spread = to_float(outcome.get('point'))
                if market.get('key') == 'totals' and total is None:
                    for outcome in market.get('outcomes') or []:
                        if str(outcome.get('name') or '').lower() == 'over':
                            total = to_float(outcome.get('point'))
            if home_spread is not None and total is not None:
                break
        implied_home, implied_away = implied_from_spread(total, home_spread)
        result[f'{away}@{home}'] = {
            'home': home,
            'away': away,
            'total': total,
            'spread': home_spread,
            'impliedHome': implied_home,
            'impliedAway': implied_away,
        }
    return cache_set('live-odds', result, CACHE_TTL['odds'])


def games_for_week(week: int) -> list[dict]:
    live = fetch_live_odds()
    rows = []
    for game in load_games_file():
        if int(game.get('week') or 0) != int(week):
            continue
        home = normalize_team(game.get('home'))
        away = normalize_team(game.get('away'))
        overlay = live.get(f'{away}@{home}') or {}
        total = overlay.get('total') if overlay.get('total') is not None else to_float(game.get('total'))
        spread = overlay.get('spread') if overlay.get('spread') is not None else to_float(game.get('spread'))
        implied_home = overlay.get('impliedHome')
        implied_away = overlay.get('impliedAway')
        if implied_home is None or implied_away is None:
            implied_home, implied_away = implied_from_spread(total, spread)
            if implied_home is None:
                implied_home = to_float(game.get('impliedHome'))
                implied_away = to_float(game.get('impliedAway'))
        rows.append({
            **game,
            'home': home,
            'away': away,
            'total': total,
            'spread': spread,
            'impliedHome': implied_home,
            'impliedAway': implied_away,
            'oddsLive': bool(overlay),
        })
    return rows


def matchup_for_team(team: str, week: int) -> dict:
    code = normalize_team(team)
    for game in games_for_week(week):
        home = game['home']
        away = game['away']
        if code not in {home, away}:
            continue
        home_side = code == home
        team_spread = game.get('spread') if home_side else (
            -game['spread'] if game.get('spread') is not None else None
        )
        implied = game.get('impliedHome') if home_side else game.get('impliedAway')
        opp_implied = game.get('impliedAway') if home_side else game.get('impliedHome')
        opponent = away if home_side else home
        favorite = team_spread is not None and team_spread < 0
        pickem = team_spread == 0
        favorite_by = abs(team_spread) if favorite else 0
        underdog_by = team_spread if team_spread and team_spread > 0 else 0
        if team_spread is None:
            spread_label = '—'
            lean_label = 'No line yet'
        elif pickem:
            spread_label = f'{code} PK'
            lean_label = "Pick'em"
        elif favorite:
            spread_label = f'{code} -{favorite_by:g}'
            lean_label = f'Favored by {favorite_by:g}'
        else:
            spread_label = f'{code} +{underdog_by:g}'
            lean_label = f'Underdog by {underdog_by:g}'
        return {
            'opponent': opponent,
            'home': home_side,
            'label': f'vs {opponent}' if home_side else f'@{opponent}',
            'kickoff': game.get('kickoff'),
            'status': game.get('status') or '',
            'total': game.get('total'),
            'spread': team_spread,
            'homeSpread': game.get('spread'),
            'spreadLabel': spread_label,
            'leanLabel': lean_label,
            'favorite': favorite,
            'pickem': pickem,
            'favoriteBy': round2(favorite_by) if team_spread is not None else None,
            'underdogBy': round2(underdog_by) if team_spread is not None else None,
            'implied': implied,
            'oppImplied': opp_implied,
            'indoor': bool(game.get('indoor')),
            'stadium': 'Dome' if game.get('indoor') else 'Outdoor',
            'bye': False,
        }
    return {
        'opponent': None,
        'home': False,
        'label': 'BYE',
        'kickoff': None,
        'status': 'Bye week',
        'total': None,
        'spread': None,
        'homeSpread': None,
        'spreadLabel': 'BYE',
        'leanLabel': 'On bye',
        'favorite': False,
        'pickem': False,
        'favoriteBy': None,
        'underdogBy': None,
        'implied': None,
        'oppImplied': None,
        'indoor': False,
        'stadium': 'Bye',
        'bye': True,
    }


def _sleeper_player_name(info: dict) -> str:
    full = str(info.get('full_name') or '').strip()
    if full:
        return full
    first = str(info.get('first_name') or '').strip()
    last = str(info.get('last_name') or '').strip()
    return f'{first} {last}'.strip()


def _espn_id_text(value) -> str:
    if value in (None, '', 0, '0'):
        return ''
    try:
        return str(int(value))
    except (TypeError, ValueError):
        return str(value).strip()


def player_photo_url(player_id: str = '', position: str = '', team: str = '') -> str:
    pos = normalize_pos(position)
    team_code = normalize_team(team)
    if pos == 'DEF' and team_code:
        return f'https://sleepercdn.com/images/team_logos/nfl/{team_code.lower()}.png'
    pid = str(player_id or '').strip()
    if pid:
        return f'https://sleepercdn.com/content/nfl/players/thumb/{pid}.jpg'
    return ''


def sleeper_photo_index() -> dict:
    cached = cache_get('sleeper-photo-index')
    if cached is not None:
        return cached
    players = sleeper_players()
    by_key = {}
    for pid, info in (players or {}).items():
        if not isinstance(info, dict):
            continue
        pos = normalize_pos(info.get('position'))
        if pos not in SKILL_POS:
            continue
        team = normalize_team(info.get('team') or info.get('team_abbr'))
        active = bool(info.get('active')) or str(info.get('status') or '').lower() == 'active'
        if not team and not active:
            continue
        name = _sleeper_player_name(info)
        if pos == 'DEF':
            name = dst_display_name(name, team)
        if not name:
            continue
        record = {
            'sleeperId': str(info.get('player_id') or pid),
            'espnId': _espn_id_text(info.get('espn_id')),
            '_active': active,
        }
        keys = []
        for n in name_keys(name):
            if n and pos and team:
                keys.append(f'{n}|{pos}|{team}')
            if n and pos:
                keys.append(f'{n}|{pos}')
            if n:
                keys.append(n)
        if pos == 'DEF' and team:
            keys.append(f'def|{team}')
        for key in keys:
            existing = by_key.get(key)
            if not existing or (active and not existing.get('_active')):
                by_key[key] = record
    cleaned = {
        key: {'sleeperId': value['sleeperId'], 'espnId': value['espnId']}
        for key, value in by_key.items()
    }
    return cache_set('sleeper-photo-index', cleaned, CACHE_TTL['sleeper_players'])


def sleeper_players() -> dict:
    cached = cache_get('sleeper-players')
    if cached is not None:
        return cached
    try:
        data = http_json('https://api.sleeper.app/v1/players/nfl', timeout=25)
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    return cache_set('sleeper-players', data, CACHE_TTL['sleeper_players'])


def sleeper_projections(week: int) -> list[dict]:
    key = f'sleeper-proj-{SEASON}-{week}'
    cached = cache_get(key)
    if cached is not None:
        return cached
    url = (
        f'https://api.sleeper.app/projections/nfl/{SEASON}/{week}'
        '?season_type=regular&position[]=QB&position[]=RB&position[]=WR'
        '&position[]=TE&position[]=K&position[]=DEF'
    )
    try:
        rows = http_json(url, timeout=20)
    except Exception:
        rows = []
    if not isinstance(rows, list):
        rows = []
    players_map = None
    parsed = []
    for row in rows:
        info = row.get('player') if isinstance(row.get('player'), dict) else {}
        if not isinstance(info, dict):
            info = {}
        name = _sleeper_player_name(info)
        if not name:
            if players_map is None:
                players_map = sleeper_players()
            info = players_map.get(str(row.get('player_id') or ''), {}) or info
            name = _sleeper_player_name(info)
        pos = normalize_pos(info.get('position') or row.get('position'))
        team = normalize_team(info.get('team') or row.get('team'))
        stats = row.get('stats') if isinstance(row.get('stats'), dict) else {}
        if pos == 'DEF':
            name = dst_display_name(name, team)
        if not name or pos not in SKILL_POS:
            continue
        parsed.append({
            'source': 'sleeper',
            'id': str(row.get('player_id') or ''),
            'name': name,
            'position': pos,
            'team': team,
            'opponent': normalize_team(row.get('opponent') or ''),
            'injury': info.get('injury_status') or info.get('status'),
            'points': {
                'pts_std': to_float(stats.get('pts_std')),
                'pts_half_ppr': to_float(stats.get('pts_half_ppr')),
                'pts_ppr': to_float(stats.get('pts_ppr')),
            },
            'stats': {
                'passYds': to_float(stats.get('pass_yd')),
                'passTd': to_float(stats.get('pass_td')),
                'rushAtt': to_float(stats.get('rush_att')),
                'rushYds': to_float(stats.get('rush_yd')),
                'rushTd': to_float(stats.get('rush_td')),
                'rec': to_float(stats.get('rec')),
                'recYds': to_float(stats.get('rec_yd')),
                'recTd': to_float(stats.get('rec_td')),
                'int': to_float(stats.get('pass_int') or stats.get('int')),
                'fgm': to_float(stats.get('fgm')),
                'xpm': to_float(stats.get('xpm')),
                'sack': to_float(stats.get('sack')),
                'defInt': to_float(stats.get('int') if pos == 'DEF' else None),
                'ptsAllow': to_float(stats.get('pts_allow')),
            },
        })
    return cache_set(key, parsed, CACHE_TTL['sleeper_proj'])


def sleeper_week_stats(season: int, week: int) -> dict:
    key = f'sleeper-stats-{season}-{week}'
    cached = cache_get(key)
    if cached is not None:
        return cached
    url = (
        f'https://api.sleeper.com/stats/nfl/{season}/{week}'
        '?season_type=regular&position[]=QB&position[]=RB&position[]=WR'
        '&position[]=TE&position[]=K&position[]=DEF'
    )
    try:
        rows = http_json(url, timeout=20)
    except Exception:
        rows = []
    mapped = {}
    if isinstance(rows, list):
        for row in rows:
            pid = str(row.get('player_id') or '')
            stats = row.get('stats') if isinstance(row.get('stats'), dict) else {}
            if pid:
                mapped[pid] = stats
    return cache_set(key, mapped, CACHE_TTL['sleeper_stats'])


ESPN_STAT_IDS = {
    'passYds': '3',
    'passTd': '4',
    'int': '20',
    'rushAtt': '23',
    'rushYds': '24',
    'rushTd': '25',
    'rec': '53',
    'recYds': '42',
    'recTd': '43',
    'xpm': '86',
    'sack': '99',
    'defInt': '95',
    'ptsAllow': '120',
}
ESPN_FG_MADE_IDS = ('80', '81', '82', '83', '84')


def _espn_week_points(player: dict, week: int):
    weekly = []
    for stat in player.get('stats') or []:
        if stat.get('statSourceId') != 1:
            continue
        if stat.get('scoringPeriodId') != week:
            continue
        if stat.get('statSplitTypeId') == 0:
            continue
        raw = stat.get('stats') if isinstance(stat.get('stats'), dict) else {}
        applied = to_float(stat.get('appliedTotal'))
        if not raw and not applied:
            continue
        weekly.append(stat)
    if not weekly:
        return None, {}
    weekly.sort(key=lambda row: (
        0 if row.get('statSplitTypeId') == 1 else 1,
        -len(row.get('stats') or {}),
    ))
    best = weekly[0]
    raw = best.get('stats') if isinstance(best.get('stats'), dict) else {}
    parsed_stats = {}
    for key, stat_id in ESPN_STAT_IDS.items():
        value = to_float(raw.get(stat_id))
        if value is None:
            value = to_float(raw.get(str(stat_id)))
        if value is not None:
            parsed_stats[key] = value
    fg_buckets = []
    for stat_id in ESPN_FG_MADE_IDS:
        value = to_float(raw.get(stat_id))
        if value is None:
            value = to_float(raw.get(int(stat_id))) if str(stat_id).isdigit() else None
        fg_buckets.append(value)
    if any(value is not None for value in fg_buckets[1:]):
        parsed_stats['fgm'] = round1(sum(value or 0 for value in fg_buckets))
    elif fg_buckets[0] is not None:
        parsed_stats['fgm'] = fg_buckets[0]
    return to_float(best.get('appliedTotal')), parsed_stats


def _espn_fetch_league(week: int, league_id: int) -> list[dict]:
    key = f'espn-{SEASON}-{week}-{league_id}'
    cached = cache_get(key)
    if cached is not None:
        return cached
    url = (
        f'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}'
        f'/segments/0/leaguedefaults/{league_id}?view=kona_player_info&scoringPeriodId={week}'
    )
    fantasy_filter = {
        'players': {
            'limit': 500,
            'sortPercOwned': {'sortPriority': 1, 'sortAsc': False},
            'filterSlotIds': {'value': [0, 2, 4, 6, 16, 17]},
            'filterStatsForCurrentSeasonScoringPeriod': {'value': [week]},
        }
    }
    try:
        data = http_json(url, headers={'X-Fantasy-Filter': json.dumps(fantasy_filter)}, timeout=15)
    except Exception:
        return cache_set(key, [], 120)
    pos_map = {1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF'}
    team_map = {
        1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
        9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
        17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
        25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
    }
    parsed = []
    for entry in data.get('players') or []:
        player = entry.get('player') if isinstance(entry.get('player'), dict) else {}
        name = player.get('fullName') or ''
        pos = normalize_pos((player.get('defaultPosition') or {}).get('abbreviation') if isinstance(player.get('defaultPosition'), dict) else player.get('defaultPositionId'))
        if not pos or pos not in SKILL_POS:
            pos = pos_map.get(player.get('defaultPositionId'), '')
        team = normalize_team(team_map.get(player.get('proTeamId'), ''))
        if pos == 'DEF':
            name = dst_display_name(name, team)
        if not name or pos not in SKILL_POS:
            continue
        points, parsed_stats = _espn_week_points(player, week)
        parsed.append({
            'source': 'espn',
            'name': name,
            'position': pos,
            'team': team,
            'points': points,
            'injury': player.get('injuryStatus'),
            'stats': parsed_stats,
        })
    return cache_set(key, parsed, CACHE_TTL['espn'])


def espn_projections(week: int, scoring: str) -> list[dict]:
    std_rows = _espn_fetch_league(week, 1)
    ppr_rows = _espn_fetch_league(week, 3)
    merged = {}
    for row in std_rows:
        item = dict(row)
        item['pointsStd'] = to_float(row.get('points'))
        item['pointsPpr'] = None
        merged[normalize_name(row.get('name'))] = item
    for row in ppr_rows:
        key = normalize_name(row.get('name'))
        existing = merged.get(key)
        if not existing:
            item = dict(row)
            item['pointsStd'] = None
            item['pointsPpr'] = to_float(row.get('points'))
            merged[key] = item
            continue
        existing['pointsPpr'] = to_float(row.get('points'))
        if not existing.get('team') and row.get('team'):
            existing['team'] = row.get('team')
        if not existing.get('position') and row.get('position'):
            existing['position'] = row.get('position')
        if not existing.get('stats') and row.get('stats'):
            existing['stats'] = row.get('stats')
        elif row.get('stats') and existing.get('stats'):
            for stat_key, value in row['stats'].items():
                existing['stats'].setdefault(stat_key, value)
    scoring = (scoring or 'half').lower()
    for item in merged.values():
        std = to_float(item.get('pointsStd'))
        ppr = to_float(item.get('pointsPpr'))
        recs = to_float((item.get('stats') or {}).get('rec'))
        if recs is None and std is not None and ppr is not None and normalize_pos(item.get('position')) not in {'K', 'DEF'}:
            recs = max(0, ppr - std)
            item['impliedRec'] = round1(recs)
            if recs and not (item.get('stats') or {}).get('rec'):
                item.setdefault('stats', {})['rec'] = round1(recs)
        if scoring == 'ppr':
            item['points'] = ppr if ppr is not None else item.get('points')
        elif scoring in {'standard', 'std'}:
            item['points'] = std if std is not None else item.get('points')
        else:
            if recs is not None and std is not None:
                item['points'] = round1(std + 0.5 * recs)
            elif recs is not None and ppr is not None:
                item['points'] = round1(ppr - 0.5 * recs)
            elif std is not None and ppr is not None:
                item['points'] = round1((std + ppr) / 2)
    return list(merged.values())


def _find_in_source(rows: list[dict], name: str, team: str = '', pos: str = ''):
    name_hits = [
        row for row in rows
        if names_match(
            name,
            row.get('name') or '',
            team,
            row.get('team') or '',
            pos,
            row.get('position') or '',
        )
    ]
    if team:
        team_hits = [row for row in name_hits if not row.get('team') or normalize_team(row.get('team')) == normalize_team(team)]
        if team_hits:
            name_hits = team_hits
    if pos:
        pos_hits = [row for row in name_hits if not row.get('position') or normalize_pos(row.get('position')) == normalize_pos(pos)]
        if pos_hits:
            name_hits = pos_hits
    if not pos:
        query_keys = lookup_keys(name, team, 'DEF')
        looks_like_dst = 'dst' in normalize_name(name) or any(
            query_keys.intersection(aliases | {code.lower()})
            for code, aliases in TEAM_SEARCH_KEYS.items()
        )
        if looks_like_dst:
            dst_hits = [row for row in name_hits if normalize_pos(row.get('position')) == 'DEF']
            if dst_hits:
                name_hits = dst_hits
    return name_hits[0] if name_hits else None


def _league_ppr(scoring: str) -> float:
    key = (scoring or 'half').lower()
    if key in {'ppr'}:
        return 1.0
    if key in {'standard', 'std'}:
        return 0.0
    return 0.5


def _points_from_stats(stats: dict, rec_ppr: float):
    if not stats:
        return None
    pieces = [
        ('passYds', 0.04),
        ('passTd', 4.0),
        ('int', -2.0),
        ('rushYds', 0.1),
        ('rushTd', 6.0),
        ('recYds', 0.1),
        ('recTd', 6.0),
    ]
    total = 0.0
    seen = False
    for key, mult in pieces:
        value = to_float(stats.get(key))
        if value is None:
            continue
        seen = True
        total += value * mult
    recs = to_float(stats.get('rec'))
    if recs is not None:
        seen = True
        total += recs * rec_ppr
    return round1(total) if seen else None


def _source_points(row, scoring: str):
    if not row:
        return None
    points = row.get('points')
    if isinstance(points, dict):
        return to_float(points.get(scoring_field(scoring)))
    return to_float(points)


def _te_bonus(position: str, recs, te_premium: float) -> float:
    if position != 'TE' or not te_premium:
        return 0.0
    catches = to_float(recs) or 0
    return round2(catches * te_premium)


def _format_source_points(row, source: str, scoring: str, position: str, te_premium: float, fallback_rec=None):
    if not row:
        return None, 0.0
    stats = row.get('stats') if isinstance(row.get('stats'), dict) else {}
    recs = to_float(stats.get('rec'))
    if recs is None:
        recs = to_float(row.get('impliedRec'))
    if recs is None:
        recs = to_float(fallback_rec)
    league_ppr = _league_ppr(scoring)
    te_extra = _te_bonus(position, recs, te_premium)

    if source == 'espn':
        std = to_float(row.get('pointsStd'))
        ppr = to_float(row.get('pointsPpr'))
        native = None
        if scoring == 'ppr':
            native = ppr if ppr is not None else (None if std is None or recs is None else std + recs)
        elif scoring == 'standard':
            native = std if std is not None else (None if ppr is None or recs is None else ppr - recs)
        else:
            if recs is not None and std is not None:
                native = std + 0.5 * recs
            elif recs is not None and ppr is not None:
                native = ppr - 0.5 * recs
            elif std is not None and ppr is not None:
                native = (std + ppr) / 2
            else:
                native = std if std is not None else ppr
        if native is None:
            native = _points_from_stats(stats, league_ppr)
        return (None if native is None else round1(native + te_extra), te_extra)

    native = _source_points(row, scoring)
    if native is None:
        native = _points_from_stats(stats, league_ppr)
    return (None if native is None else round1(native + te_extra), te_extra)


def _recent_form(player_id: str, week: int, scoring: str, position: str = '', te_premium: float = 0) -> dict:
    if week <= 2:
        return {
            'games': [],
            'average': None,
            'note': f'Not enough {SEASON} games yet',
            'usedPriorSeason': False,
        }
    field = scoring_field(scoring)
    lookback = [w for w in range(max(1, week - 3), week)]
    note = f'weeks {lookback[0]}-{lookback[-1]}' if lookback else f'Not enough {SEASON} games yet'
    totals = []
    weeks = []
    for prior in lookback:
        stats = sleeper_week_stats(SEASON, prior).get(player_id) or {}
        pts = to_float(stats.get(field))
        if pts is not None:
            if position == 'TE' and te_premium:
                recs = to_float(stats.get('rec')) or 0
                pts = pts + recs * te_premium
            totals.append(pts)
            weeks.append({'week': prior, 'points': round1(pts)})
    avg = sum(totals) / len(totals) if totals else None
    return {
        'games': weeks,
        'average': round1(avg),
        'note': note,
        'usedPriorSeason': False,
    }


def _volume_index(stats: dict, position: str) -> float | None:
    if not stats:
        return None
    if position == 'QB':
        return to_float(stats.get('passYds'))
    if position == 'RB':
        rush = to_float(stats.get('rushAtt')) or 0
        rec = to_float(stats.get('rec')) or 0
        return rush + rec if rush or rec else None
    if position == 'K':
        return to_float(stats.get('fgm'))
    if position == 'DEF':
        return to_float(stats.get('sack'))
    rec = to_float(stats.get('rec'))
    rec_yds = to_float(stats.get('recYds'))
    if rec is None and rec_yds is None:
        return None
    return (rec or 0) + ((rec_yds or 0) / 20.0)


def _adjust(consensus: float, matchup: dict, form: dict, position: str, injury: str, stats: dict, pos_volume_avg: float | None):
    adjustments = []
    injured = str(injury or '').upper()
    if matchup.get('bye'):
        return 0.0, [{'id': 'bye', 'label': 'Bye week', 'delta': 0, 'hard': True}], True
    if injured in SIT_INJURIES:
        return 0.0, [{'id': 'injury', 'label': f'{injured.title()} — sit', 'delta': 0, 'hard': True}], True

    if injured in {'QUESTIONABLE', 'Q'}:
        delta = round2(-0.15 * consensus)
        adjustments.append({'id': 'injury', 'label': 'Questionable', 'delta': delta})

    form_avg = form.get('average')
    if form_avg is not None and consensus:
        ratio = form_avg / max(consensus, 1)
        delta = round2(clamp((ratio - 1) * 0.30 * consensus, -2.5, 2.5))
        if abs(delta) >= 0.15:
            label = 'Above last 3 games' if delta > 0 else 'Below last 3 games'
            adjustments.append({'id': 'form', 'label': label, 'delta': delta})

    implied = matchup.get('implied')
    opp_implied = matchup.get('oppImplied')
    if position == 'DEF':
        if opp_implied is not None:
            delta = round2(clamp((22.5 - opp_implied) * 0.20, -1.8, 1.8))
            if abs(delta) >= 0.05:
                adjustments.append({'id': 'implied', 'label': f'Opp implied {opp_implied:g}', 'delta': delta})
    elif implied is not None:
        delta = round2(clamp((implied - 22.5) * 0.18, -1.8, 1.8))
        if abs(delta) >= 0.05:
            adjustments.append({'id': 'implied', 'label': f'Implied {implied:g}', 'delta': delta})

    team_spread = matchup.get('spread')
    if team_spread is not None:
        if position == 'RB':
            delta = clamp(-team_spread * 0.10, -1.2, 1.2)
        elif position in {'WR', 'TE'}:
            delta = clamp(team_spread * 0.04, -0.6, 0.6)
        elif position == 'DEF':
            delta = clamp(-team_spread * 0.08, -1.2, 1.2)
        elif position == 'K':
            delta = clamp(-team_spread * 0.03, -0.5, 0.5)
        else:
            delta = 0
        delta = round2(delta)
        if abs(delta) >= 0.05:
            adjustments.append({'id': 'spread', 'label': matchup.get('leanLabel') or 'Spread', 'delta': delta})

    if matchup.get('home') and not matchup.get('bye'):
        adjustments.append({'id': 'home', 'label': 'Home game', 'delta': 0.3})

    if matchup.get('indoor') and not matchup.get('bye'):
        if position in {'QB', 'WR', 'TE'}:
            adjustments.append({'id': 'dome', 'label': 'Dome', 'delta': 0.35})
        elif position == 'RB':
            adjustments.append({'id': 'dome', 'label': 'Dome', 'delta': 0.1})
        elif position == 'K':
            adjustments.append({'id': 'dome', 'label': 'Dome', 'delta': 0.2})

    vol = _volume_index(stats, position)
    if vol is not None and pos_volume_avg:
        delta = round2(clamp((vol / pos_volume_avg - 1) * 1.2, -1.5, 1.5))
        if abs(delta) >= 0.15:
            adjustments.append({'id': 'volume', 'label': 'Projected volume', 'delta': delta})

    raw = consensus + sum(item['delta'] for item in adjustments)
    adjusted = round1(clamp(raw, 0.65 * consensus, 1.35 * consensus)) if consensus else 0
    return adjusted, adjustments, False


def _consensus(source_points: dict) -> tuple[float | None, float | None]:
    weighted = []
    values = []
    for key, pts in source_points.items():
        if pts is None:
            continue
        weight = SOURCE_WEIGHTS.get(key, 1)
        weighted.append((pts, weight))
        values.append(pts)
    if not weighted:
        return None, None
    total_w = sum(weight for _pts, weight in weighted)
    avg = sum(pts * weight for pts, weight in weighted) / total_w
    spread = max(values) - min(values) if len(values) > 1 else 0
    return round1(avg), round1(spread)


def _avg_stats(stat_rows: list[dict]) -> dict:
    keys = ('passYds', 'passTd', 'rushAtt', 'rushYds', 'rushTd', 'rec', 'recYds', 'recTd', 'fgm', 'xpm', 'sack', 'defInt', 'ptsAllow')
    out = {}
    for key in keys:
        nums = [to_float(row.get(key)) for row in stat_rows if to_float(row.get(key)) is not None]
        out[key] = round1(sum(nums) / len(nums)) if nums else None
    return out


def search_players(query: str, week=None, limit=8) -> list[dict]:
    week = current_week(week)
    needle = str(query or '').strip()
    if len(needle) < 2:
        return []
    needle_key = normalize_name(needle)
    needle_team = normalize_team(needle)
    is_team_code = needle_team in TEAM_SEARCH_KEYS
    rows = sleeper_projections(week)
    hits = []
    for row in rows:
        name = row.get('name') or ''
        team = row.get('team') or ''
        pos = normalize_pos(row.get('position'))
        keys = lookup_keys(name, team, pos)
        hay = normalize_name(name)
        team_code_hit = bool(is_team_code and needle_team == normalize_team(team) and pos in {'DEF', 'K'})
        if is_team_code:
            matched = team_code_hit or needle_key in keys
        else:
            matched = (
                needle_key in hay
                or needle_key in keys
                or any(needle_key in key for key in keys)
                or needle.lower() in name.lower()
            )
        if not matched:
            continue
        matchup = matchup_for_team(team, week)
        rank = 6
        if hay == needle_key:
            rank = 0
        elif team_code_hit and pos == 'DEF':
            rank = 1
        elif team_code_hit and pos == 'K':
            rank = 2
        elif hay.startswith(needle_key):
            rank = 3
        elif hay.endswith(needle_key):
            rank = 4
        elif needle_key in keys:
            rank = 5
        hits.append({
            'name': name,
            'position': pos,
            'team': team,
            'sleeperId': row.get('id') or '',
            'photo': player_photo_url(row.get('id') or '', pos, team),
            'matchupLabel': matchup.get('label'),
            'total': matchup.get('total'),
            'implied': matchup.get('implied'),
            '_rank': rank,
            '_rostered': 0 if team else 1,
        })
    hits.sort(key=lambda item: (item['_rank'], item['_rostered'], item.get('name') or ''))
    out = []
    for item in hits[:limit]:
        item.pop('_rank', None)
        item.pop('_rostered', None)
        out.append(item)
    return out


def compare_players(names: list[str], week=None, scoring='half', te_premium=0) -> dict:
    week = current_week(week)
    scoring = (scoring or 'half').lower()
    if scoring not in {'half', 'ppr', 'standard', 'std'}:
        scoring = 'half'
    if scoring == 'std':
        scoring = 'standard'
    te_premium = parse_te_premium(te_premium)
    clean_names = []
    for name in names or []:
        text = str(name or '').strip()
        if text and text not in clean_names:
            clean_names.append(text)
    if len(clean_names) < 2:
        return {'ok': False, 'error': 'Pick at least two players to compare.', 'status': 400}

    source_errors = {}

    def load_sleeper():
        return sleeper_projections(week)

    def load_espn():
        try:
            return espn_projections(week, scoring)
        except Exception as exc:
            source_errors['espn'] = str(exc)
            return []

    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_sleeper = pool.submit(load_sleeper)
        fut_espn = pool.submit(load_espn)
        sleeper_rows = fut_sleeper.result()
        espn_rows = fut_espn.result()

    if not espn_rows:
        source_errors.setdefault('espn', 'No weekly projections returned')

    volume_samples = []
    built = []
    for name in clean_names:
        sleeper_row = _find_in_source(sleeper_rows, name)
        team = (sleeper_row or {}).get('team') or ''
        pos = (sleeper_row or {}).get('position') or ''
        espn_row = _find_in_source(espn_rows, name, team, pos)
        identity = sleeper_row or espn_row
        if not identity:
            built.append({'name': name, 'missing': True, 'error': 'Player not found in weekly boards'})
            continue
        pos = identity.get('position') or pos
        team = identity.get('team') or team
        matchup = matchup_for_team(team, week)
        fallback_rec = None
        for src_row in (sleeper_row, espn_row):
            if not src_row:
                continue
            rec = to_float((src_row.get('stats') or {}).get('rec'))
            if rec is None:
                rec = to_float(src_row.get('impliedRec'))
            if rec is not None:
                fallback_rec = rec
                break
        sleeper_pts, sleeper_te = _format_source_points(sleeper_row, 'sleeper', scoring, pos, te_premium, fallback_rec)
        espn_pts, espn_te = _format_source_points(espn_row, 'espn', scoring, pos, te_premium, fallback_rec)
        source_points = {
            'sleeper': sleeper_pts,
            'espn': espn_pts,
        }
        source_stats = [row.get('stats') or {} for row in (sleeper_row, espn_row) if row]
        stats = _avg_stats(source_stats)
        if stats.get('rec') is None and fallback_rec is not None:
            stats['rec'] = round1(fallback_rec)
        te_bonus = _te_bonus(pos, stats.get('rec'), te_premium)
        consensus, spread_range = _consensus(source_points)
        form = _recent_form((sleeper_row or {}).get('id') or '', week, scoring, pos, te_premium)
        volume_samples.append(_volume_index(stats, pos))
        injury = (sleeper_row or {}).get('injury') or (espn_row or {}).get('injury')
        built.append({
            'name': identity.get('name') or name,
            'position': pos,
            'team': team,
            'sleeperId': (sleeper_row or {}).get('id') or '',
            'photo': player_photo_url((sleeper_row or {}).get('id') or '', pos, team),
            'injury': injury,
            'matchup': matchup,
            'sources': {
                'sleeper': {'label': SOURCE_LABELS['sleeper'], 'points': round1(sleeper_pts), 'teBonus': round2(sleeper_te) or None},
                'espn': {'label': SOURCE_LABELS['espn'], 'points': round1(espn_pts), 'teBonus': round2(espn_te) or None},
            },
            'stats': stats,
            'consensus': consensus,
            'sourceSpread': spread_range,
            'teBonus': te_bonus or None,
            'form': form,
            'injuryStatus': injury,
        })

    pos_volume = {}
    for row in built:
        if row.get('missing'):
            continue
        pos = row.get('position')
        vol = _volume_index(row.get('stats') or {}, pos)
        if vol is not None:
            pos_volume.setdefault(pos, []).append(vol)

    players = []
    scored = []
    for row in built:
        if row.get('missing'):
            players.append(row)
            continue
        pos = row.get('position')
        samples = pos_volume.get(pos) or []
        pos_avg = sum(samples) / len(samples) if samples else None
        consensus = row.get('consensus') or 0
        adjusted, adjustments, hard_sit = _adjust(
            consensus,
            row.get('matchup') or {},
            row.get('form') or {},
            pos,
            row.get('injury'),
            row.get('stats') or {},
            pos_avg,
        )
        row['adjusted'] = adjusted
        row['adjustments'] = adjustments
        row['hardSit'] = hard_sit
        players.append(row)
        if not hard_sit and adjusted is not None:
            scored.append(row)

    recommendation = None
    if len(scored) >= 2:
        ranked = sorted(scored, key=lambda item: item.get('adjusted') or 0, reverse=True)
        start = ranked[0]
        sits = ranked[1:]
        margin = round1((start.get('adjusted') or 0) - (sits[0].get('adjusted') or 0))
        if margin >= 3:
            confidence = 'high'
            summary = f"Start {start['name']}. Clear edge on adjusted points ({start['adjusted']} vs {sits[0]['adjusted']})."
        elif margin >= 1.2:
            confidence = 'medium'
            summary = f"Lean {start['name']} over {sits[0]['name']} ({start['adjusted']} vs {sits[0]['adjusted']})."
        else:
            confidence = 'low'
            summary = f"Toss-up, slight lean {start['name']} ({start['adjusted']} vs {sits[0]['adjusted']})."
        for row in players:
            if row.get('missing'):
                continue
            if row.get('hardSit') or row.get('matchup', {}).get('bye'):
                row['verdict'] = 'sit'
            elif row['name'] == start['name']:
                row['verdict'] = 'start'
            else:
                row['verdict'] = 'sit'
        recommendation = {
            'start': start['name'],
            'sit': [row['name'] for row in sits],
            'margin': margin,
            'confidence': confidence,
            'summary': summary,
        }
    else:
        for row in players:
            if row.get('missing'):
                continue
            row['verdict'] = 'sit' if row.get('hardSit') else 'start'

    available = []
    if sleeper_rows:
        available.append('sleeper')
    if espn_rows:
        available.append('espn')

    return {
        'ok': True,
        'week': week,
        'season': SEASON,
        'scoring': scoring,
        'tePremium': te_premium,
        'sources': available,
        'sourceErrors': source_errors,
        'players': players,
        'recommendation': recommendation,
    }


def meta(week=None, scoring='half') -> dict:
    week = current_week(week)
    games = []
    for game in games_for_week(week):
        games.append({
            'away': game.get('away'),
            'home': game.get('home'),
            'short': game.get('short'),
            'total': game.get('total'),
            'spread': game.get('spread'),
            'impliedHome': game.get('impliedHome'),
            'impliedAway': game.get('impliedAway'),
            'status': game.get('status'),
            'kickoff': game.get('kickoff'),
            'oddsLive': game.get('oddsLive'),
        })
    return {
        'ok': True,
        'week': week,
        'season': SEASON,
        'scoring': scoring,
        'games': games,
        'sourceLabels': SOURCE_LABELS,
    }
