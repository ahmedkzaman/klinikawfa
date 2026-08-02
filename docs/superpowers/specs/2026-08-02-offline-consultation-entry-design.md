# Offline Consultation Entry and Doctor Approval

## Goal

Allow operations staff to transcribe consultation records captured while internet access was unavailable, while preserving the identity of the actual consulting doctor and requiring later clinical approval. A pending approval must not prevent the normal dispensary or payment workflow.

## Scope

- Add an `Enter offline consultation` action for users whose effective role is `ops_staff`.
- The action is available for an existing patient visit and does not create an unrelated patient or duplicate queue visit.
- Staff must select the actual consulting doctor and original consultation date and time.
- Staff may enter the existing consultation content supported by the doctor form: clinical notes, all diagnoses, treatment items, dispense notes, and clinical attachments.
- Offline consultations use the normal dispensary and checkout flow while doctor approval is pending.
- The selected doctor or a doctor administrator may approve the record or return it for correction.
- This feature does not allow operations staff to approve clinical content, impersonate a doctor, or edit an approved clinical record.

## Roles and Authorization

The server derives roles from protected role records rather than client-provided metadata.

- `ops_staff` may create an offline consultation and edit it only while its approval state is `pending` or `returned`.
- The selected consulting doctor may read, approve, or return the record.
- `doctor_admin` may read, approve, or return any offline consultation as a fallback.
- Existing clinical read permissions remain in effect for other users.
- Locum behavior and permissions are unchanged.
- Individual permission overrides must not silently grant this clinical transcription workflow; it is restricted to the `ops_staff` role unless a later requirement explicitly broadens it.

All privileged writes run through focused security-definer RPCs with fixed search paths, explicit role checks, row locking, and revoked direct execution for anonymous users. Direct table policies remain least privilege.

## Data Model

Extend `consultations` with server-controlled provenance and approval fields:

- `entry_source`: `live` or `offline_transcription`, defaulting to `live`.
- `entered_by`: authenticated user who created the offline transcription.
- `original_consulted_at`: staff-supplied date and time of the actual consultation.
- `approval_status`: `not_required`, `pending`, `returned`, or `approved`.
- `approved_by` and `approved_at`.
- `returned_by`, `returned_at`, and `return_reason`.

The consultation's existing `doctor_id` remains the authoritative consulting doctor. `entered_by` is separate and can never be presented as the attending doctor.

Add an immutable `consultation_approval_audit` table containing consultation ID, action, actor, timestamp, optional reason, and a bounded clinical snapshot or change summary. Authenticated users cannot update or delete audit rows directly.

Existing consultations are backfilled as `live` and `not_required`; their behavior does not change.

## Workflow

### Entry

From the Consultation page, operations staff selects `Enter offline consultation`, chooses an existing visit, selects the consulting doctor, supplies the original consultation time, and enters the clinical record. Saving creates or updates one consultation for that visit with `entry_source = offline_transcription` and `approval_status = pending`.

The database records the authenticated staff member as `entered_by`; the client cannot choose or override this value. The database also verifies that the selected doctor is an active doctor profile with an eligible clinical role.

### Pending and Returned Editing

Pending records display:

- `Pending doctor approval`;
- `Consulting doctor: Dr. <name>`; and
- `Entered by: <staff name> on <timestamp>`.

Operations staff may correct pending records. If a doctor returns a record, a reason is mandatory and is shown to the entering staff. Editing and resubmitting a returned record moves it back to `pending` and writes an audit event.

Changing the consulting doctor after initial save requires an explicit confirmation and produces an audit event. It is allowed only before approval.

### Approval

The selected doctor and doctor administrators receive an approval panel when opening a pending record. They may:

- approve the record; or
- return it with a required correction reason.

Approval locks operations-staff clinical edits, records the approving user and time, and adds an immutable audit event. Approval does not rewrite `doctor_id`: the selected consulting doctor remains the clinical attribution even when a doctor administrator performs fallback approval.

### Dispensary and Payment

Pending or returned approval states do not block navigation to dispensary, item dispensing, payment recording, or checkout. Existing billing permissions continue to govern those actions.

The consultation's clinical approval state is independent of its operational completion status. Checkout must not automatically mark an offline consultation as clinically approved.

## User Interface

Reuse the existing consultation editor and treatment components to avoid creating a second clinical form with divergent behavior. Offline-entry mode adds a compact provenance section above the notes containing the doctor selector, original consultation date/time, status badge, entering staff identity, and return reason when present.

The doctor selector lists active doctor profiles and is mandatory. The primary action reads `Save for doctor approval`; returned records use `Resubmit for approval`.

Approved records show a read-only approval line with the approver and timestamp. Operations staff sees approved clinical fields as read-only. Existing doctor editing rules are not broadened by this feature.

## Attachments and Diagnoses

Offline entry uses the existing multi-diagnosis relation so every diagnosis is retained and displayed in completed-visit views. Clinical attachments use the existing private clinical storage path and authorization checks.

Attachment upload and removal follow the same pending/returned edit boundary as the consultation. Once approved, operations staff cannot add or remove attachments. Attachment audit events record metadata only, not file contents.

## Concurrency and Error Handling

- Creation locks the visit and rejects a second consultation for the same visit.
- Approval, return, resubmission, doctor reassignment, and staff edits lock the consultation and validate its current approval state.
- A stale edit receives a clear message that the record changed and must be reloaded.
- Inactive or missing doctor profiles are rejected before saving.
- Failed attachment uploads do not silently mark the consultation as submitted.
- A returned record cannot be resubmitted without preserving the doctor's return reason in audit history.
- Approval is rejected if the record is no longer pending.

## Reporting and Display

Patient visit history, Completed Today, consultation history, and clinical activity reports continue to attribute the visit to `consultations.doctor_id`. They may display an `Offline entry` indicator but must not count the entering staff member as the doctor.

Pending approval records are included in ordinary operational and financial reports according to their existing visit and payment status. Approval status is clinical provenance, not a billing filter.

## Tests

Add failing tests first for:

- operations staff can create an offline consultation for an existing visit;
- the server records `entered_by` from `auth.uid()` and rejects client impersonation;
- doctor selection and original consultation time are required;
- an ineligible or inactive doctor cannot be assigned;
- all diagnoses, treatment items, notes, and attachments are retained;
- operations staff can edit pending and returned records but not approved records;
- only the selected doctor or doctor admin can approve or return;
- return requires a reason and resubmission restores `pending`;
- approval and return events are immutable and auditable;
- pending and returned consultations can proceed through dispensary and payment;
- checkout never changes clinical approval status;
- reporting attributes activity to the selected doctor, not the entering staff member;
- locum permissions are unchanged;
- duplicate consultation creation and stale concurrent updates are rejected;
- existing live consultations retain their current behavior.

Run focused component, hook, migration-contract, and permission tests, followed by the full unit suite, type checking, linting, and production build.

## Deployment

Deploy the additive database migration before or together with the compatible application build. New columns have defaults so the current application remains functional during rollout. After deployment, verify with an operations-staff account and a doctor account that entry, dispensary, checkout, return, resubmission, and approval work, and verify that a locum cannot access the workflow.

