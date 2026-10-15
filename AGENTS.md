<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project-specific guidance

- This is a single-package app (not a monorepo). `app/` contains the Next App Router UI and API handlers; `lib/` contains the election/TSE domain logic. `app/api/results` and `app/api/municipalities` are the backend entrypoints.
- Node `>=22.13` and pnpm `11.25.0` are declared in `package.json`; use `pnpm install --frozen-lockfile` to respect `pnpm-lock.yaml`.
- There are two runtime targets: `dev:next` / `build:next` / `start:next` run Next.js; `dev` / `build` / `start` run the Vinext/Cloudflare Workers path. Keep changes and verification aligned to the target being modified.
- Focused checks: `pnpm test` runs `scripts/test-election.mjs` (a Node-based domain test harness; no network/test runner needed); `pnpm typecheck` runs `tsc --noEmit`; `pnpm lint` runs ESLint. `pnpm start:next` requires a successful `pnpm build:next` first.
- `scripts/test-election.mjs` compiles selected `lib/*.ts` modules to a temporary directory and removes it afterward; extend this harness for domain logic rather than assuming a separate test framework exists.
- Results come from official TSE data. Preserve validation of election/turn/territory, hidden-vote handling, and safe municipality codes (leading zeros matter); never substitute synthetic results in app code. Regional results require a complete compatible set of UFs and must not imply elected candidates.

## Implementation and verification

- Preserve existing user changes. Work on the current feature branch.
- Implement only the stage authorized by the current task.
- Keep changes focused; avoid unrelated refactors and dependency upgrades.
- Use pnpm and preserve pnpm-lock.yaml. Update the lockfile only when
  intentionally changing dependencies.
- Extend the existing Node test harness. Do not introduce another test
  framework without a concrete need.
- Keep shared application code compatible with Next.js and
  Vinext/Cloudflare Workers.
- Before declaring the feature complete, run:
  pnpm test, pnpm typecheck, pnpm lint, pnpm build:next, and pnpm build.
- Report executed commands and actual results. Distinguish pre-existing
  failures from regressions. Never claim an unexecuted check passed.
- Do not delete or weaken tests, validation, or quality checks to make
  the implementation pass.
- Do not push, merge, deploy, or provision external services unless
  explicitly requested.

## Forecasting domain

- Keep statistical functions pure: pass data, parameters, time, and
  random seeds explicitly. Keep network and filesystem I/O separate.
- Use explicit units and denominators. Distinguish vote share,
  probability of victory, section progress, and estimated vote progress.
- Preserve observed votes. Uncertainty must apply to unobserved outcomes,
  never replace or discard votes already counted.
- Validate election, round, office, territory, and candidate identities.
  Include the electoral context in cache and fallback keys.
- Historical forecasts may use only information publicly available at
  their cutoff time, including calibration inputs.
- Keep synthetic fixtures exclusively in tests. Never invent production
  polls, registration numbers, candidates, results, or evaluation metrics.
- Missing or inconsistent data must produce an explicit unavailable or
  insufficient-data state, never a fabricated 50/50 forecast.
- Version statistical parameters and document their justification.
  Never change them merely to satisfy a test.
- Distinguish software correctness from statistical calibration.
  Passing tests does not establish predictive accuracy.
- Keep experimental live forecasts disabled by default until documented
  data-quality and evaluation requirements are met.
- Clearly distinguish model projections from official TSE results.
  Only official source data may determine an elected status.

## Documentation and review

- Read the task specification before editing the relevant feature.
  Treat preliminary proposals as references, not validated code.
- Prefer installed-version documentation; use Context7 when available
  to resolve library questions, and official TSE documentation for
  electoral data formats.
- Require reproducible examples for mathematical bug fixes.
- Review changed behavior with numerical tests and, for UI changes,
  browser checks when available.
- Summarize changed files, verification evidence, remaining limitations,
  and any external data still required.
