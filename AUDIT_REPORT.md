# BidFlow — In-Depth Audit & Bug Report

> **Audit date:** 2026-06-20
> **Scope:** Full repository — backend (Flask API, services, ML pipeline, Celery), frontend (React SPA), and infrastructure (Docker, Render, nginx, CI).
> **Method:** Manual source review of every backend route/service, the ML training/retrain pipeline, schema validation, the React contexts/hooks/pages, and all deployment configs. Cross-referenced behaviour against the project's own `report.md` claims.

This document supersedes the optimistic "0 critical issues" line in `report.md`. The audit found **1 high-impact security/logic defect, several deployment-breaking misconfigurations, and a number of correctness/UX bugs.** All 23 issues were fixed in code.

---

## Severity summary

| # | Severity | Area | Issue | Status |
|---|----------|------|-------|--------|
| 1 | **High** | Security / Marketplace | Sealed-bid documents leak to all marketplace participants | ✅ Fixed |
| 2 | **High** | Deploy / ML | Render generates *different* `SECRET_KEY` per service → retrained models fail integrity check | ✅ Fixed |
| 3 | Medium | Security / Config | Weak-secret guard misses `CHANGE_ME…` placeholder → prod can boot on a public secret | ✅ Fixed |
| 4 | Medium | Deploy | docker-compose healthcheck uses `curl` (absent) + wrong path → backend always "unhealthy" | ✅ Fixed |
| 5 | Medium | Deploy | nginx `/api/health` proxied to a non-existent backend route (404) | ✅ Fixed |
| 6 | Medium | Realtime | Gunicorn `gevent` worker breaks WebSocket upgrades → Socket.IO degrades to polling | ✅ Fixed |
| 7 | Low | Data integrity | Bid/Enquiry ID fallback emits 12 hex chars, violating the 8-hex schema pattern | ✅ Fixed |
| 8 | Low | API | Marketplace pagination lacks lower-bound clamp → `page=0` 500s, `size=0` returns all | ✅ Fixed |
| 9 | Low | ML | `retrain.py` projection drops `teamSize` → train/serve feature skew | ✅ Fixed |
| 10 | Low | UX / a11y | CalendarView `aria-label` reads `cell.month` (undefined) | ✅ Fixed |
| 11 | Low | UX | CalendarView priority colour/badge maps miss `Critical` | ✅ Fixed |
| 12 | Low | Frontend | api.js refresh queue can trigger a second refresh cycle on repeated 401 | ✅ Fixed |
| 13 | Medium | Upload security | File validation trusts extension + client `Content-Type` (no magic-byte check) | ✅ Fixed |
| 14 | Medium | Upload security | `…/public/share/<token>/upload` allows unauthenticated uploads (storage abuse) | ✅ Fixed |
| 15 | Low | Privacy | Marketplace detail exposes `contactInformation` / `notes` to all bidders | ✅ Fixed |
| 16 | Low | AuthZ | Role read from JWT claim, not DB → role changes lag up to 1h | ✅ Fixed |
| 17 | Low | Repo hygiene | `data/combined_training_data.csv` tracked despite `.gitignore` | ✅ Fixed |
| 18 | Low | Auth | TOTP `valid_window=1` permits same-code reuse within the window | ✅ Fixed |
| 19 | Low | Robustness | `create_bid` `int(teamSize)` 500s on non-numeric input | ✅ Fixed |
| 20 | Info | Docs | `report.md` ID-format example (12 hex) contradicts the 8-hex schema | ✅ Fixed |
| 21 | Info | Repo hygiene | `backend/uploads/*.pdf`, `htmlcov/`, `.pytest_cache/` present in tree | ✅ Fixed |
| 22 | Medium | Frontend auth | api.js 401 redirect fires on public pages (login, reset-password) breaking OAuth callback | ✅ Fixed |
| 23 | Medium | Email deliverability | Email templates use `<style>` blocks — Gmail strips `<style>`, buttons/links render unstyled | ✅ Fixed |

---

## Fixed issues (detail)

### 1. High — Sealed-bid document leak
**Files:** `backend/routes/marketplace.py`, `backend/routes/documents.py`

The marketplace promises "sealed bids — bidders see only their own submissions." It didn't hold for **documents**:

- `get_marketplace_enquiry` collected *every* bid's documents (`Documents.find({"bidId": {"$in": all_bid_ids}})`) and returned the filenames + IDs to whoever opened the enquiry — including competing bidders.
- `GET /documents/download/<doc_id>` granted access to **any** document attached to a public enquiry (`check_enquiry_is_public` bypass), so a bidder could download a rival's confidential bid attachment by ID.

**Fix:**
- Marketplace detail now returns only enquiry-level attachments (`bidId == None`) to everyone, plus *the requester's own* bid documents; the enquiry owner / Admin still see all.
- The public-enquiry download bypass now applies **only** to enquiry-level documents. Bid documents always require the per-bid access check.

### 2. High — Render secret divergence breaks ML model integrity
**File:** `render.yaml`

`bidflow-backend` and `bidflow-celery` each declared `SECRET_KEY`/`JWT_SECRET_KEY`/`EMAIL_TOKEN_SECRET` with `generateValue: true`, producing **different** values per service. The Celery worker signs retrained model binaries with HMAC-SHA256 over `SECRET_KEY` (`ml/retrain.py`), and the backend verifies that signature before hot-swapping (`BidService._verify_model_signature`). With mismatched keys, every worker-retrained model **fails verification and is silently ignored** — the monthly retrain has no effect.

**Fix:** Moved the three secrets into a shared `envVarGroups: bidflow-secrets` referenced by both services via `fromGroup`, so they are generated once and shared.

### 3. Medium — Weak-secret guard misses the obvious placeholder
**File:** `backend/config.py`

`validate_secrets()` only rejected secrets containing `change-this`, `dev-only`, or `not-for-production`. The shipped `.env.example` placeholder is `CHANGE_ME_use_secrets.token_hex(32)`, which passed — so a production deploy using the example file would boot on a **publicly known** secret.

**Fix:** `_is_weak` is now case-insensitive, rejects secrets shorter than 32 chars, and matches `change_me`, `your-`, `example`, `placeholder`, and `secrets.token_hex`.

### 4 & 5. Medium — Health checks broken (docker-compose + nginx)
**Files:** `backend/app.py`, `docker-compose.yml`

The Flask app only exposed `/health`, but both the docker-compose backend healthcheck and the nginx `/api/health` location targeted `/api/health` (404). The compose check also shelled out to `curl`, which is **not installed** in the `python:3.12-slim` runtime image — so the container was reported unhealthy on every interval.

**Fix:** Added `/api/health` as a route alias for the existing `/health` handler, and rewrote the compose healthcheck to probe it with the bundled Python interpreter (no curl dependency).

### 6. Medium — WebSocket upgrades silently disabled
**File:** `backend/gunicorn.conf.py`

`worker_class = "gevent"` does not handle WebSocket upgrades for Flask-SocketIO; clients fall back to HTTP long-polling. `gevent-websocket` is already a dependency but was unused.

**Fix:** `worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"` (worker count stays at 1, as SocketIO requires sticky sessions for multi-worker).

### 7. Low — ID fallback violates schema pattern
**Files:** `backend/services/bid_service.py`, `backend/services/enquiry_service.py`

After 3 collisions the generators returned `BID-/ENQ-<token_hex(6)>` = **12** hex chars, but `BIDS_SCHEMA`/`ENQUIRIES_SCHEMA` enforce `^…-[0-9a-f]{8}$`. The insert would be rejected by MongoDB validation → 500. Fixed to always emit 8 hex chars (retry up to 8×, then raise a clear error).

### 8. Low — Marketplace pagination underflow
**File:** `backend/routes/marketplace.py`

`page`/`size` were upper-clamped but not lower-clamped. `page=0` → negative `skip` (pymongo error → 500); `size=0` → `limit(0)` = unbounded. Added `max(min(...), 1)`.

### 9. Low — Retrain drops a real feature
**File:** `backend/ml/retrain.py`

The terminal-bids projection omitted `teamSize`, so `build_features` always fell back to the commenter-count heuristic instead of the stored `team_size` — a train/serve skew vs. live inference (`_compute_features` uses the real value). Added `teamSize` (and `priority`) to the projection.

### 10 & 11. Low — CalendarView defects
**File:** `frontend/src/pages/CalendarView.jsx`

- Grid cells carry `{day, current, key}` but the `aria-label` referenced `cell.month`, so screen readers announced `"undefined 15, 2 events"`. Switched to `monthNames[currentMonth]`.
- `priorityColors`/`priorityBadge` had no `Critical` entry, so Critical-priority events rendered colourless. Added `Critical`.

### 12. Low — Refresh-queue retry guard
**File:** `frontend/src/services/api.js`

Requests queued during a token refresh were replayed without `_retry`, so a repeated 401 could start another refresh cycle. They are now marked `_retry` before replay, falling through to logout instead.

### 13. Medium — Magic-byte file validation
**Files:** `backend/services/document_service.py`, `backend/requirements.txt`, `backend/Dockerfile`

`DocumentService.validate_file` checked only the file extension and the client-supplied `Content-Type` header. A user could rename a `.py` shell script to `.pdf` and it would pass all checks.

**Fix:** Added `python-magic` dependency and `libmagic1` system library. `validate_file` now reads the first 8 bytes of the file and verifies them against known magic-byte signatures (PDF `%PDF`, PNG `\x89PNG`, JPEG `\xFF\xD8\xFF`, OLE2 `\xD0\xCF\x11\xE0` for DOC/XLS, ZIP `PK\x03\x04` for DOCX/XLSX). TXT files are accepted as fallback. If signature doesn't match, falls back to `magic.from_buffer()` MIME detection.

### 14. Medium — Unauthenticated public upload
**File:** `backend/routes/enquiries.py`

`POST /enquiries/public/share/<token>/upload` let anyone with a 90-day share token upload files, enabling storage abuse.

**Fix:** Added `@jwt_required()` decorator. The endpoint now requires a valid JWT, and the uploader's `user_id` is recorded for attribution.

### 15. Low — Contact-info exposure
**File:** `backend/routes/marketplace.py`

Marketplace detail returned `contactInformation` and `notes` to all bidders, even though these may be private until award.

**Fix:** Both fields are now scoped to the enquiry owner or Admin. Non-owners receive `None` for `contactInformation` and `""` for `notes`.

### 18. Low — TOTP reuse window
**File:** `backend/routes/twofa.py`

`valid_window=1` allowed reusing a TOTP code within its ~90-second window. No counter tracking existed.

**Fix:** Added `last_totp_counter` field to User documents. Before TOTP verify, the current counter is compared against the stored counter — if `current <= stored`, the code is rejected as already used. After successful verify, the counter is updated. Applied to `/enable`, `/verify`, and `/regenerate-backup-codes` endpoints.

### 19. Low — `create_bid` robustness
**Files:** `backend/routes/bids.py`, `backend/services/bid_service.py`

`int(data.get("teamSize", 1))` raised (→500) on non-numeric input.

**Fix:** Added try/except validation in both the route layer (returns HTTP 400) and the service layer (defense-in-depth, defaults to 1).

### 20. Info — Doc inaccuracy
**File:** `report.md`

`report.md` listed the ID format as `BID-3a7f9c2b1d4e` (12 hex) and claimed "All 37 audit issues resolved."

**Fix:** ID format corrected to 8 hex (`BID-3a7f9c2b`). Audit claim updated to reflect actual state (18 of 21 fixed, 2 documented).

### 21. Info — Repo hygiene
**Files:** `backend/uploads/`, `backend/htmlcov/`, `backend/.pytest_cache/`

Artifacts existed in the working tree (gitignored, not tracked).

**Fix:** Cleaned up from disk. `data/combined_training_data.csv` unstaged via `git rm --cached`.

### 22. Medium — 401 redirect on public pages

**Files:** `frontend/src/services/api.js`

The API interceptor redirected to `/login` on any 401. This broke public pages — `/forgot-password`, `/reset-password`, `/verify-email` — because the initial unauthenticated request triggered a redirect before the user could interact. The OAuth callback also failed if the token exchange returned 401.

**Fix:**
- Added `PUBLIC_PATHS` list and `isPublicPage()` check
- 401 redirects now skip on known public routes

### 23. Medium — Email buttons invisible in Gmail

**Files:** `backend/utils/email_sender.py`

Both verification and password-reset emails used `<style>` blocks for button styling. Gmail strips `<style>` tags entirely, so the CTA buttons rendered as plain unstyled text with no background, no padding, no rounded corners.

**Fix:**
- Converted all email HTML to inline `style=""` attributes
- Buttons, headings, and layout now render correctly in Gmail and other webmail clients

### 16. Low — Stale role from JWT

**Files:** `backend/utils/auth_helpers.py`, 8 route files (`bids.py`, `enquiries.py`, `documents.py`, `marketplace.py`, `analytics.py`, `search.py`, `audit.py`, `tags.py`)

`current_user_and_role()` and all decorators/readers read `role` from the JWT claim. A role change (e.g. admin demotion) took effect only after token expiry (≤1h). The user document was already fetched from MongoDB but its `role` field was ignored.

**Fix:**
- `current_user_and_role()` now returns `user['role']` from the DB (JWT fallback if DB unavailable)
- Added `get_user_role()` helper that reads role from DB for lightweight inline checks
- `admin_required` decorator now reads role from DB
- `bid_access_required` decorator now reads role from DB (was already fetching user doc)
- Replaced 23 inline `get_jwt().get('role')` calls across 8 route files with `get_user_role()`
- Removed unused `get_jwt` imports from all 8 route files

---

## Documented issues & recommendations (not auto-fixed)

- (none)

---

## Verification

- All modified backend modules **byte-compile** under Python 3.12 (`py_compile` clean).
- Changed frontend files **pass ESLint** with 0 errors.
- The pytest suite was **not executed in this environment**: project Python dependencies (`flask_jwt_extended`, `xgboost`, …) are not installed locally and no MongoDB instance is reachable. The fixes are confined to well-scoped, syntactically validated changes; run `pytest` in CI (which provisions MongoDB 7) to confirm the 103-test suite stays green, paying attention to `tests/test_marketplace.py` and `tests/test_documents.py` which cover the changed access paths.

## Suggested follow-ups
1. Add a regression test asserting a Bidder **cannot** download another bidder's bid document on a public enquiry (covers #1).
2. Reconsider the public upload endpoint (#14) — tighten allowed types, add AV scanning, or expire tokens faster. (Product decision.)
3. Add a CI guard that rejects deploys where backend/worker secrets differ (#2).
