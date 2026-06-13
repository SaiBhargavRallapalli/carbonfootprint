# Changelog

All notable changes to EcoSage are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- GitHub Actions CI/CD pipeline (lint, unit tests, E2E, Docker build)
- `utils/sanitize.js` — shared `escHtml` utility, eliminating code duplication across routes
- Direct unit tests for `requestLogger`, `validateEnvironment`, and `escHtml` (89 total tests)
- Coverage threshold raised from 85% to 90% (currently 92.69% lines)
- `LICENSE` (MIT), `CONTRIBUTING.md`, `CHANGELOG.md`
- `docs/API.md` — full REST API reference

---

## [1.0.0] — 2026-06-13

### Added
- Five-tab single-page app: Dashboard, Log Activity, Insights, AI Assistant, Actions
- Carbon engine (`services/carbonEngine.js`) — pure functions for CO₂ calculation, aggregation, and benchmark comparison
- India-specific emission factors: CEA 2024 grid intensity, ICCT transport, IPCC AR6 food/goods
- Gemini 2.0 Flash integration with user carbon profile injected into every system prompt
- Firebase Firestore persistence with graceful demo-mode fallback (no credentials required)
- In-memory TTL cache for Insights, Compare, and Tips endpoints
- Helmet CSP + HSTS (production), CORS with origin lock, per-route rate limiting (20/min AI, 100/min data)
- XSS protection via `escHtml` on all user-controlled inputs
- Playwright E2E tests: dashboard, logging, chat, accessibility
- Dockerfile with non-root user and `HEALTHCHECK`
- Deploy-ready for Google Cloud Run (`asia-south1`)
- Demo mode — all five tabs functional without any API keys
