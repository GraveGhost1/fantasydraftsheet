# Fantasy Draft Sheet

A browser-based fantasy football draft board that lets you:

- compare your personal rankings against ESPN and Yahoo ADP
- adjust league settings like scoring, roster construction, and bench spots
- sort players by any column header
- assign tiers for a simple draft cheat sheet

## Run locally

Use the Flask app so login/save APIs work:

```bash
pip install -r requirements.txt
python app.py
```

Then visit http://localhost:8000.

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
