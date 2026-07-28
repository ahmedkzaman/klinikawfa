# Cross-Doctor Consultation Notes: Read-Only Access

## Goal

Allow `resident_doctor` and `doctor_admin` users to open completed consultations attended by other doctors and read their clinical notes. Cross-doctor access must be read-only. Locum users must remain limited to their own assigned consultations.

## Scope

- The existing Consultation page remains the entry point.
- Resident doctors and doctor admins see:
  - their own active consultation queue entries; and
  - completed consultation queue entries for every doctor.
- The `Completed` tab contains all completed consultations available to those roles.
- The `All` tab combines the user's own active consultations with all completed consultations.
- Opening another doctor's completed consultation displays the existing consultation detail in an explicit read-only mode.
- No new archive page, new clinical fields, or cross-doctor access to active consultations is included.

## Authorization

Cross-doctor completed-note access is granted only to:

- `resident_doctor`
- `doctor_admin`

The application determines ownership by comparing the current doctor's ID with the consultation's attending or assigned doctor ID.

For a consultation owned by another doctor, the detail page must not permit:

- editing consultation or dispensary notes;
- changing diagnoses;
- adding, editing, or removing treatment items;
- recording or changing vital signs;
- issuing, editing, voiding, or deleting documents;
- changing queue or consultation status;
- acquiring or overriding an edit lock; or
- automatically creating a consultation or seeding a consultation fee.

Locum users must not receive cross-doctor completed entries and must not be able to read another doctor's consultation through a direct database request.

## Application Design

Extract a small, testable permission helper that accepts the user's role, current doctor ID, attending doctor ID, consultation status, and queue status. It returns whether the record may be listed, viewed, and edited.

The Consultation list will build its rows as follows:

- own assigned entries are retained under the existing workflow;
- completed entries from all doctors are added for `resident_doctor` and `doctor_admin`;
- duplicates are removed by queue-entry ID;
- locum behavior remains unchanged.

The consultation detail page will derive `isReadOnlyCrossDoctor`. When true, it will render a visible read-only notice and replace editable fields with disabled or non-editable presentation. All mutation handlers and automatic creation effects will also guard against execution, so read-only safety does not rely only on disabled buttons.

## Database Design

Add a focused Supabase migration for consultation read access. The policy will allow a resident doctor or doctor admin to select:

- consultations assigned to their own doctor profile; or
- consultations with completed status.

Locums may select only consultations assigned to their own doctor profile. Existing broader administrator access remains unchanged where already required by the application.

The policy will use server-controlled role records and doctor-profile ownership, not user-editable metadata. Update, insert, and delete policies will not be broadened by this feature.

Queue-entry visibility will be reviewed because the Consultation list is sourced from `queue_entries`. If its current policy exposes more rows than the UI needs, the application query will remain role-scoped and the consultation policy will remain the authoritative protection for clinical notes.

## Error Handling

- A direct URL to an unavailable consultation shows an access-denied or not-found state without leaking clinical content.
- A failed read shows the existing load error treatment.
- Any attempted mutation while in cross-doctor read-only mode is rejected before reaching Supabase.

## Tests

Add failing tests first for:

- resident doctor can list and view another doctor's completed consultation;
- doctor admin can list and view another doctor's completed consultation;
- resident doctor cannot list another doctor's active consultation;
- locum cannot list or view another doctor's completed consultation;
- another doctor's consultation is read-only;
- the attending doctor's own consultation retains its existing edit behavior;
- read-only mode blocks mutation and automatic-creation paths;
- the migration grants only the intended SELECT access and does not broaden write policies.

Run the focused tests, the broader clinic permission tests, type checking, and the production build before deployment.

## Deployment

Commit the application and migration changes together, push them through the repository's normal deployment workflow, confirm the production workflow succeeds, and verify the live Consultation page using both an allowed doctor role and a locum-denied case where test accounts are available.
