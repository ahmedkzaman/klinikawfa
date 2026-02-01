
# Improve Gallery Upload with Category Selector

## Overview
Replace the free-text "Tags" input in the gallery upload dialog with a clear category selector, so admins immediately know where each image will appear on the website.

---

## Current Problem

The current upload dialog shows:
- A free-text "Tags (comma separated)" input
- Users must remember the exact tag values (e.g., "waiting", "treatment")
- No visual indication of which gallery section the image will appear in

---

## Solution

Replace the tags input with a checkbox-based category selector that shows:
- Clear category names in both languages
- Multiple categories can be selected (an image can appear in multiple sections)
- Visual indication of where the image will appear

---

## New Upload Dialog Design

```text
+------------------------------------------+
|  Upload Image                            |
|  Select an image to upload to gallery    |
+------------------------------------------+
|                                          |
|  Image *                                  |
|  [Choose File] No file chosen            |
|                                          |
|  Alt Text                                 |
|  [Image description...              ]    |
|                                          |
|  Category *                               |
|  Where will this image appear?           |
|                                          |
|  [ ] Waiting Area & Kids Zone            |
|  [ ] Treatment Rooms                      |
|  [ ] Clinic Exterior                      |
|  [ ] Staff & Team                         |
|                                          |
|           [Cancel]  [Upload]             |
+------------------------------------------+
```

---

## Technical Changes

### File to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/GalleryManagement.tsx` | Replace tags input with category checkboxes |

### Implementation Details

1. **Import GALLERY_CATEGORIES** from the existing hook to ensure consistency

2. **Update form state** to track selected categories:
```typescript
const [uploadForm, setUploadForm] = useState({
  file: null as File | null,
  altText: '',
  selectedCategories: [] as string[], // Array of category IDs
});
```

3. **Replace tags input** with checkboxes for each category (excluding "all"):
```typescript
{GALLERY_CATEGORIES.filter(cat => cat.id !== 'all').map((category) => (
  <label key={category.id} className="flex items-center gap-2">
    <Checkbox
      checked={uploadForm.selectedCategories.includes(category.id)}
      onCheckedChange={(checked) => toggleCategory(category.id, checked)}
    />
    <span>{language === 'ms' ? category.labelMs : category.labelEn}</span>
  </label>
))}
```

4. **Convert selected categories to tags** when saving:
```typescript
// Get all tags from selected categories
const tags = uploadForm.selectedCategories.flatMap(catId => {
  const category = GALLERY_CATEGORIES.find(c => c.id === catId);
  return category ? [category.id] : []; // Use category ID as the main tag
});
```

5. **Update existing images display** to show category names instead of raw tags

---

## User Experience Improvements

| Before | After |
|--------|-------|
| Free text: "waiting, kids" | Checkbox: Waiting Area & Kids Zone |
| Must remember exact tags | Clear visual categories |
| No validation | At least one category required |
| Raw tags shown on hover | Category names shown on hover |

---

## Validation

- Require at least one category to be selected
- Show validation message if no category is chosen

---

## Impact on Existing Images

- Existing images with tags will continue to work
- The filtering logic already handles the tag matching
- New uploads will use consistent category-based tags
