# EcoSage REST API Reference

Base URL: `http://localhost:8080` (development) · `https://<cloud-run-url>` (production)

All endpoints return `application/json`. Error responses follow `{ "error": "<message>" }`.

---

## Health & Config

### `GET /api/health`

Returns server status. No auth required.

**Response 200**
```json
{ "status": "ok", "ts": "2026-06-13T10:00:00.000Z" }
```

---

### `GET /api/config`

Returns Firebase client-SDK configuration for the frontend. Values come from environment variables; all null in demo mode.

**Response 200**
```json
{
  "firebaseApiKey": "AIza...",
  "firebaseAuthDomain": "project.firebaseapp.com",
  "firebaseProjectId": "project-id",
  "firebaseStorageBucket": "project.firebasestorage.app",
  "firebaseMessagingSenderId": "123456",
  "firebaseAppId": "1:123:web:abc",
  "firebaseMeasurementId": "G-XXXX",
  "demoMode": false
}
```

---

### `GET /api/emission-factors`

Returns the full emission factor table and monthly benchmarks.

**Response 200**
```json
{
  "factors": {
    "transport": {
      "petrol_car": { "factor": 0.171, "unit": "km", "label": "Petrol Car" }
    },
    "energy": { ... },
    "food": { ... },
    "shopping": { ... },
    "waste": { ... }
  },
  "averages": {
    "india_monthly": 158,
    "global_monthly": 392,
    "paris_monthly": 208
  }
}
```

---

## Activity Tracking

### `POST /api/log`

Log a carbon-emitting activity for a session.

**Rate limit:** 100 req/min

**Request body**
| Field | Type | Required | Notes |
|---|---|---|---|
| `sessionId` | string | Yes | Max 128 chars |
| `category` | string | Yes | `transport` \| `energy` \| `food` \| `shopping` \| `waste` |
| `type` | string | Yes | Key within category (e.g. `petrol_car`) |
| `quantity` | number | Yes | Non-negative, in the activity's unit |
| `timestamp` | number | No | Unix ms; defaults to `Date.now()` |

**Response 201**
```json
{ "id": "abc123", "co2": 1.71, "label": "Petrol Car", "unit": "km" }
```

**Errors**
- `400` — missing/invalid fields, unknown category or type, negative quantity
- `500` — Firestore write failure

---

### `GET /api/history`

Retrieve recent activities for a session, newest first.

**Rate limit:** 100 req/min

**Query params**
| Param | Type | Default | Max |
|---|---|---|---|
| `sessionId` | string | — | required |
| `limit` | number | 50 | 100 |

**Response 200**
```json
{
  "activities": [
    {
      "id": "abc123",
      "category": "transport",
      "type": "petrol_car",
      "quantity": 10,
      "co2": 1.71,
      "label": "Petrol Car",
      "unit": "km",
      "timestamp": 1718273600000
    }
  ]
}
```

---

## Insights & Comparison

### `GET /api/insights`

Aggregated CO₂ breakdown by category plus a daily trend series.

**Rate limit:** 100 req/min · **Cache:** 30 s

**Query params**
| Param | Default | Max |
|---|---|---|
| `sessionId` | — | required |
| `days` | 30 | 365 |

**Response 200**
```json
{
  "periodDays": 30,
  "grandTotal": 142.5,
  "totals": { "transport": 89.0, "energy": 30.2, "food": 18.1, "shopping": 5.0, "waste": 0.2 },
  "topCategory": "transport",
  "daily": [{ "date": "2026-05-14", "co2": 5.13 }],
  "activityCount": 12
}
```

Returns `X-Cache: HIT` header on cached responses.

---

### `GET /api/compare`

Compare the session's footprint against Indian, global, and Paris Agreement averages.

**Rate limit:** 100 req/min · **Cache:** 30 s

**Query params** — same as `/api/insights`

**Response 200**
```json
{
  "periodDays": 30,
  "grandTotal": 142.5,
  "monthlyEquivalent": 142.5,
  "averages": { "india_monthly": 158, "global_monthly": 392, "paris_monthly": 208 },
  "comparison": {
    "india_diff_pct": -9.8,
    "global_diff_pct": -63.6,
    "paris_diff_pct": -31.5,
    "rating": "good"
  }
}
```

`rating` values: `excellent` | `good` | `average` | `high`

---

### `GET /api/actions`

Ranked catalog of recommended actions sorted by CO₂ impact descending.

**Rate limit:** 100 req/min

**Query params**
| Param | Notes |
|---|---|
| `category` | Optional filter — `transport` \| `energy` \| `food` \| `shopping` \| `waste` |

**Response 200**
```json
{
  "actions": [
    {
      "id": "reduce_ac",
      "category": "energy",
      "title": "Reduce AC usage by 2 hours/day",
      "description": "Set AC to 24°C and use ceiling fans. Saves ~74 kg CO₂/month.",
      "impact_kg_month": 74,
      "difficulty": "easy",
      "tags": ["ac", "energy", "home"]
    }
  ]
}
```

`difficulty` values: `easy` | `medium` | `hard`

---

## AI Assistant

### `POST /api/chat`

Send a conversational turn to Gemini. The user's 30-day carbon profile is injected into the system prompt automatically.

**Rate limit:** 20 req/min

**Request body**
| Field | Type | Required | Notes |
|---|---|---|---|
| `sessionId` | string | Yes | |
| `message` | string | Yes | Max 2000 chars |
| `history` | array | No | Prior turns `[{ role, parts }]`, last 10 used |

**Response 200**
```json
{ "reply": "Your biggest source is transport at 89 kg last month. Switching your 15 km commute to metro would save ~33 kg CO₂/month." }
```

In demo mode (no `GEMINI_API_KEY`), returns a static explanation string.

---

### `GET /api/tips`

Generate 3 personalised weekly tips based on the session's top emission category.

**Rate limit:** 100 req/min · **Cache:** 5 min

**Query params**
| Param | Notes |
|---|---|
| `sessionId` | required |

**Response 200**
```json
{
  "tips": [
    "Switch your 15 km daily commute from petrol car to metro — saves ~33 kg CO₂/month.",
    "Set your AC to 24°C — every degree higher saves roughly 6% electricity.",
    "Pack a vegetarian lunch twice a week to cut ~8 kg CO₂/month from food."
  ]
}
```

---

## Error Codes

| Status | Meaning |
|---|---|
| `400` | Bad request — missing or invalid input |
| `404` | Route not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
