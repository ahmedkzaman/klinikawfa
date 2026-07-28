# Cross-Doctor Consultation Notes: Read-Only Access

## Goal

Allow `resident_doctor` and `doctor_admin` users to find and open completed consultations attended by other doctors, including consultations from earlier dates, and read their clinical notes. Cross-doctor access must be read-only. Locum users must remain limited to their own assigned consultations.

## Scope

- The existing Consultation page remains the entry point.
- A date picker on the Consultation page defaults to today's local clinic date.
- The date picker is visible to all clinic roles except `locum`.
- The Consultation list route is opened to authenticated clinic staff other than `locum`, but the consultation-detail route retains its stricter clinical authorization.
- Resident doctors and doctor admins see:
  - their own active consultation queue entries; and
  - completed consultation queue entries for every doctor on the selected date.
- When today is selected, the `Completed` tab contains all completed consultations available to those roles and the `All` tab combines their own active consultations with all completed consultations.
- When an earlier date is selected, the list is an archive of completed consultations from that date; active workflow actions are not shown.
- Opening another doctor's completed consultation displays the existing consultation detail in an explicit read-only mode.
- On the Patients page, a permitted doctor can open the exact consultation associated with a row in the patient's Visit History.
- Non-doctor, non-locum staff may use the date picker and see only the ordinary queue or visit information already permitted to their role. They do not receive clinical-note links or clinical-note content.
- No new archive page, new clinical fields, or cross-doctor access to active consultations is included.

## Authorization

Cross-doctor completed-note access is granted only to:

- `resident_doctor`
- `doctor_admin`

The application determines ownership by comparing the current doctor's ID with the consultation's attending or assigned doctor ID.

Cross-doctor clinical-note links and content are not granted to any other role, including general administrators, operations staff, nurses, purchasers, or staff accounts, unless that account's effective role is exactly `resident_doctor` or `doctor_admin`.

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
- completed entries from all doctors on the selected date are added for `resident_doctor` and `doctor_admin`;
- duplicates are removed by queue-entry ID;
- selecting a past date excludes active queue entries and active workflow actions;
- the selected date is interpreted in the clinic's local timezone and defaults to today whenever the page is opened;
- locum behavior remains unchanged.

The Consultation navigation item and route guard will allow non-locum clinic staff to reach the dated list. For those non-doctor roles, list rows expose only the existing operational visit metadata and do not link to consultation detail. The detail route remains restricted to clinical roles and repeats the cross-doctor permission check.

The consultation detail page will derive `isReadOnlyCrossDoctor`. When true, it will render a visible read-only notice and replace editable fields with disabled or non-editable presentation. All mutation handlers and automatic creation effects will also guard against execution, so read-only safety does not rely only on disabled buttons.

The Patients page Visit History will expose a `View consultation` action only when:

- the visit has an associated consultation; and
- the current role is `resident_doctor` or `doctor_admin`.

The action navigates to the existing consultation-detail route using that visit's queue-entry ID. The destination repeats the authorization and ownership checks instead of trusting the source page.

## Database Design

Add a focused Supabase migration for consultation read access. The policy will allow a resident doctor or doctor admin to select:

- consultations assigned to their own doctor profile; or
- consultations with completed status.

Locums may select only consultations assigned to their own doctor profile. Existing broader administrator access remains unchanged where already required by the application.

The policy will use server-controlled role records and doctor-profile ownership, not user-editable metadata. Update, insert, and delete policies will not be broadened by this feature.

Queue-entry visibility will be reviewed because the Consultation list is sourced from `queue_entries`. The application query will request the selected local-date range and remain role-scoped. The consultation policy remains the authoritative protection for clinical notes, including requests made through nested queue-entry joins.

## Error Handling

- A direct URL to an unavailable consultation shows an access-denied or not-found state without leaking clinical content.
- A failed read shows the existing load error treatment.
- Any attempted mutation while in cross-doctor read-only mode is rejected before reaching Supabase.
- A selected date with no completed consultations shows the existing empty-list treatment.
- Invalid date input falls back to today's local clinic date rather than issuing an unbounded query.

## Tests

Add failing tests first for:

- resident doctor can list and view another doctor's completed consultation;
- doctor admin can list and view another doctor's completed consultation;
- resident doctor and doctor admin can list completed consultations on a selected earlier date;
- the date picker defaults to today's local date on page entry;
- locum does not see or use the date picker;
- non-doctor staff cannot receive cross-doctor clinical-note content;
- non-locum clinic staff can open the dated Consultation list without receiving a consultation-detail link;
- resident doctor cannot list another doctor's active consultation;
- locum cannot list or view another doctor's completed consultation;
- another doctor's consultation is read-only;
- the attending doctor's own consultation retains its existing edit behavior;
- read-only mode blocks mutation and automatic-creation paths;
- eligible doctor roles receive a Visit History link to the exact consultation;
- ineligible roles do not receive the Visit History link;
- direct navigation repeats the authorization check;
- the migration grants only the intended SELECT access and does not broaden write policies.

Run the focused tests, the broader clinic permission tests, type checking, and the production build before deployment.

## Deployment

Commit the application and migration changes together, push them through the repository's normal deployment workflow, confirm the production workflow succeeds, and verify the live Consultation page using both an allowed doctor role and a locum-denied case where test accounts are available.
