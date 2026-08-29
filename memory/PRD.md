# Rx Sync med reminder — Product Requirements Document

## Original Problem Statement
Full-stack intelligent digital health platform to eliminate missed medications and doctor check-ups. Converts handwritten/typed/digital prescriptions into daily routines, provides AI drug education, cross-drug interaction screening, multi-channel alerts, and connects Patients, Caregivers, Pharmacists, and Clinics in one unified system. Delivered as an Expo React Native app (mobile-first) + FastAPI + MongoDB.

## Architecture
- **Frontend**: Expo Router (React Native). Single main screen (`app/index.tsx`) with role-aware bottom tabs (Today, Scan Rx, Drug Info, Caregiver, Refills, Clinic). Components in `src/components/`, global state in `src/context/AppContext.tsx`, i18n in `src/localization/translations.ts` (en/hi/bn).
- **Backend**: FastAPI (`backend/server.py`), all routes prefixed `/api`. MongoDB via Motor. Emergent Universal LLM (GPT-4o vision) for OCR. RxNorm public API for RxCUI mapping. Local clinical DDI matrix + master drug knowledge base.
- **Integrations**: Emergent LLM key (OCR + drug education), RxNorm (RxCUI, no key), OpenFDA-style local tables. Multi-channel dispatch (Push/WhatsApp/SMS) simulated in-app per user request ("Interactive In-App Multi-Channel Dispatcher").

## User Personas
1. **Ramesh Sharma (68, Patient)** — needs large, clear daily medicine cards, meal rules, wellness check-in, emergency SOS.
2. **Ananya Sharma (Caregiver, daughter)** — remote compliance tracking, WhatsApp Magic Invite link, emergency dispatch history.
3. **MedPlus Pharmacy (Pharmacist)** — B2B refill queue (7–14 day), auto-dispatch, retention analytics.
4. **Dr. S. Mukherjee (Clinic)** — compliance oversight, flagged DDIs, missed-dose trends, Rx logs.

## Core Requirements (static)
- Passwordless mobile OTP auth (demo OTP `123456`), role selection, vernacular-first (English/Hindi/Bengali).
- Vision AI OCR extraction with per-field confidence scoring (<85% → red highlight + mandatory verify), Step-3 verification form.
- Drug interaction screening (RxNorm + local DDI), dual-tier side effects (Tier 1 informational, Tier 2 emergency).
- One-click health status; Unwell/Distress triggers Tier-2 multi-channel cascade.
- Caregiver Magic WhatsApp invite (Remote Handshake), pharmacist refill engine, clinic DDI dashboard.
- WCAG-minded UI: ≥48px touch targets, high-contrast clinical theme.

## Implemented (with dates)
### 2026-08-29 (Google Sign-In)
- **Emergent-managed Google OAuth** added (no API keys). Backend: `POST /api/auth/session` (exchange `session_id` via `X-Session-ID` → 7-day `session_token`, upsert user by email), `POST /api/auth/select-role`, `POST /api/auth/logout`, Bearer-token support on `GET /api/auth/me`, `user_sessions` collection + indexes (unique session_token, TTL on expires_at, sparse-unique users.email).
- Frontend: Google auth integrated into `AppContext` (secure token storage via `@/src/utils/storage`, web hash/query + mobile `WebBrowser`/`Linking` redirect handling, session restore on mount, duplicate-`session_id` guard). "Continue with Google" button added to the login sheet (OTP + demo switcher kept). New `RoleSelectionModal` prompts first-time Google users to pick a role. Header shows Sign Out for Google users.
- Verified end-to-end at API level: token→user (role_selected=false)→select-role→logout all correct.

### 2026-08-29 (later)
- **Real prescription upload/scan**: Added "Upload Prescription Photo" (gallery) and "Take Photo with Camera" in the scanner, with contextual permission handling (request → denied → Open Settings) per best practices. Images are resized/compressed (`expo-image-manipulator`, max 1400px) then sent to GPT-4o Vision for OCR.
- **Robust OCR**: Backend now extracts JSON reliably (fence-strip + regex fallback), and when a real photo can't be read it returns a clear "retake / add manually" message instead of silently showing demo meds. Verified GPT-4o correctly extracts drug/dosage/frequency from a legible Rx; sample-link path still returns the demo prescription.
- Added `app.json` camera/photo permission strings + `expo-image-picker` plugin.

### 2026-08-29
- Backend: full API (auth/OTP, magic-link, OCR extract + verify-save, medications + education + check-interactions, routines/today + log-dose + compliance, health-status/log + sos, pharmacist refill-queue + process-refill, dispatch-alert + logs). Startup DB seed with 4 role profiles, 4 meds, doses, refills, Rx log, alert logs.
- Frontend: all role dashboards, scanner modal, drug education modal, health check-in bar, interaction banner, passwordless auth modal, guided permission modal, i18n en/hi/bn.
- **Fixes this session**:
  - `check-interactions` no longer blocks the event loop — synchronous RxNorm `requests.get` moved off-loop via `asyncio.to_thread` + `gather` (was causing stuck loaders when hammered).
  - Reset polluted demo data (100+ duplicate test meds/doses accumulated from prior automated testing) back to clean seed (4 meds / ~5–6 today doses).
  - Fixed magic-link 404: create stored `rx-XXXX` but claim did `.upper()`; now generated as `RX-XXXX` — verified round-trip works.
  - Added `testID` across all interactive elements (tabs, wellness/SOS buttons, auth inputs/buttons, scanner buttons, dose cards, caregiver/pharmacist actions).
- Testing: backend 21/22 → 22/22 after magic-link fix; frontend flows verified (wellness toast, tab nav, clinic DDI dashboard) via screenshots.

## Backlog (prioritized)
### P1
- End-to-end verification of full Hindi/Bengali UI switch across every screen.
- Camera-based live OCR capture (currently sample/upload path; camera needs native build + permission primer).
- Real WhatsApp/SMS webhook wiring (Twilio/Meta) — currently simulated in-app.

### P2
- Migrate deprecated `shadow*` styles to `boxShadow` (web warning only).
- Caregiver: multiple linked patients management.
- Pharmacist: filter tabs wiring for queue status (all/due_soon/dispatched).

## Next Tasks
- Confirm vernacular toggle coverage; add any missing translation keys.
- Optional: persist auth session with `@/src/utils/storage`.
