import json
import os
import sqlite3
import time
import hashlib
import re
import secrets
import smtplib
import urllib.request
import csv
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse, unquote

try:
    from pymongo import MongoClient
except ImportError:  # Keep the local SQLite fallback usable before install.
    MongoClient = None

ROOT = Path(__file__).resolve().parent


def load_local_env(path):
    """Load simple KEY=value credentials for local development only."""
    if not path.exists():
        return
    try:
        for raw_line in path.read_text(encoding='utf-8').splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)
    except OSError as exc:
        print(f'[DB] Could not read local env file: {exc}', flush=True)


load_local_env(ROOT / 'atlas-credentials.env')
load_local_env(ROOT / '.env')

PORT = int(os.environ.get('PORT', 8000))
PROXY_TIMEOUT_SECONDS = 8
DB_PATH = Path(os.environ.get('DB_PATH', ROOT / 'adp_profile.db'))
MONGODB_URI = os.environ.get('MONGODB_URI')
MONGODB_DATABASE = os.environ.get('MONGODB_DATABASE', 'fantasy_draft_sheet')
APP_BASE_URL = os.environ.get('APP_BASE_URL', 'http://localhost:8000').rstrip('/')
APP_ENV = os.environ.get('APP_ENV', 'development').lower()
_mongo_client = None
_mongo_db = None


def ensure_db_directory():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_mongo_db():
    """Return the configured Atlas database, or None when Mongo is unavailable."""
    global _mongo_client, _mongo_db
    if not MONGODB_URI or MongoClient is None:
        return None
    if _mongo_db is None:
        _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        _mongo_client.admin.command('ping')
        _mongo_db = _mongo_client[MONGODB_DATABASE]
        _mongo_db.user_states.create_index('username', unique=True)
        print(f'[DB] Using MongoDB database: {MONGODB_DATABASE}', flush=True)
    return _mongo_db

# API configurations
FANTASYPROS_API_KEY = 'PNnzNP9Brm5ZdldankRwc8l6Z1z9HpJR1KKEQTjF'
FANTASYNERDS_API_KEY = 'TEST'
THE_ODDS_API_KEY = '14c838df8c4ec407c40336ca9594213b'


def parse_csv_points(row):
    """Prefer current-season projections over prior-year actual points."""
    for key in ('PTS (Projections)', 'PTS'):
        raw = row.get(key)
        if raw in (None, ''):
            continue
        try:
            return float(raw)
        except (TypeError, ValueError):
            continue
    return 0


def load_rotoballer_rankings():
    """Load and parse the Underdog/Rotoballer CSV rankings file"""
    csv_path = ROOT / 'rotoballer-rankings.csv'
    if not csv_path.exists():
        return {'error': 'Underdog rankings file not found'}
    
    try:
        players = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    player = {
                        'rank': int(row.get('RK', 0)),
                        'name': row.get('Player', ''),
                        'position': row.get('Pos', ''),
                        'team': row.get('Team', ''),
                        'bye': row.get('BYE', ''),
                        'opponent': row.get('Opp', ''),
                        'points': parse_csv_points(row),
                        'sosRank': int(row.get('SoS Rank', 0)) if row.get('SoS Rank') else 0,
                        'adpUnderdog': float(row.get('ADP (Underdog)', 0)) if row.get('ADP (Underdog)') else 0,
                        'posRank': row.get('P-RK', ''),
                        'auctionValue': row.get('Auction $', ''),
                        'targetRound': row.get('Target Round', ''),
                        'expertRank': int(row.get('RK', 0))  # Rotoballer's expert ranking
                    }
                    players.append(player)
                except (ValueError, KeyError) as e:
                    print(f'[UNDERDOG] Error parsing row: {e}', flush=True)
                    continue
        
        return {'players': players}
    except Exception as exc:
        print(f'[UNDERDOG] Error loading CSV: {exc}', flush=True)
        return {'error': str(exc)}

def load_ghost_rankings():
    """Load and parse Ghost's personal rankings CSV file"""
    csv_path = ROOT / 'ghost-underdog-rankings.csv'
    if not csv_path.exists():
        return {'error': 'Ghost rankings file not found'}
    
    try:
        players = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    player = {
                        'rank': int(row.get('RK', 0)),
                        'name': row.get('Player', ''),
                        'position': row.get('Pos', ''),
                        'team': row.get('Team', ''),
                        'personalRank': float(row.get('Personal Rank', 0)) if row.get('Personal Rank') else 0
                    }
                    players.append(player)
                except (ValueError, KeyError) as e:
                    print(f'[GHOST] Error parsing row: {e}', flush=True)
                    continue
        
        return {'players': players}
    except Exception as exc:
        print(f'[GHOST] Error loading CSV: {exc}', flush=True)
        return {'error': str(exc)}

def load_ffpc_rankings():
    """Load and parse the FFPC CSV rankings file"""
    csv_path = ROOT / 'ffpc-rankings.csv'
    if not csv_path.exists():
        return {'error': 'FFPC rankings file not found'}
    
    try:
        players = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    player = {
                        'rank': int(row.get('RK', 0)),
                        'name': row.get('Player', ''),
                        'position': row.get('Pos', ''),
                        'team': row.get('Team', ''),
                        'bye': row.get('BYE', ''),
                        'opponent': row.get('Opp', ''),
                        'points': parse_csv_points(row),
                        'sosRank': int(row.get('SoS Rank', 0)) if row.get('SoS Rank') else 0,
                        'adpFFPC': float(row.get('ADP (FFPC)', 0)) if row.get('ADP (FFPC)') else 0,
                        'posRank': row.get('P-RK', ''),
                        'auctionValue': row.get('Auction $', ''),
                        'targetRound': row.get('Target Round', ''),
                        'expertRank': int(row.get('RK', 0))  # Rotoballer's expert ranking
                    }
                    players.append(player)
                except (ValueError, KeyError) as e:
                    print(f'[FFPC] Error parsing row: {e}', flush=True)
                    continue
        
        return {'players': players}
    except Exception as exc:
        print(f'[FFPC] Error loading CSV: {exc}', flush=True)
        return {'error': str(exc)}
    """Load and parse the FFPC CSV rankings file"""
    csv_path = ROOT / 'ffpc-rankings.csv'
    if not csv_path.exists():
        return {'error': 'FFPC rankings file not found'}
    
    try:
        players = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    player = {
                        'rank': int(row.get('RK', 0)),
                        'name': row.get('Player', ''),
                        'position': row.get('Pos', ''),
                        'team': row.get('Team', ''),
                        'bye': row.get('BYE', ''),
                        'opponent': row.get('Opp', ''),
                        'points': parse_csv_points(row),
                        'sosRank': int(row.get('SoS Rank', 0)) if row.get('SoS Rank') else 0,
                        'adpFFPC': float(row.get('ADP (FFPC)', 0)) if row.get('ADP (FFPC)') else 0,
                        'posRank': row.get('P-RK', ''),
                        'auctionValue': row.get('Auction $', ''),
                        'targetRound': row.get('Target Round', ''),
                        'expertRank': int(row.get('RK', 0))  # Rotoballer's expert ranking
                    }
                    players.append(player)
                except (ValueError, KeyError) as e:
                    print(f'[FFPC] Error parsing row: {e}', flush=True)
                    continue
        
        return {'players': players}
    except Exception as exc:
        print(f'[FFPC] Error loading CSV: {exc}', flush=True)
        return {'error': str(exc)}

def load_yahoo_style_rankings(csv_name, label):
    """Load a Yahoo-style rankings CSV (RK + ADP (Y!))."""
    csv_path = ROOT / csv_name
    log_label = label.upper()
    if not csv_path.exists():
        return {'error': f'{label} rankings file not found'}

    try:
        players = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    player = {
                        'rank': int(row.get('RK', 0)),
                        'name': row.get('Player', ''),
                        'position': row.get('Pos', ''),
                        'team': row.get('Team', ''),
                        'bye': row.get('BYE', ''),
                        'opponent': row.get('Opp', ''),
                        'points': parse_csv_points(row),
                        'sosRank': int(row.get('SoS Rank', 0)) if row.get('SoS Rank') else 0,
                        'adpYahoo': float(row.get('ADP (Y!)', 0)) if row.get('ADP (Y!)') else 0,
                        'posRank': row.get('P-RK', ''),
                        'auctionValue': row.get('Auction $', ''),
                        'targetRound': row.get('Target Round', ''),
                        'expertRank': int(row.get('RK', 0))
                    }
                    players.append(player)
                except (ValueError, KeyError) as e:
                    print(f'[{log_label}] Error parsing row: {e}', flush=True)
                    continue

        return {'players': players}
    except Exception as exc:
        print(f'[{log_label}] Error loading CSV: {exc}', flush=True)
        return {'error': str(exc)}


def load_yahoo_rankings():
    """Load and parse the half-PPR Yahoo CSV rankings file"""
    return load_yahoo_style_rankings('yahoo-rankings.csv', 'Yahoo')


def load_standard_rankings():
    """Load and parse the standard-scoring Yahoo CSV rankings file"""
    return load_yahoo_style_rankings('standard-rankings.csv', 'Standard')

def load_espn_rankings():
    """Load and parse the ESPN CSV rankings file"""
    csv_path = ROOT / 'espn-rankings.csv'
    if not csv_path.exists():
        return {'error': 'ESPN rankings file not found'}
    
    try:
        players = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    player = {
                        'rank': int(row.get('RK', 0)),
                        'name': row.get('Player', ''),
                        'position': row.get('Pos', ''),
                        'team': row.get('Team', ''),
                        'bye': row.get('BYE', ''),
                        'opponent': row.get('Opp', ''),
                        'points': parse_csv_points(row),
                        'sosRank': int(row.get('SoS Rank', 0)) if row.get('SoS Rank') else 0,
                        'adpESPN': float(row.get('ADP (ESPN)', 0)) if row.get('ADP (ESPN)') else 0,
                        'posRank': row.get('P-RK', ''),
                        'auctionValue': row.get('Auction $', ''),
                        'targetRound': row.get('Target Round', ''),
                        'expertRank': int(row.get('RK', 0))  # Rotoballer's expert ranking
                    }
                    players.append(player)
                except (ValueError, KeyError) as e:
                    print(f'[ESPN] Error parsing row: {e}', flush=True)
                    continue
        
        return {'players': players}
    except Exception as exc:
        print(f'[ESPN] Error loading CSV: {exc}', flush=True)
        return {'error': str(exc)}

def load_sleeper_rankings():
    """Load and parse the Sleeper CSV rankings file"""
    csv_path = ROOT / 'sleeper-rankings.csv'
    if not csv_path.exists():
        return {'error': 'Sleeper rankings file not found'}

    try:
        players = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    player = {
                        'rank': int(row.get('RK', 0)),
                        'name': row.get('Player', ''),
                        'position': row.get('Pos', ''),
                        'team': row.get('Team', ''),
                        'bye': row.get('BYE', ''),
                        'opponent': row.get('Opp', ''),
                        'points': parse_csv_points(row),
                        'sosRank': int(row.get('SoS Rank', 0)) if row.get('SoS Rank') else 0,
                        'adpSleeper': float(row.get('ADP (Sleeper)', 0)) if row.get('ADP (Sleeper)') else 0,
                        'posRank': row.get('P-RK', ''),
                        'auctionValue': row.get('Auction $', ''),
                        'targetRound': row.get('Target Round', ''),
                        'expertRank': int(row.get('RK', 0))
                    }
                    players.append(player)
                except (ValueError, KeyError) as e:
                    print(f'[SLEEPER] Error parsing row: {e}', flush=True)
                    continue

        return {'players': players}
    except Exception as exc:
        print(f'[SLEEPER] Error loading CSV: {exc}', flush=True)
        return {'error': str(exc)}

def init_db():
    ensure_db_directory()
    print(f'[DB] Using database at {DB_PATH}', flush=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS adp_profile (
                profile_key TEXT PRIMARY KEY,
                name TEXT,
                position TEXT,
                team TEXT,
                total_pick_no REAL NOT NULL,
                sample_count INTEGER NOT NULL,
                average_pick_no REAL NOT NULL,
                last_seen_at INTEGER NOT NULL
            )
            '''
        )
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS adp_profile_meta (
                meta_key TEXT PRIMARY KEY,
                meta_value TEXT NOT NULL
            )
            '''
        )
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS user_states (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                state_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            '''
        )
        for column, definition in (
            ('email', 'TEXT'),
            ('reset_token_hash', 'TEXT'),
            ('reset_expires_at', 'INTEGER')
        ):
            try:
                conn.execute(f'ALTER TABLE user_states ADD COLUMN {column} {definition}')
            except sqlite3.OperationalError:
                pass
        conn.commit()

    if MONGODB_URI and MongoClient is not None:
        try:
            get_mongo_db()
        except Exception as exc:
            print(f'[DB] MongoDB connection check failed: {exc}', flush=True)


def load_adp_profile():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            '''
            SELECT profile_key, name, position, team, total_pick_no,
                   sample_count, average_pick_no, last_seen_at
            FROM adp_profile
            '''
        ).fetchall()

        meta_row = conn.execute(
            'SELECT meta_value FROM adp_profile_meta WHERE meta_key = ?',
            ('total_samples',)
        ).fetchone()

    players = {}
    for row in rows:
        players[row['profile_key']] = {
            'name': row['name'] or '',
            'position': row['position'] or '',
            'team': row['team'] or '',
            'totalPickNo': float(row['total_pick_no']),
            'count': int(row['sample_count']),
            'averagePickNo': float(row['average_pick_no']),
            'lastSeenAt': int(row['last_seen_at'])
        }

    if meta_row:
        try:
            total_samples = int(meta_row['meta_value'])
        except ValueError:
            total_samples = sum(player['count'] for player in players.values())
    else:
        total_samples = sum(player['count'] for player in players.values())

    return {
        'totalSamples': total_samples,
        'players': players
    }


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def normalize_email(email):
    return str(email or '').strip().lower()


def is_valid_email(email):
    return bool(re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', normalize_email(email)))


def _get_user_document(username):
    mongo_db = get_mongo_db()
    if mongo_db is not None:
        return mongo_db.user_states.find_one({'_id': username})

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            '''
            SELECT username, password_hash, state_json, updated_at, email,
                   reset_token_hash, reset_expires_at
            FROM user_states
            WHERE username = ?
            ''',
            (username,)
        ).fetchone()
    return dict(row) if row else None


def ensure_user_account(username, password, email=''):
    """Validate credentials and attach an email to new/legacy accounts."""
    username = str(username or '').strip()
    email = normalize_email(email)
    if not username or not password:
        return 'MISSING_FIELDS'
    if email and not is_valid_email(email):
        return 'INVALID_EMAIL'

    document = _get_user_document(username)
    if document and document.get('password_hash') != hash_password(password):
        return 'INVALID_PASSWORD'

    existing_email = normalize_email(document.get('email')) if document else ''
    if existing_email and email and existing_email != email:
        return 'EMAIL_ALREADY_SET'

    if document:
        if not existing_email and email:
            mongo_db = get_mongo_db()
            if mongo_db is not None:
                mongo_db.user_states.update_one({'_id': username}, {'$set': {'email': email}})
            else:
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute('UPDATE user_states SET email = ? WHERE username = ?', (email, username))
                    conn.commit()
        return 'OK'

    if not email:
        return 'EMAIL_REQUIRED'

    password_hash = hash_password(password)
    mongo_db = get_mongo_db()
    if mongo_db is not None:
        mongo_db.user_states.insert_one({
            '_id': username,
            'username': username,
            'password_hash': password_hash,
            'email': email,
            'state_json': None,
            'updated_at': int(time.time())
        })
    else:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                '''
                INSERT INTO user_states
                    (username, password_hash, state_json, updated_at, email)
                VALUES (?, ?, ?, ?, ?)
                ''',
                (username, password_hash, '', int(time.time()), email)
            )
            conn.commit()
    return 'CREATED'


def save_user_state(username, password, state_json):
    password_hash = hash_password(password)
    mongo_db = get_mongo_db()
    if mongo_db is not None:
        mongo_db.user_states.update_one(
            {'_id': username},
            {'$set': {
                'username': username,
                'password_hash': password_hash,
                'state_json': state_json,
                'updated_at': int(time.time())
            }},
            upsert=True
        )
        return

    with sqlite3.connect(DB_PATH) as conn:
        updated = conn.execute(
            '''
            UPDATE user_states
            SET password_hash = ?, state_json = ?, updated_at = ?
            WHERE username = ?
            ''',
            (password_hash, state_json, int(time.time()), username)
        ).rowcount
        if not updated:
            conn.execute(
                '''
                INSERT INTO user_states (username, password_hash, state_json, updated_at)
                VALUES (?, ?, ?, ?)
                ''',
                (username, password_hash, state_json, int(time.time()))
            )
        conn.commit()


def load_user_state(username, password):
    password_hash = hash_password(password)
    mongo_db = get_mongo_db()
    if mongo_db is not None:
        document = mongo_db.user_states.find_one({'_id': username})
        if not document:
            return None
        if document.get('password_hash') != password_hash:
            return 'INVALID_PASSWORD'
        return document.get('state_json')

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            'SELECT state_json, password_hash FROM user_states WHERE username = ?',
            (username,)
        ).fetchone()
        if row and row['password_hash'] == password_hash:
            return row['state_json']
        if row and row['password_hash'] != password_hash:
            return 'INVALID_PASSWORD'
        return None


def send_password_reset_email(email, token):
    reset_url = f'{APP_BASE_URL}/?reset_token={token}'
    smtp_host = os.environ.get('SMTP_HOST')
    if not smtp_host:
        if APP_ENV != 'production':
            print(f'[AUTH] Development password reset link: {reset_url}', flush=True)
            return
        raise RuntimeError('SMTP_HOST is not configured')

    smtp_port = int(os.environ.get('SMTP_PORT', '587'))
    smtp_username = os.environ.get('SMTP_USERNAME')
    smtp_password = os.environ.get('SMTP_PASSWORD')
    from_email = os.environ.get('SMTP_FROM_EMAIL', smtp_username or 'no-reply@localhost')
    message = EmailMessage()
    message['Subject'] = 'Reset your Fantasy Draft Sheet password'
    message['From'] = from_email
    message['To'] = email
    message.set_content(
        'Use this link to reset your Fantasy Draft Sheet password. '
        f'The link expires in 15 minutes:\n\n{reset_url}\n'
    )

    if smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as smtp:
            if smtp_username and smtp_password:
                smtp.login(smtp_username, smtp_password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        if smtp_username and smtp_password:
            smtp.login(smtp_username, smtp_password)
        smtp.send_message(message)


def request_password_reset(email):
    email = normalize_email(email)
    if not is_valid_email(email):
        return

    mongo_db = get_mongo_db()
    if mongo_db is not None:
        document = mongo_db.user_states.find_one({'email': email})
    else:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute('SELECT * FROM user_states WHERE email = ?', (email,)).fetchone()
        document = dict(row) if row else None

    if not document:
        return

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = int(time.time()) + 15 * 60
    if mongo_db is not None:
        mongo_db.user_states.update_one(
            {'_id': document['_id']},
            {'$set': {'reset_token_hash': token_hash, 'reset_expires_at': expires_at}}
        )
    else:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                'UPDATE user_states SET reset_token_hash = ?, reset_expires_at = ? WHERE username = ?',
                (token_hash, expires_at, document['username'])
            )
            conn.commit()

    try:
        send_password_reset_email(email, token)
    except Exception:
        if mongo_db is not None:
            mongo_db.user_states.update_one(
                {'_id': document['_id']},
                {'$unset': {'reset_token_hash': '', 'reset_expires_at': ''}}
            )
        else:
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute(
                    'UPDATE user_states SET reset_token_hash = NULL, reset_expires_at = NULL WHERE username = ?',
                    (document['username'],)
                )
                conn.commit()
        raise


def reset_password(token, new_password):
    if not token or not new_password or len(new_password) < 8:
        return False

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = int(time.time())
    mongo_db = get_mongo_db()
    if mongo_db is not None:
        document = mongo_db.user_states.find_one({
            'reset_token_hash': token_hash,
            'reset_expires_at': {'$gt': now}
        })
        if not document:
            return False
        mongo_db.user_states.update_one(
            {'_id': document['_id']},
            {'$set': {'password_hash': hash_password(new_password)},
             '$unset': {'reset_token_hash': '', 'reset_expires_at': ''}}
        )
        return True

    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            '''
            SELECT username FROM user_states
            WHERE reset_token_hash = ? AND reset_expires_at > ?
            ''',
            (token_hash, now)
        ).fetchone()
        if not row:
            return False
        conn.execute(
            '''
            UPDATE user_states
            SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL
            WHERE username = ?
            ''',
            (hash_password(new_password), row[0])
        )
        conn.commit()
    return True


def save_adp_profile(payload):
    if not isinstance(payload, dict):
        raise ValueError('Invalid payload format')

    players = payload.get('players', {})
    if not isinstance(players, dict):
        raise ValueError('Invalid players object')

    total_samples = payload.get('totalSamples')
    if not isinstance(total_samples, (int, float)):
        total_samples = 0

    normalized_rows = []
    for profile_key, value in players.items():
        if not isinstance(profile_key, str) or not isinstance(value, dict):
            continue

        count = value.get('count')
        total_pick_no = value.get('totalPickNo')
        if not isinstance(count, (int, float)) or not isinstance(total_pick_no, (int, float)):
            continue

        count = int(count)
        total_pick_no = float(total_pick_no)
        if count <= 0:
            continue

        average_pick_no = value.get('averagePickNo')
        if not isinstance(average_pick_no, (int, float)):
            average_pick_no = total_pick_no / count

        last_seen_at = value.get('lastSeenAt')
        if not isinstance(last_seen_at, (int, float)):
            last_seen_at = 0

        normalized_rows.append((
            profile_key,
            str(value.get('name') or ''),
            str(value.get('position') or ''),
            str(value.get('team') or ''),
            total_pick_no,
            count,
            float(average_pick_no),
            int(last_seen_at)
        ))

    if not total_samples:
        total_samples = sum(row[5] for row in normalized_rows)

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('BEGIN')
        conn.execute('DELETE FROM adp_profile')
        conn.executemany(
            '''
            INSERT INTO adp_profile (
                profile_key, name, position, team, total_pick_no,
                sample_count, average_pick_no, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            normalized_rows
        )
        conn.execute(
            '''
            INSERT INTO adp_profile_meta(meta_key, meta_value)
            VALUES(?, ?)
            ON CONFLICT(meta_key) DO UPDATE SET meta_value=excluded.meta_value
            ''',
            ('total_samples', str(int(total_samples)))
        )
        conn.commit()

class Handler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/test':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'message': 'Server is working'}).encode('utf-8'))
            return

        if parsed.path == '/adp-profile':
            self.handle_get_adp_profile()
            return

        if parsed.path == '/api/user-state':
            self.handle_get_user_state()
            return

        if parsed.path == '/proxy':
            self.handle_proxy(parsed)
            return

        if parsed.path == '/api/fantasypros':
            self.handle_fantasypros(parsed)
            return

        if parsed.path == '/api/fantasynerds':
            self.handle_fantasynerds(parsed)
            return

        if parsed.path == '/api/theodds':
            self.handle_theodds(parsed)
            return

        if parsed.path == '/api/rotoballer':
            self.handle_rotoballer(parsed)
            return

        if parsed.path == '/api/ffpc':
            self.handle_ffpc(parsed)
            return

        if parsed.path == '/api/ghost':
            self.handle_ghost(parsed)
            return

        if parsed.path == '/api/yahoo':
            self.handle_yahoo(parsed)
            return

        if parsed.path == '/api/standard':
            self.handle_standard(parsed)
            return

        if parsed.path == '/api/espn':
            self.handle_espn(parsed)
            return

        if parsed.path == '/api/sleeper':
            self.handle_sleeper(parsed)
            return

        if parsed.path in ('/', '/index.html'):
            target = ROOT / 'index.html'
        else:
            target = ROOT / parsed.path.lstrip('/')

        if target.exists() and target.is_file():
            self.send_response(200)
            self.send_header('Content-Type', self.content_type_for(target))
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(target.read_bytes())
        else:
            self.send_response(404)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(b'Not Found')

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/adp-profile':
            self.handle_post_adp_profile()
            return

        if parsed.path == '/api/user-state':
            self.handle_post_user_state()
            return

        if parsed.path == '/api/account':
            self.handle_post_account()
            return

        if parsed.path == '/api/password-reset/request':
            self.handle_password_reset_request()
            return

        if parsed.path == '/api/password-reset/confirm':
            self.handle_password_reset_confirm()
            return

        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(b'Not Found')

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/user-state':
            self.handle_delete_user_state()
            return

        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(b'Not Found')

    def handle_fantasypros(self, parsed):
        """Fetch FantasyPros rankings server-side to bypass CORS"""
        try:
            season = parsed.query.split('season=')[1].split('&')[0] if 'season=' in parsed.query else '2026'
            # FantasyPros requires position parameter - fetch all positions
            positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
            all_players = []
            
            for position in positions:
                url = f'https://api.fantasypros.com/public/v2/json/nfl/{season}/consensus-rankings?scoring=ppr&position={position}'
                print(f'[FANTASYPROS] Fetching {position}: {url}', flush=True)
                
                req = urllib.request.Request(url, headers={
                    'x-api-key': FANTASYPROS_API_KEY,
                    'User-Agent': 'Mozilla/5.0'
                })
                
                with urllib.request.urlopen(req, timeout=15) as response:
                    body = response.read()
                    print(f'[FANTASYPROS] {position} response status: {response.status}, body length: {len(body)}', flush=True)
                    data = json.loads(body.decode())
                    if data.get('players'):
                        all_players.extend(data['players'])
            
            result = {'players': all_players}
            result_json = json.dumps(result).encode('utf-8')
            print(f'[FANTASYPROS] Total players fetched: {len(all_players)}', flush=True)
            
            self.send_response(200)
            self._set_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result_json)
            print(f'[FANTASYPROS] Success: returned {len(result_json)} bytes', flush=True)
        except urllib.error.HTTPError as e:
            print(f'[FANTASYPROS] HTTP Error: {e.code} - {e.reason}', flush=True)
            print(f'[FANTASYPROS] Response body: {e.read().decode() if hasattr(e, "read") else "N/A"}', flush=True)
            self.send_response(502)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'HTTP {e.code}: {e.reason}'}).encode('utf-8'))
        except Exception as exc:
            print(f'[FANTASYPROS] ERROR: {type(exc).__name__}: {exc}', flush=True)
            import traceback
            traceback.print_exc()
            self.send_response(502)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_fantasynerds(self, parsed):
        """Fetch FantasyNerds projections server-side to bypass CORS"""
        try:
            url = f'https://api.fantasynerds.com/v1/nfl/draft-projections?apikey={FANTASYNERDS_API_KEY}'
            print(f'[FANTASYNERDS] Fetching: {url}', flush=True)
            
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            
            with urllib.request.urlopen(req, timeout=15) as response:
                body = response.read()
                print(f'[FANTASYNERDS] Response status: {response.status}, body length: {len(body)}', flush=True)
                
                self.send_response(200)
                self._set_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(body)
        except Exception as exc:
            print(f'[FANTASYNERDS] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(502)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_theodds(self, parsed):
        """Fetch The Odds API data server-side to bypass CORS"""
        try:
            # Get NFL events with player props
            url = f'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=player_pass_tds,player_rush_tds,player_reception_tds,player_pass_yds,player_rush_yds,player_reception_yds&apiKey={THE_ODDS_API_KEY}'
            print(f'[THEODDS] Fetching: {url}', flush=True)
            
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            
            with urllib.request.urlopen(req, timeout=15) as response:
                body = response.read()
                print(f'[THEODDS] Response status: {response.status}, body length: {len(body)}', flush=True)
                
                self.send_response(200)
                self._set_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(body)
        except Exception as exc:
            print(f'[THEODDS] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(502)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_rotoballer(self, parsed):
        """Serve Underdog rankings from local CSV file"""
        try:
            data = load_rotoballer_rankings()
            result_json = json.dumps(data).encode('utf-8')
            print(f'[UNDERDOG] Serving {len(data.get("players", []))} players', flush=True)
            
            self.send_response(200)
            self._set_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result_json)
        except Exception as exc:
            print(f'[UNDERDOG] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(500)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_ffpc(self, parsed):
        """Serve FFPC rankings from local CSV file"""
        try:
            data = load_ffpc_rankings()
            result_json = json.dumps(data).encode('utf-8')
            print(f'[FFPC] Serving {len(data.get("players", []))} players', flush=True)
            
            self.send_response(200)
            self._set_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result_json)
        except Exception as exc:
            print(f'[FFPC] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(500)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_ghost(self, parsed):
        """Serve Ghost's personal rankings from local CSV file"""
        try:
            data = load_ghost_rankings()
            result_json = json.dumps(data).encode('utf-8')
            print(f'[GHOST] Serving {len(data.get("players", []))} players', flush=True)
            
            self.send_response(200)
            self._set_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result_json)
        except Exception as exc:
            print(f'[GHOST] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(500)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_yahoo(self, parsed):
        """Serve Yahoo rankings from local CSV file"""
        try:
            data = load_yahoo_rankings()
            result_json = json.dumps(data).encode('utf-8')
            print(f'[YAHOO] Serving {len(data.get("players", []))} players', flush=True)
            
            self.send_response(200)
            self._set_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result_json)
        except Exception as exc:
            print(f'[YAHOO] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(500)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_standard(self, parsed):
        """Serve standard-scoring Yahoo rankings from local CSV file"""
        try:
            data = load_standard_rankings()
            result_json = json.dumps(data).encode('utf-8')
            print(f'[STANDARD] Serving {len(data.get("players", []))} players', flush=True)

            self.send_response(200)
            self._set_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result_json)
        except Exception as exc:
            print(f'[STANDARD] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(500)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_espn(self, parsed):
        """Serve ESPN rankings from local CSV file"""
        try:
            data = load_espn_rankings()
            result_json = json.dumps(data).encode('utf-8')
            print(f'[ESPN] Serving {len(data.get("players", []))} players', flush=True)
            
            self.send_response(200)
            self._set_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result_json)
        except Exception as exc:
            print(f'[ESPN] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(500)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_sleeper(self, parsed):
        """Serve Sleeper rankings from local CSV file"""
        try:
            data = load_sleeper_rankings()
            result_json = json.dumps(data).encode('utf-8')
            print(f'[SLEEPER] Serving {len(data.get("players", []))} players', flush=True)

            self.send_response(200)
            self._set_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result_json)
        except Exception as exc:
            print(f'[SLEEPER] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(500)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_get_adp_profile(self):
        try:
            payload = load_adp_profile()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode('utf-8'))
        except Exception as exc:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_post_adp_profile(self):
        try:
            content_length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            content_length = 0

        try:
            body = self.rfile.read(content_length) if content_length > 0 else b'{}'
            payload = json.loads(body.decode('utf-8'))
            save_adp_profile(payload)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
        except Exception as exc:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_get_user_state(self):
        try:
            params = parse_qs(urlparse(self.path).query)
            username = params.get('username', [None])[0]
            password = params.get('password', [None])[0]
            
            if not username or not password:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing username or password'}).encode('utf-8'))
                return
            
            state_json = load_user_state(username, password)
            if state_json == 'INVALID_PASSWORD':
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Invalid username or password'}).encode('utf-8'))
                return
            if not state_json:
                # First time login - no saved state
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'state': None}).encode('utf-8'))
                return
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'state': state_json}).encode('utf-8'))
        except Exception as exc:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_post_user_state(self):
        try:
            content_length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            content_length = 0

        try:
            body = self.rfile.read(content_length) if content_length > 0 else b'{}'
            payload = json.loads(body.decode('utf-8'))
            
            username = payload.get('username')
            password = payload.get('password')
            state_json = payload.get('state')
            
            if not username or not password or state_json is None:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing username, password, or state'}).encode('utf-8'))
                return
            
            save_user_state(username, password, state_json)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
        except Exception as exc:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def _read_json_body(self):
        try:
            content_length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            content_length = 0
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        return json.loads(body.decode('utf-8'))

    def _write_json(self, payload, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def handle_post_account(self):
        try:
            payload = self._read_json_body()
            status = ensure_user_account(
                payload.get('username'),
                payload.get('password'),
                payload.get('email')
            )
            status_codes = {
                'INVALID_PASSWORD': (401, 'Invalid username or password'),
                'EMAIL_REQUIRED': (400, 'Email is required when creating a new account'),
                'INVALID_EMAIL': (400, 'Enter a valid email address'),
                'EMAIL_ALREADY_SET': (409, 'That account already has a different email address'),
                'MISSING_FIELDS': (400, 'Missing username or password')
            }
            if status in status_codes:
                code, message = status_codes[status]
                self._write_json({'error': message}, code)
                return
            self._write_json({'ok': True, 'created': status == 'CREATED'})
        except Exception as exc:
            self._write_json({'error': str(exc)}, 500)

    def handle_password_reset_request(self):
        try:
            payload = self._read_json_body()
            request_password_reset(payload.get('email'))
            self._write_json({
                'ok': True,
                'message': 'If an account uses that email, a reset link has been sent.'
            })
        except Exception as exc:
            self._write_json({'error': str(exc)}, 500)

    def handle_password_reset_confirm(self):
        try:
            payload = self._read_json_body()
            if not reset_password(payload.get('token'), payload.get('password')):
                self._write_json({'error': 'This reset link is invalid or expired.'}, 400)
                return
            self._write_json({'ok': True})
        except Exception as exc:
            self._write_json({'error': str(exc)}, 500)

    def handle_delete_user_state(self):
        try:
            params = parse_qs(urlparse(self.path).query)
            username = params.get('username', [None])[0]
            password = params.get('password', [None])[0]
            
            if not username or not password:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing username or password'}).encode('utf-8'))
                return
            
            password_hash = hash_password(password)
            with sqlite3.connect(DB_PATH) as conn:
                conn.row_factory = sqlite3.Row
                row = conn.execute(
                    'SELECT password_hash FROM user_states WHERE username = ?',
                    (username,)
                ).fetchone()
                if row and row['password_hash'] == password_hash:
                    conn.execute('DELETE FROM user_states WHERE username = ?', (username,))
                    conn.commit()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
                    return
            
            self.send_response(401)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Invalid username or password'}).encode('utf-8'))
        except Exception as exc:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def handle_proxy(self, parsed):
        params = parse_qs(parsed.query)
        target_url = params.get('url', [None])[0]
        if not target_url:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing url parameter'}).encode('utf-8'))
            return

        target_url = unquote(target_url)
        print(f'[PROXY] Fetching: {target_url}', flush=True)
        try:
            req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=PROXY_TIMEOUT_SECONDS) as response:
                body = response.read()
                content_type = response.headers.get('content-type', '')
                print(f'[PROXY] Response status: {response.status}, content-type: {content_type}, body length: {len(body)}', flush=True)
                
                # Validate that we're getting JSON, not HTML error pages
                # Check body content since some APIs return JSON with wrong content-type
                if body.startswith(b'<!DOCTYPE') or body.startswith(b'<html'):
                    print(f'[PROXY] ERROR: Non-JSON response detected', flush=True)
                    self.send_response(502)
                    self.send_header('Content-Type', 'application/json')
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': f'External API returned HTML error page (content-type: {content_type})'}).encode('utf-8'))
                    return
                
                self.send_response(200)
                self._set_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(body)
                print(f'[PROXY] Success: proxied {len(body)} bytes, set content-type to application/json', flush=True)
        except Exception as exc:
            print(f'[PROXY] ERROR: {type(exc).__name__}: {exc}', flush=True)
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))

    def content_type_for(self, path: Path) -> str:
        if path.suffix == '.html':
            return 'text/html; charset=utf-8'
        if path.suffix == '.css':
            return 'text/css; charset=utf-8'
        if path.suffix == '.js':
            return 'application/javascript; charset=utf-8'
        if path.suffix == '.json':
            return 'application/json; charset=utf-8'
        return 'application/octet-stream'

if __name__ == '__main__':
    init_db()
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Serving at http://127.0.0.1:{PORT}')
    server.serve_forever()
