# BidFlow — In-Depth Audit & Bug Report

> **Audit date:** 2026-06-20
> **Scope:** Full repository — backend (Flask API, services, ML pipeline, Celery), frontend (React SPA), and infrastructure (Docker, Render, nginx, CI).
> **Method:** Manual source review of every backend route/service, the ML training/retrain pipeline, schema validation, the React contexts/hooks/pages, and all deployment configs. Cross-referenced behaviour against the project's own `report.md` claims.

This document supersedes the optimistic "0 critical issues" line in `report.md`. The audit found **1 high-impact security/logic defect, several deployment-breaking misconfigurations, and a number of correctness/UX bugs.** 12 issues were fixed in code; 9 more are documented with rationale and recommendations.

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
| 13 | Medium | Upload security | File validation trusts extension + client `Content-Type` (no magic-byte check) | ⚠️ Documented |
| 14 | Medium | Upload security | `…/public/share/<token>/upload` allows unauthenticated uploads (storage abuse) | ⚠️ Documented |
| 15 | Low | Privacy | Marketplace detail exposes `contactInformation` / `notes` to all bidders | ⚠️ Documented |
| 16 | Low | AuthZ | Role read from JWT claim, not DB → role changes lag up to 1h | ⚠️ Documented |
| 17 | Low | Repo hygiene | `data/combined_training_data.csv` tracked despite `.gitignore` | ⚠️ Documented |
| 18 | Low | Auth | TOTP `valid_window=1` permits same-code reuse within the window | ⚠️ Documented |
| 19 | Low | Robustness | `create_bid` `int(teamSize)` 500s on non-numeric input | ⚠️ Documented |
| 20 | Info | Docs | `report.md` ID-format example (12 hex) contradicts the 8-hex schema | ⚠️ Documented |
| 21 | Info | Repo hygiene | `backend/uploads/*.pdf`, `htmlcov/`, `.pytest_cache/` present in tree | ⚠️ Documented |

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

---

## Documented issues & recommendations (not auto-fixed)

- **#13 File-type validation is spoofable.** `DocumentService.validate_file` checks the extension and the client-supplied `Content-Type` only. Recommend magic-byte sniffing (e.g. `python-magic`) — deferred because it requires the `libmagic` system library in the image.
- **#14 Unauthenticated public upload.** `POST /enquiries/public/share/<token>/upload` lets anyone with a 90-day share token upload files. Consider removing public upload, tightening allowed types, adding AV scanning, or expiring tokens faster. (Product decision.)
- **#15 Contact-info exposure.** Marketplace detail returns `contactInformation` and `notes` to all bidders. If these are meant to be private until award, scope them to the owner/Admin.
- **#16 Stale role.** `current_user_and_role`/decorators read `role` from the JWT claim (documented as SEC-29). A demotion/promotion takes effect only after token expiry (≤1h). Acceptable, but note it for incident response (revoke the token to force re-auth).
- **#17 Tracked training data.** `data/combined_training_data.csv` is committed even though `.gitignore` lists `data/` (it predates the rule). If it contains PII, `git rm --cached` it and rotate.
- **#18 TOTP reuse window.** `valid_window=1` allows reusing a code within its window. Track the last-used counter to prevent replay if you need strict TOTP.
- **#19 `create_bid` robustness.** `int(data.get("teamSize", 1))` raises (→500) on non-numeric input. Wrap with validation like the `amount` path. Low impact (clients send numbers).
- **#20 Doc inaccuracy.** `report.md` lists the ID format as `BID-3a7f9c2b1d4e` (12 hex) and "0 critical issues"; the schema is 8 hex. Align the docs.
- **#21 Repo hygiene.** `backend/uploads/*.pdf`, `backend/htmlcov/`, `backend/.pytest_cache/` exist in the working tree (gitignored, not tracked). Safe to delete locally.

---

## Verification

- All modified backend modules **byte-compile** under Python 3.12 (`py_compile` clean).
- Changed frontend files **pass ESLint** with 0 errors.
- The pytest suite was **not executed in this environment**: project Python dependencies (`flask_jwt_extended`, `xgboost`, …) are not installed locally and no MongoDB instance is reachable. The fixes are confined to well-scoped, syntactically validated changes; run `pytest` in CI (which provisions MongoDB 7) to confirm the 103-test suite stays green, paying attention to `tests/test_marketplace.py` and `tests/test_documents.py` which cover the changed access paths.

## Suggested follow-ups
1. Add a regression test asserting a Bidder **cannot** download another bidder's bid document on a public enquiry (covers #1).
2. Add magic-byte upload validation (#13) and reconsider the public upload endpoint (#14).
3. Add a CI guard that rejects deploys where backend/worker secrets differ (#2).
