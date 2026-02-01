

# Stage 8: Health Tips Blog

## Overview
Transform the placeholder Health Tips page into a fully functional blog system with real database content, category filtering, search, pagination, and a dedicated article page with rich features.

---

## Current State

The HealthTips page currently shows:
- Static placeholder posts (hardcoded)
- Non-functional category filter buttons
- A "TODO" notice about admin dashboard

What already exists:
- Database tables: `blog_posts` and `blog_categories` (both populated with 4 categories)
- Admin blog editor with bilingual support and image uploads
- Blog management page for CRUD operations

---

## What Will Be Built

### 1. Blog Listing Page (`/health-tips`)
- **Real posts from database** instead of placeholders
- **Category filtering** with four predefined categories:
  - Children's Health
  - General Health
  - Lump and Wart Info
  - ENT / Ear Care Tips
- **Search functionality** to filter by title/content
- **Pagination** (6 posts per page)
- **Loading skeletons** for better UX
- **Empty state** when no posts match

### 2. Blog Post Page (`/health-tips/:slug`)
- **Article content** with Markdown rendering
- **Featured image** display
- **Author info** and published date
- **Reading time** indicator
- **Related posts** based on same category
- **Social share buttons** (WhatsApp, Facebook, X, copy link)
- **CTA section** to book appointment

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useBlogPosts.ts` | Custom hook for fetching blog posts with filtering and pagination |
| `src/pages/BlogPost.tsx` | Individual blog post page |
| `src/components/blog/BlogCard.tsx` | Reusable blog post card component |
| `src/components/blog/BlogSearch.tsx` | Search input component |
| `src/components/blog/BlogPagination.tsx` | Pagination wrapper component |
| `src/components/blog/ShareButtons.tsx` | Social share buttons component |
| `src/components/blog/RelatedPosts.tsx` | Related posts section |
| `src/components/blog/MarkdownRenderer.tsx` | Markdown to HTML renderer |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/HealthTips.tsx` | Replace placeholders with real data, add search and pagination |
| `src/App.tsx` | Add route for individual blog post page |
| `src/components/blog/index.ts` | Export new components |

---

## Technical Details

### useBlogPosts Hook

```typescript
interface UseBlogPostsOptions {
  category?: string;       // Category slug filter
  searchQuery?: string;    // Title/content search
  page?: number;           // Current page (1-indexed)
  limit?: number;          // Posts per page (default: 6)
}

interface UseBlogPostsReturn {
  posts: BlogPost[];
  totalPosts: number;
  totalPages: number;
  isLoading: boolean;
  error: Error | null;
  categories: BlogCategory[];
}
```

### Category Mapping

The database already has these categories:

| Category Name | Slug | Malay Name |
|---------------|------|------------|
| Children's Health | children-health | Kesihatan Kanak-kanak |
| General Health | general-health | Kesihatan Umum |
| Lump and Wart Info | lump-wart-info | Info Ketumbuhan dan Ketuat |
| ENT / Ear Care Tips | ent-ear-care | Tips Penjagaan Telinga |

### Markdown Rendering

Simple markdown support for blog content:
- Headings (##, ###)
- Bold (**text**)
- Italic (*text*)
- Lists (- item, 1. item)
- Links ([text](url))
- Line breaks

Using a lightweight approach without heavy dependencies.

### Share Buttons

```text
+-------------------------------------------+
|  Share this article:                      |
|  [WhatsApp] [Facebook] [X] [Copy Link]    |
+-------------------------------------------+
```

Each button opens the respective platform's share URL with:
- Post title
- Post URL
- Preview text (excerpt)

### Related Posts Logic

Query up to 3 posts where:
- Same category_id as current post
- Not the current post
- Published = true
- Order by published_at DESC

---

## Page Layouts

### Health Tips Listing

```text
+--------------------------------------------------+
|  Health Tips                                      |
|  Health articles and guides from our experts     |
+--------------------------------------------------+
|  [Search: ____________________]                  |
+--------------------------------------------------+
|  [All] [Children] [General] [Lump] [ENT]         |
+--------------------------------------------------+
|  +----------+  +----------+  +----------+        |
|  | Image    |  | Image    |  | Image    |        |
|  | Date     |  | Date     |  | Date     |        |
|  | Title    |  | Title    |  | Title    |        |
|  | Excerpt  |  | Excerpt  |  | Excerpt  |        |
|  | Read >   |  | Read >   |  | Read >   |        |
|  +----------+  +----------+  +----------+        |
|                                                   |
|  +----------+  +----------+  +----------+        |
|  | ...      |  | ...      |  | ...      |        |
|  +----------+  +----------+  +----------+        |
+--------------------------------------------------+
|  [< Previous]  1  2  3  ...  [Next >]            |
+--------------------------------------------------+
```

### Blog Post Page

```text
+--------------------------------------------------+
|  < Back to Health Tips                           |
+--------------------------------------------------+
|  [Featured Image - Full Width]                   |
+--------------------------------------------------+
|  Category Badge                                  |
|  Post Title (H1)                                 |
|  Date | Author | Reading Time                    |
+--------------------------------------------------+
|  [Article Content - Markdown Rendered]           |
|                                                   |
|  Paragraph text with formatting...               |
|  ## Subheading                                   |
|  More content...                                 |
+--------------------------------------------------+
|  Share this article:                             |
|  [WhatsApp] [Facebook] [X] [Copy]                |
+--------------------------------------------------+
|  Related Posts                                   |
|  +--------+  +--------+  +--------+              |
|  | Card   |  | Card   |  | Card   |              |
|  +--------+  +--------+  +--------+              |
+--------------------------------------------------+
|  Have Health Questions? [Book Appointment]       |
+--------------------------------------------------+
```

---

## Implementation Order

1. Create `useBlogPosts` hook with filtering, search, pagination
2. Create `BlogCard` component (reusable)
3. Update `HealthTips.tsx` with real data and filters
4. Add search functionality
5. Add pagination with page state
6. Create `BlogPost.tsx` page with markdown rendering
7. Add share buttons component
8. Add related posts section
9. Add route to App.tsx
10. Test bilingual switching

---

## SEO and Performance

- Proper heading hierarchy (H1 for post title)
- Alt text for images
- Loading states prevent layout shift
- Posts lazy-loaded by page

---

## Mobile Considerations

- Category buttons scroll horizontally
- Full-width cards on mobile
- Touch-friendly share buttons
- Back button always visible

