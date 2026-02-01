
# Stage 9: Polish, Performance & SEO

## Overview
This stage focuses on final optimizations to ensure the Klinik Awfa website is fast, search-engine friendly, accessible, and fully compliant with legal requirements. We will address performance, SEO, accessibility (WCAG 2.1 AA), and ensure all disclaimers and PDPA notices are in place.

---

## Current State Assessment

### What's Already Working
- **Lazy loading**: Gallery images and maps already use `loading="lazy"`
- **PDPA consent**: Appointment form has proper PDPA checkbox with bilingual text
- **Medical disclaimer**: ServiceDetail page already includes proper disclaimer
- **Accessibility basics**: Some aria-labels on carousel buttons and navigation
- **robots.txt**: Basic robots.txt exists allowing all bots

### What Needs Work
- **SEO**: No page-specific meta tags (title still says "Lovable App")
- **Schema markup**: No structured data for MedicalClinic/LocalBusiness
- **Sitemap**: No sitemap.xml exists
- **Footer**: Needs to match the required verbatim copy from memory
- **Lazy loading**: Missing on BlogCard images and BlogPost featured image
- **Accessibility**: Some buttons missing aria-labels, skip navigation missing
- **Focus management**: Needs review for keyboard navigation

---

## What Will Be Built

### 1. SEO System
- **SEO component** with dynamic meta tags per page
- **OpenGraph tags** for social sharing
- **Sitemap.xml** with all public routes
- **LocalBusiness/MedicalClinic schema** markup

### 2. Performance Optimizations
- **Add lazy loading** to remaining images (BlogCard, BlogPost, Doctors)
- **Preconnect hints** for external resources
- **Image optimization** guidance

### 3. Accessibility Enhancements
- **Skip to main content** link
- **Focus visible** improvements
- **Aria-labels** for interactive elements
- **Heading hierarchy** audit
- **Screen reader** announcements

### 4. Compliance Verification
- **Footer copy** updated to exact required text
- **PDPA notices** verified on all forms
- **Medical disclaimers** confirmed on health content

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/seo/SEOHead.tsx` | Dynamic meta tags component using react-helmet-async |
| `src/components/seo/SchemaMarkup.tsx` | JSON-LD structured data for LocalBusiness/MedicalClinic |
| `src/components/seo/index.ts` | Exports |
| `src/components/layout/SkipToContent.tsx` | Accessibility skip link |
| `public/sitemap.xml` | Static sitemap for search engines |

---

## Files to Modify

| File | Changes |
|------|---------|
| `index.html` | Update default title, meta, add preconnect hints |
| `public/robots.txt` | Add sitemap reference |
| `src/App.tsx` | Add HelmetProvider wrapper |
| `src/main.tsx` | Add any required providers |
| `src/components/layout/Footer.tsx` | Update to required verbatim copy |
| `src/components/layout/MainLayout.tsx` | Add SkipToContent link, schema markup |
| `src/pages/Index.tsx` | Add SEO component |
| `src/pages/Services.tsx` | Add SEO component |
| `src/pages/ServiceDetail.tsx` | Add dynamic SEO component |
| `src/pages/Doctors.tsx` | Add SEO component |
| `src/pages/Appointment.tsx` | Add SEO component |
| `src/pages/Gallery.tsx` | Add SEO component |
| `src/pages/HealthTips.tsx` | Add SEO component |
| `src/pages/BlogPost.tsx` | Add dynamic SEO with article schema |
| `src/components/blog/BlogCard.tsx` | Add lazy loading to images |
| `src/components/layout/Header.tsx` | Add aria-labels to language buttons |

---

## Technical Details

### SEO Component

```typescript
// SEOHead.tsx
interface SEOProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  author?: string;
}
```

Each page will have appropriate meta tags:

| Page | Title | Description |
|------|-------|-------------|
| Home | Klinik Awfa - Klinik Keluarga Anda | Rawatan berkualiti untuk keluarga anda di KotaSAS Kuantan |
| Services | Perkhidmatan - Klinik Awfa | Pelbagai perkhidmatan kesihatan untuk seluruh keluarga |
| Doctors | Doktor - Klinik Awfa | Pasukan doktor berpengalaman di Klinik Awfa |
| Appointment | Temujanji - Klinik Awfa | Buat temujanji dengan Klinik Awfa |
| Gallery | Galeri - Klinik Awfa | Lihat suasana di Klinik Awfa |
| Health Tips | Tips Kesihatan - Klinik Awfa | Artikel dan panduan kesihatan |
| Blog Post | [Post Title] - Klinik Awfa | [Post Excerpt] |

### LocalBusiness Schema

```json
{
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "MedicalClinic"],
  "name": "Klinik Awfa",
  "description": "Klinik Keluarga Anda - Your Family Clinic",
  "url": "https://klinikawfa.lovable.app",
  "telephone": "+60182523531",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "B2 & B4, Jalan KS 1/12, KotaSAS Avenue",
    "addressLocality": "Kuantan",
    "addressRegion": "Pahang",
    "postalCode": "25200",
    "addressCountry": "MY"
  },
  "openingHours": "Mo-Su 08:00-00:00",
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "3.8",
    "longitude": "103.4"
  }
}
```

### Footer Update (Required Verbatim Copy)

The footer must display the exact text from the compliance requirements:

```text
Nak buat temujanji dengan kami?
Boleh hubungi kami untuk maklumat lanjut
☎️ +60 18-252 3531
📱 www.wasap.my/60182523531

Klinik Awfa, KotaSAS,
B2 & B4, Jalan KS 1/12,
KotaSAS Avenue,
25200 Kuantan, Pahang

Waktu Operasi:
Setiap Hari
8.00 pagi - 12.00 tengah malam
"Klinik Keluarga Anda"
```

### Skip to Content

```typescript
// SkipToContent.tsx
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md"
    >
      Skip to main content
    </a>
  );
}
```

### Sitemap.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://klinikawfa.lovable.app/</loc><priority>1.0</priority></url>
  <url><loc>https://klinikawfa.lovable.app/services</loc><priority>0.9</priority></url>
  <url><loc>https://klinikawfa.lovable.app/doctors</loc><priority>0.8</priority></url>
  <url><loc>https://klinikawfa.lovable.app/appointment</loc><priority>0.9</priority></url>
  <url><loc>https://klinikawfa.lovable.app/gallery</loc><priority>0.7</priority></url>
  <url><loc>https://klinikawfa.lovable.app/health-tips</loc><priority>0.8</priority></url>
</urlset>
```

---

## Accessibility Checklist

| Item | Status | Action |
|------|--------|--------|
| Skip to content link | Missing | Add to MainLayout |
| Page titles | Missing | Add SEO component |
| Heading hierarchy | Mostly OK | Verify H1 on each page |
| Image alt text | Partial | Already using alt_text from DB |
| Focus visible | Default | Enhanced with Tailwind |
| Keyboard navigation | Mostly OK | Review lightbox |
| Aria-labels | Partial | Add to language buttons |
| Form labels | Good | Already in place |
| Color contrast | Tailwind handles | Verify with tool |
| Screen reader | Basic | Add sr-only text where needed |

---

## Image Lazy Loading Additions

| Component | Current | Action |
|-----------|---------|--------|
| GalleryGrid | Has lazy loading | None |
| GalleryStrip | Has lazy loading | None |
| MapSection | Has lazy loading | None |
| BlogCard | Missing | Add `loading="lazy"` |
| BlogPost | Missing | Add `loading="lazy"` |
| Doctors | Missing | Add `loading="lazy"` |

---

## Implementation Order

1. Create SEO components (SEOHead, SchemaMarkup)
2. Update index.html with proper defaults and preconnect
3. Add SEO to all pages
4. Create sitemap.xml and update robots.txt
5. Update Footer with required copy
6. Add SkipToContent link
7. Add lazy loading to remaining images
8. Add aria-labels to interactive elements
9. Verify medical disclaimers are present
10. Test with Lighthouse

---

## Lighthouse Target Scores

| Category | Target |
|----------|--------|
| Performance | 90+ |
| Accessibility | 95+ |
| Best Practices | 95+ |
| SEO | 100 |

---

## Dependencies

We'll need to add `react-helmet-async` for managing document head:

```bash
npm install react-helmet-async
```

This is a lightweight package specifically designed for React 18+ that allows us to update `<head>` tags dynamically per page.

---

## Impact

- **SEO**: Pages will be properly indexed with rich snippets
- **Social Sharing**: WhatsApp, Facebook, Twitter will show proper previews
- **Accessibility**: WCAG 2.1 AA compliance for all users
- **Performance**: Faster initial load with lazy loading
- **Compliance**: All legal requirements met (PDPA, disclaimers, footer copy)
