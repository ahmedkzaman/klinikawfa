

# Add Reviews Management to Admin Dashboard

## Overview

Create a new admin section for managing patient testimonials/reviews that will be displayed on the homepage. This allows you to add reviews from Google Business with star ratings, reviewer names, and messages in both Malay and English.

---

## What Will Be Built

### New Admin Page: Reviews Management

| Feature | Description |
|---------|-------------|
| **View All Reviews** | List all reviews with star ratings, names, and preview text |
| **Add New Review** | Form with fields for name (BM/EN), review text (BM/EN), and star rating (1-5) |
| **Edit Review** | Modify existing reviews |
| **Delete Review** | Remove reviews with confirmation |
| **Toggle Published** | Show/hide reviews on the homepage |
| **Reorder Reviews** | Change display order |

### Homepage Integration

The TestimonialsSection will fetch reviews from the database instead of using hardcoded data. It will display reviews marked as "published".

---

## Database Design

A new `reviews` table will store the patient testimonials:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name_ms` | TEXT | Reviewer name in Malay |
| `name_en` | TEXT | Reviewer name in English |
| `text_ms` | TEXT | Review text in Malay |
| `text_en` | TEXT | Review text in English |
| `rating` | INTEGER | Star rating (1-5) |
| `published` | BOOLEAN | Whether to show on homepage |
| `display_order` | INTEGER | Order on homepage |
| `created_at` | TIMESTAMP | When added |
| `updated_at` | TIMESTAMP | When last modified |

### Security Policies

- **Public**: Can view published reviews (for homepage display)
- **Staff/Admin**: Can create, read, update, and delete all reviews

---

## Changes Required

| File | Changes |
|------|---------|
| **Database** | Create `reviews` table with RLS policies |
| `src/pages/admin/ReviewsManagement.tsx` | New admin page for managing reviews |
| `src/pages/admin/index.ts` | Export new component |
| `src/components/admin/AdminSidebar.tsx` | Add Reviews menu item |
| `src/App.tsx` | Add route for reviews management |
| `src/components/home/TestimonialsSection.tsx` | Fetch reviews from database |
| `src/components/home/index.ts` | Update exports if needed |

---

## Admin Interface Design

The Reviews Management page will follow the same design patterns as the Gallery and Blog management pages:

```text
+--------------------------------------------------+
|  Reviews Management                [Refresh] [+Add] |
|  6 reviews                                         |
+--------------------------------------------------+
|                                                    |
|  +-------------+  +-------------+  +-------------+ |
|  | ★★★★★       |  | ★★★★★       |  | ★★★★☆       | |
|  | "Doktor     |  | "Perkhidm-  |  | "Klinik     | |
|  |  sangat..." |  |  atan..."   |  |  bersih..." | |
|  | Puan Fatimah|  | Encik Ahmad |  | Cik Nurul   | |
|  | [Published] |  | [Published] |  | [Draft]     | |
|  | [Edit][Del] |  | [Edit][Del] |  | [Edit][Del] | |
|  +-------------+  +-------------+  +-------------+ |
|                                                    |
+--------------------------------------------------+
```

### Add/Edit Review Dialog

```text
+----------------------------------------+
|  Add Review                            |
+----------------------------------------+
|                                        |
|  Star Rating *                         |
|  [★] [★] [★] [★] [★]                   |
|                                        |
|  Reviewer Name (Malay) *               |
|  [Puan Fatimah                    ]    |
|                                        |
|  Reviewer Name (English)               |
|  [Mrs. Fatimah                    ]    |
|                                        |
|  Review Text (Malay) *                 |
|  [Doktor sangat mesra dan sabar...]    |
|                                        |
|  Review Text (English)                 |
|  [The doctor is very friendly...]      |
|                                        |
|  [x] Publish this review               |
|                                        |
|           [Cancel] [Save Review]       |
+----------------------------------------+
```

---

## Implementation Steps

1. **Create database table**
   - Create `reviews` table with all required columns
   - Set up RLS policies for public read and staff/admin CRUD

2. **Create ReviewsManagement.tsx**
   - List view with cards showing reviews
   - Add/Edit dialog with rating selector
   - Delete confirmation
   - Publish toggle

3. **Update admin navigation**
   - Add "Reviews" / "Ulasan" menu item to AdminSidebar.tsx
   - Add route in App.tsx

4. **Update TestimonialsSection**
   - Create a custom hook `useReviews()` to fetch from database
   - Show loading state while fetching
   - Fall back to empty state if no reviews

5. **Export and integrate**
   - Export new component from index.ts
   - Ensure bilingual support throughout

---

## Technical Details

### Custom Hook for Reviews

```typescript
// src/hooks/useReviews.ts
export function useReviews() {
  return useQuery({
    queryKey: ['reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('published', true)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });
}
```

### Star Rating Component

A reusable component for selecting and displaying star ratings:

```typescript
function StarRating({ value, onChange, readonly = false }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-5 w-5 cursor-pointer",
            star <= value ? "fill-accent text-accent" : "text-muted"
          )}
          onClick={() => !readonly && onChange?.(star)}
        />
      ))}
    </div>
  );
}
```

---

## After Implementation

- New "Reviews" / "Ulasan" menu item in admin sidebar
- Full CRUD for patient reviews with bilingual support
- Star ratings from 1-5 stars
- Publish/unpublish reviews to control homepage display
- Homepage testimonials section dynamically pulls from database
- You can easily copy reviews from Google Business and add them here

