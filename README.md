# AsterByte Solutions — AI Consultancy Voice Agent

A voice-first consultancy and customer-support platform built incrementally with React, TypeScript,
Express, Supabase and Bolna.

**Current scope: knowledge retrieval and voice-operation integration.** Supabase holds the original
113 records plus **43 real Qwen3-Embedding-8B chunks from seven approved documents**. The API provides
authenticated public-knowledge search, confirmed prospect inquiries, authenticated call ingestion,
and a protected activity dashboard at `/admin`.

The existing Bolna agent and prompts are unchanged. Live tools/webhooks are **not connected yet**:
the user chose configuration templates without a tunnel/deployment, and no public HTTPS origin is set.
Administrator sign-in is implemented, but no administrator account has been provisioned. See
[integration setup](docs/voice-integration.md) for exact steps and limitations. Calendar/email,
private customer support and browser calling from this website remain unavailable.

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
- No credentials, Docker or Supabase CLI are required for local application/PGlite tests. Explicit
  hosted verification requires the existing Supabase configuration or authenticated project-scoped MCP.

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
- Protected operations dashboard: <http://127.0.0.1:5173/admin>
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

| Endpoint                | Response                                                            | Meaning                                           |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| `GET /api/health/live`  | `200`, `{ "data": { "status": "ok", "service": "asterbyte-api" } }` | API process responds; no business-readiness claim |
| `GET /api/health/ready` | `503`, structured configuration inventory                           | Complete voice workflow is not enabled/probed     |

`503` on readiness is **intentional**, not a broken server. Use liveness for a process health probe;
do not configure restart loops against the intentionally incomplete business-readiness endpoint.

Readiness lists configuration presence, missing variable **names**, and `verification: not_checked`.
This conservative configuration inventory is separate from real retrieval verification and stored
activity. It does not dynamically probe providers or claim live voice readiness.
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

Database checks and the optional read-only hosted API check:

```powershell
npm.cmd run db:validate
npm.cmd run test:database
npm.cmd run db:verify:rest
```

The last command performs only GET requests using local server configuration. It checks project
scope, denied anonymous access, the company record and seven hosted source hashes without logging keys.
`npm.cmd run db:seed:sql -- --output supabase/.temp/initial-import.sql` generates a validated UTF-8
import statement; it does **not** execute it. See the database guide before applying migrations/imports.
The original importer is frozen developer tooling: it intentionally rejects the later schema/review
state rather than overwriting approved records. Do not rerun it on the current database.

Current integration commands:

```powershell
npm.cmd run knowledge:ingest
npm.cmd run knowledge:verify
npm.cmd run bolna:config
```

`knowledge:ingest` validates and resumes approved public chunks; missing chunks use the paid embedding
API. `knowledge:verify` makes three real authenticated local-backend searches through OpenRouter and
Supabase and records genuine backend tool checks (not Bolna calls). `bolna:config` writes placeholder-only
JSON under Git-ignored `supabase/.temp/`, without modifying the agent. Never commit `--private` exports.

For a built API:

```powershell
npm.cmd run build
npm.cmd start
```

`apps/web/dist` is a static frontend build. `npm.cmd run preview --workspace @asterbyte/web` is a
**local preview**, not a production hosting service. Set `WEB_ORIGIN=http://127.0.0.1:4173` for that
preview. Production will need static hosting, an HTTPS reverse proxy for `/api`, environment secrets
and reviewed proxy/network settings; deployment is not implemented in milestone 1.

## Supabase MCP for development

The project-local `opencode.json` configures Supabase's hosted MCP server, scoped to the Supabase
project identified in the local setup. It currently exposes **database and documentation tools**, with
writes enabled under the user's milestone 2 authorization. No API key or OAuth token is stored in the
configuration. This does not authorize unrelated writes, resets, other-project work or deployment.

To authorize it in OpenCode, run `/mcps`, select **supabase**, and complete the browser sign-in for the
organization containing this project's Supabase project. Check the result with `opencode mcp list`;
it must say `connected` before the connection is considered verified. The connection and database
operations were verified for milestone 2. Restore `read_only=true` in the scoped URL when only inspection
is needed; URL changes can require a new OAuth sign-in. Do not use production data for this setup.

MCP is an internal developer connection, **not the application's runtime database integration**. It
does not enable application persistence, authentication or change the foundation's readiness status.

## Structure and next milestone

```text
apps/api/src/          App factory, server lifecycle, config, HTTP middleware and health module
apps/web/src/          React foundation screen, isolated status fetcher and lifecycle hook
packages/contracts/   Shared Zod request/response contracts and inferred types
scripts/              Cross-platform local startup smoke test
scripts/database/     Source validator, SQL emitter, isolated SQL tests and read-only REST check
supabase/             Versioned migrations, explicit local config and metadata/access verification SQL
docs/                 Architecture and external integration readiness
WORKLOG.md            Chronological progress, verification and unresolved dependencies
```

See [integration setup](docs/voice-integration.md) for connecting the prepared tools and webhook after
choosing a public HTTPS URL, and provisioning one administrator after choosing the account. The next
verification is a user-run real Bolna call. Private customer tools additionally require session-bound
identity/access checks and remain out of this iteration.
