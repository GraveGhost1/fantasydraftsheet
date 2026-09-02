"""Fetch ESPN NFL schedule grid and emit extension/data/nfl-schedule-2026.json."""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'extension' / 'data' / 'nfl-schedule-2026.json'
OUT_JS = ROOT / 'extension' / 'data' / 'nfl-schedule-2026.js'
URL = 'https://www.espn.com/nfl/schedulegrid'

# Fantasy CSVs often use WAS; ESPN uses WSH.
ALIASES = {
    'WSH': 'WAS',
    'JAC': 'JAX',
    'LA': 'LAR',
}

DOME_TEAMS = {'ATL', 'ARI', 'DAL', 'DET', 'HOU', 'IND', 'LV', 'LAR', 'MIN', 'NO', 'WAS', 'WSH'}

# Approximate best-ball playoff game tiers (higher = better stack environment).
# Keys are sorted team pair "AAA|BBB".
GAME_TIERS = {
    'BAL|CIN': 98,
    'CHI|DET': 94,
    'DAL|NYG': 90,
    'KC|LAC': 88,
    'BUF|MIA': 86,
    'PHI|SF': 84,
    'LAR|TB': 82,
    'JAX|WAS': 78,
    'WSH|JAX': 78,
    'DEN|NE': 72,
    'GB|HOU': 70,
    'MIN|NYJ': 68,
    'SEA|CAR': 66,
    'NO|TB': 64,
}


def normalize_team(raw: str) -> str:
    token = raw.strip().upper()
    if token == 'BYE':
        return 'BYE'
    token = re.sub(r'^@', '', token)
    return ALIASES.get(token, token)


def parse_opponent(cell: str) -> dict:
    cell = cell.strip()
    if not cell or cell.upper() == 'BYE':
        return {'opponent': 'BYE', 'home': None, 'raw': cell}
    home = not cell.startswith('@')
    opp = normalize_team(cell)
    return {'opponent': opp, 'home': home, 'raw': cell}


def fetch_html() -> str:
    req = Request(URL, headers={'User-Agent': 'Mozilla/5.0 (compatible; FantasyDraftSheet/1.0)'})
    with urlopen(req, timeout=20) as response:
        return response.read().decode('utf-8', errors='replace')


def parse_schedule(html: str) -> dict:
    teams: dict[str, list[str]] = {}
    row_re = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S | re.I)
    cell_re = re.compile(r'<td[^>]*>(.*?)</td>', re.S | re.I)
    team_re = re.compile(r'>([A-Z]{2,3})</a>', re.I)

    for row_html in row_re.findall(html):
        cells = cell_re.findall(row_html)
        if len(cells) < 19:
            continue
        team_match = team_re.search(cells[0])
        if not team_match:
            continue
        team = normalize_team(team_match.group(1))
        weeks = []
        for cell in cells[1:19]:
            text = re.sub(r'<[^>]+>', '', cell).strip()
            weeks.append(text)
        teams[team] = weeks

    if len(teams) < 20:
        raise RuntimeError(f'Expected ~32 teams, parsed {len(teams)}')

    payload = {
        'source': URL,
        'season': 2026,
        'teams': {},
    }

    for team, weeks in teams.items():
        w15 = parse_opponent(weeks[14])
        w16 = parse_opponent(weeks[15])
        w17 = parse_opponent(weeks[16])
        pair_key = '|'.join(sorted([team, w17['opponent']])) if w17['opponent'] != 'BYE' else ''
        game_tier = GAME_TIERS.get(pair_key, 55)
        payload['teams'][team] = {
            'weeks': weeks,
            'playoff': {
                '15': w15,
                '16': w16,
                '17': w17,
            },
            'dome': team in DOME_TEAMS or team == 'WSH',
            'w17GameTier': game_tier,
        }

    return payload


def write_js(data: dict) -> None:
    compact = {
        'source': data['source'],
        'season': data['season'],
        'teams': {
            team: {
                'dome': info['dome'],
                'w17GameTier': info['w17GameTier'],
                'playoff': info['playoff'],
            }
            for team, info in data['teams'].items()
        },
    }
    body = json.dumps(compact, separators=(',', ':'))
    OUT_JS.write_text(
        '(function (global) {\n'
        f'  global.FDSNflSchedule2026 = {body};\n'
        '})(typeof window !== "undefined" ? window : globalThis);\n',
        encoding='utf-8',
    )


def main() -> None:
    html = fetch_html()
    data = parse_schedule(html)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2), encoding='utf-8')
    write_js(data)
    print(f'Wrote {OUT} and {OUT_JS} with {len(data["teams"])} teams')


if __name__ == '__main__':
    main()
