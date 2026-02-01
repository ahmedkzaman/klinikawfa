

# Add Auto-Rotating Carousel to Testimonials Section

## Overview

Convert the testimonials section from a static grid to an auto-rotating carousel that smoothly cycles through patient reviews. The carousel will show multiple cards on larger screens and fewer on mobile, automatically advancing every 5 seconds.

---

## What Will Change

| Current | After |
|---------|-------|
| Static 4-column grid | Auto-rotating carousel |
| All reviews visible at once | Shows 1-3 reviews at a time (responsive) |
| No interaction | Navigation arrows + dot indicators |
| No animation | Smooth slide transitions |

---

## Design Approach

Using the Embla Carousel component already in the project, enhanced with the **autoplay plugin** for automatic transitions. This provides:

- Smooth, touch-friendly sliding
- Responsive breakpoints (1 card mobile, 2 tablet, 3 desktop)
- Auto-advance every 5 seconds
- Pause on hover/touch
- Dot indicators for current position
- Optional prev/next arrows

---

## Visual Layout

```text
+--------------------------------------------------------------------+
|  What Our Patients Say                                              |
|  Patient satisfaction is our priority.                              |
+--------------------------------------------------------------------+
|                                                                      |
|   [<]   +-------------+  +-------------+  +-------------+   [>]     |
|         | ★★★★★       |  | ★★★★★       |  | ★★★★☆       |            |
|         | "Doktor     |  | "Perkhidm-  |  | "Klinik     |            |
|         |  sangat..." |  |  atan..."   |  |  bersih..." |            |
|         | Puan Fatimah|  | Encik Ahmad |  | Cik Nurul   |            |
|         +-------------+  +-------------+  +-------------+            |
|                                                                      |
|                         ● ○ ○ ○                                      |
|                                                                      |
+--------------------------------------------------------------------+
```

**Mobile View:** 1 card visible at a time
**Tablet View:** 2 cards visible
**Desktop View:** 3 cards visible

---

## Implementation Details

### 1. Install Embla Autoplay Plugin

```bash
npm install embla-carousel-autoplay
```

### 2. Update TestimonialsSection Component

The component will be refactored to:

- Use `Carousel`, `CarouselContent`, `CarouselItem` from the existing UI library
- Add the autoplay plugin with 5-second delay
- Pause autoplay on hover/interaction
- Show dot indicators for navigation
- Responsive card sizing using Tailwind classes

### Key Code Pattern

```tsx
import Autoplay from "embla-carousel-autoplay";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

// Autoplay plugin configuration
const autoplayPlugin = Autoplay({ delay: 5000, stopOnInteraction: true });

<Carousel
  plugins={[autoplayPlugin]}
  opts={{ loop: true, align: "start" }}
  className="w-full"
>
  <CarouselContent>
    {reviews?.map((review) => (
      <CarouselItem 
        key={review.id} 
        className="md:basis-1/2 lg:basis-1/3"
      >
        {/* Review card content */}
      </CarouselItem>
    ))}
  </CarouselContent>
</Carousel>
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Auto-rotate** | Advances every 5 seconds |
| **Pause on hover** | Stops when user hovers over carousel |
| **Loop infinitely** | Cycles back to start after last review |
| **Dot indicators** | Shows current position with clickable dots |
| **Touch/swipe support** | Works on mobile with swipe gestures |
| **Responsive** | 1/2/3 cards based on screen size |
| **Smooth transitions** | CSS-animated slide movements |

---

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `embla-carousel-autoplay` dependency |
| `src/components/home/TestimonialsSection.tsx` | Refactor to use carousel with autoplay |

---

## Loading & Empty States

- **Loading:** Show skeleton carousel items (3 placeholders)
- **No reviews:** Section is hidden entirely (current behavior preserved)
- **Single review:** Carousel still works, no auto-scroll needed

