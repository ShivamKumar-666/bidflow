# BidFlow

![Python](https://img.shields.io/badge/Python-3.12-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![MongoDB](https://img.shields.io/badge/MongoDB-7-green)
![XGBoost](https://img.shields.io/badge/XGBoost-2.1-orange)
![Tests](https://img.shields.io/badge/Tests-109-brightgreen)
![Languages](https://img.shields.io/badge/Languages-7-purple)

Enterprise-grade bid management platform with ML-powered win predictions, real-time collaboration, and role-based access control. Built with Flask + React.

---

## Key Stats

- **109** pytest tests, 0 warnings, ~20s
- **88.6%** balanced accuracy on ML predictions
- **7** languages (EN, HI, GU, ES, FR, DE, AR with RTL)
- **4** user roles (Admin, Company, Sales Executive, Bidder)
- **15** engineered features for bid win prediction
- **6** backend services (business logic layer)
- **0** critical vulnerabilities (Strict CI gating enabled)

---

## Features

### Core

| Feature | Description |
|---------|-------------|
| Enquiry Management | Capture, prioritize, and track customer enquiries |
| Bid Tracking | Full lifecycle: Quotation → Review → Negotiation → Won / Lost |
| AI Win Predictions | XGBoost model with SHAP explainability per prediction |
| Marketplace | Public/private enquiries, sealed bidding, team size limits |
| Deadline Calendar | Interactive monthly view with deadline highlighting |
| Customer Portal | Token-based links for external bid status tracking |
| KPI Analytics | Revenue, win rate, pipeline metrics with CSV export |
| Document Management | Secure file attachments with access control |
| Real-Time Notifications | WebSocket push for status changes and comments |
| Admin User Management | User table with search, role badges, and password reset |

### Security

| Feature | Description |
|---------|-------------|
| Two-Factor Auth | Google Authenticator TOTP with backup codes |
| Forgot Password | Email-based reset with 1-hour token, Gmail-compatible HTML emails |
| Admin Password Reset | Admin can reset any user's password from the Users panel |
| JWT + CSRF | httpOnly cookies, refresh tokens, server-side revocation |
| Rate Limiting | Flask-Limiter with Redis backend for production |
| RBAC | Role-based access with ownership enforcement |
| Audit Logging | Every action logged for governance |
| MongoDB Schema | JSON Schema validation on all 8 collections |
| PII Protection | Email redaction in application logs & strict logging policy |
| Supply Chain | Strict version locking (`npm ci`) & blocking CI audits (`pip-audit`) |

### UX

| Feature | Description |
|---------|-------------|
| 7 Languages + RTL | Full i18n with Arabic right-to-left support |
| Dark/Light Theme | Glassmorphic design, persisted in localStorage |
| Accessibility | ARIA labels, keyboard navigation, screen reader support |
| Per-Bid Currency | 7 currencies (USD, EUR, GBP, INR, JPY, CAD, AUD) |
| AlertDialog | Accessible confirmation dialogs (no window.confirm) |

---

## Quick Start

### Prerequisites
- Node.js v18+
- Python 3.12+
- Docker (for MongoDB + Redis)

### Setup

```bash
git clone https://github.com/ShivamKumar-666/bidflow.git
cd bidflow

# Start databases
docker compose up -d mongodb redis

# Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### One-Click (Windows)

```bash
start.bat
```

---

## Docker

```bash
docker compose up -d
```

| Service | Port | Description |
|---------|------|-------------|
| `mongodb` | 27017 | MongoDB 7 |
| `redis` | 6379 | Redis 7 |
| `backend` | 5000 | Flask API (Gunicorn + gevent) |
| `celery-worker` | — | Background tasks + beat scheduler |
| `frontend` | 80 | React SPA via Nginx |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, shadcn/ui, Chart.js, react-i18next, Socket.IO |
| Backend | Flask 3.0, Flask-SocketIO, Flask-JWT-Extended, Flask-Limiter, Celery |
| ML | XGBoost 2.1, SHAP, scikit-learn 1.7, SMOTE (imbalanced-learn) |
| Database | MongoDB 7 with JSON Schema validation |
| Production | Docker Compose, Gunicorn + gevent, Nginx, GitHub Actions CI/CD |

---

## Project Structure

```
bidflow/
├── backend/
│   ├── app.py              # Flask entrypoint
│   ├── routes/             # HTTP controllers (12 blueprints, /api/v1/)
│   ├── services/           # Business logic (bid, enquiry, auth, analytics, document, notification)
│   ├── ml/                 # ML pipeline (train, retrain, model files)
│   ├── tests/              # 103 pytest tests across 11 files
│   └── utils/              # Helpers (email, auth, audit, date)
├── frontend/
│   └── src/
│       ├── pages/          # 15 pages (Dashboard, Bids, Enquiries, Marketplace, AdminUsers, ForgotPassword, ResetPassword, etc.)
│       ├── components/     # BidTable, CreateBidDialog, CommentsDialog, etc.
│       ├── contexts/       # Auth, Theme, Notification, Socket contexts
│       ├── hooks/          # useBids, useMarketplace, useUsers
│       ├── locales/        # 7 languages (en, hi, gu, es, fr, de, ar)
│       └── utils/          # formatCurrency, date helpers
├── data/                   # Raw CRM data + combined training dataset
├── .github/workflows/      # CI/CD (ci.yml, cd.yml)
├── docker-compose.yml      # 5 services
├── COMMANDS.md             # All commands by directory
└── report.md               # Project report
```

---

## User Roles

| Role | Dashboard | Enquiries | Bids | Marketplace | Reports | Audit |
|------|:---------:|:---------:|:----:|:-----------:|:-------:|:-----:|
| Admin | Yes | CRUD | CRUD | View | Yes | Yes |
| Company | Yes | CRUD (own) | View (own) | Yes | No | Yes |
| Sales Executive | Yes | CRUD | CRUD | No | No | Yes |
| Bidder | Yes | No | Own bids | Submit | No | Yes |

First registered user is automatically Admin.

---

## Machine Learning

- **Algorithm**: XGBoost with L1/L2 regularization + SMOTE oversampling
- **Features**: 15 engineered (amount, deadline urgency, win rates, industry, team size, etc.)
- **Explainability**: SHAP values per prediction ("Constraint Analysis")
- **Training**: GridSearchCV with `balanced_accuracy` scoring

| Metric | Value |
|--------|-------|
| Balanced Accuracy | 88.6% |
| ROC-AUC | 0.91 |
| F1 (Lost) | 0.87 |
| F1 (Won) | 0.93 |

---

## Deployment

BidFlow deploys on **Render** (free tier) with **MongoDB Atlas** (free tier).

- Backend: Docker-based Web Service
- Frontend: Static Site
- Celery: Background Worker
- Database: MongoDB Atlas M0 (512MB)
- Cache: Upstash Redis (TLS)

See [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step guide.

---

## Security Notes

- **JWT role caching**: User roles are read from the JWT claim (not the database) for performance. If a user's role changes (promotion/demotion), the change takes effect after the current token expires (≤1 hour). To force immediate re-auth, revoke the user's refresh token.
- **TOTP**: Standard TOTP with `valid_window=1`. Backup codes are single-use and deleted after redemption.

---

## Documentation

| Document | Description |
|----------|-------------|
| [COMMANDS.md](COMMANDS.md) | All commands organized by directory |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Render + Atlas deployment guide |
| [report.md](report.md) | Project report (architecture, features, metrics) |


