"""Fetch ESPN NFL scoreboard weeks and emit kickoff-dated games for slate detection."""
from __future__ import annotations

import json
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'extension' / 'data' / 'nfl-games-2026.json'
OUT_JS = ROOT / 'extension' / 'data' / 'nfl-games-2026.js'
SEASON = 2026
SEASON_TYPE = 2
WEEKS = range(1, 19)
ET = ZoneInfo('America/New_York')
SCHEDULE_URL = (
    'https://cdn.espn.com/core/nfl/schedule'
    f'?xhr=1&year={SEASON}&seasontype={SEASON_TYPE}&week={{week}}'
)

ALIASES = {
    'WSH': 'WAS',
    'JAC': 'JAX',
    'LA': 'LAR',
}


def normalize_team(raw: str) -> str:
    token = str(raw or '').strip().upper()
    return ALIASES.get(token, token)


def fetch_json(url: str) -> dict:
    curl = shutil.which('curl') or shutil.which('curl.exe')
    if curl:
        result = subprocess.run(
            [curl, '-fsS', '--max-time', '20', url],
            check=True,
            capture_output=True,
            text=True,
            encoding='utf-8',
        )
        return json.loads(result.stdout)
    req = Request(url, headers={
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        ),
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.espn.com/nfl/schedule',
    })
    with urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode('utf-8', errors='replace'))


def events_from_schedule(payload: dict) -> list[dict]:
    schedule = ((payload.get('content') or {}).get('schedule') or {})
    events: list[dict] = []
    if isinstance(schedule, dict):
        for day in schedule.values():
            events.extend((day or {}).get('games') or [])
    return events


def kickoff_iso(raw: str) -> str:
    text = str(raw or '').strip()
    if not text:
        return ''
    if text.endswith('Z') and len(text) == 17:
        return text.replace('Z', ':00Z')
    return text


def parse_event(event: dict) -> dict | None:
    competitions = event.get('competitions') or []
    if not competitions:
        return None
    comp = competitions[0]
    competitors = comp.get('competitors') or []
    home = next((row for row in competitors if row.get('homeAway') == 'home'), None)
    away = next((row for row in competitors if row.get('homeAway') == 'away'), None)
    if not home or not away:
        return None

    home_team = normalize_team((home.get('team') or {}).get('abbreviation'))
    away_team = normalize_team((away.get('team') or {}).get('abbreviation'))
    if not home_team or not away_team:
        return None

    odds = (comp.get('odds') or [{}])[0]
    venue = comp.get('venue') or {}
    status = (comp.get('status') or event.get('status') or {}).get('type') or {}
    raw_broadcast = comp.get('broadcast') or ''
    if isinstance(raw_broadcast, dict):
        raw_broadcast = raw_broadcast.get('shortName') or raw_broadcast.get('name') or ''
    week = int((event.get('week') or {}).get('number') or event.get('_week') or 0)
    if week < 1:
        return None

    return {
        'id': str(event.get('id') or comp.get('id') or f'{away_team}-{home_team}-w{week}'),
        'week': week,
        'kickoff': kickoff_iso(comp.get('date') or event.get('date') or event.get('startDate')),
        'away': away_team,
        'home': home_team,
        'broadcast': str(raw_broadcast or ''),
        'indoor': bool(venue.get('indoor')),
        'neutral': bool(comp.get('neutralSite')),
        'total': odds.get('overUnder'),
        'timeValid': bool(comp.get('timeValid', True)),
        'flexTbd': bool((comp.get('status') or {}).get('isTBDFlex')),
        'short': event.get('shortName') or f'{away_team} @ {home_team}',
        'status': status.get('shortDetail') or status.get('detail') or '',
    }


def et_parts(kickoff: str) -> tuple[str, int] | None:
    if not kickoff:
        return None
    stamp = kickoff.replace('Z', '+00:00')
    try:
        dt = datetime.fromisoformat(stamp).astimezone(ET)
    except ValueError:
        return None
    return dt.strftime('%a'), dt.hour


def in_primetime(parts: tuple[str, int] | None) -> bool:
    if not parts:
        return False
    weekday, hour = parts
    return weekday in {'Wed', 'Thu'} and hour >= 19


def in_sunday(parts: tuple[str, int] | None) -> bool:
    if not parts:
        return False
    weekday, hour = parts
    return weekday == 'Sun' and hour >= 12


def build_games() -> list[dict]:
    games: list[dict] = []
    seen: set[str] = set()
    for week in WEEKS:
        payload = fetch_json(SCHEDULE_URL.format(week=week))
        for event in events_from_schedule(payload):
            if isinstance(event, dict) and not (event.get('week') or {}).get('number'):
                event = {**event, 'week': {'number': week}}
            game = parse_event(event)
            if not game or not game['kickoff']:
                continue
            if game['id'] in seen:
                continue
            seen.add(game['id'])
            games.append(game)
        time.sleep(0.15)
    games.sort(key=lambda row: (row['week'], row['kickoff'], row['away']))
    return games


def write_js(data: dict) -> None:
    body = json.dumps(data, separators=(',', ':'))
    OUT_JS.write_text(
        '(function (global) {\n'
        f'  global.FDSNflGames2026 = {body};\n'
        '})(typeof window !== "undefined" ? window : globalThis);\n',
        encoding='utf-8',
    )


def summarize(games: list[dict]) -> str:
    week1 = [game for game in games if game['week'] == 1]
    prime = [game for game in week1 if in_primetime(et_parts(game['kickoff']))]
    sunday = [game for game in week1 if in_sunday(et_parts(game['kickoff']))]
    prime_label = ', '.join(f"{g['away']}@{g['home']}" for g in prime) or 'none'
    sunday_count = len(sunday)
    return (
        f'{len(games)} games across {len({g["week"] for g in games})} weeks; '
        f'Week 1 primetime: {prime_label}; Week 1 Sunday: {sunday_count} games'
    )


def main() -> None:
    games = build_games()
    if len(games) < 200:
        raise RuntimeError(f'Expected ~272 regular-season games, got {len(games)}')
    data = {
        'source': 'https://cdn.espn.com/core/nfl/schedule',
        'season': SEASON,
        'updatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'games': games,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2), encoding='utf-8')
    write_js(data)
    print(f'Wrote {OUT} and {OUT_JS}')
    print(summarize(games))


if __name__ == '__main__':
    main()
