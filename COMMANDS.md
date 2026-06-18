# BidFlow — All Commands Reference

> Every command organized by the directory you must `cd` into first.

---

## Table of Contents

1. [`bidflow/` (Root)](#1-bidflow-root-directory)
2. [`bidflow/backend/`](#2-bidflowbackend)
3. [`bidflow/backend/ml/`](#3-bidflowbackendml)
4. [`bidflow/backend/tests/`](#4-bidflowbackendtests)
5. [`bidflow/frontend/`](#5-bidflowfrontend)
6. [`.github/workflows/`](#6-githubworkflows)
7. [Render Dashboard (Browser)](#7-render-dashboard-browser)

---

## 1. `bidflow/` (Root Directory)

### Git
```bash
git clone https://github.com/ShivamKumar-666/bidflow.git
git status
git add -A
git commit -m "feat: your message"
git push origin master
git pull origin master
git log --oneline -10
git diff
git diff --staged
git branch -a
git checkout -b feature/new-feature
git checkout main
git merge feature/new-feature
git branch -d feature/new-feature
```

### Docker Compose
```bash
# Start all services
docker compose up -d

# Start only databases (local dev)
docker compose up -d mongodb redis

# Start only Redis (troubleshooting)
docker compose up -d redis

# Stop all services
docker compose down

# Stop and remove volumes (full reset)
docker compose down -v

# Check running containers
docker compose ps

# Rebuild everything
docker compose build

# Rebuild and restart backend only
docker compose build backend
docker compose up -d --build backend

# View logs
docker compose logs -f backend
docker compose logs -f celery-worker
docker compose logs -f frontend

# Manage volumes
docker volume ls
docker volume inspect bidflow_mongo_data
docker volume rm bidflow_mongo_data bidflow_redis_data
```

### Local Dev Scripts (Windows)
```bash
# Start everything (databases + backend + frontend)
start.bat

# Stop everything
stop.bat
```

### Data Preparation
```bash
# Combine raw CSVs into training dataset
python combine_datasets.py
```

---

## 2. `bidflow/backend/`

### Python Environment Setup
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Flask Dev Server
```bash
python app.py
```

### Gunicorn Production Server
```bash
gunicorn -c gunicorn.conf.py wsgi:app
```

### Celery Worker
```bash
# With beat scheduler (production)
celery -A celery_app.celery worker --beat --loglevel=info

# Worker only (no scheduler)
celery -A celery_app.celery worker --loglevel=info

# Debug mode
celery -A celery_app.celery worker --beat --loglevel=debug

# Inspect tasks
celery -A celery_app.celery inspect registered
celery -A celery_app.celery inspect active
celery -A celery_app.celery inspect scheduled

# Purge pending tasks
celery -A celery_app.celery purge
```

### MongoDB Backup
```bash
python backup.py
```

### API Health & Docs
```bash
# Health check
curl http://localhost:5000/health

# API root
curl http://localhost:5000/

# Swagger UI (open in browser)
open http://localhost:5000/api/v1/docs

# OpenAPI spec
curl http://localhost:5000/api/v1/docs/openapi.yaml
```

### MongoDB Shell
```bash
# Connect to local Docker MongoDB
mongosh mongodb://localhost:27017/bidflow

# Ping test
mongosh --eval "db.adminCommand('ping')"

# List collections
mongosh --eval "use bidflow; db.getCollectionNames()"

# Count documents
mongosh --eval "use bidflow; db.enquiries.countDocuments()"

# Promote first user to Admin
mongosh mongodb://localhost:27017/bidflow --eval '
  db.users.updateOne(
    { email: "your@email.com" },
    { $set: { role: "Admin" } }
  )
'

# Backfill model versions
mongosh mongodb://localhost:27017/bidflow --eval '
  db.modelversions.insertOne({
    version: "1.0.0",
    trainedAt: new Date(),
    metrics: { balancedAccuracy: 0.886 },
    isActive: true
  })
'
```

### mongodump (Raw)
```bash
# Full database dump
mongodump --uri="mongodb+srv://..." --out=./dump

# Specific collection
mongodump --uri="mongodb+srv://..." --db=bidflow --collection=enquiries --out=./dump

# With authentication
mongodump --host=localhost --port=27017 --db=bidflow \
  --username=admin --password=secret --authenticationDatabase=admin \
  --out=./dump
```

### ML Retraining via API
```bash
# Retrain model (admin only)
curl -X POST http://localhost:5000/api/v1/admin/retrain \
  -H "Authorization: Bearer <admin-token>"

# Check model status
curl http://localhost:5000/api/v1/analytics/model-stats

# Rollback model version
curl -X POST http://localhost:5000/api/v1/admin/models/rollback \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"version": "1.0.0"}'

# Trigger SLA check manually
curl -X POST http://localhost:5000/api/v1/admin/check-sla \
  -H "Authorization: Bearer <token>"
```

---

## 3. `bidflow/backend/ml/`

### Initial Training (One-Time)
```bash
python prepare_and_train.py
```
> Produces: `bid_model.pkl`, `industry_encoder.pkl`, `series_encoder.pkl`, `region_encoder.pkl`, `best_params.json`, `feature_list.json`

### Retrain from CSV
```bash
python train.py
```

### Backfill Model Versions in MongoDB (One-Time)
```bash
python backfill_model_version.py
```

---

## 4. `bidflow/backend/tests/`

### Run All Tests
```bash
pytest
```

### Verbose Output
```bash
pytest -v
```

### Short Tracebacks
```bash
pytest --tb=short
```

### Run Specific Test File
```bash
pytest tests/test_auth.py -v
pytest tests/test_bids.py -v
pytest tests/test_analytics.py -v
pytest tests/test_documents.py -v
pytest tests/test_enquiries.py -v
pytest tests/test_health.py -v
pytest tests/test_ids.py -v
pytest tests/test_marketplace.py -v
pytest tests/test_notifications.py -v
pytest tests/test_remaining.py -v
```

### Run Specific Test Class
```bash
pytest tests/test_bids.py::TestBidCreation -v
```

### Run Specific Test Method
```bash
pytest tests/test_bids.py::TestBidCreation::test_create_bid -v
```

### With Coverage (Routes Only)
```bash
pytest --cov=routes
```

### HTML Coverage Report
```bash
pytest --cov=routes --cov-report=html
```

### XML Coverage Report (CI)
```bash
pytest --cov=routes --cov-report=xml --cov-report=term-missing
```

---

## 5. `bidflow/frontend/`

### Install Dependencies
```bash
npm install
```

### Clean Install (CI / Docker)
```bash
npm ci
```

### Dev Server (port 5173)
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Lint
```bash
npm run lint
```

### Security Audit
```bash
npm audit --audit-level=high
npm audit fix
```

### Docker Build
```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://your-backend.onrender.com \
  --build-arg VITE_SOCKET_URL=https://your-backend.onrender.com \
  --build-arg VITE_GOOGLE_CLIENT_ID=your-client-id \
  -t bidflow-frontend .
```

---

## 6. `.github/workflows/`

### Backend CI (Python 3.12)
```bash
# Install system dependencies
sudo apt-get update
sudo apt-get install -y libcairo2-dev libpango-1.0-0 libpangocairo-1.0-0 \
  libgdk-pixbuf-2.0-0 libxml2-dev libxslt1-dev

# Install Python dependencies
pip install -r requirements.txt

# Security audit
pip install pip-audit
pip-audit -r requirements.txt --desc on

# Run tests with coverage
pytest --cov=routes --cov-report=xml --cov-report=term-missing
```

### Frontend CI (Node.js 20)
```bash
# Install dependencies
npm ci

# Security audit
npm audit --audit-level=high

# Lint
npm run lint

# Build
npm run build
```

### Docker Build Verification
```bash
# Build backend image (no push)
docker buildx build -t bidflow-backend:test ./backend

# Build frontend image (no push)
docker buildx build -t bidflow-frontend:test ./frontend
```

### CD — Push to GitHub Container Registry
```bash
# Login
docker login ghcr.io -u $GITHUB_ACTOR -p $GITHUB_TOKEN

# Build and push backend
docker buildx build \
  --tag ghcr.io/shivamkumar-666/bidflow-backend:latest \
  --push ./backend

# Build and push frontend
docker buildx build \
  --tag ghcr.io/shivamkumar-666/bidflow-frontend:latest \
  --push ./frontend
```

---

## 7. Render Dashboard (Browser)

### Create Services
| Service | Type | Dockerfile | Start Command |
|---------|------|------------|---------------|
| `bidflow-backend` | Web Service | `./backend/Dockerfile` | `gunicorn -c gunicorn.conf.py wsgi:app` |
| `bidflow-celery` | Background Worker | `./backend/Dockerfile` | `celery -A celery_app.celery worker --beat --loglevel=info` |
| `bidflow-frontend` | Static Site | — | Build: `cd frontend && npm install && npm run build` / Publish: `frontend/dist` |

### Environment Variables (Backend & Celery)
```bash
MONGO_URI=mongodb+srv://shivam258467_db_user:PASSWORD@bidflow.xixl0yd.mongodb.net/bidflow?retryWrites=true&w=majority
REDIS_URL=rediss://default:PASSWORD@on-seasnail-85102.upstash.io:6379
SECRET_KEY=your-production-secret
JWT_SECRET_KEY=your-production-jwt-secret
MAIL_USERNAME=your-gmail@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_DEFAULT_SENDER=your-gmail@gmail.com
SENTRY_DSN=your-sentry-dsn
FLASK_ENV=production
SKIP_INDEX_CREATION=true
```

### Environment Variables (Frontend)
```bash
VITE_API_BASE_URL=https://bidflow-backend.onrender.com
VITE_SOCKET_URL=https://bidflow-backend.onrender.com
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_SENTRY_DSN=your-sentry-dsn
```

---

## Quick Reference — Common Workflows

### First-Time Setup
```bash
git clone https://github.com/ShivamKumar-666/bidflow.git   # root
cd bidflow
docker compose up -d mongodb redis                          # root
cd backend && python -m venv venv && venv\Scripts\activate  # backend
pip install -r requirements.txt                             # backend
cd ../frontend && npm install                               # frontend
cd .. && start.bat                                          # root
```

### Daily Development
```bash
start.bat    # root — start everything
# ... work ...
stop.bat     # root — stop everything
```

### Run Tests Before Commit
```bash
cd backend && pytest -v          # backend/tests
cd ../frontend && npm run lint   # frontend
npm run build                    # frontend
```

### Deploy to Render
```bash
git add -A                       # root
git commit -m "feat: your feature"
git push origin master           # root — Render auto-deploys
```

### Full Docker Build
```bash
docker compose build             # root
docker compose up -d             # root
# Access at http://localhost (frontend via Nginx)
```

### Retrain ML Model
```bash
# Via API (admin)
curl -X POST http://localhost:5000/api/v1/admin/retrain \
  -H "Authorization: Bearer <admin-token>"

# Check model status
curl http://localhost:5000/api/v1/analytics/model-stats
```

### Database Backup
```bash
cd backend                       # backend
venv\Scripts\activate
python backup.py
# Creates: backups/bidflow_YYYYMMDD_HHMMSS/
```

---

*Last updated: June 17, 2026*
