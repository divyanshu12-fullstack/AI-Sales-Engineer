# Foundation architecture

## Implemented boundaries

- **`apps/web`:** React/Vite/Tailwind, with a single foundation screen. API requests and runtime
  response validation live in `src/lib/api.ts`; async state and cancellation live in a feature hook.
  Native fetch is sufficient for two health requests; introduce a consistent server-state cache when
  real business screens require it. No router or global state library is justified yet.
- **`apps/api`:** A testable Express application factory separate from process startup. Configuration,
  HTTP middleware, logging and health services have distinct responsibilities. Native ESM output runs
  without TypeScript at runtime. Server startup validates configuration and supports bounded shutdown.
- **`packages/contracts`:** Browser-safe Zod schemas and inferred types. No configuration, privileged
  clients or server-only imports. Built package exports are used consistently in source and deployment.
- **`scripts/smoke.mjs`:** Owned-process startup/HTTP assertions, independent of external providers.

## Security defaults in this milestone

- Loopback binding by default, no trusted forwarding headers and no `X-Powered-By` header.
- Helmet response headers, an exact browser-origin allowlist, 16 KiB JSON payload limit and a
  120/minute in-memory per-IP API limit. Liveness is exempt so traffic limits cannot make it unhealthy.
- The limiter is **single-process only**. Review a shared limiter/edge limits and trusted proxy IPs
  before a multi-instance deployment or public call-session endpoint. Do not enable `trust proxy=true`
  indiscriminately. CORS is not authentication and does not protect server-to-server endpoints.
- Generated correlation IDs; request logs include method, path, status and elapsed time, not query
  strings, headers, bodies or environment objects. Unknown error text/stacks are not exposed or logged
  automatically. Future routes must not place personal data in URL path segments.
- Configuration errors identify fields, not values. Logs include additional common-secret redaction;
  this is not permission to log arbitrary credentials or customer records.
- No authentication endpoints, database access, admin routes, provider clients or webhook/tool routes
  exist yet. Their absence is intentional, not a substitute for future authorization.
- Readiness is a configuration inventory, **not a provider health probe**. All capabilities remain
  unavailable regardless of whether configuration values exist. Never derive success from presence.

## Planned, not implemented

PostgreSQL will own business records, constraints and transactions. Public, administrator and
verified-customer contexts will be distinct. Frontend direct Supabase use will be limited to approved
Auth/Realtime interactions; privileged business mutations remain behind application services.

Future voice tools and dashboard routes will call those same services. Transactions will commit
business events with their records. Durable post-call work will use PostgreSQL-backed jobs/outbox
before introducing another infrastructure service. Customer memories will remain separate from
approved public/project knowledge and administrator-reviewed reusable solutions.

Calendar choice is provisional: Cal.com connected to a real demo calendar is the documented initial
configuration shape. Neither Cal.com nor another calendar adapter is installed or operational.

No microservices, message broker, Socket.IO, database abstraction layer, Bolna SDK, Supabase SDK or
email/calendar SDK has been added speculatively. Each will need a concrete milestone requirement.
