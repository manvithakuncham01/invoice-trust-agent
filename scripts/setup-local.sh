#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v python3 >/dev/null || { echo "Install Python 3.11+ first."; exit 1; }
command -v npm >/dev/null || { echo "Install Node.js 22.12+ first."; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ required"'
if [ ! -f .env ]; then
  cp .env.example .env
  python3 - <<'PYENV'
from pathlib import Path
import secrets
p=Path('.env');s=p.read_text().replace('DEMO_MODE=false','DEMO_MODE=true').replace('replace-with-a-random-value-of-at-least-32-characters',secrets.token_urlsafe(40));p.write_text(s)
PYENV
  chmod 600 .env
fi
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
(cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed)
(cd frontend && npm ci)
echo 'Ready. Follow README.md to start the backend and frontend in two terminals.'
