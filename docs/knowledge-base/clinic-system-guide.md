---
document_id: clinic-system-guide
version: "1.1"
language: en
status: draft
visibility: public
product_id: clinicflow
updated_on: "2026-10-23"
---

# ClinicFlow appointment system - support guide

## Product and scope

ClinicFlow is the appointment management system delivered by AsterByte Solutions for ClearCare Clinic. This guide covers reception workflows, doctor schedules, appointment status and common support checks.

The first release covers doctor availability, appointments, reception check-in, booking status and daily operational summaries. It is an administrative scheduling product, not a diagnosis tool, emergency service or complete electronic health-record system.

## Roles and features

- **Receptionist:** Search permitted patient contact records, create appointments, reschedule, cancel and check in visitors.
- **Doctor:** View their own schedule and update appointment completion status.
- **Clinic administrator:** Manage staff access, doctor hours, appointment durations and permitted reports.

Appointments use Scheduled, Checked in, Completed, Cancelled and No-show statuses. Cancelled appointments remain in history. Email or SMS reminders exist only if the relevant provider is configured; sending and delivery are separate outcomes.

The clinic uses India Standard Time, Asia/Kolkata. Confirm the date and time aloud when discussing a booking.

## Common workflows

### Create an appointment

1. An authorized receptionist searches for an existing contact before creating another record.
2. Open Appointments, choose New appointment, and select the doctor, date and an available slot.
3. Confirm the contact details and appointment reason using the minimum necessary information.
4. Save once and check for a confirmation and appointment reference.

Only say the appointment is booked after the operation actually succeeds. This guide cannot establish live slot availability.

### Reschedule or cancel

Open the appointment by its reference, check current status, select Reschedule or Cancel, confirm the intended change and save. Check the saved result before repeating. A failed notification does not prove that the appointment change failed.

### Check in and complete

Reception changes Scheduled to Checked in when the visitor arrives. The authorized doctor marks the appointment Completed. A mistaken status needs an authorized correction; do not delete the appointment to hide the history.

## Troubleshooting reference

Start with these diagnostic checks. Confirm the cause before marking an issue resolved, and escalate when the symptoms persist or the steps do not fit the affected version.

| Issue ID | Symptom | Checks and next step | Expected result / escalation |
| --- | --- | --- | --- |
| CLIN-001 | No slots appear | Check doctor, date, clinic timezone and active filters. Ask the clinic admin to review working hours and leave. | Slots appear if configuration was the cause. If valid hours still produce no slots, report the doctor/date and scope of impact. |
| CLIN-002 | A slot becomes unavailable during booking | Refresh availability and inspect whether another appointment already occupies it. Offer a different confirmed slot. | Avoid a double booking. If two confirmed appointments share one exclusive slot, escalate with both references. |
| CLIN-003 | Save seems stuck or a confirmation is missing | Check the appointment list for the reference before clicking Save again. Record the time and visible message. | Prevent duplicate creation. If state is uncertain, stop retries and contact support. |
| CLIN-004 | Reminder was not received | Confirm the saved appointment exists, contact details are correct and reminders are enabled. An authorized support engineer checks provider status. | Do not create another appointment. Escalate confirmed send failures with the appointment reference. |
| CLIN-005 | An appointment looks missing | Check doctor, date, status filters, timezone and role permissions. Search by appointment reference. | If absent with correct access and filters, report possible missing data; do not recreate or delete records blindly. |
| CLIN-006 | Access denied | Check the signed-in account and ask the clinic admin to review assigned access. | Legitimate permissions are restored by an authorized admin. Never bypass the role check or share another person's login. |

## Known limitations and escalation

The first release supports one clinic location, configurable doctor schedules and basic reports. It excludes insurance claims, prescriptions, clinical decisions, offline synchronization and external hospital integrations unless separately scoped. Do not claim a health-data compliance certification.

Collect the appointment reference, affected role, approximate time, visible error and whether the issue affects one person or the clinic. Avoid patient medical details in a general support conversation. Screenshots should redact unrelated names and contact information.

Clinic-wide booking failure may be P1 under [support policies](support-policies.md). A single-user issue with a workaround is usually P2. Suspected record exposure or loss is P1. Technical support must not advise on medical emergencies; direct those to the clinic's established emergency procedure.
