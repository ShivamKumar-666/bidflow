# BidFlow — Intelligent Bid Management System

BidFlow is an enterprise-grade bid and proposal management platform that automates, analyzes, and optimizes business bidding processes. Built with a Python/Flask backend and React/Vite frontend, it integrates machine learning predictions, real-time collaboration, role-based access, and audit logging.

---

## 📖 About BidFlow

In competitive B2B sales, companies lose millions due to disorganized bid tracking, missed deadlines, and gut-feel decisions. BidFlow centralizes the entire bid lifecycle — from customer enquiry to final outcome — into one intelligent platform.

### What It Does

- **Enquiry Management** — Capture and prioritize customer enquiries with tags and detailed requirements
- **Bid Tracking** — Full lifecycle management: Quotation Prepared → Under Review → Negotiation → Order Received / Rejected
- **Deadline Calendar** — Interactive monthly view with click-to-navigate month/year pickers; never miss a submission
- **AI Win Predictions** — ML model predicts bid success probability from historical data so teams can prioritize high-value opportunities
- **Team Collaboration** — Real-time comments via WebSockets, document attachments, and role-based dashboards
- **KPI Analytics** — Live revenue, win rate, and pipeline metrics with Chart.js visualizations and CSV export
- **Customer Portal** — Secure token-based links let customers check bid status without exposing internal data

### Real-World Industry Impact

| Industry | Use Case |
|----------|----------|
| **Manufacturing** | RFQ management, machinery & logistics contract tracking |
| **Banking & Finance** | Regulated bid processes, loan syndications, compliance audit trails |
| **Technology / IT** | Software dev bids, SaaS licensing, cloud & cybersecurity proposals |
| **Healthcare** | Medical device procurement, pharma supply, clinical trial contracts |
| **Retail & E-Commerce** | POS implementations, inventory systems, loyalty program proposals |

### Key Advantages

| Advantage | Business Value |
|-----------|---------------|
| AI Win Predictions | Prioritize high-probability bids; stop wasting effort on low-value ones |
| Real-Time Collaboration | Kill email chains; all discussions and documents in one place |
| Deadline Management | Visual calendar with alerts prevents costly missed submissions |
| Role-Based Security | Executives see only their bids; admins get full oversight |
| Audit Compliance | Every action logged for governance and ISO audits |
| Multi-Language (7 langs + RTL) | Serve global teams and Arabic-speaking clients natively |
| Two-Factor Authentication | Protect sensitive bid data from unauthorized access |
| Customer Self-Service | Reduce status-inquiry calls via secure portal links |

---

## ⚡ Quick Setup

### Prerequisites

- **Node.js** v18+ and **npm**
- **Python** v3.8+
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

## 🌟 Key Features

### 🔐 Two-Factor Authentication (Admins)
Google Authenticator TOTP setup with QR code, 8 bcrypt-hashed backup codes, and temporary JWT sessions until 2FA is verified.

### 🌐 Internationalization & RTL
7 languages (EN, HI, GU, ES, FR, DE, AR) via `react-i18next`. Auto `dir="rtl"` for Arabic. Full ARIA accessibility.

### 🌗 Glassmorphic Theme Engine
Light/dark mode persisted in `localStorage`, respects system preference.

### ️ RBAC & Audit Logs
JWT auth via `Flask-JWT-Extended`, bcrypt hashing, server-side token revocation with MongoDB TTL cleanup, and admin-only audit log viewer.

### 🧠 AI Bid Success Prediction
`scikit-learn` Logistic Regression with real computed win rates from `db.Bids` (not user-controlled fields). Cold-start safety for new users. Live retraining via `POST /api/admin/retrain` (≥ 50 labeled bids).

### 💬 Real-Time Collaboration
Flask-SocketIO pushes bid comments and notifications instantly to all connected clients.

###  Secure Document Management
PDF/DOCX/image attachments linked to bids. 16MB max, blocked file extensions, path traversal protection.

### 📊 KPI Analytics
Revenue, win rate, average bid size, active bids — with Chart.js charts and one-click CSV export.

###  Notification Centre
Real-time push notifications for bid status changes and comments. Smart filtering prevents self-spam. Unread badge in navbar.

### 📅 Interactive Calendar
Monthly grid with deadline highlighting, month/year click-to-navigate pickers, and upcoming deadline sidebar.

### 🔗 Public Customer Portal
Token-based secure sharing of enquiry details and bid statuses. ML predictions hidden; tokens expire after 90 days.

---

## 🛡️ Security Summary

| Area | Implementation |
|------|---------------|
| Rate Limiting | `Flask-Limiter`: login 10/min, register 5/min, 2FA 5/min |
| JWT Revocation | Server-side JTI blacklist with MongoDB TTL auto-expiry |
| MongoDB Auth | `MONGO_USERNAME` / `MONGO_PASSWORD` env-driven URI |
| Non-Sequential IDs | `secrets.token_hex(4)` → `BID-3a7f9c2b` format |
| RBAC Enforcement | Ownership checks on bid delete/status; admin-only audit & retrain |
| Mass Assignment | Field allowlists on all PUT endpoints |
| Path Traversal | DB-ID-based document lookup; no filename exposure |
| CORS | Restricted to `http://localhost:5173` |
| Password Policy | 8-char minimum + email format regex |
| 2FA Secret Protection | MongoDB field projection excludes TOTP secrets from API responses |

---

## 📂 Project Structure

```
bidflow/
├── backend/
│   ├── app.py              # Flask entrypoint & blueprint registration
│   ├── config.py           # JWT, MongoDB, rate limit config
│   ├── database.py         # MongoDB connection & collections
│   ├── extensions.py       # Limiter, SocketIO instances
│   ├── wsgi.py             # Gunicorn entrypoint
│   ├── backup.py           # mongodump with TTL pruning
│   ├── routes/             # auth, bids, enquiries, admin, analytics, audit, twofa
│   └── ml/                 # prepare_and_train.py, retrain.py, model .pkl files
├── frontend/
│   ── src/
│       ├── pages/          # Bids, Enquiries, Calendar, Dashboard, Profile, etc.
│       ├── components/     # Navbar, Sidebar, TagInput, shared UI
│       ├── contexts/       # AuthContext, ThemeContext
│       ├── locales/        # i18n JSON (ar, de, en, es, fr, gu, hi)
│       └── services/       # Axios API layer with auto-retry
├── start.bat               # One-click launcher
└── backup.bat              # Windows backup wrapper
```

---

## ️ Technology Stack

**Frontend:** React 19, Vite, React Router v6, Axios, `react-i18next`, Chart.js, `lucide-react`, shadcn/ui, `react-hot-toast`

**Backend:** Python 3.8+, Flask 3.0 (Blueprints), Flask-SocketIO, Flask-JWT-Extended, Flask-Limiter, `scikit-learn`, PyMongo, bcrypt, pyotp

**Database:** MongoDB with TTL indexes

**Production:** Gunicorn + eventlet worker, nginx/Caddy reverse proxy

---

##  Environment Variables

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

---

## 💾 Automated Backups

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

##  Machine Learning

```bash
# Initial training from CRM dataset
cd backend/ml && python prepare_and_train.py

# Live retraining (Admin only, requires ≥ 50 labeled bids)
POST /api/admin/retrain
GET  /api/admin/model-status
```

---

## 🧪 Testing

```bash
# Isolated integration tests (mock DB)
cd backend && venv\Scripts\activate && python test_suite.py

# Live end-to-end flow test (server must be running)
cd backend && venv\Scripts\activate && python test_flow.py
```

---

## 🚨 Production Checklist

- [ ] Generate strong `SECRET_KEY` and `JWT_SECRET_KEY`
- [ ] Set `FLASK_ENV=production`
- [ ] Enable MongoDB authentication
- [ ] Use Gunicorn instead of `python app.py`
- [ ] Schedule daily backups
- [ ] Enable HTTPS via nginx/Caddy
- [ ] Switch rate limiter storage to Redis for high traffic
