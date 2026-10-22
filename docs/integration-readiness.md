# External integration readiness

Reviewed on **2026-10-22**. Documentation review is not an account-level integration test. No provider
credentials or public callback URL were supplied. No calls, bookings, emails, embeddings or database
operations have been performed. There are no provider adapters or webhook/tool routes in milestone 1.

## Readiness checklist

All items below are currently **unavailable / not verified**. The application reports configuration
presence separately; it will not mark a provider operational just because keys have been entered.

| Integration                       | Configuration names                                                                | Required real verification before enabling                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase PostgreSQL/Auth/Realtime | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`                  | Dedicated demo project; reviewed migrations/RLS/grants; disabled public admin signup; explicit administrator membership; authorized and denied API/database/Realtime tests |
| Bolna browser calling             | `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `BOLNA_TOOL_AUTH_TOKEN`, `BOLNA_WEBHOOK_SECRET` | Web-call entitlement/credits; mint a session; complete a browser call; prove run ID correlation, authenticated tools and authenticated callbacks                           |
| Backend language model            | `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`                                         | Select provider/model with structured output; real request, schema validation, timeout/quota/failure tests; no unsupported pricing promises                                |
| Embeddings                        | `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`                       | Select multilingual-capable model; real vector output/dimensions; pgvector migration and scoped retrieval evaluation                                                       |
| Calendar (proposed Cal.com)       | `CALENDAR_PROVIDER=calcom`, `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID`               | Connect a real demo calendar; verify availability, timezones, conflict handling, confirmed booking and external references; only configured resources are bookable         |
| Resend                            | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                              | Verify domain/sender and recipient restrictions; send to a controlled inbox; verify provider submission versus delivery/bounce states and duplicate prevention             |
| Public HTTPS callbacks            | `PUBLIC_API_BASE_URL`                                                              | Deployed backend or approved tunnel; provider-to-endpoint reachability; trusted proxy configuration; secret headers and duplicate/out-of-order/replay tests                |

Configuration inventory is intentionally stricter than a single operation's prerequisites. For example,
Bolna session minting itself needs the API key and agent ID, while tools/webhooks additionally need
their independent credentials and a reachable backend. These checks are separate gates, not an atomic
"all integrations work" assertion. Model choices are deliberately unset; entering a provider name does
not install or enable an adapter. Cal.com is a provisional choice, not a user-approved final provider.

Supabase's publishable key is designed for approved client use with RLS; the secret key is **never**
browser-safe. This milestone sends neither to the browser. Add frontend-safe configuration only when
Auth/Realtime are implemented, never by exporting the server environment wholesale.

## Bolna: facts confirmed in current official documentation

### Browser sessions and identifiers

- The official package is `@bolna/web-call`; the reviewed guide documents v3.0.1.
- The backend calls `POST https://api.bolna.ai/web-call/session` with
  `Authorization: Bearer <BOLNA_API_KEY>` and the server-selected `agent_id`.
- The returned session includes `run_id`, `agent_id`, ephemeral SIP/WebSocket/ICE connection fields,
  `sip_register` and `expires_in`. Sessions are single-use and last approximately 120 seconds. Pass
  required connection fields through as documented; do not store or log those credentials.
- SDK `getRunId()` returns the execution ID after minting. The documentation explicitly says it
  matches call history and webhook execution IDs. Execution payloads call this field **`id`**.
- `agent_id` identifies the agent, **not** the caller or a particular call. Telephony
  `telephony_data.provider_call_id` / `{call_sid}` are not substitutes for a browser `run_id`.
- `userData` travels as `user_data` through session minting. It is stored in provider call history;
  never put secrets, verification codes or authorization grants into it. Browser-supplied customer
  identifiers and flags must be treated as untrusted input.

### Tool authentication

- Custom functions use the exact Bolna extension `key: "custom_task"`.
- The API configuration supports `value.api_token` for an Authorization header and `value.headers`
  for additional headers. These are provider-side HTTP configuration, not model parameters.
- Planned policy: a dedicated random `BOLNA_TOOL_AUTH_TOKEN` in provider HTTP configuration, verified
  by the backend over HTTPS. Tool schemas, confirmations, idempotency and per-call/customer/project
  authorization remain separate checks. A shared provider token proves neither customer identity nor
  permission to access a specific customer.
- The reviewed automatic-variable page documents `{call_sid}` for telephony, but does **not**
  establish an automatically injected browser `run_id` in custom HTTP tools. Do not invent one.

### Webhook authentication and lifecycle

- The agent webhook configuration supports **Add headers**. Plan to send a separate randomly
  generated `BOLNA_WEBHOOK_SECRET` in a dedicated header, validate it in constant time, and keep it
  distinct from tool credentials. The environment validator rejects equal or short credentials.
- **No HMAC/signature scheme is documented in the reviewed webhook pages.** Do not invent a signing
  algorithm, signature header or signing SDK. Confirm configured-header delivery on the actual
  account, and recheck official docs before implementing.
- The documented source IPs are `13.203.39.153`, `13.126.9.249`, `13.202.133.53`. Revalidate these at
  deployment; use edge/network restrictions as defense in depth, not caller identity proof. Never
  accept spoofable forwarded IPs by enabling blanket proxy trust.
- Webhooks share the execution payload shape and can fire multiple times with the same `id`. Persist
  receipts and distinguish event/state updates from finalized ingestion. A uniqueness constraint on
  `id` alone must **not** discard later states of that execution.
- Disconnection is not completed processing. Wait for finalized `completed` data before extracting
  conversation memory; record terminal failures separately. Check actual duration/transcript evidence:
  `completed` alone does not prove the caller had a conversation or an action succeeded.
- Tool pre-call notifications can also reach the agent-level webhook. Route/validate them separately
  from completed-call ingestion. Provider API tool logs are not a replacement for application audit.

## Proposed browser-session correlation contract — not yet verified

1. Receive an application/browser session at the backend. Choose the agent server-side, rate-limit
   minting, and accept only an allowlisted non-sensitive subset of `user_data`.
2. Mint a provider session and persist its returned `run_id` against an internal call ID and the
   server-owned browser session. Do not accept an execution ID reported by the browser as authority.
3. Return only the SDK-required ephemeral session to that browser; it starts the call from a user
   gesture. The browser can display `getRunId()` for diagnostics but cannot grant access with it.
4. Match authenticated webhook `id` and `agent_id` against the mint record. Verify unexpected/ambiguous
   executions through the authenticated execution API before attaching them to customer memory.
5. Test exactly how authenticated custom tools receive a browser execution binding. A correlation ID
   in prompt/user data can assist lookup, but it is not a secret, customer verification or an
   authorization grant. Require a demonstrably trusted binding to the server-owned call context;
   if provider substitution can be overridden by the model/caller, private tools must stay disabled.
6. Later, bind customer verification to that server-owned session and permitted project relationships.
   A supplied name, email, phone, customer ID, `verified=true` argument or agent assertion is not proof.

**Blocking gate:** Before private support tools are enabled, use a real browser call to prove session
mint → SDK run ID → custom tool binding → webhook execution ID, including attempts to spoof another
call/customer. If the documented provider features cannot establish a safe live binding, restrict
tools to public/unauthenticated inquiry operations and resolve a supported alternative with Bolna.

## Future account smoke-test checklist

- [ ] Dedicated demo resources and secrets supplied outside version control.
- [ ] Public HTTPS endpoint deployed and callback/header configuration verified.
- [ ] Single-use/expired sessions, microphone denial and account concurrency limits tested.
- [ ] Minted `run_id`, SDK `getRunId()`, webhook `id` and tool call binding proven on the same call.
- [ ] Wrong/absent tool token and webhook header rejected; customer spoofing/access tests pass.
- [ ] Finalized callbacks, duplicates, state reordering and missing-callback reconciliation tested.
- [ ] English/Hindi/Hinglish and interruptions checked with actual audio.
- [ ] Calendar and Resend tested separately against controlled real resources.
- [ ] Record provider evidence, safe identifiers, limitations and outcomes in `WORKLOG.md`.

## Official references reviewed

- [Bolna browser SDK](https://www.bolna.ai/docs/developer-resources/sdks/web-call)
- [Bolna browser SDK API and session shape](https://www.bolna.ai/docs/developer-resources/sdks/web-call-api)
- [Bolna custom function schema and HTTP authentication](https://www.bolna.ai/docs/tool-calling/custom-function-schema)
- [Bolna custom function variables](https://www.bolna.ai/docs/tool-calling/custom-function-variables)
- [Bolna webhooks, custom headers and source IPs](https://www.bolna.ai/docs/post-call/polling-call-status-webhooks)
- [Bolna execution identity, finalization and duplicate deliveries](https://www.bolna.ai/docs/post-call/execution-payload)
- [Vite setup and runtime requirements](https://vite.dev/guide/)
- [Tailwind Vite plugin](https://tailwindcss.com/docs/installation/using-vite)

Supabase/model/calendar/Resend API implementation details have not yet been researched or tested in
this milestone; consult their current official documentation when implementing those integrations.
