# BidFlow — Intelligent Bid Management System

![Python](https://img.shields.io/badge/Python-3.12-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![MongoDB](https://img.shields.io/badge/MongoDB-7-green)

An enterprise-grade bid and proposal management platform that automates, analyzes, and optimizes business bidding processes. Built with Flask + React, it integrates ML predictions, real-time collaboration, role-based access, and audit logging.

---

## Overview

In competitive B2B sales, companies lose millions due to disorganized bid tracking, missed deadlines, and gut-feel decisions. BidFlow centralizes the entire bid lifecycle — from customer enquiry to final outcome — into one intelligent platform.

**Key Stats:**
- **99 pytest tests** passing with 0 warnings in ~20 seconds
- **88.6% balanced accuracy** on ML predictions
- **7 languages** supported (EN, HI, GU, ES, FR, DE, AR with RTL)
- **15 engineered features** for bid win prediction (including team size)
- **4 user roles**: Admin, Company, Sales Executive, Bidder

---

## Features

### Core Functionality

| Feature | Description |
|---------|-------------|
| **Enquiry Management** | Capture and prioritize customer enquiries with tags and detailed requirements |
| **Bid Tracking** | Full lifecycle: Quotation Prepared → Under Review → Negotiation → Order Received / Rejected |
| **Deadline Calendar** | Interactive monthly view with click-to-navigate pickers; never miss a submission |
| **AI Win Predictions** | ML model predicts bid success probability from historical data |
| **SHAP Explainability** | Per-feature impact visualization for every prediction |
| **Team Collaboration** | Real-time comments via WebSockets, document attachments, role-based dashboards |
| **KPI Analytics** | Live revenue, win rate, pipeline metrics with Chart.js visualizations and CSV export |
| **Customer Portal** | Secure token-based links let customers check bid status without exposing internal data |
| **Marketplace** | Public enquiry listing, sealed bidding, team size input with industry-dependent limits, deadline enforcement |

### Security & Administration

| Feature | Description |
|---------|-------------|
| **Two-Factor Authentication** | Google Authenticator TOTP with QR code, 8 backup codes, temporary JWT sessions |
| **Role-Based Access Control** | JWT auth, bcrypt hashing, server-side token revocation, admin-only audit logs |
| **Rate Limiting** | Flask-Limiter: login 10/min, register 5/min, 2FA 3/min |
| **MongoDB JSON Schema** | Document structure enforced at DB level (moderate validation) |
| **Model Integrity** | HMAC-SHA256 signature verification for ML models in MongoDB |
| **Model Rollback** | Admin can rollback to previous model versions via dashboard |
| **SLA Tracking** | Hourly breach detection via Celery beat, admin reports |
| **Audit Logging** | Every action logged for governance and ISO audits |

### User Experience

| Feature | Description |
|---------|-------------|
| **Multi-Language (7 langs + RTL)** | Serve global teams and Arabic-speaking clients natively |
| **Dark/Light Theme** | Glassmorphic design, persisted in localStorage, respects system preference |
| **Real-Time Notifications** | SocketIO push for bid status changes and comments, unread badge in navbar |
| **Notification Dismissal** | Dismiss individual notifications with one click (X button) |
| **Interactive Calendar** | Monthly grid with deadline highlighting, upcoming deadline sidebar |
| **Secure Document Management** | PDF/DOCX/image attachments, 16MB max, blocked extensions, path traversal protection |

### Industry Use Cases

| Industry | Use Case |
|----------|----------|
| **Manufacturing** | RFQ management, machinery & logistics contract tracking |
| **Banking & Finance** | Regulated bid processes, loan syndications, compliance audit trails |
| **Technology / IT** | Software dev bids, SaaS licensing, cloud & cybersecurity proposals |
| **Healthcare** | Medical device procurement, pharma supply, clinical trial contracts |
| **Retail & E-Commerce** | POS implementations, inventory systems, loyalty program proposals |

---

## User Roles

BidFlow supports 4 distinct user roles with role-based access control:

| Role | Dashboard | Enquiries | Bids | Marketplace | Reports | Audit Logs |
|------|-----------|-----------|------|-------------|---------|------------|
| **Admin** | ✅ | ✅ CRUD | ✅ CRUD | ✅ View | ✅ | ✅ |
| **Company** | ✅ | ✅ CRUD (own) | ✅ View (own enquiries) | ✅ | ❌ | ✅ |
| **Sales Executive** | ✅ | ✅ CRUD | ✅ CRUD | ❌ | ❌ | ✅ |
| **Bidder** | ✅ | ❌ | ✅ Own bids only | ✅ Submit | ❌ | ✅ |

### Role Descriptions

- **Admin** — Full system access: manage all enquiries/bids, view reports, audit logs, retrain ML models, rollback model versions.
- **Company** — Posts enquiries, reviews bids submitted on their enquiries, updates bid status, downloads quotations, browses marketplace, views own audit activity.
- **Sales Executive** — Internal sales role: creates bids, manages assigned enquiries, full bid CRUD, views own audit activity.
- **Bidder** — External role: submits bids on public marketplace enquiries, tracks own bid status, receives notifications on status changes, views own audit activity. Cannot create or view enquiries.

### First User = Admin

The first registered user automatically receives the Admin role (enforced via atomic counter in `Counters` collection). Subsequent users select their role during registration.

---

## Marketplace

BidFlow includes a public marketplace for multi-party bidding on procurement enquiries.

### How It Works

1. **Company** creates an enquiry and toggles visibility to **Public** (Globe icon)
2. **Bidders** browse public enquiries on the Marketplace page, filtered by industry
3. Bidders submit sealed bids — they cannot see other bidders' submissions
4. **Company** reviews all bids, updates status (Quotation Prepared → Order Received / Rejected)
5. Bidders receive real-time notifications on status changes

### Key Features

| Feature | Description |
|---------|-------------|
| **Public/Private Toggle** | Company can toggle enquiry visibility (Globe/Lock button). Default is public. |
| **Sealed Bids** | Bidders see only their own bids. Company sees all bids on their enquiries. |
| **Listing Deadline** | Enquiries can have a bidding deadline. Bids after deadline are rejected. |
| **Team Size Input** | Bidders specify team size (number of people). Industry-dependent max limits apply. |
| **Auto-Assignment** | Bidder's name is auto-assigned to their submitted bid. |
| **Live ML Prediction** | Real-time win probability + SHAP breakdown as bidder fills in the form. |

### Industry Team Size Limits

| Industry | Max Team Size |
|----------|--------------|
| Technology | 50 |
| Healthcare | 30 |
| Construction | 100 |
| Energy | 40 |
| Finance | 25 |
| Banking | 25 |
| Manufacturing | 100 |
| Retail | 40 |
| Other | 50 |

### Marketplace API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplace/` | List public enquiries (search, sort, filter) |
| GET | `/api/marketplace/<enquiry_id>` | Enquiry detail + my bids + all bids (company/admin) |
| POST | `/api/marketplace/<enquiry_id>/bid` | Submit a bid (deadline enforced) |

---

## Tech Stack

**Frontend:** React 19, Vite 8, React Router v7, Axios, `react-i18next`, Chart.js, `lucide-react`, shadcn/ui, Sonner

**Backend:** Python 3.12, Flask 3.0 (Blueprints), Flask-SocketIO, Flask-JWT-Extended, Flask-Limiter, Celery, XGBoost, SHAP, scikit-learn, imbalanced-learn (SMOTE), PyMongo, bcrypt, pyotp, bleach

**Testing:** pytest, pytest-cov, pytest-env (99 tests, 0 warnings, ~20s)

**Database:** MongoDB 7 with JSON Schema validation & TTL indexes

**Production:** Docker Compose, Gunicorn + gevent, Nginx, GitHub Actions CI/CD

---

## Quick Start

### Prerequisites

- **Node.js** v18+ and **npm**
- **Python** v3.12+
- **MongoDB** running on port `27017`
- **mongodump** (MongoDB Database Tools) for backups

### 1. Clone & Configure

```bash
git clone https://github.com/ShivamKumar-666/bidflow.git
cd bidflow
cp backend/.env.example backend/.env
```

Edit `backend/.env` — set `SECRET_KEY`, `JWT_SECRET_KEY`, and SMTP credentials for account verification emails.

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows (PowerShell: .\venv\Scripts\Activate.ps1)
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python app.py                  # → http://localhost:5000
```

### 3. Frontend

```bash
cd ../frontend
npm install
npm run dev                    # → http://localhost:5173
```

### One-Click Start (Windows)

```bash
start.bat
```

Automatically starts MongoDB, backend, and frontend.

---

## Docker Deployment

BidFlow includes a production-ready Docker Compose setup with 4 services.

### Start All Services

```bash
docker compose up -d
```

### Services

| Container | Port | Description |
|-----------|------|-------------|
| `bidflow-mongo` | 27017 | MongoDB 7 with health check |
| `bidflow-backend` | 5000 | Flask API (Gunicorn + gevent) |
| `bidflow-celery` | — | Celery worker + beat scheduler |
| `bidflow-frontend` | 80 | Nginx serving React SPA |

### Access

- **Frontend:** http://localhost
- **Backend API:** http://localhost:5000
- **MongoDB:** localhost:27017

### Stop Services

```bash
docker compose down
```

### Volumes

- `mongo_data` — Persistent MongoDB data
- `backend_uploads` — Uploaded documents

---

## Cloud Deployment (Free Tier)

BidFlow can be deployed for **$0/month** using Render + MongoDB Atlas.

### Architecture

```
Render (Free Tier)              MongoDB Atlas (Free Tier)
├── Frontend (Static Site)      └── M0 Sandbox (512MB)
├── Backend (Web Service)
└── Celery Worker (Background)
```

### Quick Deploy

1. **MongoDB Atlas**: Create free cluster → Get connection string
2. **Render**: Connect GitHub repo → Set env vars → Deploy
3. See [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step guide

### Limitations (Free Tier)

- Backend spins down after 15 min idle (30-60s cold start)
- 512MB MongoDB storage limit
- Ephemeral filesystem — uploaded files lost on redeploy

---

## CI/CD Pipeline

BidFlow uses GitHub Actions for continuous integration and deployment.

### CI Pipeline (`.github/workflows/ci.yml`)

Triggered on push to `main`/`develop` and pull requests:

1. **Backend Tests** — pytest with coverage
2. **Frontend Lint** — ESLint validation
3. **Frontend Build** — Vite production build
4. **Docker Build** — Verify images build successfully

### CD Pipeline (`.github/workflows/cd.yml`)

Triggered on push to `main` and version tags:

1. **Build Images** — Backend and frontend Docker images
2. **Push to GHCR** — GitHub Container Registry
3. **Auto-tagging** — Branch name, semver, or commit SHA

---

## Machine Learning

### Model Architecture

- **Algorithm:** XGBoost with L1/L2 regularization
- **Features:** 15 engineered features (amount, log-amount, deadline urgency, employee/industry win rates, interaction terms, team size)
- **Class Imbalance:** SMOTE oversampling + `scale_pos_weight`
- **Tuning:** GridSearchCV with `balanced_accuracy` scoring (target: 80-90%)
- **Explainability:** SHAP values for per-feature impact visualization
- **Data Sources:** `data/sales_pipeline.csv`, `data/accounts.csv`, `data/products.csv`, `data/sales_teams.csv` → `data/combined_training_data.csv`

### Commands

```bash
# Combine raw data into training dataset
python combine_datasets.py

# Initial training with GridSearchCV (2-5 minutes)
cd backend/ml && python prepare_and_train.py

# Live retraining (Admin only, requires >= 50 labeled bids)
POST /api/admin/retrain

# Check model status
GET  /api/analytics/model-stats

# Rollback to previous model version
POST /api/admin/models/rollback
```

### Performance

- **Balanced Accuracy:** 88.6%
- **ROC-AUC:** 0.91
- **F1 (Lost):** 0.87
- **F1 (Won):** 0.93

---

## Architecture

### Service Layer

The backend uses a **service layer pattern** to separate business logic from HTTP concerns:

```
routes/          ← HTTP handlers (thin controllers)
services/        ← Business logic (testable, reusable)
database.py      ← MongoDB connection & schema validation
```

| Service | Responsibility |
|---------|---------------|
| `BidService` | ML predictions, SHAP explanations, win rates, bid CRUD |
| `EnquiryService` | Enquiry management, sharing, visibility filters |
| `AuthService` | Password validation, token issuance, 2FA logic |
| `AnalyticsService` | Dashboard metrics, CSV exports, model stats |
| `DocumentService` | File validation, upload/download, access control |
| `NotificationService` | Notification creation, read status, deletion |

### System Layers

```
Client (Browser)
    ↓ HTTPS / WebSocket
Proxy (Nginx)
    ↓ /api/* routing
Application (Flask + Celery)
    ↓ Business logic
Service Layer
    ↓ Data access
Data Tier (MongoDB + File Storage)
    ↓
ML Pipeline (XGBoost + SHAP)
```

---

## Security Summary

| Area | Implementation |
|------|---------------|
| Rate Limiting | `Flask-Limiter`: login 10/min, register 5/min, 2FA 5/min |
| JWT Revocation | Server-side JTI blacklist with MongoDB TTL auto-expiry |
| MongoDB Auth | `MONGO_USERNAME` / `MONGO_PASSWORD` env-driven URI |
| Non-Sequential IDs | `secrets.token_hex(6)` → `BID-3a7f9c2b1d4e` format |
| RBAC Enforcement | Ownership checks on bid delete/status; admin-only audit & retrain |
| Bidder Bid Deletion | Bidders can delete own bids only if status is Rejected or bid is 30+ days old |
| Mass Assignment | Field allowlists on all PUT endpoints |
| Path Traversal | DB-ID-based document lookup; no filename exposure |
| CORS | Restricted to `http://localhost:5173` |
| Password Policy | 8-char minimum + uppercase + number + special character |
| 2FA Secret Protection | MongoDB field projection excludes TOTP secrets from API responses |
| JSON Schema Validation | MongoDB enforces document structure at DB level (moderate validation) |
| Model Integrity | HMAC-SHA256 signature verification for ML models in MongoDB |

---

## Project Structure

```
bidflow/
├── backend/
│   ├── app.py              # Flask entrypoint & blueprint registration
│   ├── config.py           # JWT, MongoDB, rate limit config
│   ├── database.py         # MongoDB connection & schema validation
│   ├── schemas.py          # JSON Schema validators for all 8 collections
│   ├── extensions.py       # Limiter, SocketIO instances
│   ├── celery_app.py       # Celery configuration & task definitions
│   ├── wsgi.py             # Gunicorn entrypoint (gevent monkey-patching)
│   ├── backup.py           # mongodump with TTL pruning
│   ├── conftest.py         # Pytest fixtures (app, client, auth_headers)
│   ├── pytest.ini          # Test configuration
│   ├── Dockerfile          # Python 3.12-slim + Gunicorn
│   ├── .env.docker         # Docker environment template
│   ├── routes/             # HTTP controllers (auth, bids, enquiries, marketplace, etc.)
│   ├── services/           # Business logic layer
│   │   ├── bid_service.py
│   │   ├── enquiry_service.py
│   │   ├── auth_service.py
│   │   ├── analytics_service.py
│   │   ├── document_service.py
│   │   └── notification_service.py
│   ├── ml/                 # ML pipeline
│   │   ├── prepare_and_train.py   # GridSearchCV training
│   │   ├── retrain.py             # Live retraining endpoint
│   │   ├── bid_model.pkl          # Trained XGBoost model
│   │   ├── industry_encoder.pkl   # Label encoder
│   │   ├── best_params.json       # Best hyperparameters
│   │   └── feature_list.json      # Feature names (15)
│   ├── templates/          # Jinja2 templates (quotation PDF)
│   ├── tests/              # Pytest suite (10 files, 99 tests)
│   └── utils/              # Helpers (email, auth, audit)
├── data/                   # Raw CRM data + training datasets
│   ├── Sales-Pipeline-Dataset.xlsx  # Original Excel workbook
│   ├── sales_pipeline.csv  # 8800 CRM records
│   ├── accounts.csv        # 85 accounts with sector/industry
│   ├── products.csv        # 7 products with series/price
│   ├── sales_teams.csv     # 35 sales agents with region
│   ├── data_dictionary.csv # Schema documentation
│   ├── combined_training_data.csv  # 6711 processed ML records
│   ├── 1_quotations.csv    # Quotations data
│   ├── 2_items.csv         # Line items data
│   ├── 3_PO.csv            # Purchase orders data
│   ├── 4_DO.csv            # Delivery orders data
│   └── 5_Customers.csv     # Customers data
├── frontend/
│   ├── Dockerfile          # Multi-stage Node build → Nginx
│   ├── nginx.conf          # Reverse proxy config
│   └── src/
│       ├── pages/          # 12 pages (Bids, Enquiries, Calendar, Marketplace, etc.)
│       ├── components/     # AppLayout, Navbar, Sidebar, TagInput, ui/
│       ├── contexts/       # AuthContext, ThemeContext, NotificationContext
│       ├── hooks/          # useBids, useMarketplace, useUsers
│       ├── locales/        # i18n JSON (ar, de, en, es, fr, gu, hi)
│       └── services/       # Axios API layer with auto-retry
├── .github/workflows/      # CI/CD pipelines
│   ├── ci.yml              # Test & build on PR
│   └── cd.yml              # Build & push images on merge
├── docker-compose.yml      # 4-service deployment
├── combine_datasets.py     # Merges data/ sources into training data (includes team_size generation)
├── start.bat               # One-click launcher (Windows)
└── backup.bat              # Backup wrapper (Windows)
```

---

## Testing

```bash
# Run all pytest tests
cd backend && venv\Scripts\activate && pytest

# Run with coverage
pytest --cov=routes

# HTML coverage report
pytest --cov=routes --cov-report=html

# Run specific test file
pytest tests/test_auth.py -v
```

**Coverage:** 99 tests across 10 test files, 0 warnings, ~20 seconds

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | Flask session signing |
| `JWT_SECRET_KEY` | JWT token signing |
| `MONGO_URI` | Full MongoDB connection string (overrides individual fields) |
| `MONGO_HOST` / `MONGO_PORT` / `MONGO_DB` | Individual MongoDB fields |
| `MONGO_USERNAME` / `MONGO_PASSWORD` | MongoDB authentication |
| `FLASK_ENV` | `development` or `production` |
| `BACKUP_RETENTION_DAYS` | Auto-prune backups older than N days (default: 7) |
| `SMTP_*` | Email verification (Mailtrap / Gmail App Password) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `CORS_ALLOWED_ORIGINS` | Allowed origins for CORS |

---

## Automated Backups

```bash
cd backend && venv\Scripts\activate && python backup.py
# Or on Windows: backup.bat
```

Backups saved to `<project_root>/backups/YYYY-MM-DD_HH-MM-SS/`. Old dumps auto-pruned by `BACKUP_RETENTION_DAYS`.

**Windows Task Scheduler** — daily at 2 AM:
1. New Task → Action: `Start a program`
2. Program: `C:\path\to\bidflow\backup.bat`
3. Trigger: Daily, 2:00 AM

---

## Production Checklist

- [ ] Generate strong `SECRET_KEY` and `JWT_SECRET_KEY`
- [ ] Set `FLASK_ENV=production`
- [ ] Enable MongoDB authentication
- [ ] Use Docker Compose or Gunicorn instead of `python app.py`
- [ ] Schedule daily backups
- [ ] Enable HTTPS via nginx/Caddy
- [ ] Configure `GOOGLE_CLIENT_ID` for OAuth
- [ ] Set up GitHub Actions secrets for CD pipeline
