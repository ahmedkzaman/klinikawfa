# Doctor Clinical Activity Insight Design

## Objective

Add a doctor-level clinical activity report to Clinic Insight so authorised users can:

- compare procedure and document activity across doctors;
- expand one doctor to see the underlying records;
- identify exactly which procedures were performed and which MCs, quarantine letters, and referral letters were issued; and
- export the same information for further review.

The report is informational. It does not alter consultations, treatments, documents, billing, or doctor assignments.

## Placement and interaction

The report appears in **Clinic → Insight → Scoreboards** under the existing Doctor Performance section.

The summary is an expandable table. Each row represents one treating doctor and contains:

- doctor name;
- procedures;
- MC;
- quarantine letters;
- referral letters; and
- total included documents.

Rows are collapsed initially. Clicking a doctor row expands it in place without navigating away from Insight. Only one doctor needs to be expanded at a time.

The expanded area contains:

1. **Procedures**
   - activity date;
   - procedure name;
   - patient name;
   - queue number; and
   - a link to the completed visit.
2. **Documents**
   - issue date;
   - document type;
   - saved template/document name;
   - patient name;
   - queue number; and
   - a link to the completed visit.

The existing Insight date-range selector controls the report. The report supports the existing quick ranges and the maximum one-year custom range.

Two CSV actions are available:

- export all doctors for the selected period; and
- export the currently expanded doctor.

## Attribution rules

All activity is credited to `consultations.doctor_id`, the treating doctor assigned to the consultation.

`consultation_documents.created_by` is not used for doctor attribution because documents can be generated or printed by dispensary or front-desk staff on the treating doctor's behalf.

If a qualifying record has no assigned doctor, it appears under **Unassigned** rather than being silently excluded.

The displayed doctor name comes from the current profile associated with the consultation's `doctor_id`. Historical rows retain their doctor ID even if the display name later changes.

## Procedure definition

A performed procedure is an active `consultation_items` row whose linked service is classified in the clinic service catalogue with category **Procedure**.

Rules:

- include only completed consultations;
- exclude rows where `consultation_items.deleted_at` is not null;
- exclude deleted consultations;
- exclude medication, package, laboratory, general-service, and free-text rows that are not linked to a Procedure-category service;
- attribute the procedure to the consultation's treating doctor;
- use the consultation/visit date for date-range filtering;
- count each active procedure line once, regardless of its billing quantity; and
- retain separate records if more than one procedure line was deliberately added to one consultation.

This avoids classifying an item as a procedure merely because its name contains words such as “procedure”, “service”, or “fee”.

## Document definition

An included document is a `consultation_documents` row with a normalised type of:

- `mc`;
- `quarantine`; or
- `referral`.

Rules:

- include only documents linked to completed consultations;
- attribute the document to the treating doctor of its linked consultation;
- use `consultation_documents.created_at` as the issue date and date-range filter;
- count each saved document record once;
- preserve the stored `template_name` for the detailed list;
- exclude other document types such as time slips, memos, prescriptions, consent forms, lab requests, and generic “other” documents; and
- do not infer type from free-text content.

`Total documents` is exactly `MC + quarantine + referral`.

## Data access and security

The report must enforce the same server-side authorisation boundary as Clinic Insight. Hiding the tab in the frontend is not sufficient.

The reporting endpoint must:

- require an authenticated user;
- verify the user's effective permission to view Clinic Insight;
- return only the fields required by this report;
- avoid returning IC numbers, addresses, phone numbers, clinical notes, or document contents;
- use an explicit `search_path` if privileged execution is necessary;
- revoke default `PUBLIC` execution on any privileged function; and
- grant access only to the intended authenticated role after the internal permission check.

The endpoint returns summary and detail records for the selected date range. Client-side code groups and renders the records but does not broaden access.

## Data flow

1. Insight supplies the selected start and end dates.
2. A dedicated query hook requests doctor clinical activity for that inclusive local date range.
3. The server validates the Insight permission and gathers:
   - qualifying procedure rows;
   - qualifying document rows;
   - treating doctor identity;
   - patient display name;
   - queue entry identifiers and queue metadata.
4. The hook aggregates summary counts by doctor and retains detail rows keyed by doctor.
5. The Scoreboards table renders collapsed summary rows.
6. Clicking a row reveals that doctor's already-loaded detail, avoiding another database request.
7. CSV export uses the same normalised dataset shown on screen.

## Loading, empty, and error states

- While loading, show a table-shaped skeleton.
- If no qualifying activity exists for the period, show: **No doctor clinical activity in this period.**
- A doctor with only documents or only procedures still appears.
- Missing doctor assignments appear under **Unassigned**.
- Missing patient names use **Unknown patient**.
- Missing saved document names fall back to the human-readable document type.
- Query failure shows a contained error card without breaking the rest of Scoreboards.
- CSV actions are disabled while loading or when there are no matching records.

## Performance

- The date range remains capped at one year.
- Filter procedure and document sources by date before returning rows.
- Add or verify indexes for the date and join columns used by the report.
- Fetch only required fields.
- Do not include document bodies or consultation notes.
- Summary and detail use one normalised response so expanding a doctor is immediate.

## Testing and verification

Automated tests must cover:

- activity is attributed to `consultations.doctor_id`, not `created_by`;
- each supported document type is classified correctly;
- unsupported document types are excluded;
- Procedure-category service items are included;
- medication, package, lab, general-service, and misleading free-text items are excluded;
- soft-deleted items and consultations are excluded;
- inclusive date boundaries use the intended local clinic dates;
- unassigned doctors are preserved;
- summary counts equal their detail-row counts;
- `Total documents = MC + quarantine + referral`;
- expanding a doctor displays only that doctor's records;
- visit links target the correct queue entry;
- all-doctor and single-doctor CSV exports match the visible dataset; and
- unauthorised users cannot call the reporting endpoint.

Before release:

- run focused unit and component tests;
- run the production build;
- query production-safe aggregate counts and compare them with Insight;
- test at least one doctor with both procedures and documents;
- test empty and unassigned states; and
- run Supabase security and performance advisors after database changes.

## Out of scope

This version does not:

- score clinical quality or appropriateness;
- rank doctors as better or worse;
- include document contents or medical notes;
- count time slips, prescriptions, memos, consent forms, or lab requests;
- change historical doctor assignments;
- infer procedures or document types from free text; or
- introduce a separate doctor report page.
