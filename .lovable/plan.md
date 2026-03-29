

## Replace Company Policy with Actual POLISI KSB 2025

### What
Replace the placeholder English company policy in the onboarding Step 4 with the actual content from the uploaded `POLISI_KSB_2025.pdf` — the official Kumpulan Ikram Health Terengganu Sdn Bhd company policy document, in its original Malay language.

### Changes

**Edit: `src/components/staff/onboarding/CompanyPolicyView.tsx`**

Replace the entire hardcoded policy content inside the scrollable div with the full PDF content structured as follows:

1. **Cover**: Company name, "POLISI SYARIKAT 2025"
2. **Pendahuluan** (Introduction) — welcome message from Dr. Ahmed
3. **Latar Belakang** — clinic background, vision, mission, values
4. **Budaya & Nilai Pekerja** — employee culture and values
5. **Bahagian 1: Terma dan Syarat Am Pekerjaan** — 23 sections covering:
   - Employment categories, probation, salary, EPF/SOCSO, attendance recording, working hours, shifts (clinical S1/S2, admin), rest days, resignation notice, overtime (Akta Kerja formula), health screening
6. **Bahagian 2: Faedah-Faedah Pekerjaan** — sick leave table, annual leave table (by position & tenure), maternity (98 days), paternity (7 days), compassionate leave, wedding leave, emergency leave, hajj leave, public holidays (11 days), uniform, death benefit (RM500/RM250)
7. **Bayaran Balik Dalam Perkhidmatan** — travel claims (car RM0.50/km, motorcycle RM0.30/km), accommodation rates
8. **Undang-Undang dan Peraturan Kerja** — dress code (male/female), visitor policy, parking, lost & found, workplace conduct
9. **Salahlaku** — minor and major misconduct lists
10. **Gangguan Seksual** — sexual harassment policy, categories, reporting steps, disciplinary action
11. **Prosedur Disiplin/Tatatertib** — warning letters progression, internal investigation, punishment types
12. **Latihan dan Pembangunan Kerjaya** — training categories (internal, external, OJT)

All content in original Malay with proper HTML structure (headings, lists, tables). Tables for shift schedules, leave entitlements, EPF rates, travel claims, and accommodation rates will be preserved as `<table>` elements.

The acknowledgement checkbox and "Complete Onboarding" button remain unchanged.

### Single file change
- **Edit**: `src/components/staff/onboarding/CompanyPolicyView.tsx`

