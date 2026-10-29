---
document_id: sales-crm-guide
version: "1.1"
language: en
status: draft
visibility: public
product_id: leadbridge
updated_on: "2026-10-23"
---

# LeadBridge CRM - support guide

## Product and scope

LeadBridge is the CRM delivered by AsterByte Solutions for BrightPath Services. It tracks inquiries, ownership, follow-ups and sales stages. This guide explains the main workflows and support checks.

## Roles and workflows

- **Sales representative:** Works on assigned leads, records activity and manages follow-up tasks.
- **Sales manager:** Assigns leads, reviews team pipeline and resolves ownership issues.
- **Administrator:** Manages roles, imports, integrations and permitted exports.

The default pipeline is New, Contacted, Qualified, Proposal sent, Negotiation, Won and Lost. A stage describes sales progress; it does not prove an invoice was paid or a contract signed. Store an amount and expected closing date only when provided or confirmed.

### Add and qualify a lead

1. Search by contact or company before creating a record.
2. Select Leads, then New lead. Enter name, company, contact channel and inquiry summary.
3. Set an owner and record the source. Collect only the information needed for follow-up.
4. Save and verify the returned lead reference.
5. Add requirements, approximate budget, preferred timeline and a next action as they become known.

### Follow up and update stages

Open the lead, add a note describing the conversation, and create a task with an owner and due date. Use Asia/Kolkata for the team's local dates. A completed call and a completed follow-up task are different records.

Move a lead only when the stage's event happened. Mark Proposal sent after actual sending is confirmed. Mark Won after the authorized team confirms acceptance. Record a Lost reason without erasing the lead's history.

### Imports and duplicate review

An authorized admin maps CSV columns, previews validation results and reviews likely duplicate contacts before confirming the import. Email or phone similarity is a review signal, not proof two people are the same. Merge only through an authorized workflow that preserves history; the agent cannot merge records from a caller's request alone.

### Reports

Pipeline value reflects entered deal amounts in the selected stages. Closed-won value is not automatically recognized revenue. Filters, owner access, time ranges and timezone can change the report. Exports require explicit permission.

## Troubleshooting reference

Use these checks to narrow down the issue. Record the outcome before deciding whether a fix or engineering escalation is needed.

| Issue ID | Symptom | Checks and next step | Expected result / escalation |
| --- | --- | --- | --- |
| CRM-001 | A lead is missing | Check search text, owner, stage and date filters. Confirm the signed-in user's access; search by reference if available. | Restore visibility if a filter was responsible. Escalate an authorized missing record with its reference. |
| CRM-002 | A save fails | Review validation errors and required fields. Confirm permitted access and connection, then inspect whether the record already saved before retrying. | A valid change saves once. Stop on uncertain status to avoid duplicates. |
| CRM-003 | A lead appears twice | Compare references and activity history. Ask a manager to review duplicate status. | Preserve both histories until an authorized merge is completed. Do not delete either record as a first response. |
| CRM-004 | A follow-up is overdue or absent | Check task owner, due date, timezone, completion state and filters. | Correct task visibility or scheduling. Reminder delivery needs separate provider evidence. |
| CRM-005 | Pipeline totals look wrong | Check stages, date basis, owner filters, currency and empty or duplicate deal amounts. | Explain the report inputs. Persistent calculation mismatches go to engineering with a redacted example. |
| CRM-006 | CSV import reports rejected rows | Review required column mappings and the row validation report. Correct a small sample and preview again. | Only valid, reviewed rows proceed. Do not repeatedly import the full file or overwrite records blindly. |
| CRM-007 | Email is not received | Confirm whether the send operation was accepted, then have support check delivery status and configured sender details. | Distinguish saved activity, accepted send and actual delivery. Avoid duplicate sends while state is uncertain. |

## Limitations and support handoff

LeadBridge supports one organization and INR deal amounts in its current release. Accounting, payroll, billing, marketing campaigns, automatic prospect scraping and offline editing are outside the first release. Integrations are available only when separately implemented and configured. The CRM does not guarantee sales outcomes.

Before retrieving private data, verify the caller's identity and organization/project access through the application. A supplied email, phone number or lead reference is only a lookup hint.

For escalation, capture the lead/task reference, affected role, timestamp, exact visible message, recent action and whether others are affected. Keep client lists and full CSV exports out of public knowledge. Organization-wide inability to save or suspected data exposure is P1; a limited issue with a workaround is normally P2. See [support policies](support-policies.md).
