# BidFlow — Intelligent Bid Management System

BidFlow is a state-of-the-art, secure, and intelligent bid management platform designed to automate, analyze, and optimize business bidding processes. Featuring a robust Python/Flask backend and a highly responsive React/Vite frontend wrapped in a premium glassmorphism design system, BidFlow integrates machine learning predictions, real-time collaboration, role-based dashboards, and audit logs.

---

## 🌟 Key Features

### 1. 🔐 Two-Factor Authentication (2FA) for Admins
* **Google Authenticator Setup**: Admins are prompted to configure 2FA upon first login. Generates a secure TOTP secret and a dynamic QR code for scanning.
* **bcrypt-Hashed Backup Codes**: Generates 8 unique, single-use, 8-character backup codes stored with bcrypt hashing.
* **Temporary Session Control**: Short-lived temporary JWT (`sub_type: 2fa_pending`) during login restricts system access until the TOTP or backup code is verified.
* **Security Settings**: Admins can disable 2FA (verifying password) or regenerate backup codes (verifying current TOTP) from their profile.

### 2. 🌐 Internationalization & RTL Support
* **Multi-lingual Client**: Fully translated interface using `react-i18next`.
* **7 Supported Languages**: English, Hindi, Gujarati, Spanish, French, German, Arabic.
* **Bi-directional Layout**: Automatically adjusts `dir="rtl"` for Arabic, with correct alignments.
* **Accessibility (A11y)**: Fully integrated standard ARIA roles and labels (e.g., for custom verification codes, theme switchers, progress bars, and password hide/show buttons) for comprehensive screen-reader compatibility.

### 3. 🌗 Dynamic Glassmorphic Theme Engine
* **Light & Dark Mode**: Persists user preference in `localStorage` and responds to system preferences.

### 4. 🛡️ Role-Based Access Controls (RBAC) & Audit Logs
* **JWT Authentication**: Powered by `Flask-JWT-Extended` with bcrypt password hashing.
* **JWT Token Revocation**: Logout revokes the active JWT server-side via a MongoDB `RevokedTokens` collection with a TTL index for automatic cleanup.
* **Dynamic Interfaces**: Role-based routing and layouts for `Sales Executive` vs. `Admin`.
* **Automated Audit Logging**: Critical actions are logged with user, action, details, and timestamp — viewable only by Admins.

### 5. 🧠 Intelligent Bid Success Prediction (AI-Powered)
* **Unified ML Pipeline**: `scikit-learn` Logistic Regression estimating win probabilities.
* **Real Win Rate Feature**: The assigned estimator's win rate is **computed from actual bid outcomes** in `db.Bids` — not from a user-controlled profile field — preventing feature manipulation.
* **Cold-Start Safety**: Users with fewer than 3 terminal bids default to a neutral 0.5 prior.
* **Live Model Retraining**: Admins can trigger `POST /api/admin/retrain` to retrain the model from real MongoDB data (requires ≥ 50 labeled bids). Hot-swaps `.pkl` files atomically.

### 6. 💬 Real-Time Collaboration
* **Live Bid Comments**: Team members post comments directly on bids.
* **WebSockets**: `Flask-SocketIO` pushes new comments to all connected clients instantly.

### 7. 📁 Secure Document Management
* Proposal attachments (PDF, DOCX, images) linked to bids. Max 16MB, blocked file type extensions.

### 8. 📊 KPI Analytics & Export
* Live metrics: Revenue, Win Rate, Average Bid Size, Active Bids.
* Interactive `Chart.js` visuals and one-click CSV export.

### 9. 🔌 Network Resilience
* Axios auto-retry interceptor for transient server errors (3 retries, 500ms delay).

---

## 🛡️ Security Hardening

| Gap | Fix Implemented |
|-----|----------------|
| **No rate limiting** | `Flask-Limiter`: login 10/min, register 5/min, 2FA verify 5/min |
| **No JWT revocation** | `POST /api/auth/logout` revokes JTI in `db.RevokedTokens` (MongoDB TTL index auto-expires) |
| **MongoDB no auth** | `MONGO_USERNAME` / `MONGO_PASSWORD` env vars build authenticated URI; see `.env.example` |
| **No backup** | `backup.py` + `backup.bat` run `mongodump` with 7-day retention; schedule via Task Scheduler |
| **Static frozen ML model** | `POST /api/admin/retrain` retrains from live bid outcomes; hot-swaps `.pkl` atomically |
| **User-controlled win rate** | `get_computed_win_rate()` reads real bid history from `db.Bids`; profile `winRate` is display-only |
| **Sequential IDOR-prone IDs** | `secrets.token_hex(4)` → `BID-3a7f9c2b` / `ENQ-a4c82d1f` format (2³² combinations) |
| **Flask dev server** | `wsgi.py` + `gunicorn.conf.py` for Linux/Docker; `debug` conditional on `FLASK_ENV` |

---

## 📂 Project Structure

```text
bidflow/
├── backend/
│   ├── app.py                # Flask application entrypoint & blueprint registrations
│   ├── config.py             # Configuration parameters (JWT, MongoDB, Rate Limit, Uploads)
│   ├── database.py           # MongoDB connection initialization and collection exports
│   ├── extensions.py         # Flask extension instances (Limiter, SocketIO)
│   ├── requirements.txt      # Python dependencies list
│   ├── wsgi.py               # WSGI entrypoint for Gunicorn
│   ├── gunicorn.conf.py      # Production Gunicorn configuration (Linux/Docker)
│   ├── backup.py             # Backup script with auto-mongodump detection & TTL pruning
│   ├── test_suite.py         # Isolated integration test suite with mock DB
│   ├── test_flow.py          # End-to-end integration test runner
│   ├── routes/
│   │   ├── admin.py          # Admin endpoints (retraining)
│   │   ├── analytics.py      # Analytics and KPI calculations
│   │   ├── audit.py          # Audit log retrieval route
│   │   ├── auth.py           # User registration, login, logout with rate limits
│   │   ├── bids.py           # Bid creation, listing, AI prediction fallback, win-rate computation
│   │   ├── enquiries.py      # Enquiry CRUD routes
│   │   └── twofa.py          # Two-factor authentication Setup, Enable, Verify, Disable, Backup Codes
│   └── ml/
│       ├── prepare_and_train.py  # Script for preparing training data and initial training
│       ├── retrain.py            # Live ML retraining pipeline logic
│       ├── bid_model.pkl         # Trained logistic regression model object
│       └── industry_encoder.pkl  # Label encoder for industry categories
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main React App routing setup
│   │   ├── main.jsx          # Entry point rendering App
│   │   ├── i18n.js           # internationalization configuration & bi-directional layout handler
│   │   ├── index.css         # Styling, themes (light/dark) and glassmorphism variables
│   │   ├── components/       # Reusable components (Navbar, Sidebar, etc.)
│   │   ├── contexts/         # React Contexts (AuthContext, ThemeContext)
│   │   ├── locales/          # Translation json dictionaries (ar, de, en, es, fr, gu, hi)
│   │   ├── pages/            # Application views (Bids, Dashboard, Login, Profile, TwoFASetup, etc.)
│   │   └── services/         # Axios API connection layer
│   └── package.json          # Node dependencies and build scripts
├── start.bat                 # One-click startup script (processes cleanup, MongoDB, backend, frontend)
├── backup.bat                # Windows backup task execution wrapper
└── README.md                 # System overview and instruction documentation
```

---

## 🛠️ Technology Stack

### Frontend
* **Core**: React 19, Vite
* **Routing**: React Router DOM (v6)
* **HTTP Client**: Axios (with auto-retry interceptor)
* **Localization**: `i18next`, `react-i18next`, `i18next-browser-languagedetector`
* **Charts**: `chart.js`, `react-chartjs-2`
* **Icons**: `lucide-react`
* **Styling**: Vanilla CSS (glassmorphism tokens, dark/light themes, responsive)
* **Notifications**: `react-hot-toast`

### Backend
* **Runtime**: Python 3.8+
* **Web Framework**: Flask 3.0 (Blueprint architecture)
* **WebSockets**: Flask-SocketIO (Socket.IO v4) + eventlet
* **Security & Auth**: Flask-JWT-Extended, Flask-Limiter, pyotp, qrcode, bcrypt, Flask-CORS
* **Machine Learning**: scikit-learn, joblib, numpy, pandas
* **Database**: MongoDB (via PyMongo) with TTL indexes
* **Production WSGI**: Gunicorn + eventlet worker (Linux/Docker)

---

## 📋 Prerequisites

* **Node.js** (v18+) and **npm**
* **Python** (v3.8+)
* **MongoDB** running locally on port `27017`
* **mongodump** (MongoDB Database Tools) — required for `backup.py`

---

## 🔑 Environment Configuration

Copy `backend/.env.example` to `backend/.env` and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Key variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `SECRET_KEY` | Flask session key | hardcoded (change in prod!) |
| `JWT_SECRET_KEY` | JWT signing key | hardcoded (change in prod!) |
| `MONGO_URI` | Full MongoDB URI (overrides individual fields) | — |
| `MONGO_HOST` | MongoDB host | `localhost` |
| `MONGO_PORT` | MongoDB port | `27017` |
| `MONGO_DB` | Database name | `bidflow` |
| `MONGO_USERNAME` | MongoDB username | *(empty = no auth)* |
| `MONGO_PASSWORD` | MongoDB password | *(empty = no auth)* |
| `FLASK_ENV` | `development` / `production` | `development` |
| `BACKUP_RETENTION_DAYS` | Days to keep backups | `7` |

---

## 🚀 Installation & Setup

### 1. Backend Configuration
```bash
cd backend
python -m venv venv

# Activate (Windows):
venv\Scripts\activate
# Activate (macOS/Linux):
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Frontend Configuration
```bash
cd frontend
npm install
```

---

## ⚡ Running the Application

### The Quick Way (Windows)
```bash
start.bat
```
Automatically checks/starts MongoDB, activates venv, starts Flask backend, and launches Vite frontend.

### Manual Boot
```bash
# Backend
cd backend && venv\Scripts\activate && python app.py
# → http://localhost:5000

# Frontend
cd frontend && npm run dev
# → http://localhost:5173
```

### Production (Linux/Docker)
```bash
cd backend
gunicorn -c gunicorn.conf.py wsgi:app
```

---

## 💾 Automated Backups

```bash
# Manual run
cd backend && venv\Scripts\activate && python backup.py

# Windows convenience wrapper (run from project root)
backup.bat
```

**Windows Task Scheduler** (daily at 2 AM):
1. Create a new task → Action: `Start a program`
2. Program: `C:\path\to\bidflow\backup.bat`
3. Trigger: Daily, 2:00 AM

Backups are saved to `<project_root>/backups/YYYY-MM-DD_HH-MM-SS/`. Dumps older than `BACKUP_RETENTION_DAYS` (default 7) are auto-pruned.

---

## 🤖 Machine Learning

### Train from CRM Dataset (initial setup)
```bash
cd backend/ml
python prepare_and_train.py  # Builds combined_training_data.csv and trains model
```

### Retrain from Live Bid Data (Admin only)
Once you have ≥ 50 bids with terminal statuses (`Order Received` or `Rejected`):
```bash
# Via API (requires Admin JWT)
POST /api/admin/retrain

# Check model readiness
GET  /api/admin/model-status
```

---

## 🧪 Testing Suites

### Isolated Integration Test Suite (`test_suite.py`)
Runs all modules against isolated `bidflow_test` database. Tests: Auth, JWT Revocation, RBAC, Non-sequential IDs, AI Predictions, Win Rate Isolation, SocketIO, KPIs, Document Uploads, User Profiles, Admin Endpoints.

```bash
cd backend && venv\Scripts\activate && python test_suite.py
```

### Live HTTP API Flow Test (`test_flow.py`)
End-to-end test against a running server (Register → Login → Create Enquiry → Bid → Status → Dashboard).
```bash
# Ensure python app.py is running first, then:
cd backend && venv\Scripts\activate && python test_flow.py
```

---

## 🚨 Production Checklist

Before deploying to production:

- [ ] Generate strong `SECRET_KEY` and `JWT_SECRET_KEY` (`python -c "import secrets; print(secrets.token_hex(32))"`)
- [ ] Set `FLASK_ENV=production`
- [ ] Configure MongoDB authentication (`MONGO_USERNAME` / `MONGO_PASSWORD`)
- [ ] Use Gunicorn (`gunicorn -c gunicorn.conf.py wsgi:app`) instead of `python app.py`
- [ ] Set up daily automated backups via Windows Task Scheduler or cron
- [ ] Enable HTTPS (reverse proxy: nginx or Caddy)
- [ ] For high-traffic: replace in-memory rate limiter storage with Redis (`LIMITER_STORAGE_URI=redis://...`)
