# Asterbyte Studio — AI Consultancy Voice Agent

A voice-first consultancy and customer-support platform built incrementally with React, TypeScript,
Express, Supabase and Bolna.

**Current scope: milestone 1, engineering foundation only.** The application reports actual API and
configuration state. There is no calling, authentication, database persistence, RAG, booking or email
delivery yet. All external capabilities are explicitly unavailable, even when credentials are present.

## Read before changing code

1. [Product requirements](.agents/instructions/system_prompt.md)
2. [Engineering standards](.agents/instructions/engineering-standards.md)
3. [WORKLOG.md](WORKLOG.md)

The requirements refer to `system.md`, but the supplied file is actually
`.agents/instructions/system_prompt.md`. The standards also live under `.agents/instructions/`.
These originals have not been renamed or duplicated.

## Prerequisites

- Node.js **24.18.0 or later within 24.x** (LTS); `.node-version` records the tested version.
- npm **12.x**, tested with 12.0.1. Use one package manager and the root lockfile.
- No provider credentials, Docker or Supabase CLI are required for this milestone.

TypeScript 6.0.3 is intentionally used: the selected typescript-eslint version does not support
TypeScript 7.x. Direct dependency versions are pinned; `package-lock.json` pins transitive versions.
npm 12 blocks unapproved dependency installation scripts. The esbuild postinstall is explicitly
disabled: supported platforms receive its native executable through the normal optional dependency.
Do not use `--omit=optional` or blanket-approve install scripts.

## Local setup

Run from the workspace root:

```powershell
npm.cmd ci
```

Configuration is optional for the local foundation. To customize it, create `.env` **only if it does
not already exist**, then edit it:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Start all three workspace watchers:

```powershell
npm.cmd run dev
```

- React: <http://127.0.0.1:5173>
- Express: <http://127.0.0.1:3001>
- The contracts package compiles before startup and then watches for changes.
- Vite forwards `/api` requests to Express; browser code uses relative URLs and contains no keys.
- Stop the development command with **Ctrl+C**.

On macOS/Linux use `npm` instead of `npm.cmd`. Windows instructions use `npm.cmd` to avoid PowerShell
execution-policy issues with `npm.ps1`.

## Configuration

Copy variable names from [.env.example](.env.example); never commit `.env`. The API reads the root
`.env` explicitly in source and built modes. Existing process environment variables take precedence.
Restart after configuration changes. Whitespace-only entries are treated as unset.

| Variable           | Default / behavior                                                             |
| ------------------ | ------------------------------------------------------------------------------ |
| `NODE_ENV`         | `development`; also supports `test` and `production`                           |
| `HOST`             | `127.0.0.1`; explicitly set `0.0.0.0` only when the host/container requires it |
| `PORT`             | `3001`; also determines Vite's local API proxy port                            |
| `WEB_ORIGIN`       | `http://127.0.0.1:5173`; exact permitted browser origin, no path               |
| `LOG_LEVEL`        | `info`; JSON logs, with `silent` available for tests                           |
| `RATE_LIMIT_MAX`   | `120` requests per IP per minute, excluding process liveness                   |
| Provider variables | Optional; see [integration readiness](docs/integration-readiness.md)           |

Invalid supplied values fail startup with **field names only**, never the secret values. Partial or
missing integration configuration does not prevent the foundation from starting. No credentials are
tested or transmitted by health checks.

Use `127.0.0.1` consistently: `localhost` is a different browser origin. If you change the frontend
port, update `WEB_ORIGIN` and pass the matching Vite CLI port. The proxy targets the local API on
`127.0.0.1`; changing `HOST` must still leave it reachable there.

## Health API

| Endpoint                | Response                                                            | Meaning                                              |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/health/live`  | `200`, `{ "data": { "status": "ok", "service": "asterbyte-api" } }` | API process responds; no business-readiness claim    |
| `GET /api/health/ready` | `503`, structured integration report                                | Business integrations are unavailable in milestone 1 |

`503` on readiness is **intentional**, not a broken server. Use liveness for a process health probe;
do not configure restart loops against the intentionally incomplete business-readiness endpoint.

Readiness lists configuration presence, missing variable **names**, and `verification: not_checked`.
It never returns keys, email addresses, project URLs or token values. Its shared runtime schema rejects
fabricated available integrations. API responses have `Cache-Control: no-store` and a generated
`X-Request-ID`. Errors use `{ "error": { "code", "message", "requestId" } }`.

## Quality and startup checks

```powershell
npm.cmd run check
npm.cmd run smoke
npm.cmd run smoke:dev
```

- `check`: formatting, typed ESLint, strict type checking, tests and production builds.
- `smoke`: builds, starts the compiled API and Vite preview on temporary loopback ports, checks real
  HTTP responses/assets and the proxy, then stops only its own processes.
- `smoke:dev`: checks the source API and Vite development server with the same HTTP assertions.
- Smoke tests do not place calls, send emails, access provider accounts or create business records.
- UI tests use jsdom; smoke tests are HTTP-level, not real-browser or voice end-to-end tests.

Other commands: `npm.cmd run format`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`.

For a built API:

```powershell
npm.cmd run build
npm.cmd start
```

`apps/web/dist` is a static frontend build. `npm.cmd run preview --workspace @asterbyte/web` is a
**local preview**, not a production hosting service. Set `WEB_ORIGIN=http://127.0.0.1:4173` for that
preview. Production will need static hosting, an HTTPS reverse proxy for `/api`, environment secrets
and reviewed proxy/network settings; deployment is not implemented in milestone 1.

## Structure and next milestone

```text
apps/api/src/          App factory, server lifecycle, config, HTTP middleware and health module
apps/web/src/          React foundation screen, isolated status fetcher and lifecycle hook
packages/contracts/   Shared Zod request/response contracts and inferred types
scripts/              Cross-platform local startup smoke test
docs/                 Architecture and external integration readiness
WORKLOG.md            Chronological progress, verification and unresolved dependencies
```

See [architecture](docs/architecture.md) for boundaries and [integration readiness](docs/integration-readiness.md)
for provider prerequisites and Bolna evidence. The next milestone is the database schema and
reproducible fictional business data, subject to user authorization.
