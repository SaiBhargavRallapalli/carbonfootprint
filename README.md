# EcoSage — AI Carbon Footprint Assistant

> An AI-powered carbon footprint tracker and coach using Google Gemini and Firebase — built for Indian users.

[![CI](https://github.com/SaiBhargavRallapalli/carbonfootprint/actions/workflows/ci.yml/badge.svg)](https://github.com/SaiBhargavRallapalli/carbonfootprint/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org)
[![Coverage](https://img.shields.io/badge/coverage-92%25-brightgreen)](#testing)
[![Google Gemini](https://img.shields.io/badge/Google-Gemini_2.0_Flash-blue)](https://ai.google.dev)
[![Cloud Run](https://img.shields.io/badge/Google-Cloud_Run-blue)](https://cloud.google.com/run)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PromptWars](https://img.shields.io/badge/PromptWars-Virtual_2026-orange)](https://promptwars.in)

---

## Chosen Vertical

**Carbon Footprint Tracker** — EcoSage helps Indian individuals understand, track, and reduce their carbon footprint through simple daily logging, personalized AI insights, and quantified action recommendations.

---

## Problem Statement

**Root challenge:** India is the world's third-largest emitter and its per-capita footprint is rising fast as incomes grow. Individual behaviour — how people commute, cook, cool their homes, and eat — drives a large share of that. Yet the average urban Indian has **no accurate way to measure their own carbon footprint, and no actionable guidance to lower it.** The tools that exist are built for Western lifestyles and give generic advice that ignores the user's real situation.

**Target persona:** *Priya, 28, lives in Bengaluru.* She's climate-conscious and wants to act, but she doesn't know whether her 15 km scooter commute, her AC usage, or her food choices matter most. Existing calculators ask her to fill a 30-field form once, spit out an abstract "X tonnes/year," and offer tips like "drive less" that she can't act on.

**User needs this product must satisfy:**

| # | Need | Why it matters to Priya |
|---|------|--------------------------|
| N1 | **Measure accurately, with Indian numbers** | A US grid factor overstates her electricity emissions by ~40%. Wrong data → wrong priorities. |
| N2 | **Know what to do *next*, specific to her** | "Drive less" is useless. "Shift your 15 km commute to metro → save 33 kg CO₂/month" is a decision. |
| N3 | **Log in seconds, not fill a survey** | If tracking takes effort, she stops after day two. |
| N4 | **See progress and context** | Is 142 kg good? She needs a benchmark (Indian avg, 1.5 °C target) to stay motivated. |

**Core objectives** (how success is judged): accurate India-specific measurement (N1) · personalised, quantified guidance (N2) · sub-10-second logging (N3) · benchmarked progress visualisation (N4).

---

## Approach & Logic

India has 1.4 billion people with a rapidly growing carbon footprint, yet most existing tools use generic Western emission factors and give generic advice. EcoSage is built around three principles that map directly onto the user needs above:

1. **Indian-first data → satisfies N1.** Emission factors use India-specific sources: CEA 2024 grid intensity (0.82 kg CO₂/kWh), Indian transport modes (auto-rickshaw, two-wheeler, metro), Indian food patterns (veg/egg/chicken meals).

2. **Personalised AI, not generic tips → satisfies N2.** The Gemini AI assistant receives the user's *actual logged data* as system context before every response. It knows their total footprint, biggest emission category, and recent activities — so it gives specific, quantified advice like "switching your daily 15 km car commute to metro saves ~33 kg CO₂/month", not vague platitudes.

3. **Simple, frictionless tracking → satisfies N3 & N4.** No signup required. A session ID persists the session. Five categories (Transport, Energy, Food, Shopping, Waste) cover the major sources. Log an activity in under 10 seconds, then see it benchmarked against the Indian average and the 1.5 °C personal target on the dashboard.

### Problem → Solution Traceability

| User need | Where it's solved in the code |
|-----------|-------------------------------|
| N1 — Indian-accurate measurement | [data/carbonData.ts](data/carbonData.ts) emission factors · [services/carbonEngine.ts](services/carbonEngine.ts) `calculateCO2()` |
| N2 — Personalised, quantified guidance | [services/gemini.ts](services/gemini.ts) `buildCarbonSystemPrompt()` injects the live profile · [routes/ai.ts](routes/ai.ts) `/chat` + `/tips` |
| N3 — Sub-10-second logging | [public/app.js](public/app.js) `initLogForm()` (category → type → quantity) · [routes/tracking.ts](routes/tracking.ts) `/log` |
| N4 — Benchmarked progress | [services/carbonEngine.ts](services/carbonEngine.ts) `compareToAverages()` · [routes/insights.ts](routes/insights.ts) `/insights` + `/compare` |

---

## How the Solution Works

### Architecture

```
Browser (Single-Page App)
  index.html + styles.css + app.js (ES module, no build step)
  Chart.js from CDN
        │ HTTPS REST
Express.js Backend (Node 18)
  helmet · cors · compression · express-rate-limit
  In-memory cache (30s TTL) · HSTS in production
  Modular: data/ · services/ · middleware/ · routes/

  Routes:
  GET  /api/health             Health check
  GET  /api/config             Frontend Firebase config
  GET  /api/emission-factors   All CO₂ factors + averages
  POST /api/log                Log activity → Firestore
  GET  /api/history            Activity history
  GET  /api/insights           Aggregated footprint by category
  GET  /api/compare            User vs Indian/global averages
  GET  /api/actions            Ranked recommended actions
  POST /api/chat               Gemini AI chat (user profile injected)
  GET  /api/tips               3 AI-generated weekly tips

        │
Google Cloud Services
  Gemini 2.0 Flash · Firestore · Firebase Auth · Firebase Analytics
  Cloud Run · Google Fonts
```

### The Smart AI Layer

`services/gemini.ts` builds a system prompt that injects the user's carbon profile before every Gemini call:

```
USER'S CARBON PROFILE (last 30 days):
- Total footprint: 142 kg CO₂e  |  Indian avg: 158 kg/month
- Status: 16 kg BELOW the Indian average
- Biggest source: transport
- Transport: 89 kg | Energy: 30 kg | Food: 18 kg | ...

When advising:
1. Reference actual numbers — never give generic tips
2. Name specific, quantified actions
3. Focus on their biggest category (transport)
4. Use Indian context (grid, transport modes, food)
```

This means the AI coach genuinely personalises every response to the individual.

### Carbon Calculation Engine

`services/carbonEngine.ts` handles all CO₂ calculations:
- `calculateCO2(category, type, quantity)` → CO₂e in kg
- `aggregateByCategory(activities)` → per-category totals
- `compareToAverages(monthlyKg)` → rating vs Indian/global/Paris benchmarks
- `topCategory(totals)` → identifies biggest emission source

All functions are pure (no side effects), making them fully unit-testable.

---

## Google Services Used

| Service | Integration | Usage |
|---|---|---|
| **Gemini 2.0 Flash** | Server-side REST proxy | Personalized AI chat + weekly tips |
| **Firebase Firestore** | Admin SDK (server) | Activity log persistence |
| **Firebase Authentication** | Client SDK | Optional Google Sign-In |
| **Firebase Analytics (GA4)** | Client SDK | Tab views, log events, chat usage |
| **Google Cloud Run** | Deployment | Serverless container hosting |
| **Google Fonts** | CDN | Inter typeface |

**6 Google services integrated.**

---

## Evaluation Mapping

| Criterion | Evidence |
|---|---|
| **Code Quality** | Modular: thin `server.js` (55 lines) + `data/` + `services/` + `middleware/` + `routes/` (4 focused modules). Full `'use strict'`, consistent naming, zero dead code. |
| **Security** | `helmet` (CSP + HSTS in production), `cors` with `ALLOWED_ORIGIN`, per-route rate limits (20/min chat, 100/min data), server-only API keys, `escHtml()` XSS protection on all user inputs, 10 MB JSON cap. |
| **Efficiency** | In-memory TTL cache (30s) on insights/compare/tips, `compression` middleware (gzip), 1-day `Cache-Control` on static assets in production, Chart.js from CDN (no npm dep weight), lazy tab data fetching. |
| **Testing** | Jest + Supertest — 128 tests across all 10 API routes, carbonEngine, cache, gemini, sanitize, and middleware. 90% line coverage threshold enforced. Playwright E2E — dashboard, logging, chat, accessibility (4 spec files). CI runs lint → unit → E2E → Docker build on every push. |
| **Accessibility** | Skip link, `role="tablist"` + `aria-selected` + `aria-controls`, `aria-live` regions for chat/tips/log feedback, semantic HTML, WCAG 2.1 AA contrast (green #2d6a4f on white), full keyboard nav with arrow keys, `prefers-reduced-motion` respected, mobile-responsive to 360px. |

---

## Assumptions Made

1. Emission factors use India-specific sources (CEA 2024, ICCT, IPCC AR6). Production would sync with live CEA data API.
2. Session-based tracking (no mandatory login). Optional Firebase Auth for cross-device sync.
3. Indian average of 1.9 tCO₂/year (158 kg/month) from World Bank 2022 data.
4. App degrades gracefully to demo mode if `GEMINI_API_KEY` is unset — all pages still function with static/demo data.
5. Firestore uses anonymous sessions; no PII is stored without explicit Google Sign-In.

---

## Project Structure

```
carbonfootprint/
├── server.ts              # Entry point (68 lines)
├── server.test.ts         # Jest + Supertest — 128 tests, 92%+ coverage
├── types/
│   └── index.ts           # Shared TypeScript interfaces
├── data/
│   └── carbonData.ts      # Emission factors, averages, action catalog
├── middleware/
│   ├── index.ts           # requestLogger, validateEnvironment
│   └── rateLimiters.ts    # chatLimiter (20/min), apiLimiter (100/min)
├── routes/
│   ├── config.ts          # /api/health  /api/config  /api/emission-factors
│   ├── tracking.ts        # /api/log  /api/history
│   ├── insights.ts        # /api/insights  /api/compare  /api/actions
│   └── ai.ts              # /api/chat  /api/tips
├── services/
│   ├── cache.ts           # In-memory TTL cache
│   ├── carbonEngine.ts    # Pure CO₂ calculation functions
│   ├── firestore.ts       # Activity persistence (graceful demo fallback)
│   ├── firestore.test.ts  # Firestore unit tests
│   └── gemini.ts          # Personalised system prompt + Gemini chat
├── utils/
│   └── sanitize.ts        # Shared escHtml XSS sanitiser
├── public/
│   ├── index.html         # 5-tab SPA (dashboard, log, insights, chat, actions)
│   ├── styles.css         # Earth/green design system (WCAG 2.1 AA)
│   └── app.js             # Frontend logic + Chart.js integration
├── e2e/
│   ├── dashboard.spec.js
│   ├── logging.spec.js
│   ├── chat.spec.js
│   └── accessibility.spec.js
├── docs/
│   └── API.md             # Full REST API reference
├── .github/
│   └── workflows/
│       └── ci.yml         # CI: lint → unit tests → E2E → Docker build
├── playwright.config.js
├── Dockerfile             # Non-root user, healthcheck
├── .env.example
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

---

## How to Run Locally

```bash
git clone https://github.com/SaiBhargavRallapalli/carbonfootprint.git
cd carbonfootprint
npm install
cp .env.example .env
# Edit .env — add GEMINI_API_KEY (and optional Firebase config)
npm start
# → http://localhost:8080
```

**Works without API keys** — runs in demo mode with static data.

```bash
# Run API + unit tests
npm test

# Run E2E tests (install browsers once)
npx playwright install chromium
npm run test:e2e
```

---

## Deploy to Google Cloud Run

```bash
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  generativelanguage.googleapis.com

gcloud run deploy ecosage \
  --source . \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_KEY,FIREBASE_PROJECT_ID=YOUR_PROJECT
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Recommended | Gemini API key for AI features |
| `FIREBASE_PROJECT_ID` | Optional | GCP project ID for Firestore |
| `FIREBASE_CLIENT_EMAIL` | Optional | Service account email |
| `FIREBASE_PRIVATE_KEY` | Optional | Service account private key |
| `FIREBASE_API_KEY` | Optional | Firebase web API key (client) |
| `FIREBASE_AUTH_DOMAIN` | Optional | Firebase auth domain |
| `PORT` | Optional | Server port (default 8080) |
| `ALLOWED_ORIGIN` | Optional | CORS origin lock for production |
| `NODE_ENV` | Optional | Set to `production` on Cloud Run |

> All variables are optional — the app runs in demo mode without them.

---

*Built for PromptWars Virtual 2026 — Carbon Footprint vertical.*  
*Indian emission factors: CEA 2024 (grid), ICCT (transport), IPCC AR6 (food/goods).*
