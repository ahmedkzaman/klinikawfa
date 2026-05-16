# Clinic Profile — single source of truth for clinic identity

## Goal

Create one settings page where admins set the **clinic name, address, phone, and email**. Every printed artefact (drug labels, MC/letters, invoices, POs, letterhead) reads from this single record. No more hard-coded `CLINIC_INFO` strings or per-page preview constants drifting apart.

## What exists today

- The `clinic_settings` table **already has the right columns**: `clinic_name`, `address_line_1`, `address_line_2`, `phone`, `email`. No schema change needed.
- `useClinicSettings()` already reads/updates that row (admin-only via RLS).
- `DocumentSettings.tsx` (Document & Print) currently *also* edits name/address/phone/email — mixed in with letterhead styling. That's part of the confusion.
- `printDrugLabel.ts` and the preview in `DrugLabelSettings.tsx` ignore `clinic_settings` entirely and use hard-coded constants (`CLINIC_INFO` and a local `PREVIEW` object) — that's why the addresses don't match.

## Changes

### 1. New page: `Clinic Profile`

- File: `src/pages/clinic/settings/ClinicProfile.tsx`
- Route: `/clinic/settings/clinic-profile` (registered in `App.tsx`)
- Admin-only (same gate as Document & Print).
- Fields, all bound to `useClinicSettings().update`:
  - Clinic Name
  - Address Line 1
  - Address Line 2
  - Phone
  - Email
- Single "Save changes" button, toast on success/error, dirty-state guard.
- Small live preview card showing how the address block will appear on a drug label.

### 2. Settings index card

- Add a new card in `SettingsPage.tsx` titled **"Clinic Profile"** with description *"Clinic name, address, phone and email used on all printed documents and labels."*
- Place it first (above General Preferences) since everything else depends on it.

### 3. Remove duplication from Document & Print

- In `DocumentSettings.tsx`, remove the Clinic Name / Address / Phone / Email inputs (they now live in Clinic Profile). Keep only letterhead styling: logo, logo height, letterhead text size, content margin, SST number, bank details.
- Add a small "These come from **Clinic Profile** → edit there" hint with a link, so users aren't confused by their disappearance.

### 4. Wire drug labels to `clinic_settings`

- `src/lib/clinic/printDrugLabel.ts`: change `generateDrugLabelPdf()` signature to accept a `clinic` object (`{ name, addressFull, phone }`) and use it instead of importing `CLINIC_INFO`. The address `full` becomes `[address_line_1, address_line_2].filter(Boolean).join(', ')`.
- All call sites of `generateDrugLabelPdf` (find via search): fetch settings via `useClinicSettings()` and pass them in.
- `src/pages/clinic/settings/DrugLabelSettings.tsx`: replace the local `PREVIEW` constant's name/address/phone with values from `useClinicSettings()` so the preview always matches what will actually print. Keep the dummy patient/medication data as it is — those are just preview filler.

### 5. Audit other printed artefacts

Quick pass to confirm they already read from `clinic_settings` (they should, via letterhead). Files to spot-check:

- `src/lib/clinic/printDocument.ts` (consultation docs — MC, referral, etc.)
- `src/lib/clinic/paperStyle.ts` (letterhead renderer)
- Invoice / PO print paths
If any still reference `CLINIC_INFO` for letterhead text, swap to `useClinicSettings()` data in the same pass.

### 6. Keep `CLINIC_INFO` for the **public marketing site only**

- `src/lib/constants.ts` `CLINIC_INFO` continues to serve the public website (Footer, MapSection, SEO schema, Hero). Those don't run inside the authenticated app and shouldn't hit the DB on every page load.
- Add a top-of-file comment in `constants.ts`: *"Public marketing site only. For clinic-app printing/labels, use `useClinicSettings()` — that's the editable source of truth."*
- One-time: make sure the address string in `CLINIC_INFO` matches whatever the user enters in Clinic Profile so footer and labels agree. (We'll ask the user for the correct address before flipping.)

## Out of scope

- No DB migration (columns already exist).
- No change to `drug_label_settings` toggles — those still control *which rows appear*, independent of *what they say*.
- No bilingual editing of the address (single canonical string for now).

## Open question before implementation

Which address is the **correct** one to seed into `clinic_settings` and `CLINIC_INFO`?

`B2 & B4, Jalan KS 1/12, KotaSAS Avenue, 25200 Kuantan, Pahang` (current `constants.ts`)