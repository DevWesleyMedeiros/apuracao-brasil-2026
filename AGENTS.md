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
