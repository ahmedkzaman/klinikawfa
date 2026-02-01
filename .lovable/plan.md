
# Apply "Specialist/Pakar" Wording Updates (Excluding #4)

## Summary
Update terminology from "specialist/pakar" to "special interest/pengkhususan" across 3 files, skipping the serviceContent.ts changes as requested.

---

## Changes to Apply

### 1. HeroCarousel.tsx (Lines 37-38)

**Slide 3 Title Updates:**

| Field | Current | New |
|-------|---------|-----|
| `titleMs` | "Pakar Minor Surgery" | "Pengkhususan Minor Surgery" |
| `titleEn` | "Minor Surgery Specialists" | "Special Interest in Minor Surgery" |

---

### 2. LanguageContext.tsx (Lines 46 & 110)

**Translation Key Updates:**

| Language | Key | Current | New |
|----------|-----|---------|-----|
| Malay (Line 46) | `why.minorSurgery` | "Pakar Minor Surgery" | "Pengkhususan Minor Surgery" |
| English (Line 110) | `why.minorSurgery` | "Minor Surgery Specialist" | "Special Interest in Minor Surgery" |

---

### 3. Doctors.tsx (Lines 47-48)

**Dr. Nurul Bio Updates:**

| Field | Current | New |
|-------|---------|-----|
| `bioMs` | "...dengan **kepakaran khusus** dalam penjagaan telinga..." | "...dengan **minat khusus dan pengalaman luas** dalam penjagaan telinga..." |
| `bioEn` | "...with **specialized expertise** in ear care..." | "...with a **special interest and vast experience** in ear care..." |

---

## Skipped (As Requested)

- **serviceContent.ts** - Return to Work Assessment benefits (keeping "Specialist referral" / "Rujukan pakar")

---

## Technical Details

- **Files affected:** 3
- **Total text changes:** 6 (2 per file)
- **No structural changes** - only text content updates
- **Both BM and EN versions updated** for consistency
