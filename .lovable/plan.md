

# AI-Generated Emotional Blog Content

## Overview
Add AI writing assistance to the Blog Editor that generates engaging, emotional health content in both Malay and English. The AI will take the admin's draft post and enhance it with warmth, empathy, and professional medical storytelling—connecting emotionally with patients and families seeking health guidance.

---

## How It Works

When writing a blog post, the admin can:
1. **Write a basic draft** with key points they want to cover
2. **Click "Generate with AI"** to have the AI enhance the content
3. **Choose the tone**: Empathetic, Educational, or Motivational
4. **Review and edit** the generated content before publishing

The AI will transform bullet points or rough drafts into polished, emotional prose that:
- Speaks directly to patients' concerns and fears
- Uses warm, reassuring language
- Includes relatable scenarios families can connect with
- Maintains medical accuracy while being accessible

---

## Database Changes Required

Add bilingual columns to support Malay and English content:

| Table | New Columns |
|-------|-------------|
| `blog_posts` | `title_ms`, `title_en`, `content_ms`, `content_en`, `excerpt_ms`, `excerpt_en`, `featured_image`, `reading_time` |
| `blog_categories` | `name_ms`, `name_en` |

---

## New Edge Function: `generate-blog-content`

Creates emotional, engaging blog content based on the admin's input.

### AI Prompt Strategy

The AI will be instructed to:
- Write with warmth and empathy—as if speaking to a concerned parent
- Include emotional hooks that resonate (e.g., "Sebagai ibu bapa, kita faham betapa risaunya...")
- Use storytelling techniques with relatable scenarios
- Maintain the clinic's caring, professional voice
- Follow medical terminology constraints (no "specialist/pakar" for internal staff)
- Include a gentle call-to-action where appropriate

### Input from Admin
```typescript
{
  topic: string;           // What the post is about
  key_points: string[];    // Main points to cover
  category: string;        // Category for context
  tone: 'empathetic' | 'educational' | 'motivational';
  target_audience: string; // e.g., "Parents of young children"
}
```

### Output
```typescript
{
  title_ms: string;
  title_en: string;
  content_ms: string;    // Full emotional content in Malay
  content_en: string;    // Full emotional content in English
  excerpt_ms: string;    // Short compelling preview
  excerpt_en: string;
  suggested_reading_time: number;
}
```

---

## Updated Blog Editor UI

### New Elements
1. **Language Tabs** - Switch between Malay (BM) and English (EN) content
2. **AI Writing Assistant Panel** - Collapsible sidebar with:
   - Topic input field
   - Key points textarea (bullet points)
   - Tone selector (Empathetic / Educational / Motivational)
   - Target audience dropdown
   - "Generate Content" button with sparkle icon
3. **Content Preview** - Side-by-side or tabbed view of generated content
4. **Regenerate Options** - Regenerate just title, excerpt, or full content

### User Flow
```text
Admin enters topic + key points
         ↓
Selects tone (e.g., "Empathetic")
         ↓
Clicks "Generate with AI"
         ↓
AI creates full bilingual content
         ↓
Admin reviews in Language Tabs
         ↓
Makes manual edits if needed
         ↓
Saves and publishes
```

---

## Example AI-Generated Content

### Input
- **Topic**: "Ear wax removal for children"
- **Key Points**: ["Safe microsuction method", "No pain", "Quick procedure", "When to bring your child"]
- **Tone**: Empathetic
- **Audience**: Parents

### Generated Output (Preview)

**Title (EN)**: "Gentle Ear Care for Your Little One: What Every Parent Should Know"

**Content (EN excerpt)**:
> *As parents, we know that helpless feeling when our child complains of ear discomfort. Perhaps they've been tugging at their ear, or you've noticed they're not responding when you call their name. These moments can fill us with worry—and that's completely natural.*
>
> *At Klinik Awfa, we understand these concerns intimately. Our gentle microsuction ear cleaning is specifically designed with your child's comfort in mind...*

**Title (MS)**: "Penjagaan Telinga Lembut untuk Si Manja: Panduan untuk Ibu Bapa"

**Content (MS excerpt)**:
> *Sebagai ibu bapa, kita faham betapa risaunya apabila anak kecil kita mengadu sakit telinga. Mungkin mereka sering menarik telinga, atau anda perasan mereka tidak menyahut apabila dipanggil. Perasaan cemas ini adalah normal—kerana kita sangat sayangkan mereka.*
>
> *Di Klinik Awfa, kami memahami kebimbangan ini. Pembersihan telinga secara microsuction kami direka khas dengan keselesaan anak anda sebagai keutamaan...*

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/generate-blog-content/index.ts` | Edge function for AI content generation |
| `src/components/blog/AIWritingAssistant.tsx` | UI panel for AI generation controls |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/BlogEditor.tsx` | Add bilingual fields, language tabs, AI assistant integration |
| `src/pages/admin/BlogManagement.tsx` | Display bilingual titles |
| `supabase/config.toml` | Register new edge function |

---

## Technical Details

### Edge Function: `generate-blog-content`

```typescript
// Key aspects of the implementation:

const systemPrompt = `You are a compassionate health content writer for Klinik Awfa, 
a family clinic in Malaysia. Your writing must:

1. EMOTIONAL CONNECTION:
   - Begin with empathy—acknowledge the reader's feelings and concerns
   - Use warm, inclusive language ("kita", "we understand")
   - Include relatable scenarios that parents/patients experience
   - End with reassurance and hope

2. TONE GUIDELINES:
   - Empathetic: Focus on understanding fears and concerns, gentle reassurance
   - Educational: Informative but accessible, use analogies families understand
   - Motivational: Inspiring action while being supportive, not pushy

3. MEDICAL TERMINOLOGY:
   - NEVER use "specialist" or "pakar" for clinic staff
   - Use "pengamal berpengalaman", "doctor with vast experience" instead
   - Keep medical terms simple, explain complex concepts

4. STRUCTURE:
   - Compelling headline that speaks to emotions
   - Hook that acknowledges reader's situation
   - Clear, scannable content with subheadings
   - Warm call-to-action (never pushy)

5. BILINGUAL EXCELLENCE:
   - Malay: Natural, conversational Bahasa Malaysia (not too formal)
   - English: Warm, professional, accessible to all education levels

Respond with valid JSON only.`;
```

### AI Assistant Component Features

- **Loading states** with typing animation
- **Error handling** with retry option
- **Rate limit feedback** (429 errors)
- **Content comparison** - see before/after
- **Partial regeneration** - regenerate just sections

---

## Implementation Order

1. **Database migration** - Add bilingual columns
2. **Seed categories** - Add bilingual category names
3. **Create edge function** - `generate-blog-content`
4. **Build AI assistant component** - UI controls
5. **Update BlogEditor** - Integrate bilingual fields + AI assistant
6. **Update BlogManagement** - Display correctly
7. **Test end-to-end** - Generate sample emotional content

---

## Compliance Notes

- Medical disclaimer will be added to all generated content
- No "specialist" terminology per clinic guidelines
- PDPA-friendly language in patient-facing content
- Content is for educational purposes notice included

