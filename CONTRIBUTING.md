# Contributing to EcoSage

Thank you for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/SaiBhargavRallapalli/carbonfootprint.git
cd carbonfootprint
npm install
cp .env.example .env
# Add GEMINI_API_KEY to .env (optional — app runs in demo mode without it)
npm run dev
```

## Development Workflow

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run lint` — all ESLint warnings must be resolved
4. Run `npm test` — coverage must stay at or above 90%
5. Run `npm run test:e2e` — all Playwright specs must pass
6. Open a pull request with a clear description of the change

## Code Style

- `'use strict'` at the top of every JS file
- No inline `eslint-disable` unless unavoidable — fix the root cause
- No new globals; import what you need
- Functions must be small and single-purpose

## Adding Emission Factors

All factors live in [data/carbonData.js](data/carbonData.js). When adding a new activity type:

- Cite the source (CEA, ICCT, IPCC AR6, etc.) in a comment
- Use India-specific values where available
- Add a test in `server.test.js` under the `carbonData` suite

## Tests

| Command | Purpose |
|---|---|
| `npm test` | Jest unit + integration tests (90% line coverage required) |
| `npm run test:e2e` | Playwright E2E tests (requires server on port 8080) |
| `npm run test:all` | Lint + unit + E2E in one shot |

## Commit Messages

Use the conventional format: `type: short description`

- `feat:` new feature
- `fix:` bug fix
- `refactor:` code change with no functional effect
- `test:` adding or updating tests
- `docs:` documentation only
- `chore:` build/tooling/config changes

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs. actual behaviour
- Node.js version and OS

## License

By contributing, you agree your changes will be licensed under the [MIT License](LICENSE).
