"""Build the Underdog draft-assistant player board from existing ranking files."""
from __future__ import annotations

import json
import re

from server import load_bestball_rankings, load_rotoballer_rankings, load_user_state

_SUFFIX_RE = re.compile(r'\s+(jr\.?|sr\.?|ii|iii|iv|vi|vii|viii|ix|x)$', re.I)
_NON_ALNUM_RE = re.compile(r'[^a-z0-9]+')
_SKILL_POSITIONS = {'QB', 'RB', 'WR', 'TE'}


def normalize_name(value):
    name = str(value or '').lower()
    name = _SUFFIX_RE.sub('', name)
    return _NON_ALNUM_RE.sub('', name)


def normalize_position(value):
    pos = str(value or '').upper().strip()
    if pos in {'K', 'PK'}:
        return 'K'
    if pos in {'D', 'DST', 'DEF'}:
        return 'DEF'
    return pos


def rank_key(player):
    return (
        f"{normalize_name(player.get('name'))}-"
        f"{normalize_name(player.get('position'))}-"
        f"{normalize_name(player.get('team'))}"
    )


def _valid_rank(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 0:
        return number
    return None


def parse_state(state_json):
    if not state_json:
        return {}
    if isinstance(state_json, dict):
        return state_json
    if isinstance(state_json, str):
        try:
            parsed = json.loads(state_json)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _saved_rank_map(state):
    ranks = {}
    saved = state.get('savedCustomRanks') or {}
    raw_ranks = saved.get('ranks') or {}
    if isinstance(raw_ranks, dict):
        for key, value in raw_ranks.items():
            rank = _valid_rank(value)
            if key and rank is not None:
                ranks[str(key)] = rank

    for player in state.get('players') or []:
        if not isinstance(player, dict):
            continue
        if player.get('manualRank') is not True:
            continue
        rank = _valid_rank(player.get('myRank'))
        if rank is None:
            continue
        ranks[rank_key(player)] = rank
    return ranks


def _lookup_saved_rank(player, ranks):
    direct = ranks.get(rank_key(player))
    if direct is not None:
        return direct

    player_name = normalize_name(player.get('name'))
    player_position = normalize_name(player.get('position'))
    player_team = normalize_name(player.get('team'))
    for key, rank in ranks.items():
        parts = str(key).split('-')
        if len(parts) < 3:
            continue
        saved_team = parts.pop()
        saved_position = parts.pop()
        saved_name = ''.join(parts)
        if (
            saved_name == player_name
            and saved_position == player_position
            and saved_team == player_team
        ):
            return rank
    return None


def _index_players(rows):
    indexed = {}
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        name = (row.get('name') or '').strip()
        if not name:
            continue
        key = rank_key(row)
        indexed[key] = row
        name_only = normalize_name(name)
        indexed.setdefault(name_only, row)
    return indexed


def build_assistant_board(username=None, password=None, rank_source='expert'):
    """Return a merged Underdog best-ball board.

    By default uses expert best-ball ranks from underdog-bestball-rankings.csv.
    Pass rank_source='custom' to overlay a logged-in user's saved ranks instead.
    """
    use_custom = str(rank_source or 'expert').lower() == 'custom'
    bestball = load_bestball_rankings()
    if bestball.get('error'):
        raise RuntimeError(bestball['error'])
    underdog = load_rotoballer_rankings()
    if underdog.get('error'):
        underdog = {'players': []}

    adp_index = _index_players(underdog.get('players'))
    saved_ranks = {}
    logged_in = False
    saved_count = 0

    if username and password:
        state_json = load_user_state(username, password)
        if state_json == 'INVALID_PASSWORD':
            return {'ok': False, 'error': 'Invalid username or password', 'status': 401}
        state = parse_state(state_json)
        saved_ranks = _saved_rank_map(state)
        saved_count = len(saved_ranks)
        logged_in = True

    players = []
    seen = set()
    for row in bestball.get('players') or []:
        name = (row.get('name') or '').strip()
        position = normalize_position(row.get('position'))
        if not name or position not in _SKILL_POSITIONS:
            continue
        player = {
            'name': name,
            'position': position,
            'team': (row.get('team') or '').strip().upper(),
            'bye': row.get('bye') or '',
            'opponent': row.get('opponent') or '',
            'projectedPoints': _valid_rank(row.get('points')),
            'sosRank': _valid_rank(row.get('sosRank')),
            'expertRank': _valid_rank(row.get('rank') or row.get('adpBestball')),
            'adp': None,
            'myRank': None,
            'posRank': row.get('posRank') or '',
        }
        key = rank_key(player)
        if key in seen:
            continue
        seen.add(key)

        adp_row = adp_index.get(key) or adp_index.get(normalize_name(name))
        if adp_row:
            player['adp'] = _valid_rank(adp_row.get('adpUnderdog') or adp_row.get('rank'))
            if not player['projectedPoints']:
                player['projectedPoints'] = _valid_rank(adp_row.get('points'))
            if not player['sosRank']:
                player['sosRank'] = _valid_rank(adp_row.get('sosRank'))
            if not player['team'] and adp_row.get('team'):
                player['team'] = str(adp_row.get('team')).strip().upper()

        custom = _lookup_saved_rank(player, saved_ranks) if use_custom else None
        player['myRank'] = custom if custom is not None else player['expertRank']
        player['hasCustomRank'] = custom is not None
        players.append(player)

    max_proj = max((p.get('projectedPoints') or 0) for p in players) if players else 1
    for player in players:
        proj = player.get('projectedPoints') or 0
        player['projectionPct'] = round((proj / max_proj) * 100, 1) if max_proj else 0

    players.sort(key=lambda item: (item['myRank'] is None, item['myRank'] or 9999, item['name']))

    return {
        'ok': True,
        'source': 'underdog-bestball',
        'rankSource': 'custom' if use_custom else 'expert',
        'loggedIn': logged_in,
        'username': username if logged_in else None,
        'savedRankCount': saved_count,
        'playerCount': len(players),
        'players': players,
    }
