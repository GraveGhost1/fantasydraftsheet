import json
import os
import sqlite3
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse, unquote

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get('PORT', 8000))
PROXY_TIMEOUT_SECONDS = 8
DB_PATH = ROOT / 'adp_profile.db'


def init_db():
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
        conn.commit()


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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

        if parsed.path == '/proxy':
            self.handle_proxy(parsed)
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

        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(b'Not Found')

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
