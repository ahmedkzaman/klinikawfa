
# Stage 7: Gallery Page with Lightbox

## Overview
Transform the placeholder Gallery page into a fully functional image gallery that fetches real images from the database, supports tag-based filtering, and includes a beautiful lightbox for full-screen viewing with navigation.

---

## What Will Be Built

### Public Gallery Page Features
- **Real images from database** instead of placeholders
- **Tag-based filtering** with four categories:
  - Waiting Area and Kids Play Zone
  - Treatment Rooms
  - Clinic Exterior/Signage
  - Staff and Friendly Moments
- **Responsive grid layout** (2 columns mobile, 3 tablet, 4 desktop)
- **Full-screen lightbox** with:
  - Smooth open/close animations
  - Left/right navigation arrows
  - Keyboard support (Arrow keys, Escape)
  - Touch/swipe gestures on mobile
  - Image captions from alt text
  - Image counter (e.g., "3 of 12")

### Home Page Gallery Strip
- Update to fetch real images from database
- Show first 6 images with "View All" link

---

## Tag System

The admin can already upload images with comma-separated tags. We will use standardized tag values for filtering:

| Filter Button | Matching Tags |
|---------------|---------------|
| Waiting Area and Kids Zone | `waiting`, `kids`, `play` |
| Treatment Rooms | `treatment`, `room` |
| Clinic Exterior | `exterior`, `signage`, `entrance` |
| Staff | `staff`, `team` |

Images can have multiple tags and will appear in all matching filters.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/gallery/GalleryLightbox.tsx` | Full-screen image viewer with navigation |
| `src/components/gallery/GalleryGrid.tsx` | Filterable image grid component |
| `src/components/gallery/index.ts` | Component exports |
| `src/hooks/useGalleryImages.ts` | Custom hook for fetching gallery data |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Gallery.tsx` | Replace placeholders with real gallery components |
| `src/components/home/GalleryStrip.tsx` | Fetch real images from database |

---

## Technical Details

### Lightbox Component

The lightbox will be a custom component using Radix Dialog primitives:

```text
Features:
- DialogOverlay with black background
- Full viewport image display
- Navigation arrows (ChevronLeft/ChevronRight)
- Close button (X) in corner
- Caption at bottom
- Counter badge (e.g., "3 / 12")

Keyboard Shortcuts:
- ArrowLeft: Previous image
- ArrowRight: Next image
- Escape: Close lightbox

Touch Support:
- Swipe left/right detection
- Touch threshold of 50px
```

### Gallery Hook

```typescript
// useGalleryImages.ts
function useGalleryImages(activeTag?: string) {
  // Fetches from gallery_images table
  // Filters by tag if provided
  // Orders by display_order
  // Returns { images, loading, error }
}
```

### Filter Logic

```typescript
// Categories with their matching tags
const GALLERY_CATEGORIES = [
  { id: 'waiting', tags: ['waiting', 'kids', 'play'] },
  { id: 'treatment', tags: ['treatment', 'room'] },
  { id: 'exterior', tags: ['exterior', 'signage', 'entrance'] },
  { id: 'staff', tags: ['staff', 'team'] },
];

// Client-side filtering for instant response
// Filter images where any of image.tags intersects with category.tags
```

---

## User Experience

### Loading States
- Skeleton placeholders while images load
- Smooth fade-in when images appear

### Empty State
- Friendly message if no images match filter
- Or if gallery is empty overall

### Performance
- Images lazy-loaded with native `loading="lazy"`
- Lightbox preloads adjacent images

---

## Implementation Order

1. Create `useGalleryImages` hook
2. Build `GalleryLightbox` component with keyboard/touch support
3. Build `GalleryGrid` component with filtering
4. Update `Gallery.tsx` page to use new components
5. Update `GalleryStrip.tsx` on home page
6. Test on mobile and desktop

---

## Mobile Considerations

- Touch swipe gestures for lightbox navigation
- Larger touch targets for navigation buttons
- Full-bleed images on mobile screens
- Filter buttons scroll horizontally if needed
