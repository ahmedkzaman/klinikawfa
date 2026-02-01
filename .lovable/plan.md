

# Update Doctor Profile Wording

## Summary
Change the doctor bio text from "specialist" phrasing to "special interest / vast experience" phrasing for a more humble and accurate representation.

---

## Changes Required

### File: `src/pages/Doctors.tsx`

**Doctor 1 (Dr. Ahmad) Bio Updates:**

| Field | Current Text | New Text |
|-------|-------------|----------|
| `bioMs` (line 33) | "Beliau **pakar dalam pembedahan minor**..." | "Beliau mempunyai **minat khusus dan pengalaman luas dalam pembedahan minor**..." |
| `bioEn` (line 34) | "He **specializes in** minor surgeries..." | "He has a **special interest and vast experience in** minor surgeries..." |

---

## Updated Text (Full)

**Malay (bioMs):**
> "Dr. Ahmad merupakan doktor berpengalaman lebih 15 tahun dalam bidang perubatan keluarga. Beliau mempunyai minat khusus dan pengalaman luas dalam pembedahan minor termasuk pembuangan ketumbuhan, rawatan ketuat, dan prosedur khatan. Pendekatan beliau yang mesra dan teliti menjadikan pesakit selesa sepanjang rawatan."

**English (bioEn):**
> "Dr. Ahmad has over 15 years of experience in family medicine. He has a special interest and vast experience in minor surgeries including lump removal, wart treatment, and circumcision procedures. His friendly and thorough approach ensures patients feel comfortable throughout their treatment."

---

## Technical Details

- **File:** `src/pages/Doctors.tsx`
- **Lines affected:** 33-34
- **No structural changes** - only text content update
- **Both languages updated** for consistency

