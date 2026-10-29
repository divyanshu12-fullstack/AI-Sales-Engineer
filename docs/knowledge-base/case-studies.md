---
document_id: case-studies
version: "1.1"
language: en
status: draft
visibility: public
updated_on: "2026-10-23"
---

# Client case studies

A selection of projects delivered by AsterByte Solutions across logistics, automation, marketing and developer tools.

## CS-001: DispatchPro - logistics operations

**Client:** SwiftRoute Logistics.

**Adoption:** 1,200 customer accounts, 30 couriers and 5 operations staff.

**Problem:** Delivery requests, courier assignments and status updates were scattered across manual processes. Customers needed clear quotes and tracking, while operations staff needed controlled status changes and exception handling.

**Solution:** A multi-role logistics application with zone and weight-based pricing, role-controlled order transitions, courier assignment, OTP delivery confirmation and failed-delivery recovery. A support assistant combines FAQ retrieval with role-scoped access to tracking and pricing information.

**Technologies:** React, Node.js, Express, MongoDB, transaction and concurrency controls, embeddings and MongoDB Atlas Vector Search.

**Team:** Arjun led backend workflows, Meera led the interface, Kabir handled integrations and Priya coordinated testing.

**Outcome:** Customers, couriers and administrators work from a shared delivery record, with consistent pricing logic and clear operational handoffs.

**Spoken summary:** "We built DispatchPro for SwiftRoute Logistics to bring delivery pricing, tracking and courier coordination into one application."

## CS-002: FormPilot - assisted form completion

**Client:** NextStep Career Services.

**Adoption:** 300 candidate profiles and 8 coordinators.

**Problem:** Candidates repeatedly entered the same information into placement and application forms. Personal questions still needed individual judgment and review.

**Solution:** A Chrome extension detects fields, matches them against a local profile and saved corrections, fills supported controls and checks the results. AI assistance supports unresolved field mapping and reviewable answer drafts. Users remain in control of personal answers and consent.

**Technologies:** Chrome Manifest V3, FastAPI, SQLite and Playwright.

**Team:** Kabir led form adapters, Sana handled assisted mapping and answer review, and Priya covered browser testing.

**Outcome:** Less repeated entry, reusable corrections and a clear review step for uncertain answers. Routine profile matching runs locally; AI-assisted parsing and drafting use the configured AI service.

**Spoken summary:** "FormPilot helps NextStep's candidates fill routine details from saved information while reviewing answers that need personal judgment."

## CS-003: Draftly - reviewable marketing content

**Client:** Blueframe Digital.

**Adoption:** 24 editors and reviewers across 6 brand workspaces.

**Problem:** The marketing team needed a repeatable process for turning briefs into content while checking brand rules and preserving editorial control.

**Solution:** A workflow coordinates research, writing, brand-policy checks and visual direction. Users inspect, edit, reject or retry drafts before publishing, with live progress throughout the process.

**Technologies:** Next.js, FastAPI, PostgreSQL, CrewAI, OpenRouter and server-sent events.

**Team:** Sana led AI workflow design, Meera handled the review interface and Arjun handled data and API integration.

**Outcome:** Consistent review steps, clearer handoffs and human approval before publication. Automated policy checks support editorial review rather than replacing it.

**Spoken summary:** "We built Draftly so Blueframe's team can research, draft and review content against its brand rules before publishing."

## CS-004: RepoLens - explainable repository review

**Client:** CodeBridge Learning.

**Adoption:** 180 learners and 12 mentors.

**Problem:** Mentors needed a repeatable way to review project documentation and engineering signals with explanations behind each recommendation.

**Solution:** A repository review application analyzes documentation, commits, technology choices and structure. It produces deterministic scores, supporting findings and a prioritized improvement roadmap. Optional Gemini assistance improves the wording of recommendations without deciding the score.

**Technologies:** Next.js, TypeScript, GitHub API, Zod, Recharts and Gemini.

**Team:** Arjun implemented analysis workflows, Meera designed the report interface and Priya reviewed validation and failure handling.

**Outcome:** Structured project feedback that mentors can explain and learners can act on. Repository scores provide engineering signals rather than a hiring or security certification.

**Spoken summary:** "RepoLens gives CodeBridge's mentors and learners an explained repository review with practical suggestions for improvement."
