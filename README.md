# AsterByte Solutions — AI Sales & Customer Support Demo

This project is a working voice-agent demo for a software consultancy. A visitor can speak with an AI representative on the public website to ask about services, discuss a possible software project, or report an issue with a demo product. The agent can save a project enquiry or support ticket when the caller asks it to.

## Try the website

- Live website: <https://asterbyte.divyanshu.engineer>
- Project walkthrough and call scenarios: <https://asterbyte.divyanshu.engineer/demo>
- Administrator sign-in: <https://asterbyte.divyanshu.engineer/admin>

The `/demo` page explains the customer journeys, voice stages, sample prompts, expected dashboard results, and current limitations. The live call requires microphone permission. Use test details and do not share passwords or sensitive information. Dashboard access requires administrator credentials from the project owner; there is no public sign-in bypass.

## What the demo does

- **New customer conversations:** answers company questions, helps scope a practical first version, captures a project enquiry with consent, and can offer actual consultation availability. A chosen slot is reserved pending the customer’s email confirmation.
- **Returning customer support:** accepts issues for the published fictional demo account, can consult reviewed product guidance, and creates support tickets for the team to review. Administrators can record a resolution. Email acknowledgements and resolution updates are sent only for enabled contacts and when email delivery is configured.
- **Operations dashboard:** authenticated staff can review calls and processed summaries, project enquiries, support tickets, consultation reservations, and backend tool/knowledge activity.
- **Voice experience:** the browser connects to the Bolna voice service. The configured pipeline uses Sarvam Saaras v4 for speech recognition, Gemini 3.6 Flash for language reasoning, and Sarvam Bulbul v3 for speech generation. English/Hinglish is the default; Marathi, Bengali, Telugu, and Kannada are available when the caller explicitly requests one.

After a customer confirms a consultation, the API can create a Google Calendar event and Meet link using the project owner’s personal-Gmail OAuth refresh token. The OAuth client secret and refresh token stay in server-side settings. Only the `calendar.events` scope is needed; availability is read from the app database, not Google FreeBusy. A follow-up email is sent only after Google confirms the event and Meet link. This integration remains unavailable until the Calendar API, OAuth credentials, calendar, and Resend settings are configured; a confirmation alone is not proof of calendar booking or email delivery. Demo project/customer codes enable fictional issue intake only; they are not production identity verification and do not grant access to private customer history. See `/demo` for further scope details and expected test outcomes.

## How it is built

- **Website:** React, TypeScript and Vite.
- **Application API:** Node.js and Express, serving the production website and API from the same Azure Linux App Service.
- **Data and authentication:** Supabase stores application records and provides administrator sign-in.
- **Voice:** Bolna orchestrates the browser call and voice pipeline.
- **Email:** Resend is used for configured support notifications and consultation confirmation.
- **Shared contracts:** the `packages/contracts` workspace contains shared request and response schemas.

The production app is hosted at `https://asterbyte.divyanshu.engineer`. Supabase, Bolna, Google Calendar and Resend are external services. The API health endpoint is `/api/health/live`.

## Run locally

Requirements: Node.js 24.x and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open the local website at <http://127.0.0.1:5173>, the walkthrough at <http://127.0.0.1:5173/demo>, and the admin sign-in at <http://127.0.0.1:5173/admin>. The development server proxies `/api` requests to Express on port 3001.

The public pages can be viewed without credentials. Live calling, administrator sign-in, persistence, and email require the appropriate server-side configuration. Copy `.env.example` to `.env` only if needed, and never commit `.env` or share its secrets. Do not use real customer information for demo calls.

## Verify changes

```sh
npm run check
npm run smoke
npm run review:frontend
```

`check` runs formatting, lint, type checks, tests, and builds. `smoke` checks the built app and API over HTTP. `review:frontend` runs responsive browser checks and UI scenarios; these checks do not by themselves verify a human voice call, administrator credentials, or delivery to an email inbox.

## Repository layout

```text
apps/web/              Public website, demo guide, browser calling and admin interface
apps/api/              Express API and integrations
packages/contracts/    Shared validation schemas and API types
supabase/              Database migrations and project SQL
scripts/               Build, smoke-test and browser-review tooling
```
