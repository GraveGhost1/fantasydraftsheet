from flask import Flask, request, jsonify, send_from_directory, send_file
from server import init_db, load_adp_profile, save_adp_profile, save_user_state, load_user_state
import os
from pathlib import Path

app = Flask(__name__, static_folder='.')
ROOT = Path(__file__).resolve().parent

@app.route('/')
def serve_index():
    return send_from_directory(ROOT, 'index.html')

@app.route('/fantasy-draft-sheet-standalone.html')
def serve_standalone():
    return send_from_directory(ROOT, 'fantasy-draft-sheet-standalone.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(ROOT, path)

@app.route('/adp-profile', methods=['GET'])
def get_adp_profile():
    try:
        payload = load_adp_profile()
        return jsonify(payload)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500

@app.route('/adp-profile', methods=['POST'])
def post_adp_profile():
    try:
        payload = request.get_json() or {}
        save_adp_profile(payload)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400

@app.route('/proxy')
def proxy():
    from urllib.parse import urlparse, parse_qs, unquote
    import urllib.request
    import json
    
    parsed = urlparse(request.url)
    params = parse_qs(parsed.query)
    target_url = params.get('url', [None])[0]
    
    if not target_url:
        return jsonify({'error': 'Missing url parameter'}), 400
    
    try:
        target_url = unquote(target_url)
        req = urllib.request.Request(
            target_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            data = response.read()
            return jsonify(json.loads(data.decode('utf-8')))
    except Exception as exc:
        return jsonify({'error': str(exc)}), 502

@app.route('/api/user-state', methods=['POST'])
def save_user_state_api():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        state_json = data.get('state')
        
        if not username or not password or not state_json:
            return jsonify({'error': 'Missing username, password, or state'}), 400
        
        save_user_state(username, password, state_json)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500

@app.route('/api/user-state', methods=['GET'])
def load_user_state_api():
    try:
        username = request.args.get('username')
        password = request.args.get('password')
        if not username or not password:
            return jsonify({'error': 'Missing username or password'}), 400
        
        state_json = load_user_state(username, password)
        if state_json:
            return jsonify({'state': state_json})
        else:
            return jsonify({'state': None})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    init_db()
    app.run(host='0.0.0.0', port=port)
