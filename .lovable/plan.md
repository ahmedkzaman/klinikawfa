
# Gallery Circular Collage Layout with Hover Zoom

## Overview
Transform the current standard grid gallery into an artistic circular collage layout (inspired by the reference image), with an interactive hover effect that enlarges photos when the cursor moves over them.

## What You'll Get
- A visually striking circular/radial arrangement of gallery photos
- Photos of varying sizes arranged artistically within a circular boundary
- Smooth zoom animation when hovering over any photo
- Maintains existing lightbox functionality when clicking photos
- Responsive design that works on both desktop and mobile

## Technical Implementation

### 1. Create New CircularGalleryGrid Component
- New component: `src/components/gallery/CircularGalleryGrid.tsx`
- Uses CSS Grid with custom clip-path for circular masking
- Variable-sized photo slots arranged in a radial pattern
- Works with existing `useGalleryImages` hook

### 2. Hover Zoom Effect
- CSS `transform: scale(1.15)` on hover for enlargement
- Smooth transition animation (300ms)
- Higher z-index on hover so enlarged photo appears above others
- Subtle shadow effect on hover for depth

### 3. Gallery Layout Structure
```text
+---------------------------+
|       Circular Mask       |
|    +---+    +---+         |
|    |   |    |   |         |
|  +-+   +----+   +-+       |
|  |   CENTER    |          |
|  +-+        +--+--+       |
|    |  +--+  |     |       |
|    +--+  +--+     |       |
|          +--------+       |
+---------------------------+
```

### 4. Component Structure
- Outer container with `clip-path: circle(50%)` for circular boundary
- CSS Grid with 12-column layout for flexible positioning
- Each image cell with custom grid-area for unique positioning
- Fallback to standard grid on mobile for better usability

### 5. Files to Modify
| File | Change |
|------|--------|
| `src/components/gallery/CircularGalleryGrid.tsx` | New component with circular layout |
| `src/components/gallery/GalleryGrid.tsx` | Add circular layout option or replace grid |
| `src/components/gallery/index.ts` | Export new component |

### 6. Key Features
- **Circular mask**: Photos clipped within a circular boundary
- **Variable sizing**: Different photos have different sizes based on position
- **Hover zoom**: Scale up to 115% with smooth 300ms transition
- **Elevated z-index**: Hovered photo rises above neighboring photos
- **Shadow effect**: Subtle shadow on hover for depth perception
- **Click functionality**: Existing lightbox opens on click
- **Responsive**: Falls back to masonry/grid on smaller screens

### 7. CSS Approach
```css
/* Circular container */
.circular-gallery {
  clip-path: circle(50%);
  display: grid;
  grid-template-columns: repeat(12, 1fr);
}

/* Hover zoom effect */
.gallery-image:hover {
  transform: scale(1.15);
  z-index: 10;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}
```
