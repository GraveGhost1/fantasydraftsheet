import csv
from datetime import datetime
from pathlib import Path

from server import load_espn_rankings, load_ffpc_rankings, load_rotoballer_rankings, load_yahoo_rankings, load_standard_rankings

ROOT = Path(__file__).resolve().parent

CSV_FILES = [
    'espn-rankings.csv',
    'yahoo-rankings.csv',
    'standard-rankings.csv',
    'rotoballer-rankings.csv',
    'ffpc-rankings.csv',
    'sleeper-rankings.csv',
]

LOADERS = {
    'espn-rankings.csv': load_espn_rankings,
    'yahoo-rankings.csv': load_yahoo_rankings,
    'standard-rankings.csv': load_standard_rankings,
    'rotoballer-rankings.csv': load_rotoballer_rankings,
    'ffpc-rankings.csv': load_ffpc_rankings,
}


def load_sleeper_preview():
    path = ROOT / 'sleeper-rankings.csv'
    players = []
    with open(path, encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            players.append(
                {
                    'rank': int(row.get('RK', 0) or 0),
                    'name': row.get('Player', ''),
                    'adpSleeper': float(row.get('ADP (Sleeper)', 0) or 0),
                }
            )
    return players


def main():
    print('CSV file status:')
    for name in CSV_FILES:
        path = ROOT / name
        if not path.exists():
            print(f'  {name}: MISSING')
            continue
        modified = datetime.fromtimestamp(path.stat().st_mtime).strftime('%Y-%m-%d %H:%M:%S')
        lines = sum(1 for _ in open(path, encoding='utf-8'))
        print(f'  {name}: {lines} lines, modified {modified}')

    for name, loader in LOADERS.items():
        data = loader()
        players = data.get('players', [])
        print(f'\n{name}: {len(players)} players loaded')
        for player in players[:5]:
            adp = next((player[key] for key in player if key.lower().startswith('adp') and player[key]), player.get('rank'))
            print(f'  #{player.get("rank")} {player.get("name")} ADP={adp}')

    sleeper_players = load_sleeper_preview()
    print(f'\nsleeper-rankings.csv: {len(sleeper_players)} players parsed')
    for player in sleeper_players[:5]:
        print(f'  #{player["rank"]} {player["name"]} ADP={player["adpSleeper"]}')


if __name__ == '__main__':
    main()
