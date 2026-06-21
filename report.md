# BidFlow — Project Report

> **Last Updated**: June 17, 2026
> **Version**: Production-ready (103 tests)

---

## Executive Summary

BidFlow is an enterprise-grade bid management platform built with Flask and React. It centralizes the entire bid lifecycle — from customer enquiry to final outcome — with ML-powered win predictions, real-time collaboration, and role-based access control.

The platform has undergone three comprehensive audit passes with 37+ fixes applied. All critical vulnerabilities are resolved. The codebase includes a service layer architecture, Docker containerization, GitHub Actions CI/CD, MongoDB schema validation, and a full marketplace extension for multi-party bidding.

---

## Architecture

### System Layers

```
Client (Browser)
    ↓ HTTPS / WebSocket
Proxy (Nginx)
    ↓ /api/* routing
Application (Flask + Celery)
    ↓ Business logic
Service Layer (6 services)
    ↓ Data access
Data Tier (MongoDB + Redis + File Storage)
    ↓
ML Pipeline (XGBoost + SHAP)
```

### Service Layer

| Service | Responsibility |
|---------|---------------|
| `BidService` | ML predictions, SHAP explanations, win rates, bid CRUD |
| `EnquiryService` | Enquiry management, sharing, visibility, cascade delete |
| `AuthService` | Password validation, token issuance, 2FA, Google OAuth |
| `AnalyticsService` | Dashboard metrics, CSV exports, model stats |
| `DocumentService` | File validation, upload/download, access control |
| `NotificationService` | Notification CRUD, real-time WebSocket push |

### API Design

- **Versioned**: All routes under `/api/v1/`
- **12 blueprints**: auth, bids, enquiries, documents, analytics, audit, twofa, admin, search, tags, notifications, marketplace
- **Swagger UI**: `/api/v1/docs`
- **OpenAPI spec**: `/api/v1/docs/openapi.yaml`

---

## Features

### Core Functionality

| Feature | Description |
|---------|-------------|
| Enquiry Management | Capture and prioritize customer enquiries with tags, deadlines, and industry classification |
| Bid Tracking | Full lifecycle with status transitions: Quotation Prepared → Under Review → Negotiation → Order Received / Rejected |
| AI Win Predictions | XGBoost model predicts bid success from 15 engineered features |
| SHAP Explainability | Per-feature impact visualization for every prediction ("Constraint Analysis") |
| Marketplace | Public/private enquiry listing, sealed bidding, team size input, deadline enforcement |
| Deadline Calendar | Interactive monthly view with click-to-navigate, deadline highlighting |
| Customer Portal | Token-based links for external bid status tracking without exposing internal data |
| KPI Analytics | Live revenue, win rate, pipeline metrics with Chart.js and CSV export |
| Document Management | Secure PDF/DOCX/image attachments with access control |
| Admin User Management | User table with search, role badges, and admin password reset |

### Security

| Feature | Implementation |
|---------|---------------|
| Authentication | bcrypt + JWT httpOnly cookies + refresh tokens |
| Two-Factor Auth | Google Authenticator TOTP, QR code, 8 backup codes |
| Forgot Password | Email-based reset with 1-hour token, rate-limited (5/hr per email) |
| Admin Password Reset | Admin can reset any user's password from the Users panel |
| Rate Limiting | Flask-Limiter: login 10/min, register 5/min, 2FA 3/min |
| RBAC | 4 roles with ownership enforcement on all endpoints |
| Input Sanitization | bleach.clean() on all user text fields |
| MongoDB Schema | JSON Schema validation (moderate) on all 8 collections |
| Model Integrity | HMAC-SHA256 signature verification for ML model binaries |
| Audit Logging | Every action logged with userId for governance |
| Security Headers | CSP, X-Frame-Options, HSTS, X-Content-Type-Options |
| IDOR Prevention | `@bid_access_required` decorator, ownership checks |
| Non-Sequential IDs | `secrets.token_hex(4)` → `BID-3a7f9c2b` format (8 hex chars) |
| CORS | Env-driven allowed origins |

### User Experience

| Feature | Description |
|---------|-------------|
| 7 Languages + RTL | English, Hindi, Gujarati, Spanish, French, German, Arabic |
| Dark/Light Theme | Glassmorphic design, persisted in localStorage |
| Real-Time Notifications | SocketIO push for bid status changes and comments |
| Per-Bid Currency | 7 currencies (USD, EUR, GBP, INR, JPY, CAD, AUD) |
| AlertDialog | Accessible confirmation dialogs (Radix UI) |
| Accessibility | ARIA labels, keyboard navigation, radiogroup, role=grid |

---

## User Roles

| Role | Access |
|------|--------|
| **Admin** | Full system: all enquiries/bids, reports, audit logs, ML retrain, model rollback |
| **Company** | Own enquiries, bids on own enquiries, marketplace, own audit activity |
| **Sales Executive** | Internal: creates bids, manages enquiries, full bid CRUD |
| **Bidder** | External: submits bids on marketplace, tracks own bid status |

First registered user is automatically Admin (atomic counter enforcement).

---

## Machine Learning

### Pipeline

- **Algorithm**: XGBoost with L1/L2 regularization
- **Class Imbalance**: SMOTE oversampling + `scale_pos_weight`
- **Tuning**: GridSearchCV with `balanced_accuracy` scoring
- **Explainability**: SHAP TreeExplainer for per-feature impact

### Features (15)

```
amount, amount_log, days_to_deadline, deadline_urgency,
priority_encoded, employee_win_rate, employee_experience,
industry_win_rate, amount_vs_industry_avg, amount_x_win_rate,
industry_encoded, product_series_encoded, regional_office_encoded,
sales_price, team_size
```

### Metrics

| Metric | Value |
|--------|-------|
| Balanced Accuracy | 88.6% |
| Overall Accuracy | 90.8% |
| ROC-AUC | 0.91 |
| F1 (Lost) | 0.87 |
| F1 (Won) | 0.93 |

### Operations

- **Initial training**: `python ml/prepare_and_train.py` (GridSearchCV, 2-5 min)
- **Live retraining**: `POST /api/v1/admin/retrain` (monthly via Celery beat)
- **Retrain threshold**: Minimum 0.50 balanced accuracy enforced
- **Model rollback**: Admin can rollback to previous versions
- **Post-bid feedback**: Top 3 negative SHAP factors in rejection notifications
- **Version tracking**: ModelVersions collection with accuracy, records, and version history

### Data Pipeline

```
data/sales_pipeline.csv (8800 records)
data/accounts.csv (85 accounts)
data/products.csv (7 products)
data/sales_teams.csv (35 agents)
    ↓ combine_datasets.py
data/combined_training_data.csv (6711 records, 30 columns)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, React Router v7, shadcn/ui, Chart.js, react-i18next, Socket.IO, Sonner |
| Backend | Python 3.12, Flask 3.0, Flask-SocketIO, Flask-JWT-Extended, Flask-Limiter, Celery, bleach |
| ML | XGBoost 2.1, SHAP 0.46, scikit-learn 1.7, imbalanced-learn (SMOTE), pandas, numpy |
| Database | MongoDB 7 (JSON Schema validation, TTL indexes) |
| Cache/Broker | Redis 7 (Celery broker + rate limiter storage) |
| Production | Docker Compose, Gunicorn + gevent, Nginx, GitHub Actions CI/CD |

---

## Test Coverage

**103 pytest tests** across 11 files, 0 warnings, ~20 seconds.

| File | Tests | Domain |
|------|:-----:|--------|
| `tests/test_auth.py` | 11 | Registration, login, JWT, email verification, Google OAuth |
| `tests/test_bids.py` | 15 | Bid CRUD, AI predictions, comments, tags, currency |
| `tests/test_analytics.py` | 9 | Dashboard KPI, exports, calendar, search, SLA |
| `tests/test_documents.py` | 4 | File upload validation |
| `tests/test_enquiries.py` | 5 | RBAC, PDF quotation, customer portal |
| `tests/test_health.py` | 2 | Root and health endpoints |
| `tests/test_ids.py` | 2 | Non-sequential ID format |
| `tests/test_marketplace.py` | 22 | Marketplace listing, detail, bid submission |
| `tests/test_notifications.py` | 4 | Notification CRUD |
| `tests/test_remaining.py` | 27 | Refresh, profile, enquiry update, bid delete, 2FA |

**CI coverage target**: `--cov=routes` (HTTP handler layer)

---

## CI/CD Pipeline

### CI (`.github/workflows/ci.yml`)
Triggers on push to `main`/`develop` and pull requests:

1. **Backend**: Python 3.12 + MongoDB 7 service → pip-audit → pytest with coverage → Codecov
2. **Frontend**: Node.js 20 → npm ci → npm audit → ESLint → Vite build
3. **Docker**: Build verification for both images (no push)

### CD (`.github/workflows/cd.yml`)
Triggers on push to `main` and version tags:

1. Builds backend + frontend Docker images
2. Pushes to GitHub Container Registry (GHCR) with semver/branch/SHA tags
3. Triggers Render deploy via API (after GHCR push)

---

## DevOps

### Docker Compose (5 services)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `mongodb` | `mongo:7` | 27017 | Database (volume: `mongo_data`) |
| `redis` | `redis:7-alpine` | 6379 | Cache + Celery broker (volume: `redis_data`) |
| `backend` | `./backend` | 5000 | Flask API (Gunicorn + gevent) |
| `celery-worker` | `./backend` | — | Background tasks + beat scheduler |
| `frontend` | `./frontend` | 80 | React SPA via Nginx |

### Backend Dockerfile (Multi-Stage)

- **Stage 1 (builder)**: Build dependencies (gcc, libffi-dev, etc.) + pip install
- **Stage 2 (runtime)**: Only runtime libraries + app code
- **Non-root user**: `appuser` for security

### Frontend Dockerfile (Multi-Stage)

- **Stage 1 (build)**: Node.js 20 + npm ci + npm run build
- **Stage 2**: Nginx Alpine serving static files

### Health Checks

```json
GET /health → {
  "status": "healthy|degraded",
  "checks": { "mongodb": "ok|fail", "redis": "ok|fail" }
}
```

---

## Cloud Deployment

BidFlow deploys for **$0/month** on Render + MongoDB Atlas.

| Service | Platform | Plan |
|---------|----------|------|
| Frontend | Render Static Site | Free |
| Backend | Render Web Service | Free |
| Celery Worker | Render Background Worker | Free |
| Database | MongoDB Atlas M0 | Free (512MB) |
| Cache | Upstash Redis | Free |

**Limitations**: Backend spins down after 15 min idle (30-60s cold start), 512MB MongoDB, ephemeral filesystem.

See [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step guide.

---

## Marketplace

Public enquiry listing with sealed bidding for multi-party procurement.

### Flow

1. **Company** creates enquiry → toggles visibility to Public
2. **Bidders** browse marketplace → filter by industry
3. Bidders submit sealed bids (cannot see other bids)
4. **Company** reviews all bids → updates status
5. Bidders receive real-time notifications on status changes

### Features

| Feature | Description |
|---------|-------------|
| Public/Private Toggle | Company controls enquiry visibility |
| Sealed Bids | Bidders see only their own submissions |
| Listing Deadline | Bids after deadline are rejected |
| Team Size | Industry-dependent max limits (ML feature #15) |
| Documents | Enquiry documents visible to bidders |
| Auto-Assignment | Bidder name auto-assigned on submission |

### Industry Team Size Limits

| Industry | Max |
|----------|-----|
| Technology | 50 |
| Healthcare | 30 |
| Construction | 100 |
| Energy | 40 |
| Finance / Banking | 25 |
| Manufacturing | 100 |
| Retail | 40 |
| Other | 50 |

---

## Remaining Items

| Item | Priority | Effort |
|------|----------|--------|
| Native speaker translation review (hi, gu, es, fr, de, ar) | Medium | 1-2 days |
| TypeScript migration (frontend) | Low | 3-5 days |
| Model rollback disk sync | Low | 1 day |

---

## Positive Findings

- JWT security: httpOnly cookies + CSRF + refresh tokens + revocation
- First user = Admin via atomic counter
- Service layer separates business logic from HTTP concerns
- MongoDB JSON Schema validation on all 8 collections
- HMAC signature verification on ML model binaries
- Multi-stage Docker builds for minimal image size
- GitHub Actions CI/CD with security scanning (pip-audit, npm audit)
- 103 tests with 0 warnings
- 23 of 23 audit issues fixed
