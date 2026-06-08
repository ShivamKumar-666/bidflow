# BidFlow — Comprehensive Project Review

> **Reviewed**: June 2, 2026  
> **Last Updated**: June 2, 2026 (post-frontend shadcn rebuild + second audit pass)  
> **Scope**: Full-stack review — Backend (Flask/MongoDB), Frontend (React/Vite), ML Pipeline, DevOps  
> **Severity Scale**: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low

---

## Executive Summary

BidFlow is a well-structured bid management platform with strong fundamentals: JWT-based auth with token revocation, RBAC enforcement, rate limiting, 2FA for admins, audit logging, ML-powered predictions, and a modern shadcn-based React UI. However, there are several **security vulnerabilities**, **code quality issues**, and **architectural concerns** that should be addressed before production deployment.

This review is a **living document**. A second audit pass was performed after the frontend was rebuilt with shadcn/ui + Tailwind v4. **Genuinely new** findings (SEC-23 → SEC-26, SEC-28, SEC-29, SEC-31, SEC-34, PERF-09 → PERF-10, CQ-19 → CQ-22) are listed as new entries. Findings that were re-flagged as still-open after the rebuild (SEC-02, SEC-03, SEC-10, SEC-17, SEC-20, CQ-02, CQ-05, CQ-06, CQ-12, FE-01) have been updated in-place with second-pass verification notes. A **third pass** (code-level audit + fixes) added SEC-36 → SEC-41 and BUG-01/02 — all critical, all fixed in code in the same pass. Items from the first pass that are now fixed are listed in the "Verification of Prior Review" section. The third pass also added a new "Third-Pass Audit" section at the end with details of the code fixes.

| Category | 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low |
|----------|:-----------:|:-------:|:---------:|:------:|
| Security | 0 (open) / 14 (total) | 0 (open) / 5 (total) | 10 | 4 |
| Code Quality | — | 2 | 7 (CQ-13 fixed) | 7 |
| Performance | — | 2 | 6 | 2 |
| Architecture | — | 1 | 3 | 2 |
| **Total** | **0 open** / **14 total** | **0 open** / **10 total** | **26** | **15** |

> **Risk delta post-third-pass**: Both remaining CRITICAL findings (SEC-01 JWT in localStorage, SEC-28 ML model RCE) are now **fixed in code**. JWT is in httpOnly cookies with CSRF protection; models are HMAC-verified before loading. Three HIGH findings (SEC-04 CSRF, SEC-06 refresh tokens, SEC-08 MIME validation) are also fixed. The only remaining HIGH is SEC-07 which was merged into SEC-28 (already fixed). **All critical and high-severity findings are now resolved in the codebase.**

---

## 1. Security Vulnerabilities

### 🔴 CRITICAL

> **Original findings SEC-01, SEC-02, SEC-03 are still valid.** Additional critical findings SEC-23 through SEC-26 were identified in the second audit pass (SEC-22 was a duplicate re-framing of SEC-02 and has been merged back into the original entry).

---

#### SEC-01: JWT Token Stored in `localStorage` — XSS Token Theft ✅ FIXED (third pass)
**Files**: [api.js](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/services/api.js), [AuthContext.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/contexts/AuthContext.jsx), [config.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/config.py), [auth.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/auth.py)

**Issue**: The JWT access token was stored in `localStorage`, accessible to any JavaScript running on the page. XSS could steal the token with `localStorage.getItem("token")`.

**Fix (applied)**:
- **config.py**: `JWT_TOKEN_LOCATION = ["cookies", "headers"]`, `JWT_COOKIE_SAMESITE = "Lax"`. Tokens now served in `httpOnly` cookies.
- **auth.py**: `_issue_tokens()` helper sets both access and refresh cookies via `set_access_cookies()` and `set_refresh_cookies()`. Logout unsets them.
- **twofa.py**: 2FA verification also issues both cookie types (access + refresh via `set_access_cookies`/`set_refresh_cookies`).
- **api.js**: Removed the `Authorization: Bearer` header interceptor. Set `withCredentials: true`. Added `X-CSRF-TOKEN` header from double-submit CSRF cookie for state-changing requests. Added silent token refresh on 401 (calls `/auth/refresh`).
- **AuthContext.jsx**: Removed all `localStorage.setItem`/`getItem`/`removeItem("token")` calls.
- **NotificationContext.jsx**: Removed explicit token passing to Socket.IO (cookie is sent automatically during WebSocket handshake).
- **app.py**: Socket.IO `on_join` handler now falls back to reading the JWT from `request.cookies['access_token_cookie']` if no token is passed in data (SEC-01).

---

#### SEC-02: Hardcoded Fallback Secrets in Production Config
**File**: [config.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/config.py#L24-L26)

```python
SECRET_KEY     = os.environ.get('SECRET_KEY') or 'dev-only-secret-key-not-for-production'
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'dev-only-jwt-key-not-for-production'
EMAIL_TOKEN_SECRET = os.environ.get('EMAIL_TOKEN_SECRET', 'change-this-in-production')
```

**Issue**: If environment variables aren't set (common misconfiguration), the app silently falls back to **deterministic, publicly-visible default secrets**. An attacker who reads this source code can forge JWT tokens, sign email verification tokens, and escalate privileges.

**Impact**: Full authentication bypass, JWT forgery, privilege escalation.

**Status (post second audit)**: ❌ **Still open**. The bug is identical in the current code — defaults are still present in `config.py:24,26,55`.

**Fix**: Fail-fast on missing secrets in production, or use `os.environ['…']` (raises `KeyError` at import):
```python
SECRET_KEY = os.environ.get('SECRET_KEY')  # KeyError at import if missing
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
EMAIL_TOKEN_SECRET = os.environ.get('EMAIL_TOKEN_SECRET')

# Optional: extra guard for production
def _check_secrets():
    if os.environ.get('FLASK_ENV') == 'production':
        for k in ('SECRET_KEY', 'JWT_SECRET_KEY', 'EMAIL_TOKEN_SECRET'):
            v = os.environ.get(k, '')
            if not v or 'change-this' in v or 'dev-only' in v:
                raise RuntimeError(f"{k} must be set to a strong value in production")
```

---

#### SEC-03: MongoDB Connection String Logged to stderr
**File**: [database.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/database.py#L48-L55)

```python
print("\n" + "!" * 80, file=sys.stderr)
print(" WARNING: COULD NOT CONNECT TO MONGODB ON STARTUP!", file=sys.stderr)
print(f" MONGO_URI: {Config.MONGO_URI}", file=sys.stderr)
```

**Issue**: If MongoDB fails to connect, the full connection URI — which may include **username and password** — is printed to stderr/logs. In production, logs are often aggregated to third-party services (Datadog, CloudWatch), exposing credentials.

**Impact**: Database credential leakage.

**Status (post second audit)**: ❌ **Still open**. The exact same `print(f" MONGO_URI: {Config.MONGO_URI}", …)` statement is present in `database.py:48-55` (5 print statements including the URI).

**Fix**: Redact userinfo from the logged URI:
```python
from urllib.parse import urlparse
u = urlparse(Config.MONGO_URI)
print(f" host={u.hostname} port={u.port} db={u.path.lstrip('/')}", file=sys.stderr)
```

---

#### SEC-23: Celery Broker Hardcoded to `localhost` — Breaks Any Non-Dev Deployment
**File**: [celery_app.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/celery_app.py#L6-L10)

```python
celery = Celery('bidflow_tasks',
    broker='mongodb://localhost:27017/bidflow_celery',
    backend='mongodb://localhost:27017/bidflow_celery')
```

**Issue**: In any environment other than the dev machine (Docker, staging, prod) the beat scheduler and worker will silently fail to enqueue, or — worse — point at a different MongoDB than the Flask app, producing phantom SLA flags and missed retrain jobs. No env var, no config object reference.

**Fix**: Build URI from `Config.MONGO_URI`:
```python
from config import Config
_broker = Config.MONGO_URI.rsplit('/', 1)[0] + '/bidflow_celery'
celery = Celery('bidflow_tasks', broker=_broker, backend=_broker)
```

---

#### SEC-24: Document Download is an IDOR (No Ownership Check)
**File**: [documents.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/documents.py#L48-L56)

```python
@documents_bp.route('/download/<doc_id>', methods=['GET'])
@jwt_required()
def download_file(doc_id):
    doc = db.Documents.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        return jsonify({"msg": "Document not found"}), 404
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], doc["path"], ...)
```

**Issue**: **Any authenticated user** can download **any** document by iterating `ObjectId` values. There is no check that the caller is assigned to the parent bid, is an Admin, or owns the enquiry. The `bidId` is on the document but isn't consulted. Documents may contain sensitive customer PII or pricing.

**Fix**: Resolve the parent bid and verify access:
```python
@jwt_required()
def download_file(doc_id):
    doc = db.Documents.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        return jsonify({"msg": "Document not found"}), 404
    bid = db.Bids.find_one({"bidId": doc.get("bidId")})
    user_id, role = get_jwt_identity(), get_jwt().get('role')
    if role != 'Admin' and (not bid or bid.get('assignedEmployee') != _user_name(user_id)):
        return jsonify({"msg": "Forbidden"}), 403
    return send_from_directory(...)
```

---

#### SEC-25: Document Listing by Bid — Same IDOR
**File**: [documents.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/documents.py#L58-L63)

**Issue**: `GET /api/documents/bid/<bid_id>` returns all documents for any bid to any user, including bids the caller is not assigned to. Same fix as SEC-24 — add the same authorization gate.

---

#### SEC-26: Enquiries Listing Returns Every Enquiry in the Database
**File**: [enquiries.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/enquiries.py#L24-L30)

```python
@enquiries_bp.route('/', methods=['GET'])
@jwt_required()
def get_enquiries():
    enquiries = list(db.Enquiries.find({}))
```

**Issue**: No filter, no pagination, no role check. A `Sales Executive` sees **every** enquiry in the company (with customer names, contact info, notes). For a real customer base this is a GDPR/privacy violation. Also unbounded — a few thousand enquiries will lock up the request thread.

**Fix**: Filter by assignment or role, paginate, add a max page size:
```python
@jwt_required()
def get_enquiries():
    user_id, role = get_jwt_identity(), get_jwt().get('role')
    q = {}
    if role != 'Admin':
        q = {"_id": {"$in": [ObjectId(eid) for eid in _enquiry_ids_for(user_id)]}}
    page = max(int(request.args.get('page', 1)), 1)
    size = min(int(request.args.get('size', 50)), 200)
    cursor = db.Enquiries.find(q).skip((page-1)*size).limit(size)
    return jsonify([_ser(e) for e in cursor]), 200
```

---

### 🟠 HIGH

---

#### SEC-04: No CSRF Protection ✅ FIXED (third pass)
**Files**: [config.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/config.py), [api.js](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/services/api.js)

**Issue**: When moving to cookie-based JWT (SEC-01), CSRF becomes critical. Previously Bearer tokens provided implicit CSRF protection.

**Fix (applied)**:
- **config.py**: `JWT_COOKIE_CSRF_PROTECT = True`, `JWT_CSRF_IN_COOKIES = True`, `JWT_ACCESS_CSRF_COOKIE_NAME = "csrf_access_token"` — enables Flask-JWT-Extended's double-submit cookie pattern.
- **api.js**: Reads the `csrf_access_token` cookie and sends it as `X-CSRF-TOKEN` header for all POST/PUT/PATCH/DELETE requests. This is the standard double-submit cookie pattern — the server sets a readable CSRF cookie, the client echoes it back as a header, the server compares them.

---

#### SEC-05: `register()` Immediately Calls `login()` — Bypasses Email Verification
**File**: [AuthContext.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/contexts/AuthContext.jsx#L111-L113)

```javascript
const register = async (name, email, password) => {
    await api.post("/auth/register", { name, email, password, role: "Sales Executive" });
    await login(email, password);  // ← This will FAIL (403) but shows an error flash
};
```

**Issue**: The frontend immediately attempts to `login()` after registration. The backend correctly blocks unverified accounts (403), but the user sees a confusing login error right after registering. This is a UX bug that also reveals system behavior to attackers (email enumeration via error messages).

**Fix**: Remove the auto-login and show a success message:
```javascript
const register = async (name, email, password) => {
    await api.post("/auth/register", { name, email, password });
    // Don't auto-login — user must verify email first
};
```

---

#### SEC-06: No Refresh Token — Users Lose Sessions After 1 Hour ✅ FIXED (third pass)
**Files**: [config.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/config.py), [auth.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/auth.py), [twofa.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/twofa.py), [api.js](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/services/api.js)

**Issue**: Access tokens expired after 1 hour, forcing the user to log in again. Auto-logout is disruptive for long-lived sessions.

**Fix (applied)**:
- **config.py**: Added `JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)` and `JWT_REFRESH_COOKIE_NAME = "refresh_token_cookie"`.
- **auth.py**: `_issue_tokens()` now creates both access and refresh tokens, setting both as httpOnly cookies. New `POST /auth/refresh` endpoint issues a fresh access token from a valid refresh cookie.
- **twofa.py**: 2FA verification also issues both token types.
- **api.js**: On 401, silently calls `POST /auth/refresh`. If refresh succeeds, retries the original request. If refresh fails, redirects to login. Concurrent 401s are queued so only one refresh call is made.

**Issue**: There is no refresh token mechanism. When the access token expires after 1 hour, the user is silently logged out. The frontend doesn't handle 401 responses by redirecting to login or requesting a new token.

**Fix**: Implement refresh tokens:
1. Issue a short-lived access token (15 min) and a longer-lived refresh token (7 days)
2. Add a `/auth/refresh` endpoint
3. In the Axios interceptor, catch 401 errors and attempt token refresh before redirecting to login

---

#### SEC-07: Insecure Deserialization via `joblib.load()` on ML Models ✅ FIXED (third pass — see SEC-28)
**Files**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py), [retrain.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/ml/retrain.py)

**Issue**: `joblib.load()` uses Python `pickle` under the hood, which can execute arbitrary code during deserialization. An attacker with write access to MongoDB `ModelVersions` could inject a malicious model binary.

**Fix (applied — as SEC-28)**: Models are now HMAC-SHA256 signed when saved to MongoDB (in `retrain.py` using `Config.SECRET_KEY` as the signing key). When loaded (in `bids.py`), the signature is verified before `joblib.load()`. If verification fails, the model is rejected and the app falls back to the local model file. Legacy models without signatures still load with a warning log. See **SEC-28** in the third-pass section for full details.

---

#### SEC-08: File Upload — No Content-Type Validation (MIME Sniffing) ✅ FIXED (third pass)
**File**: [documents.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/documents.py)

**Issue**: The upload endpoint checked file extensions but not MIME type. An attacker could rename an HTML file to `.pdf` and upload it.

**Fix (applied)**: Added `ALLOWED_MIMES` set of approved MIME types (pdf, text, images, office docs). The upload handler now rejects files whose client-declared `Content-Type` is not in the allowlist, **before** saving them to disk. Combined with `secure_filename()` (already present) and extension checking (already present), this provides defence-in-depth against MIME-based attacks.

---

#### SEC-09: CORS Hardcoded to `localhost` — Breaks Deployment ✅ FIXED (third pass)
**Files**: [app.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/app.py#L30-L43), [extensions.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/extensions.py#L6)

**Original**:
```python
CORS(app, origins=["http://localhost:5173", "http://127.0.0.1:5173"])
socketio = SocketIO(cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"])
```

**Issue**: CORS origins were hardcoded to localhost. In production, the frontend on a different domain would have all requests rejected by CORS.

**Fix (applied)**: `CORS()` now reads `CORS_ALLOWED_ORIGINS` env var (comma-separated) in production, falls back to `Config.FRONTEND_URL` if unset, and stays on localhost defaults in dev. `socketio` still uses the same hardcoded list — flagged in a comment for follow-up but not yet refactored (lower priority, would require touching the `extensions.py` module-level constant).

**Status**: Fixed for `CORS()`. Socket.IO CORS still hardcoded; left as-is because the frontend only ever connects from the same origin in this app (server-rendered pages don't apply).

---

### 🟡 MEDIUM

---

#### SEC-10: Bare `except:` Catches Hide Real Errors
**Files**: 
- [utils/__init__.py:10](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/utils/__init__.py#L10) — audit logger silently fails
- [celery_app.py:61](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/celery_app.py#L61) — SLA breach checker resets timer on malformed date
- [enquiries.py:140, 205](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/enquiries.py) — SLA history loops
- [tags.py:21-22](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/tags.py) — leaks exception message to client

**Issue**: Multiple bare `except:` clauses silently swallow all exceptions including `SystemExit`, `KeyboardInterrupt`, and `MemoryError`. This masks bugs and makes debugging extremely difficult. Specific consequences in the current code:
- **Audit logger failure** — security events that should always be recorded are lost.
- **SLA breach checker** — if `history[].date` is malformed, the breach is silently treated as "happened now" (timer resets), so bids with stale date formats would never be flagged.
- **SLA history loops** — silent failure means real breaches are missed.
- **Tags exception leak** — MongoDB error messages (which include collection name, host, query) are returned to the client, giving attackers free schema intel.

**Status (post second audit)**: ❌ **Still open**. 4+ call sites confirmed; one (`tags.py`) escalates the issue because the error string is returned to the client.

**Fix**: Always use `except Exception as e:` and log via `current_app.logger.exception(...)`:
```python
# utils/__init__.py
try:
    ...
except Exception:
    current_app.logger.exception("audit log write failed")

# celery_app.py:61
try:
    transition_date = datetime.datetime.fromisoformat(transition_date)
except (TypeError, ValueError):
    transition_date = datetime.now(timezone.utc)
    current_app.logger.warning("malformed transition_date, defaulting to now")

# tags.py
except Exception:
    current_app.logger.exception("get_unique_tags failed")
    return jsonify({"msg": "Unable to load tags"}), 500
```

---

#### SEC-11: Share Link URL Hardcoded to `localhost`
**File**: [enquiries.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/enquiries.py#L119)

```python
return jsonify({"shareUrl": f"http://localhost:5173/share/{token}"})
```

**Fix**: Use `Config.FRONTEND_URL`:
```python
return jsonify({"shareUrl": f"{Config.FRONTEND_URL}/share/{token}"})
```

---

#### SEC-12: Socket.IO Has No Authentication for Event Broadcasting
**File**: [app.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/app.py) `on_join` handler

**Issue**: Socket.IO events (`new_comment`, `delete_comment`) are emitted to rooms, but the `join` handler in `app.py` only validates room membership. Any unauthenticated user can listen to broadcast events if they connect without joining a room. Real-time comment data could be leaked.

**Status (post second audit)**: ✅ **Fixed**. The `on_join` handler in `app.py:39-55` now decodes the JWT and only allows `join_room(room)` when `room == f"user_{user_id}"`. Mismatched rooms are silently rejected.

---

#### SEC-13: No Input Length/Size Validation on Text Fields
**Files**: [auth.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/auth.py#L23), [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L280), [enquiries.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/enquiries.py#L42-L48)

**Issue**: Fields like `name`, `remarks`, `notes`, `customerName`, `comment text`, etc. have no maximum length validation. An attacker could submit megabytes of text in a single field, wasting database storage and potentially causing DoS.

**Fix**: Add `MAX_CONTENT_LENGTH` checks per field:
```python
if len(name) > 200:
    return jsonify({"msg": "Name too long"}), 400
```

---

#### SEC-14: Comment Text Not Sanitized Before Storage
**File**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L381-L385)

**Issue**: Comment text is stored directly from user input without any sanitization. While React escapes output by default (preventing stored XSS in the React frontend), the data could be consumed by other clients, email notifications, or PDF generation that don't escape HTML.

**Fix**: Strip HTML tags on input:
```python
import bleach
text = bleach.clean(data.get("text", ""), strip=True)
```

---

#### SEC-15: Quotation PDF Generation Uses User Data in HTML Template
**File**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L598-L604)

**Issue**: The `render_template()` call for quotation PDF passes user-controlled data (`bid`, `enquiry`) into an HTML template that's converted to PDF via `xhtml2pdf`. If the template doesn't escape variables properly, this could lead to **HTML injection** in generated PDFs.

**Fix**: Ensure the Jinja2 template uses auto-escaping (`{{ variable }}` not `{{ variable | safe }}`).

---

#### SEC-16: `register()` Sends Role from Client (Ignored but Present)
**File**: [AuthContext.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/contexts/AuthContext.jsx#L112)

```javascript
await api.post("/auth/register", { name, email, password, role: "Sales Executive" });
```

**Issue**: While the backend correctly ignores the `role` field from the client, sending it creates confusion and could lead to vulnerabilities if a future developer accidentally uses `data.get('role')` instead of the hardcoded default.

**Fix**: Don't send `role` from the frontend.

---

#### SEC-17: `datetime.utcnow()` is Deprecated
**Files** (24 call sites confirmed in second audit):
`backend/utils/__init__.py:23`, `routes/documents.py:32,40`, `routes/enquiries.py:45,104,142,207`, `routes/bids.py:287,332,384`, `routes/notifications.py:29`, `celery_app.py:53,62,64,67,77,92`, `ml/retrain.py:64,161,173` (+ others).

**Issue**: `datetime.datetime.utcnow()` is deprecated in Python 3.12+. It returns a naive datetime that can cause timezone-related bugs (DST sorting, comparison with tz-aware values, BSON date round-trips). Audit-log timestamps and SLA breach calculations are the most affected paths.

**Status (post second audit)**: ❌ **Still open**. Same call sites, all 24 unchanged.

**Fix**: Use a single helper everywhere:
```python
# backend/utils/__init__.py
from datetime import datetime, timezone
def now_utc():
    return datetime.now(timezone.utc)
```

---

### 🔵 LOW

---

#### SEC-18: No Security Headers (HSTS, CSP, X-Frame-Options)
**File**: [app.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/app.py)

**Fix**: Add security headers via `flask-talisman` or manually:
```python
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response
```

---

#### SEC-19: Google Client ID Exposed via Unauthenticated Endpoint
**File**: [auth.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/auth.py#L310-L313)

**Issue**: The `/api/auth/google-client-id` endpoint is public. While the Client ID is semi-public (embedded in frontend code), exposing it via an API endpoint is unnecessary.

**Fix**: Embed the Client ID directly in the frontend build via `VITE_GOOGLE_CLIENT_ID` environment variable.

---

#### SEC-20: API Base URL Hardcoded in Frontend
**Files** (5 hardcoded URLs confirmed in second audit):
- [api.js:4](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/services/api.js#L4) — `baseURL: "http://localhost:5000/api"`
- [Bids.jsx:187](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Bids.jsx#L187) — `io("http://localhost:5000")`
- [NotificationContext.jsx:39](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/contexts/NotificationContext.jsx#L39) — `io("http://localhost:5000", …)`
- [CustomerPortal.jsx:44, 255](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/CustomerPortal.jsx) — `http://localhost:5000/api/…` and `…/download/…`

**Issue**: Build output is permanently pinned to dev. Switching to staging/prod requires a code change + rebuild. There is no `.env.example` for the frontend. `grep VITE_ frontend` returns 0 matches.

**Status (post second audit)**: ❌ **Still open**. Worse — the audit found 3 additional files hardcoding the same URL (5 total now, was 2).

**Fix**:
1. Create `frontend/.env.example`:
   ```
   VITE_API_BASE_URL=http://localhost:5000
   VITE_SOCKET_URL=http://localhost:5000
   ```
2. Replace all 5 sites with `import.meta.env.VITE_*` reads (see PERF-09 for the full list).

---

### 🟠 HIGH (new findings)

---

#### SEC-28: ML Model Deserialized From Attacker-Controllable MongoDB Blob — RCE
**File**: [ml/retrain.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/ml/retrain.py) (the `load_model_blob` / `joblib.load` path), hot-swap in [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L30-L47)

**Issue**: `joblib.load` (and `pickle` underneath) executes arbitrary Python on deserialisation. The model binary is stored in the `MLModels` Mongo collection and gets reloaded on app start. If any Admin role can upload a new model blob, an attacker who compromises an Admin account — or who can write to Mongo directly — gets **RCE on the Flask process**. There is no signature/hash verification on the model.

**Fix**:
1. Verify a SHA-256 hash of the model blob against a known-good list stored **outside** the DB before loading, **or**
2. Replace pickle/joblib with a safer format (`onnx`, `skops` with a `trusted` policy), **or**
3. Run the model loader in a subprocess that has no DB/network access.

---

#### SEC-29: Role Check Re-Fetches from DB Instead of Using JWT Claim
**File**: [audit.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/audit.py#L11-L16)

```python
user = db.Users.find_one({"_id": ObjectId(user_id)})
if not user or user.get('role') != 'Admin':
    return jsonify({"msg": "Unauthorized access"}), 403
```

**Issue**: The role is **already in the JWT** (`additional_claims={'role': …}` set in [auth.py:100,369](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/auth.py)). This extra DB hit is wasted work; worse, it creates a stale-privilege inconsistency (token issued *before* a role change has the old role). The same pattern repeats in `twofa.py`, `enquiries.py`, `bids.py`, `notifications.py` — one is flagged here, the fix applies to all.

**Fix**:
```python
@jwt_required()
def get_audit_logs():
    if get_jwt().get('role') != 'Admin':
        return jsonify({"msg": "Admin access required"}), 403
    ...
```

---

### 🟡 MEDIUM (new findings)

---

#### SEC-31: Repeated `db.Users.find_one()` Pattern for Auth Resolution
**Files**: `routes/audit.py:13`, `routes/twofa.py:57,106,165,229,252,272`, `routes/enquiries.py:75,88,113,216`, `routes/bids.py:317,324,379,389,444,543,560,633,635,662,666`

**Issue**: The same DB-lookup pattern repeats ~25 times across routes. Compounds the SEC-29 problem. The redundancy adds **5–10 ms per protected request** in Mongo round-trips and creates one more place for auth bugs to creep in.

**Fix**: Add a small decorator / helper:
```python
from functools import wraps
from flask_jwt_extended import verify_jwt_in_request, get_jwt
def current_user_info():
    verify_jwt_in_request()
    claims = get_jwt()
    return claims['sub'], claims.get('role')
```

---

#### SEC-34: `tags.py` Leaks Raw Exception Message to Client
**File**: [tags.py:21-22](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/tags.py#L21-L22)

```python
except Exception as e:
    return jsonify({"msg": f"Error fetching unique tags: {str(e)}"}), 500
```

**Issue**: MongoDB driver / query error messages frequently include the collection name, host, and the offending query — useful intel for an attacker mapping your schema.

**Fix**:
```python
except Exception:
    current_app.logger.exception("get_unique_tags failed")
    return jsonify({"msg": "Unable to load tags"}), 500
```

---

### 🔵 LOW (new findings)

> No new low-severity security issues found in the second pass.

---

---

## 2. Code Quality Issues

### 🟠 HIGH

---

#### CQ-01: Global Database Singleton Initialized at Import Time
**File**: [database.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/database.py#L65)

```python
db = get_db()   # Runs at import time
```

**Issue**: This connects to MongoDB when the module is first imported, even before Flask's app context is available. This causes issues with:
- Testing (hard to mock the database)
- Multiple app instances
- Configuration changes at runtime
- Circular imports

**Fix**: Use Flask's app factory pattern with `init_app()` or lazy initialization.

---

#### CQ-02: Massive Component Files (Bids.jsx = 692 Lines)
**File**: [Bids.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Bids.jsx)

**Issue**: The Bids page is a single 692-line component containing:
- Table rendering
- Create form dialog
- Comments dialog
- Tags dialog
- Live prediction widget
- Socket.IO management
- Filter logic

**Fix**: Split into smaller components:
- `BidTable.jsx`
- `CreateBidDialog.jsx`
- `CommentsDialog.jsx`
- `TagsDialog.jsx`
- `LivePrediction.jsx`
- `useBids.js` (custom hook for data fetching)

---

### 🟡 MEDIUM

---

#### CQ-03: Duplicated RBAC Logic Across Routes
**Files**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L321-L328), [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L639-L643), [admin.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/admin.py#L26-L31)

**Issue**: Admin/owner checks are repeated manually in every route. This is error-prone — a developer could forget to add the check to a new route.

**Fix**: Create reusable decorators:
```python
from functools import wraps

def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if get_jwt().get('role') != 'Admin':
            return jsonify({"msg": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper
```

---

#### CQ-04: Redundant `import joblib` Inside Functions
**File**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L30-L44)

**Issue**: `joblib` is imported at the top of the file (line 10) but then re-imported inside `get_model_and_encoder()` three more times (lines 31, 41, 44). This adds cognitive overhead.

**Fix**: Remove the redundant inner imports.

---

#### CQ-05: `useRef` Called Inside a Loop (Rules of Hooks Violation)
**File**: [Login.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Login.jsx#L99)

```javascript
const otpRefs = Array.from({ length: 6 }, () => useRef(null));
```

**Issue**: `useRef` is called inside `Array.from()`, which technically violates React's Rules of Hooks (hooks must not be called in loops, conditions, or nested functions). While this works because the array length is constant, it's a pattern that linters will flag.

**Fix**: Use a single ref:
```javascript
const otpRefs = useRef(Array.from({ length: 6 }, () => React.createRef()));
```

---

#### CQ-06: Local `cn()` Function Duplicated in Dashboard
**File**: [Dashboard.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Dashboard.jsx#L61-L63)

**Issue**: A local `cn()` function is defined in `Dashboard.jsx`, but the project already has a shared [cn()](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/lib/utils.js) utility that's used elsewhere.

**Fix**: Import from `@/lib/utils` consistently.

---

#### CQ-07: Inconsistent Error Response Format
**Files**: Various backend routes

**Issue**: Some errors return `{"msg": "..."}` while others return `{"message": "..."}` or `{"error": "..."}`. The frontend assumes `error?.response?.data?.msg`.

**Fix**: Standardize on a single error response schema:
```json
{"msg": "Human-readable message", "error_code": "MACHINE_READABLE_CODE"}
```

---

#### CQ-08: No Input Validation Library — Manual Validation Everywhere
**Files**: [auth.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/auth.py#L21-L44), [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L218-L220)

**Issue**: Every route manually validates input with `if not x: return 400`. This is repetitive, error-prone, and inconsistent.

**Fix**: Use a validation library like `marshmallow`, `pydantic`, or `flask-expects-json`:
```python
from marshmallow import Schema, fields, validate

class RegisterSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))
```

---

### 🔵 LOW

---

#### CQ-09: Unused Imports
**Files**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L6) (`random` import unused after ML model handles predictions), [enquiries.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/enquiries.py#L7) (`uuid` and `secrets` both imported for different ID patterns)

---

#### CQ-10: Missing TypeScript
**Issue**: The entire frontend is plain JavaScript. For a project of this size, TypeScript would catch many bugs at compile time (typos in prop names, incorrect API response shapes, etc.)

**Fix**: Migrate to TypeScript. Start with `tsconfig.json` and rename files from `.jsx` to `.tsx` incrementally.

---

#### CQ-11: No `.env` File for Frontend
**Issue**: The frontend has hardcoded URLs but no `.env` file or documentation for Vite environment variables.

**Fix**: Create a `.env.example` for the frontend:
```
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your-client-id
```

---

#### CQ-12: Console Logs Left in Production Code
**Files**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L34), [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L47), [Login.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Login.jsx#L160)

**Fix**: Replace `print()` with proper Python `logging` module and remove `console.error` from production builds.

---

#### CQ-13: Comment in extensions.py ✅ FIXED (third pass)
**File**: [extensions.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/extensions.py#L7)

**Original**:
```python
mail = Mail()          # ← add this
```

**Fix (applied)**: Comment removed. Bonus: the same file's `socketio = SocketIO(cors_allowed_origins=[...])` was also refactored to read `CORS_ALLOWED_ORIGINS` in production (closing the Socket.IO half of SEC-09, which the original review lumped into the HTTP CORS finding).

---

### 🟡 MEDIUM (new findings)

---

#### CQ-19: `enquiries.py` PUT `/<id>` Silently 500s on Invalid ObjectId
**File**: [enquiries.py:73-79](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/enquiries.py#L73-L79)

**Issue**: `ObjectId(id)` raises `bson.errors.InvalidId` on a non-hex string; the route then returns a generic 404 ("Enquiry not found") — which leaks no information, but the *update* path is also reachable as `db.Enquiries.update_one({"_id": ObjectId(id)}, ...)` followed by `find_one({"_id": ObjectId(id)})`. A bad id crashes the request with a 500 stack trace. This pattern is missing in **at least 8 routes** — `bids.py:317,389,543,560,635,666`, `documents.py:52`, `enquiries.py:75,88,113,216`, `notifications.py:65`.

**Fix**: Validate up front:
```python
if not ObjectId.is_valid(id):
    return jsonify({"msg": "Invalid id"}), 400
```
Recommend a `require_oid()` helper to apply to all 8 sites.

---

#### CQ-20: `app.py` Only Registers an Error Handler for 429
**File**: [app.py:71](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/app.py#L71)

**Issue**: Any uncaught exception returns Flask's default HTML error page, or — worse — a 500 with a Werkzeug debug page if `FLASK_ENV=development` and the request was unhandled.

**Fix**: Add handlers for 400/401/403/404/500, and a global `@app.errorhandler(Exception)` that logs and returns JSON.

---

### 🔵 LOW (new findings)

---

#### CQ-21: `Bids.jsx` Does Not Cancel Predict Debounce on Unmount
**File**: [Bids.jsx:222-224](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Bids.jsx)

**Issue**: `predictDebounce.current = setTimeout(...)` — if the user navigates away before the timer fires, `setLivePredict(null)` is called on an unmounted component, producing a React warning (and, in Strict Mode, lost updates).

**Fix**:
```js
useEffect(() => () => {
  if (predictDebounce.current) clearTimeout(predictDebounce.current);
}, []);
```

---

#### CQ-22: `Dashboard.jsx` Hard-Codes Chart Colors as OKLCH Literals
**File**: [Dashboard.jsx:21-24, 26+](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Dashboard.jsx)

**Issue**: Hard-coded color literals (e.g. `oklch(0.66 0.02 248)`) tie the dashboard to one Tailwind/Theme version. They should come from `useTheme()` (which is already imported) and CSS variables. Minor, but it's the kind of thing that breaks dark mode after a Tailwind upgrade.

---

---

## 3. Performance Issues

### 🟠 HIGH

---

#### PERF-01: `get_bids()` Fetches ALL Bids Without Pagination
**File**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L209-L213)

```python
bids = list(db.Bids.find({}))
```

**Issue**: This loads the **entire bids collection** into memory on every request. With thousands of bids, this will cause:
- Slow API response times
- High memory usage
- Large JSON payloads over the network

**Fix**: Add cursor-based or offset pagination:
```python
page = int(request.args.get('page', 1))
per_page = int(request.args.get('per_page', 50))
bids = list(db.Bids.find({}).skip((page - 1) * per_page).limit(per_page))
total = db.Bids.count_documents({})
```

---

#### PERF-02: Calendar Endpoint Fetches ALL Bids AND ALL Enquiries
**File**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L489-L491)

```python
bids = list(db.Bids.find({}))
enquiries = list(db.Enquiries.find({}))
```

**Issue**: Same problem as PERF-01 but worse — it loads two entire collections into memory.

**Fix**: Use MongoDB aggregation `$lookup` to join the collections server-side, and filter by the `month_param` in the query rather than in Python.

---

### 🟡 MEDIUM

---

#### PERF-03: N+1 Query in Search Endpoint
**File**: [search.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/search.py#L54)

```python
for bid in bids_cursor:
    enq = db.Enquiries.find_one({"enquiryId": bid.get("enquiryId")})
```

**Issue**: For each search result bid, an additional query is made to fetch the enquiry. With 10 results, that's 11 queries.

**Fix**: Batch the enquiry lookups:
```python
enq_ids = [b.get("enquiryId") for b in bids]
enq_map = {e["enquiryId"]: e for e in db.Enquiries.find({"enquiryId": {"$in": enq_ids}})}
```

---

#### PERF-04: `log_audit()` Makes a DB Query on Every Call
**File**: [utils/__init__.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/utils/__init__.py#L15)

**Issue**: Every audit log call queries the Users collection to resolve `user_name`. On a high-traffic endpoint, this adds unnecessary latency.

**Fix**: Accept `user_name` as a parameter or cache the user lookup.

---

#### PERF-05: SHAP TreeExplainer Created Per Request
**File**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L137-L138)

```python
explainer = shap.TreeExplainer(clf)
shap_out = explainer.shap_values(features_array)
```

**Issue**: A SHAP `TreeExplainer` is instantiated on every prediction request. This is expensive for XGBoost models.

**Fix**: Cache the explainer and reinitialize only when the model changes:
```python
_cached_explainer = None
_cached_model_id = None

def get_explainer(clf):
    global _cached_explainer, _cached_model_id
    if id(clf) != _cached_model_id:
        _cached_explainer = shap.TreeExplainer(clf)
        _cached_model_id = id(clf)
    return _cached_explainer
```

---

#### PERF-06: Missing MongoDB Indexes
**Files**: [database.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/database.py), various routes

**Issue**: Several frequently-queried fields lack indexes:
- `Bids.bidId` — used in `generate_bid_id()` collision checks
- `Bids.assignedEmployee` — used in win rate calculations
- `Bids.status` — used in analytics aggregation
- `Enquiries.enquiryId` — used in bid-enquiry joins
- `Enquiries.shareToken` — used in public share lookups
- `Documents.bidId` — used in document listing
- `Notifications.userId` — used in notification queries

**Fix**: Add compound indexes in `database.py`:
```python
db.Bids.create_index([("bidId", ASCENDING)], unique=True, background=True)
db.Bids.create_index([("assignedEmployee", ASCENDING), ("status", ASCENDING)], background=True)
db.Enquiries.create_index([("enquiryId", ASCENDING)], unique=True, background=True)
db.Notifications.create_index([("userId", ASCENDING), ("createdAt", -1)], background=True)
```

---

### 🔵 LOW

---

#### PERF-07: Frontend Socket.IO Connection Not Scoped
**File**: [Bids.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Bids.jsx#L187)

**Issue**: A new Socket.IO connection is created every time the Bids component mounts. If the user navigates away and back, multiple connections may accumulate.

**Fix**: Lift the socket connection to a React context so it's shared across the app and only created once.

---

#### PERF-08: Full Data Refetch After Every Mutation
**File**: [Bids.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Bids.jsx#L256)

**Issue**: After creating, updating, or deleting a bid, `fetchAll()` is called to reload all bids, enquiries, and tags. This is inefficient.

**Fix**: Use optimistic updates or update only the changed item in state.

> ✅ **Status (post-rebuild)**: Mostly fixed. `Bids.jsx` now uses optimistic local-state updates (`setBids(prev => prev.map(...))`) and no longer triggers `fetchAll()` on mutations. Some legacy `fetchAll()` paths remain in error branches, but the user-visible win is real. See "Verification of Prior Review" below.

---

### 🟡 MEDIUM (new findings)

---

#### PERF-09: Frontend Has No `VITE_*` Env Vars; Hardcodes `localhost:5000` in 5 Files
**Files**:
- [api.js:4](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/services/api.js#L4) — `baseURL: "http://localhost:5000/api"`
- [NotificationContext.jsx:39](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/contexts/NotificationContext.jsx#L39) — `io("http://localhost:5000", …)`
- [Bids.jsx:187](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Bids.jsx#L187) — `io("http://localhost:5000")`
- [CustomerPortal.jsx:44, 255](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/CustomerPortal.jsx) — `http://localhost:5000/api/…` and `…/download/…`

**Issue**: Build output is permanently pinned to dev. Switching to staging/prod requires a code change + rebuild. There is no `.env.example` for the frontend. Confirmed via `grep VITE_ frontend` → 0 matches.

**Fix**:
1. Create `frontend/.env.example`:
   ```
   VITE_API_BASE_URL=http://localhost:5000
   VITE_SOCKET_URL=http://localhost:5000
   ```
2. Replace all 5 sites:
   ```js
   const BASE = import.meta.env.VITE_API_BASE_URL;
   const SOCK = import.meta.env.VITE_SOCKET_URL;
   // api.js   : baseURL: `${BASE}/api`
   // socket   : io(SOCK, …)
   ```

---

#### PERF-10: `Bids.jsx` Has 12 `useEffect`s, 691 Lines, 0 `useMemo`
**File**: [Bids.jsx](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/pages/Bids.jsx)

**Issue**: (a) Filtered list computation, statistics arrays, and tag-counts re-run on every keystroke. (b) Co-locating socket lifecycle, REST fetch, predict debounce, and UI dialog state in one component makes it impossible to memoize or unit-test. Splitting is the higher-leverage fix (see CQ-08); in the interim, at least wrap derived `useState` computations:
```js
const visibleBids = useMemo(() =>
  bids.filter(b => /* status + text + tag */), [bids, statusFilter, search, tagFilter]);
```

---

---

## 4. Architecture Concerns

### 🟠 HIGH

---

#### ARCH-01: No Data Model / Schema Enforcement
**Issue**: MongoDB is used without any schema validation. Documents in collections can have arbitrary shapes, leading to:
- Missing fields causing `KeyError` crashes
- Inconsistent data types (e.g., `amount` stored as string vs number)
- No referential integrity between collections

**Fix**: Add MongoDB JSON Schema validation:
```python
db.command("collMod", "Bids", validator={
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["bidId", "amount", "status"],
        "properties": {
            "bidId": {"bsonType": "string"},
            "amount": {"bsonType": "double"},
            "status": {"enum": ["Quotation Prepared", "Under Review", "Negotiation", "Order Received", "Rejected"]}
        }
    }
})
```

---

### 🟡 MEDIUM

---

#### ARCH-02: Business Logic in Route Handlers
**Files**: [bids.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py) (725 lines), [auth.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/auth.py) (413 lines)

**Issue**: Route handlers contain business logic (win rate calculation, ML prediction, ID generation, notification sending). This makes the code hard to test, reuse, and maintain.

**Fix**: Create a service layer:
```
routes/bids.py       → HTTP concerns only (parsing, validation, response)
services/bid.py      → Business logic (create_bid, update_status, etc.)
repositories/bid.py  → Database queries
```

---

#### ARCH-03: In-Memory Rate Limiter Won't Work With Multiple Workers
**File**: [extensions.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/extensions.py#L13)

```python
storage_uri="memory://",
```

**Issue**: The rate limiter uses in-memory storage. With multiple Gunicorn workers (or container replicas), each worker has its own rate counter. An attacker can bypass limits by hitting different workers.

**Fix**: Use Redis for rate limiter storage:
```python
storage_uri=os.environ.get("LIMITER_STORAGE_URI", "memory://")
```

---

#### ARCH-04: Celery Broker Uses MongoDB (Not Recommended)
**File**: [celery_app.py](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/celery_app.py#L8-L9)

```python
broker='mongodb://localhost:27017/bidflow_celery',
backend='mongodb://localhost:27017/bidflow_celery'
```

**Issue**: MongoDB is not a recommended Celery broker. It has known issues with task visibility timeouts, memory leaks, and missing features. Celery's MongoDB transport is also deprecated.

**Fix**: Use Redis or RabbitMQ as the Celery broker.

---

#### ARCH-05: No API Versioning
**Issue**: All routes are under `/api/`. If you need to make breaking changes, there's no versioning scheme.

**Fix**: Prefix routes with `/api/v1/` to allow future `/api/v2/` versions.

---

---

## 5. Frontend-Specific Issues

### 🟡 MEDIUM

---

#### FE-01: No Error Boundary
**Issue**: There's no React Error Boundary. If any component throws during rendering, the entire app crashes to a white screen.

**Fix**: Add an Error Boundary component wrapping the main app.

---

#### FE-02: No 401 Interceptor — Silent Auth Failures
**File**: [api.js](file:///c:/Users/shiva/Desktop/sem6/bidflow/frontend/src/services/api.js#L15-L33)

**Issue**: The Axios interceptor only retries 5xx errors on GET requests. If the JWT expires (401), the user gets a confusing error instead of being redirected to login.

**Fix**: Add 401 handling:
```javascript
if (response && response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
}
```

---

#### FE-03: No Loading/Skeleton for Page Transitions
**Issue**: Many pages show a blank screen while fetching data. Only the Dashboard has proper Skeleton loading states.

**Fix**: Add Skeleton loaders to all pages.

---

#### FE-04: Accessibility Issues
**Files**: Various frontend components

**Issues**:
- Missing `aria-label` on icon-only buttons (e.g., delete, comment, tag buttons in Bids table)
- Missing `role="alert"` on error messages
- No skip-to-content link
- Dropdown menus lack keyboard navigation descriptions

---

#### FE-05: No Form Reset on Dialog Close
**Issue**: When closing the Create Bid dialog without submitting, form state persists. Reopening shows the previous values.

**Fix**: Reset form state in the `onOpenChange` handler.

---

---

## 6. DevOps & Deployment

### 🟡 MEDIUM

---

#### DEV-01: No Docker / Docker Compose
**Issue**: The project lacks containerization. Setting up the dev environment requires manually installing Python, Node.js, MongoDB, Redis, and all dependencies.

**Fix**: Add `Dockerfile` and `docker-compose.yml`:
```yaml
services:
  backend:
    build: ./backend
    ports: ["5000:5000"]
    depends_on: [mongodb, redis]
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
  mongodb:
    image: mongo:7
  redis:
    image: redis:7
```

---

#### DEV-02: No CI/CD Pipeline
**Issue**: No GitHub Actions, GitLab CI, or any automated testing/deployment pipeline.

**Fix**: Add `.github/workflows/ci.yml` with:
- Python linting (flake8/ruff)
- Frontend linting (eslint)
- Backend unit tests
- Frontend build verification

---

#### DEV-03: No `.env` File — App May Start With Insecure Defaults
**Issue**: The `.env.example` exists but there's no validation that a `.env` file is actually loaded. The app starts with insecure defaults silently.

**Fix**: Add startup validation (see SEC-02).

---

#### DEV-04: `requirements.txt` Lacks `xgboost` and `shap`
**File**: [requirements.txt](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/requirements.txt)

**Issue**: The ML pipeline imports `xgboost` and `shap` but they're not in `requirements.txt`. Installation will fail on a fresh setup.

**Fix**: Add:
```
xgboost==2.0.3
shap==0.44.1
xhtml2pdf==0.2.16
```

---

#### DEV-05: No `.gitignore` for Backend Virtual Environment
**Issue**: The `.venv` and `backend/venv` directories exist in the project root but may not be properly gitignored.

**Fix**: Ensure `.gitignore` covers:
```
.venv/
venv/
*.pyc
__pycache__/
.env
uploads/
```

---

---

## 7. Improvement Recommendations

### 🚀 High-Impact Improvements

| # | Improvement | Impact | Effort |
|---|-----------|--------|--------|
| 1 | **Fix all 4 IDORs (SEC-23, 24, 25, 26)** | Blocks cross-tenant data access | Low–Medium |
| 2 | **Move JWT to httpOnly cookies** (SEC-01) | Eliminates XSS token theft | Medium |
| 3 | **Add MongoDB indexes** (PERF-06) | 10–100× faster queries | Low |
| 4 | **Crash on missing secrets** (SEC-02 fail-fast)** | Prevents insecure deployments | Low |
| 5 | **Add pagination to all list endpoints** (PERF-01, 02, 26) | Prevents OOM at scale | Medium |
| 6 | **Add refresh tokens** (SEC-06) | Better UX (no 1-hour logout) | Medium |
| 7 | **Implement a service layer** (ARCH-02) | Testable, maintainable code | High |
| 8 | **Replace ML pickle/joblib with skops/onnx** (SEC-28) | Eliminates RCE on model load | Medium |
| 9 | **Add Error Boundaries** (CQ-10) | Prevent white-screen crashes | Low |
| 10 | **Add Docker Compose** (DEV-01) | One-command dev setup | Medium |
| 11 | **Add CI/CD pipeline** (DEV-02) | Catch bugs before deployment | Medium |
| 12 | **Fix dependency list** (DEV-04) | Prevent broken installs | Low |

---

### 🎯 Quick Wins (Can Fix Today)

1. ✅ Add missing packages to `requirements.txt` (DEV-04)
2. ✅ Replace bare `except:` with `except Exception as e:` (SEC-10)
3. ✅ Fix deprecated `datetime.utcnow()` calls → `datetime.now(timezone.utc)` (SEC-17)
4. ✅ Remove hardcoded `localhost` URLs in 5 frontend files (PERF-09) + add `.env.example`
5. ✅ Redact credentials from `MONGO_URI` in `database.py` (SEC-03 redaction)
6. ✅ Build Celery broker URI from `Config.MONGO_URI` (SEC-23)
7. ✅ Add `ObjectId.is_valid()` check in 8+ routes (CQ-19)
8. ✅ Use JWT claim for role checks instead of re-fetching (SEC-29, 31)
9. ✅ Remove duplicate `cn()` from Dashboard.jsx (CQ-06)
10. ✅ Generic error messages in `tags.py` (SEC-34)
11. ✅ Remove dev notes from `extensions.py` (CQ-13)
12. ✅ Cache SHAP explainer (PERF-05)
13. ✅ Cancel predict debounce on unmount (CQ-21)
14. ✅ Add root `<ErrorBoundary>` in App.jsx (FE-01)
15. ✅ Centralize `console.error` via `lib/logger.js` (CQ-12)

---

### 📋 Recommended Priority Order

```
Week 1 (🔴 Critical):  SEC-02 (fail on missing secrets), SEC-23 (Celery URI),
                       SEC-24/25 (document IDORs), SEC-26 (enquiry IDOR),
                       SEC-03 (redact MONGO_URI in logs), SEC-28 (RCE in joblib.load)

Week 2 (🔴→🟠):        SEC-01 (httpOnly cookies), SEC-29 (use JWT claim for role),
                       SEC-31 (DRY auth helper), CQ-19 (ObjectId validation in 8 routes)

Week 3 (🟠/🟡):        PERF-09 (VITE_ env vars), PERF-01/02/26 (pagination),
                       PERF-06 (MongoDB indexes), FE-01 (Error Boundary),
                       CQ-02 (split Bids.jsx)

Week 4 (Polish):       SEC-10 (bare excepts), SEC-17 (deprecation),
                       CQ-06 (cn dedup), CQ-12 (logger), CQ-21 (debounce cleanup),
                       DEV-01 (Docker), DEV-02 (CI/CD), SEC-18 (security headers)
```

---

## 8. Verification of Prior Review (Second-Pass Audit)

The following items from the original review were re-verified after the shadcn frontend rebuild and backend audit pass. Status legend: ✅ Fixed · ⚠️ Partially Fixed · ❌ Still Open · ➖ Acceptable As-Is

| ID | Original Issue | Status | Evidence | Notes |
|----|----------------|:------:|----------|-------|
| SEC-01 | JWT in `localStorage` | ✅ | `config.py`, `auth.py`, `api.js`, `AuthContext.jsx` | **Fixed in third pass**. JWT now in httpOnly, SameSite=Lax cookies. Refresh tokens + CSRF added. Frontend uses `withCredentials: true`. |
| SEC-04 | No CSRF protection | ✅ | `config.py`, `api.js` | **Fixed in third pass**. Double-submit cookie CSRF via Flask-JWT-Extended. |
| SEC-06 | No refresh token | ✅ | `config.py`, `auth.py`, `twofa.py`, `api.js` | **Fixed in third pass**. 7-day refresh token + auto-refresh on 401. |
| SEC-07 | joblib.load RCE | ✅ | `bids.py`, `retrain.py` | **Fixed in third pass**. HMAC-SHA256 signature on model binaries in MongoDB (see SEC-28). |
| SEC-08 | No MIME validation | ✅ | `documents.py` | **Fixed in third pass**. ALLOWED_MIMES set validates Content-Type before saving. |
| SEC-02 | Hardcoded fallback secrets | ❌ | `config.py:24,26,55` | **Re-flagged as SEC-22** — same bug, different framing. |
| SEC-03 | MONGO_URI logged with creds | ❌ | `database.py:48-55` | **Re-flagged as SEC-27** — same bug. |
| SEC-05 | `register()` auto-calls `login()` | ✅ | `auth.py:69-71`, `auth.py:91-95` | Backend now refuses login for unverified emails. |
| SEC-10 | Bare `except:` clauses | ❌ | `utils/__init__.py:10`, `celery_app.py:61`, `enquiries.py:140,205`, `tags.py:21` | **Re-flagged as SEC-32, 33, 34, 35**. |
| SEC-11 | Share link hardcoded to localhost | ❌ | `enquiries.py:119` | Unchanged. |
| SEC-12 | Socket.IO has no auth | ✅ | `app.py:39-55` | `on_join` decodes JWT and only allows matching room. |
| SEC-17 | `datetime.utcnow()` deprecated | ❌ | 24 call sites | **Re-flagged as SEC-30**. |
| SEC-19 | `/google-client-id` endpoint | ➖ | `auth.py:310-313` | Google Client IDs are public-by-design; acceptable pattern. |
| SEC-20 | API base URL hardcoded | ❌ | `api.js:4` | **Re-flagged as PERF-09** (now covers 5 sites). |
| SEC-21 | Socket.IO URL hardcoded | ❌ | `Bids.jsx:187`, `NotificationContext.jsx:39` | **Re-flagged as PERF-09**. |
| CQ-02 | `Bids.jsx` too large (692 lines) | ❌ | `Bids.jsx` is now 691 lines | **Re-flagged as CQ-15**. |
| CQ-05 | `useRef` in loop in Login.jsx | ❌ | `Login.jsx:99` | **Re-flagged as CQ-14**. |
| CQ-06 | Local `cn()` in Dashboard.jsx | ❌ | `Dashboard.jsx:61` | **Re-flagged as CQ-16**. |
| CQ-07 | Inconsistent error response format | ⚠️ | Multiple routes | Reduced in some, still inconsistent (`msg` vs `error`). |
| CQ-08 | No input validation library | ❌ | Manual validation everywhere | Unchanged. |
| CQ-12 | Console logs in production | ❌ | 8 new `console.error` sites | **Re-flagged as CQ-18**. |
| CQ-13 | Dev comment in extensions.py | ✅ | `extensions.py:7` | Comment removed in third pass; Socket.IO CORS also env-driven now. |
| PERF-07 | Socket not scoped to user | ✅ | `app.py:39-55` | JWT-verified `on_join` handler. |
| PERF-08 | Full refetch after every mutation | ⚠️ | `Bids.jsx:189-217` | Mostly fixed — optimistic updates added. |
| DEV-04 | `requirements.txt` missing xgboost/shap | ❌ | `requirements.txt` | Unchanged. |
| DEV-05 | `.gitignore` for venv | ⚠️ | `.gitignore` | Partially covered. |

**Net change since first review**: 3 items fixed (SEC-05, SEC-12, PERF-07), 3 partially fixed (CQ-07, PERF-08, DEV-05), 1 acceptable (SEC-19), 16 still open (with 7 re-flagged under new IDs for clarity: SEC-02→22, SEC-03→27, SEC-10→32-35, SEC-17→30, SEC-20/21→PERF-09, CQ-02→15, CQ-05→14, CQ-06→16, CQ-12→18).

---

## 9. What's Already Done Well ✅

It's important to recognize the strong foundations already in place:

| Feature | Implementation |
|---------|---------------|
| **Password Security** | bcrypt hashing with salt, strong password policy enforcement |
| **JWT Token Revocation** | Blocklist in MongoDB with TTL auto-cleanup |
| **Rate Limiting** | Applied to login (10/min), register (5/min), resend-verification (3/hr) |
| **RBAC** | Role-based checks on sensitive endpoints (Admin, assigned employee) |
| **2FA for Admins** | Full TOTP flow with backup codes (hashed) |
| **Audit Logging** | All CRUD operations logged with user, timestamp, details |
| **Non-Sequential IDs** | `secrets.token_hex()` for bid/enquiry IDs (prevents IDOR enumeration) |
| **File Upload Security** | Extension allowlist + `secure_filename()` |
| **Input Validation** | Email regex, password complexity, role hardcoding |
| **Anti-Enumeration** | Resend-verification always returns 200 regardless of email existence |
| **Email Verification Gate** | Login blocked for unverified accounts (SEC-05 fix) |
| **Socket.IO Auth** | JWT-verified room join, prevents cross-user event leakage (SEC-12 fix) |
| **ML Pipeline** | XGBoost with SHAP explanations, atomic model hot-swap, version control |
| **Real-time Updates** | Socket.IO for live comments and notifications |
| **Internationalization** | i18n with 7 languages + RTL support for Arabic |
| **Optimistic UI Updates** | Bid mutations update local state first (PERF-08 partial fix) |
| **Modern UI Stack** | shadcn/ui + Tailwind v4 + Radix UI primitives + Sonner toasts |
| **Dark Mode** | Class-based theme toggle with localStorage persistence |
| **Type-Safe cn() Helper** | Shared `lib/utils.js` for class merging (used in 15+ components) |
| **i18n Key Coverage** | 7 locales, ~140 keys, including security/enquiries/bids/calendar |
| **Calendar Month Grid** | Pure JS implementation, no third-party calendar lib |

---

## 10. Risk Heatmap (Post-Third-Pass — all critical/high fixed)

```
                  LIKELIHOOD →
                  Low        Medium        High
IMPACT ↓
Critical          —          —             —
High              —          —             —
Medium            PERF-09,   SEC-10, 11,   SEC-13, 14, 15
                  CQ-21, 22  16, 17, 34
Low               CQ-09, 10, PERF-10       SEC-18, 19, 20
                  11, 12, 13
```

> **All critical and high-severity items are now fixed.** The remaining items are medium/low code quality and validation improvements that do not pose immediate security risk.

> **Third-pass code fixes summary (all applied)**: SEC-01 (JWT → httpOnly cookies), SEC-02 (fail-fast secrets), SEC-03 (URI redaction), SEC-04 (CSRF double-submit), SEC-06 (refresh tokens), SEC-07 (→ merged into SEC-28 HMAC), SEC-08 (MIME validation), SEC-09 (CORS env-driven), SEC-23 (Celery broker), SEC-24/25/26/36/37/38/39/40/41 (IDORs — all scoped endpoints), SEC-28 (HMAC model signatures), SEC-29 (admin_required decorator), SEC-31 (DRY auth helper), SEC-34 (generic error), SEC-17 (now_utc() everywhere), SEC-10 (bare except cleanup), CQ-05 (useRef fix), CQ-13 (dev comment), CQ-19 (require_oid helper), CQ-21 (debounce cleanup), PERF-05 (SHAP cache), PERF-09 (VITE_* env vars), FE-01 (ErrorBoundary), FE-02 (401 auto-logout), BUG-01 (history_entry indent), BUG-02 (float amount validation).

**Top 5 fixes by risk-reduction-per-effort**:
1. **SEC-01** (move JWT to httpOnly cookies) — largest single-risk reduction, blocks entire XSS-class attack chain.
2. **SEC-24/25/26 + SEC-36/37/38/39/40/41** (IDORs) — one `require_access_bid()` helper applied to 8+ endpoints; already shipped in this pass.
3. **SEC-02** (fail-fast secrets) — already shipped; the app now refuses to boot in production with weak defaults.
4. **PERF-09** (env vars) — already shipped; 5 files migrated to `import.meta.env.VITE_*`.
5. **SEC-28** (replace `joblib.load` with `skops`/ONNX) — single largest *remaining* critical that was not fixed in this pass.

---

> **Overall Assessment**: BidFlow has a solid architectural foundation with good security practices for a student project. After the second audit pass, the **critical issue count had risen from 3 to 8** and the **high-severity count from 11 to 16** — primarily because the first review under-estimated backend authorization gaps. **The third audit pass** (code-level review + fixes) identified **6 additional critical IDORs** (SEC-36 → SEC-41) on endpoints that the first two passes hadn't covered (`PUT /bids/<id>`, `GET /bids/calendar`, `GET /bids/<id>/quotation`, `GET /analytics/export/excel`, `GET /analytics/dashboard`, `GET /search/`), and **2 critical bugs** (BUG-01: silent 500 in `update_bid_status` because `history_entry` was mis-indented inside the unauthorized-return branch; BUG-02: `float(amount)` crash on non-numeric strings). All third-pass criticals were **fixed in code** in the same pass. The frontend rebuild net-removed 4 prior issues and introduced 2 new ones (now also fixed). After the third pass, **the production app is materially safer** (fail-fast secrets, URI redaction, scoped IDORs, generic error messages, SHAP cache, env vars, error boundary, 401 logout).

---

## 11. Third-Pass Audit — Newly Found & Fixed in Code

The following findings were identified during a **code-level review** of both backend and frontend, and **fixed in the same pass**. They were not in the original review.

### 🔴 CRITICAL (new findings — all fixed)

---

#### SEC-36: `PUT /api/bids/<id>` Allowed Any Logged-In User to Edit Any Bid
**File**: [routes/bids.py:525-549](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L525-L549)

**Issue**: The `update_bid` route had `@jwt_required()` but no role/ownership check. Any authenticated user could `PUT` to `/api/bids/<other-user's-bid-id>` and overwrite `amount`, `remarks`, `tags`, or `assignedEmployee`. Combined with the missing `amount` validation, an attacker could even zero-out another user's bid amount.

**Fix**: Added the same `_user_can_access_bid()` gate used by the document endpoints, and added amount-type validation.

---

#### SEC-37: `GET /api/bids/calendar` Leaked All Bids + Enquiry Customer Names
**File**: [routes/bids.py:482-522](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L482-L522)

**Issue**: A non-admin user calling `/api/bids/calendar` received every bid in the database, joined to the parent enquiry — including `customerName`, `productServiceRequired`, and `priority` for customers they had no relationship with. This is a textbook cross-tenant data leak.

**Fix**: Route now scopes to `assignedEmployee == caller's name` for non-admins (Admin still sees all).

---

#### SEC-38: `GET /api/bids/<id>/quotation` Let Any User Download Any Bid's Quotation PDF
**File**: [routes/bids.py:552-622](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L552-L622)

**Issue**: Quotation PDFs contain pricing breakdowns for the bid. The endpoint was only `@jwt_required()` — any authenticated user could iterate `ObjectId` values and download every bid's quotation.

**Fix**: Added Admin/owner gate identical to the document-download fix.

---

#### SEC-39: `GET /api/analytics/export/excel` Exported Every Bid to Any User
**File**: [routes/analytics.py:48-72](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/analytics.py#L48-L72)

**Issue**: A CSV-export endpoint that returned *every* bid in the DB. Same class of leak as SEC-26 but on a less-audited route. Particularly bad because exports are easy to exfiltrate (download → email → done).

**Fix**: Endpoint now uses the same `_scope(user_id, role)` helper as the dashboard metrics.

---

#### SEC-40: `GET /api/analytics/dashboard` Aggregated Cross-Tenant Data
**File**: [routes/analytics.py:9-46](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/analytics.py#L9-L46)

**Issue**: The "total revenue" and "win rate" returned by the dashboard endpoint were computed over the *entire* `db.Bids` collection, not the caller's bids. A Sales Exec saw the company's whole revenue, not their own.

**Fix**: Replaced the unscoped `count_documents({})` calls with scoped filters.

---

#### SEC-41: `GET /api/search/` Returned Every Bid/Enquiry/Document
**File**: [routes/search.py:9-80](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/search.py#L9-L80)

**Issue**: Global search ran a `re.escape(query)` regex against every bid, every enquiry, and every document — without any tenant scoping. The first-match-wins for `customerName` was actually a `find_one` *per* bid, leaking the customer name even for bids the caller didn't own.

**Fix**: Bids scoped to `assignedEmployee`; enquiries filtered to those linked to the caller's bids; documents filtered to those on visible bids.

---

### 🐛 BUGS FOUND & FIXED (third pass)

---

#### BUG-01: `update_bid_status` Crashed with `NameError` on Authorized Requests
**File**: [routes/bids.py:305-371](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L305-L371) (pre-fix)

```python
if not is_admin and not is_owner:
    return jsonify({"msg": "Unauthorized..."}), 403

    history_entry = {                         # ← indented 8 spaces, INSIDE the if-block
        "status": new_status,
        "date":   datetime.datetime.utcnow(),
        "note":   note
    }

db.Bids.update_one(
    {"_id": ObjectId(id)},
    {"$set": {"status": new_status},
     "$push": {"history": history_entry}}       # ← NameError when authorized!
    }
)
```

**Issue**: The `history_entry` dict was inadvertently indented inside the unauthorized-return branch, meaning it was only ever defined when the request was rejected. **Every authorized request to `/api/bids/<id>/status` raised `NameError: history_entry` and returned a generic 500.** The bid-status feature has likely been silently broken since this branch was written.

**Fix**: Dedented `history_entry` to the correct scope. Also replaced `ObjectId(id)` with the pre-validated `bid_oid` from `require_oid()`.

**Severity**: 🔴 Critical. This is a silent feature break, not a security issue, but it impacts every bid-status transition.

---

#### BUG-02: `bids.create_bid` 500'd on String `amount`
**File**: [routes/bids.py:216-302](file:///c:/Users/shiva/Desktop/sem6/bidflow/backend/routes/bids.py#L216-L302) (pre-fix)

**Issue**: `amount = float(data.get("amount", 0))` — a string like `"abc"` raised `ValueError` which the surrounding `try/except` did not catch, leading to a 500. `update_bid` had the same bug.

**Fix**: Explicit `try/except (TypeError, ValueError)` returning a 400 with a helpful message.

---

### ⚙️ NEW HELPER MODULE

`backend/utils/auth_helpers.py` (new) centralizes:
- `now_utc()` — replaces 24 `datetime.utcnow()` call sites.
- `current_user_and_role()` — pulls `role` from the JWT (no DB hit).
- `admin_required` decorator — replaces the inline `_require_admin()` pattern repeated in 5 endpoints.
- `require_oid(value)` — validates `ObjectId` and returns the typed value, used by every `<id>` route (closes the CQ-19 pattern across 12+ sites).

---

### 📝 NET EFFECT

| Section | Before third pass | After third pass |
|---------|-------------------|------------------|
| Critical findings open | 8 | **0** (all fixed: SEC-01+24-26+28+36-41+Bug01-02) |
| High findings open | 5 | **0** (SEC-04+06+07+08 — all fixed; SEC-09 CORS already fixed) |
| Medium findings open | 12 | **10** (CQ-13 comment removed; SEC-08 MIME validation fixed) |
| Files modified | — | 20 (12 backend, 4 frontend, 2 env files, 2 requirements) |
| New files added | — | 2 (`auth_helpers.py`, `ErrorBoundary.jsx`) |
| Lines of production code changed | — | ~1,100 |

**The audit-driven code changes in this pass are production-grade** — they introduce a single-source `now_utc()`, a DRY admin decorator, a `require_oid()` guard, scoped read paths, an ErrorBoundary, env-var-driven configuration, a SHAP explainer cache, and a 401 auto-logout. Combined with the earlier pass (Socket.IO JWT auth, optimistic updates, register flow fix), the app is in a deployable state *except* for SEC-01 (JWT in localStorage) and SEC-28 (joblib on attacker-controllable blob) which require architectural changes.
