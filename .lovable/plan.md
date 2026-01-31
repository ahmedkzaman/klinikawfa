

# Klinik Awfa Website - Updated Implementation Plan
## Modern, Bilingual Medical Clinic Website with Full CMS & Lead Management

---

## Project Overview

A premium, mobile-first clinic website that converts visitors into appointments and WhatsApp leads. Features bilingual content (Malay/English), image-rich design with lightbox galleries, autoplay video section, comprehensive service pages, appointment booking with Lovable Cloud database, and a full admin dashboard with role-based access.

**Contact Details:**
- **Phone:** +60 18-252 3531
- **WhatsApp:** http://www.wasap.my/60182523531
- **Address:** B2 & B4, Jalan KS 1/12, KotaSAS Avenue, 25200 Kuantan, Pahang, Malaysia

---

## Stage 1: Foundation & Design System
**Focus: Core infrastructure, styling, and navigation**

- **Design System Setup**
  - Modern medical color palette (clean whites, calming blues/greens, soft shadows)
  - Typography system with readable, professional fonts
  - Rounded cards, smooth micro-animations, hover states
  - Mobile-first responsive breakpoints

- **Core Layout Components**
  - Header with logo, navigation menu, language toggle (BM/EN)
  - Sticky mobile CTA bar (WhatsApp + Call buttons always visible)
  - Footer with the exact required copy block
  - Mobile hamburger menu with smooth animations

- **Routing Structure**
  - Home, Services, Doctors, Appointment, Gallery, Health Tips
  - Individual service detail pages
  - Admin section (protected routes)

- **Language System**
  - Context-based language switching (Malay ↔ English)
  - Persistent language preference
  - All UI text translatable

---

## Stage 2: Homepage
**Focus: Hero section, video, and key conversion elements**

- **Hero Section**
  - Image slider/carousel (clinic exterior, friendly doctor, family vibe)
  - Three prominent CTAs: "Buat Temujanji", "WhatsApp", "Call"
  - Auto-rotating with manual controls
  - Mobile-optimized touch gestures

- **Why Klinik Awfa Section**
  - Highlight cards with icons (6 key points):
    - 🕐 Open daily 8am–12am
    - 🛋️ Comfortable waiting area + kids play zone
    - 👨‍👩‍👧 Family clinic at KotaSAS
    - 👨‍⚕️ Experienced doctors with years of practice
    - 🔬 Special interest in minor surgeries (lumps, warts, circumcision)
    - 👂 ENT services including microsuction ear care

- **Video Section**
  - Autoplay video (muted by default for browser compatibility)
  - Clinic tour or welcome message from doctor
  - Play/pause controls
  - Mobile-optimized with poster image fallback

- **Services Preview Grid**
  - Image cards for each service category
  - Quick filter buttons
  - "View All Services" link

- **Photo Gallery Strip**
  - Horizontal scrollable gallery preview
  - Lightbox modal on click
  - "View Full Gallery" link

- **Testimonials Section**
  - Simple, credible patient testimonials
  - Card-based layout

- **Map & Directions**
  - Embedded Google Map
  - "Get Directions" button
  - Address display

---

## Stage 3: Services Hub & Detail Pages
**Focus: All 9 service categories with filterable listing**

- **Services Main Page**
  - Searchable/filterable grid of service cards
  - Filter by category tags
  - Each card: image, title, brief description, "Learn More" CTA

- **Individual Service Detail Pages (9 total)**
  - A. Rawatan Umum (General Treatment)
  - B. Sakit Tekak / Selsema / Demam (Cold/Flu)
  - C. Rapid Tests: Influenza / COVID / RSV
  - D. Nebulizer Therapy
  - E. Sputum Suction
  - F. Nasal Irrigation
  - G. Ear Care: Ear Cleaning / Ear Suction (Microsuction)
  - H. Circumcision: Kanak-kanak & Dewasa
  - I. Lump/Wart Treatment & Removal

- **Each Detail Page Includes:**
  - Hero image with service title
  - What it helps with (bullet points)
  - What to expect during visit (step-by-step)
  - Who it's for
  - FAQ accordion (5–8 questions)
  - CTA buttons: WhatsApp (wasap.my/60182523531), Call (+60 18-252 3531), Book Appointment
  - Safety disclaimer text

---

## Stage 4: Doctors/Team Page
**Focus: Professional presentation of 2 doctors**

- **Team Overview**
  - Introduction text about the clinic's medical team
  - Values and approach to patient care

- **Doctor Profile Cards (2 Doctors)**
  - **Doctor 1**
    - Professional photo placeholder
    - Name and title
    - Qualifications & experience
    - Areas of expertise (e.g., minor surgeries, family medicine)
    - Brief bio
  
  - **Doctor 2**
    - Professional photo placeholder
    - Name and title
    - Qualifications & experience
    - Areas of expertise (e.g., ENT care, pediatrics)
    - Brief bio

- **Clinic Staff Section**
  - Support staff introduction
  - Friendly, welcoming imagery

---

## Stage 5: Backend Setup & Appointment System
**Focus: Lovable Cloud database, authentication, and lead capture**

- **Lovable Cloud Database Setup**
  - `appointments` table: name, phone, preferred_date, preferred_time, service, message, status, created_at
  - `blog_posts` table: title, content, category, slug, published, author_id, created_at, updated_at
  - `blog_categories` table: name, slug
  - `gallery_images` table: url, tags, alt_text, display_order
  - `users` table with role field (admin, staff)
  - Row Level Security (RLS) policies for data protection

- **Authentication System (Lovable Cloud Auth)**
  - Email/password authentication
  - Role-based access (admin, staff)
  - Protected admin routes
  - Secure login/logout flow
  - Password reset functionality

- **Appointment Form**
  - Fields: Name, Phone, Preferred Date/Time, Service dropdown, Message
  - PDPA privacy notice
  - Input validation with Zod
  - On submit:
    - Save to Lovable Cloud database
    - Show success message
    - Display "Send to WhatsApp" button with pre-filled message (wasap.my/60182523531)

- **WhatsApp Integration**
  - Pre-filled message with appointment details
  - Direct link: wasap.my/60182523531

---

## Stage 6: Admin Dashboard
**Focus: Lead management and content administration**

- **Admin Login**
  - Secure authentication page
  - Role verification (admin vs staff access levels)

- **Leads Dashboard**
  - Table view of all appointment requests
  - Columns: Date, Time, Name, Phone, Service, Status
  - Filter by status (New, Contacted, Confirmed, Cancelled)
  - Search functionality
  - Export to CSV option

- **Lead Detail View**
  - Full appointment information
  - Status update controls
  - Quick contact action buttons (Call, WhatsApp)

- **Blog Management (CMS)**
  - Create/Edit/Delete blog posts
  - Rich text editor with formatting
  - Category selection
  - Publish/Draft toggle
  - SEO fields

- **Gallery Management**
  - Upload/delete images
  - Tag assignment
  - Drag-and-drop reordering

- **User Management (Admin only)**
  - View all staff users
  - Add new staff accounts
  - Assign/change roles

---

## Stage 7: Gallery Page
**Focus: Tag-based image gallery with lightbox**

- **Gallery Layout**
  - Masonry or grid layout
  - Tag-based filtering:
    - Waiting Area & Kids Play Zone
    - Treatment Rooms
    - Clinic Exterior/Signage
    - Staff & Friendly Moments

- **Lightbox Feature**
  - Full-screen image view
  - Navigation arrows
  - Keyboard support
  - Touch/swipe on mobile
  - Image captions

---

## Stage 8: Health Tips Blog
**Focus: Public-facing blog with categories**

- **Blog Listing Page**
  - Card grid of articles
  - Category filters:
    - Children's Health
    - General Health
    - Lump/Wart Info
    - ENT / Ear Care Tips
  - Pagination
  - Search functionality

- **Blog Post Page**
  - Article content (rich text rendered)
  - Author info
  - Published date
  - Related posts
  - Social share buttons
  - CTA to book appointment

---

## Stage 9: Polish, Performance & SEO
**Focus: Final optimizations and compliance**

- **Performance**
  - Image lazy loading
  - Video optimization
  - WebP format for images
  - Code splitting
  - Lighthouse score optimization

- **SEO Setup**
  - Meta tags on all pages
  - OpenGraph tags
  - LocalBusiness/MedicalClinic schema markup
  - Sitemap generation

- **Accessibility**
  - WCAG 2.1 AA compliance
  - Full keyboard navigation
  - Screen reader friendly

- **Final Compliance Check**
  - All disclaimers in place
  - PDPA notices on forms
  - Footer copy verified

---

## Required Footer Copy (UPDATED CONTACT INFO)

"Nak buat temujanji dengan kami?
Boleh hubungi kami untuk maklumat lanjut
☎️ +60 18-252 3531
📱 www.wasap.my/60182523531
.
Klinik Awfa, KotaSAS,
B2 & B4, Jalan KS 1/12,
KotaSAS Avenue,
25200 Kuantan, Pahang
.
Waktu Operasi:
Setiap Hari
8.00 pagi - 12.00 tengah malam
"Klinik Keluarga Anda""

---

## Key Features Summary

| Feature | Description |
|---------|-------------|
| 🌐 Bilingual | Malay + English with easy toggle |
| 📱 Mobile-First | Sticky CTAs, touch-friendly |
| 🎬 Video Section | Autoplay clinic video |
| 📸 Image-Rich | Galleries, lightbox, service cards |
| 👨‍⚕️ 2 Doctors | Dedicated profiles for each doctor |
| 📅 Lead Capture | Form → Lovable Cloud → WhatsApp |
| 👨‍💼 Admin Dashboard | Role-based access, full CMS |
| 📝 Blog/CMS | Database-driven with admin UI |
| 🔒 Secure | Lovable Cloud Auth with roles |
| 🚀 Fast | Optimized images, video & code |

