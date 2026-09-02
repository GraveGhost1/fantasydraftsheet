# Fantasy Draft Sheet

A browser-based fantasy football draft board that lets you:

- compare your personal rankings against ESPN and Yahoo ADP
- adjust league settings like scoring, roster construction, and bench spots
- sort players by any column header
- assign tiers for a simple draft cheat sheet

It also includes a **Draft Assistant** Chrome extension for Underdog Best Ball drafts — live recommendations, heat map highlighting, draft capital tracking, and portfolio exposure.

## Run locally

Use the Flask app so login/save APIs work:

```bash
pip install -r requirements.txt
python app.py
```

Then visit http://localhost:8000.

## Draft Assistant (Underdog overlay)

The extension in [`extension/`](extension/) adds a Solver-style sidebar on Underdog Best Ball draft rooms. It uses expert best-ball ranks by default (from `underdog-bestball-rankings.csv`), not your redraft saved list.

### Quick start

1. Start the backend: `python app.py`
2. Load the extension in Chrome: **Extensions → Developer mode → Load unpacked** → select the `extension/` folder
3. Click the extension icon → **Load expert ranks**
4. Practice in the test room: http://localhost:8000/extension/test-draft-room.html  
   Or open a live Underdog Best Ball draft.

### Extension popup

| Action | What it does |
|--------|----------------|
| **Load expert ranks** | Fetches the public best-ball board (no login required) |
| **Ranking source** | Expert BB, imported CSV, or your saved custom ranks |
| **Draft Sheet URL** | API host — `http://127.0.0.1:8000` locally, or your Render URL in production |
| **Open test draft room** | Opens the local Underdog-style mock room for testing heat/recs |
| **Account & imports** | Log in for custom ranks; import rank or exposure CSVs |

### Overlay panel

Once a draft room is detected, a panel appears on the right with three tabs:

- **Recs** — top 3 pick recommendations, warnings, draft capital summary
- **Board** — searchable remaining players with rank/ADP/diff, position filters, dock/boost/exclude
- **Team** — your roster, capital vs targets, refresh/undo

Click **⚙ Settings** for scoring weights (ranks, ADP, stacks, playoff weeks, portfolio fade), position limits, and clock alert sound. Player rows on the Underdog board are color-coded to match recommendations.

### Test draft room

`extension/test-draft-room.html` mimics the Underdog 3-column layout (player list, queue, roster, draft ticker). Use **Load demo (pick 16)** in the dev bar to simulate being on the clock with a partial roster.

### API routes (assistant)

| Route | Purpose |
|-------|---------|
| `GET /api/assistant/board?rankSource=expert` | Public expert best-ball board + ADP |
| `POST /api/assistant/login` | Board merged with saved user ranks |
| `GET /assistant` | Setup / help page |

### Refresh NFL schedule data

Playoff-week stack scoring uses `extension/data/nfl-schedule-2026.json`. Regenerate before the season:

```bash
python build_nfl_schedule.py
```

## MongoDB Atlas user storage

The server uses MongoDB Atlas for user accounts and saved draft state when
`MONGODB_URI` is configured. For local development, place the connection
string in the ignored `atlas-credentials.env` file:

```text
MONGODB_URI=mongodb+srv://...
```

On Render, add `MONGODB_URI` as a secret environment variable instead. The
MongoDB database defaults to `fantasy_draft_sheet`; override it with
`MONGODB_DATABASE` if needed.

### Password reset email

New accounts collect an email address, and existing accounts can add one the
next time they log in. Configure SMTP to send password reset links:

```text
APP_BASE_URL=https://your-app.example.com
APP_ENV=production
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_FROM_EMAIL=no-reply@your-app.example.com
```

For local development, if SMTP is not configured, the reset link is printed
in the server terminal instead of being emailed. Reset links expire after 15
minutes and can only be used once.

For frontend-only work, you can open [index.html](index.html) or run `python server.py`.

## Deploy on Render

This repo includes a [render.yaml](render.yaml) that:

- starts the app with `gunicorn app:app`
- attaches a **1 GB persistent disk** at `/var/data`
- stores SQLite data at `/var/data/adp_profile.db` via `DB_PATH`

That keeps saved rankings across redeploys without setting up PostgreSQL.

After pushing to GitHub, sync the Blueprint in Render or create a Web Service from this repo.
If you already have a Render service, add a persistent disk in the dashboard:

1. Open your web service → **Disks** → **Add disk**
2. Mount path: `/var/data`
3. Size: `1` GB (or larger)
4. Add environment variable: `DB_PATH=/var/data/adp_profile.db`
5. Redeploy

Verify after deploy:

- `https://your-app.onrender.com/api/health` should return `{"ok": true}`
- Log in, change rankings, click **Save**, log out, log back in

For the Draft Assistant extension, set **Draft Sheet URL** in the popup to your Render URL (e.g. `https://your-app.onrender.com`) and click **Load expert ranks**.
