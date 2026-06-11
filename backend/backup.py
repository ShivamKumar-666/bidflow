"""
backend/backup.py
─────────────────
Automated MongoDB backup using mongodump.

Creates a timestamped dump in <project_root>/backups/YYYY-MM-DD_HH-MM-SS/
and prunes backups older than RETENTION_DAYS.

Usage
─────
  # Manual run (activate venv first):
  python backup.py

  # Windows Task Scheduler: point to backup.bat in the project root.
  # Linux/macOS cron (every day at 2 AM):
  #   0 2 * * * /path/to/venv/bin/python /path/to/backend/backup.py

Environment Variables (read from .env automatically)
─────────────────────────────────────────────────────
  MONGO_URI      — full MongoDB connection string (with or without auth)
  MONGO_HOST     — host (default: localhost)
  MONGO_PORT     — port (default: 27017)
  MONGO_DB       — database name (default: bidflow)
  MONGO_USERNAME — optional credential
  MONGO_PASSWORD — optional credential
  BACKUP_RETENTION_DAYS — days to keep backups (default: 7)
"""

import os
import sys
import subprocess
import datetime
import shutil
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present
load_dotenv(dotenv_path=Path(__file__).parent / '.env')

# ── Configuration ─────────────────────────────────────────────────────────────
PROJECT_ROOT    = Path(__file__).parent.parent
BACKUP_ROOT     = PROJECT_ROOT / 'backups'
RETENTION_DAYS  = int(os.environ.get('BACKUP_RETENTION_DAYS', '7'))

MONGO_URI      = os.environ.get('MONGO_URI', '')
MONGO_HOST     = os.environ.get('MONGO_HOST', 'localhost')
MONGO_PORT     = os.environ.get('MONGO_PORT', '27017')
MONGO_DB       = os.environ.get('MONGO_DB', 'bidflow')
MONGO_USERNAME = os.environ.get('MONGO_USERNAME', '')
MONGO_PASSWORD = os.environ.get('MONGO_PASSWORD', '')


def _find_mongodump():
    """Locate mongodump executable — checks PATH then common install locations."""
    # Try PATH first
    if shutil.which('mongodump'):
        return 'mongodump'

    candidates = [
        r"C:\Program Files\MongoDB\Server\8.3\bin\mongodump.exe",
        r"C:\Program Files\MongoDB\Server\7.0\bin\mongodump.exe",
        r"C:\Program Files\MongoDB\Server\6.0\bin\mongodump.exe",
        '/usr/bin/mongodump',
        '/usr/local/bin/mongodump',
    ]
    for path in candidates:
        if os.path.exists(path):
            return path

    print("ERROR: mongodump not found. Install MongoDB Database Tools:", file=sys.stderr)
    print("  https://www.mongodb.com/try/download/database-tools", file=sys.stderr)
    sys.exit(1)


def run_backup():
    timestamp  = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    dump_dir   = BACKUP_ROOT / timestamp
    dump_dir.mkdir(parents=True, exist_ok=True)

    mongodump = _find_mongodump()

    # Build command
    cmd = [mongodump, f'--out={dump_dir}']

    if MONGO_URI:
        cmd.append(f'--uri={MONGO_URI}')
    else:
        cmd += [f'--host={MONGO_HOST}', f'--port={MONGO_PORT}', f'--db={MONGO_DB}']
        if MONGO_USERNAME:
            import tempfile
            pw_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt')
            pw_file.write(MONGO_PASSWORD)
            pw_file.close()
            cmd += [f'--username={MONGO_USERNAME}',
                    f'--password={pw_file.name}',
                    '--authenticationDatabase=admin']

    print(f"[{timestamp}] Starting backup → {dump_dir}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    finally:
        if MONGO_USERNAME and 'pw_file' in dir():
            import os
            os.unlink(pw_file.name)

    if result.returncode != 0:
        print(f"ERROR: mongodump failed:\n{result.stderr}", file=sys.stderr)
        # Clean up empty/partial dump dir
        shutil.rmtree(dump_dir, ignore_errors=True)
        sys.exit(1)

    print(f"[{timestamp}] Backup complete.")

    # ── Prune old backups ──────────────────────────────────────────────────────
    cutoff = datetime.datetime.now() - datetime.timedelta(days=RETENTION_DAYS)
    pruned = 0
    for entry in BACKUP_ROOT.iterdir():
        if not entry.is_dir():
            continue
        try:
            entry_time = datetime.datetime.strptime(entry.name, '%Y-%m-%d_%H-%M-%S')
            if entry_time < cutoff:
                shutil.rmtree(entry)
                pruned += 1
        except ValueError:
            pass   # skip directories not matching timestamp format

    if pruned:
        print(f"Pruned {pruned} backup(s) older than {RETENTION_DAYS} days.")

    print(f"Backup directory: {dump_dir}")
    return str(dump_dir)


if __name__ == '__main__':
    run_backup()
