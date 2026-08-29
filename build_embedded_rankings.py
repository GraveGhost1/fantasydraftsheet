import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_espn():
    players = []
    with open(ROOT / 'espn-rankings.csv', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            players.append(
                {
                    'rank': int(row.get('RK', 0) or 0),
                    'name': row.get('Player', ''),
                    'position': row.get('Pos', ''),
                    'team': row.get('Team', ''),
                    'adpESPN': float(row.get('ADP (ESPN)', 0) or 0),
                    'expertRank': int(row.get('RK', 0) or 0),
                }
            )
    return {'players': players}


def load_yahoo():
    players = []
    with open(ROOT / 'yahoo-rankings.csv', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            players.append(
                {
                    'rank': int(row.get('RK', 0) or 0),
                    'name': row.get('Player', ''),
                    'position': row.get('Pos', ''),
                    'team': row.get('Team', ''),
                    'adpYahoo': float(row.get('ADP (Y!)', 0) or 0),
                }
            )
    return {'players': players}


def load_rotoballer():
    players = []
    with open(ROOT / 'rotoballer-rankings.csv', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            players.append(
                {
                    'rank': int(row.get('RK', 0) or 0),
                    'name': row.get('Player', ''),
                    'position': row.get('Pos', ''),
                    'team': row.get('Team', ''),
                    'adpUnderdog': float(row.get('ADP (Underdog)', 0) or 0),
                }
            )
    return {'players': players}


def load_ffpc():
    players = []
    with open(ROOT / 'ffpc-rankings.csv', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            players.append(
                {
                    'rank': int(row.get('RK', 0) or 0),
                    'name': row.get('Player', ''),
                    'position': row.get('Pos', ''),
                    'team': row.get('Team', ''),
                    'adpFFPC': float(row.get('ADP (FFPC)', 0) or 0),
                }
            )
    return {'players': players}


def load_sleeper():
    players = []
    with open(ROOT / 'sleeper-rankings.csv', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            players.append(
                {
                    'rank': int(row.get('RK', 0) or 0),
                    'name': row.get('Player', ''),
                    'position': row.get('Pos', ''),
                    'team': row.get('Team', ''),
                    'adpSleeper': float(row.get('ADP (Sleeper)', 0) or 0),
                }
            )
    return {'players': players}


def main():
    payload = {
        'espn': load_espn(),
        'yahoo': load_yahoo(),
        'rotoballer': load_rotoballer(),
        'ffpc': load_ffpc(),
        'sleeper': load_sleeper(),
    }
    print(json.dumps(payload, separators=(',', ':')))


if __name__ == '__main__':
    main()
