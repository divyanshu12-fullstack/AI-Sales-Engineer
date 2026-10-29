---
document_id: support-policies
version: "1.1"
language: en
status: draft
visibility: public
updated_on: "2026-10-23"
---

# Support, priorities and escalation

## Coverage and hours

These support terms cover projects delivered by AsterByte Solutions. A project-specific agreement takes precedence where it defines different coverage or response commitments.

Standard staffed hours are Monday-Friday, 10:00-19:00 India Standard Time, Asia/Kolkata, excluding company holidays. One business day means 9 staffed hours. There is no default 24/7 response commitment. Out-of-hours coverage requires a separately agreed arrangement.

The voice agent may collect an issue outside staffed hours only when the calling service is operational. Intake does not imply an engineer is currently available. No support email, holiday calendar, public phone number or emergency contact is configured by these documents; do not invent one.

## Priority and response targets

Response means a human acknowledges the issue and begins triage. It does not mean the problem is resolved. Targets count staffed hours from successful ticket submission, with the clock beginning at the next staffed period for an out-of-hours submission.

| Priority | Impact | Initial human response target | Update target while actively investigated |
| --- | --- | --- | --- |
| P1 - Critical | Production service unavailable for most users; core workflow blocked without a workaround; suspected data exposure or loss | Within 2 business hours | Every 4 business hours or sooner on a material change |
| P2 - High | Important function degraded for a subset of users, or a workable alternative exists | Within 1 business day | Each business day |
| P3 - Normal | Isolated noncritical defect, cosmetic issue or ordinary product question | Within 2 business days | Every 3 business days while open |
| P4 - Enhancement | New feature, improvement or change of scope | Within 3 business days | Schedule agreed after scoping |

Support may reclassify priority after reviewing impact and will explain why. Contract-specific terms take precedence. Resolution time depends on cause, reproducibility, access and external dependencies; do not promise a fix by the response deadline.

## Intake and record creation

Collect the product or project, brief symptom, time first observed, affected users, impact, exact error and steps immediately before it happened. Ask about a workaround and recent changes. Record unconfirmed details as caller reports, not established facts.

Verify identity and project authorization before revealing private records. Do not request passwords, OTPs, secret keys, card information or full production data. Use redacted screenshots and the approved secure channel for necessary diagnostic material.

Summarize the issue and obtain confirmation before submitting a ticket. Say it was created only when the real tool returns a persisted ticket reference. If the tool is unavailable or fails, explain that submission is unconfirmed and offer the configured fallback channel. Do not invent a ticket ID or promise a callback that has not been recorded and accepted.

## Escalation route

1. Ishaan, the support specialist, handles intake and safe documented checks.
2. The owning engineer investigates the affected product or component.
3. Priya coordinates P1 triage, cross-team incidents and investigation that exceeds the response target.
4. The delivery lead handles commercial exceptions, unresolved commitments and customer escalations.

Suspected data exposure, loss or unauthorized access goes directly to urgent human review. Avoid destructive changes, mass deletions, disabling access controls or unreviewed restores during voice troubleshooting. An authorized engineer decides any containment or recovery action.

If no human handoff tool is available, describe the required escalation without claiming someone was notified. Automated intake must not imply a staffed on-call team.

## Bug fixes, changes and maintenance

Qualifying defects in AsterByte Solutions' delivered custom code are corrected free for the product's lifetime as defined in [services and pricing](services-pricing.md), regardless of maintenance subscription status. They do not consume revision rounds or post-launch refinement hours. A paid maintenance plan adds proactive work; it is not a condition for free qualifying fixes.

New features, changed business rules, new integrations, third-party platform changes and work caused by external modifications may need a separate estimate. Do not classify an unexplained problem as billable before diagnosis. Explain any proposed paid work and obtain agreement first.

## Ticket lifecycle and closure

The ticket lifecycle is Open, Triaged, In progress, Waiting for customer or provider, Resolved, and Closed. Keep the reason for waiting and the next required action visible. Waiting does not mean the issue was fixed.

Mark Resolved only when evidence supports the fix or documented answer. Ask the customer to verify where appropriate. Close after customer confirmation, or after 5 business days without a reply following a resolution notice and one reminder. A customer can ask to reopen a recurring issue, and covered bug-fix rights do not expire because a ticket was closed. Never claim a fix was tested when it was not.

## Reusable solutions

Clinic and CRM diagnostic guidance stays in its own product guide. After an engineer verifies a resolution, record the issue ID, affected version, symptoms, root cause, safe procedure, expected result, reviewer and verification date there. Keep customer-specific logs in restricted tickets.

Conversation summaries and customer suggestions can inform an investigation, but cannot silently replace approved shared knowledge. A human reviews new reusable guidance before it is marked verified and indexed for future calls.
