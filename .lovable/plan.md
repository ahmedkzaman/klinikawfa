

# AI-Powered Biography Generator for Team Members

## Overview

Add a button to the Team Editor that uses AI to automatically generate professional, polished biographies in both Malay and English. The AI will craft eloquent descriptions based on the team member's special interests, years of experience, qualifications, and any additional notes provided.

## How It Will Work

1. After filling in the team member's details (name, title, qualifications, special interests, years of experience), you can click a "Generate Biography" button
2. The AI will create professional, flowery prose that highlights their expertise and experience
3. Both Malay and English biographies will be generated simultaneously
4. You can review and edit the generated text before saving

## Implementation Steps

### Step 1: Create Backend Function

Create an edge function called `generate-bio` that:
- Receives team member data (name, title, expertise, years of experience, qualifications, additional notes)
- Calls Lovable AI (using the pre-configured LOVABLE_API_KEY) to generate professional biographies
- Returns both Malay and English versions
- Uses a carefully crafted prompt that produces eloquent, professional language while respecting medical terminology guidelines (avoiding terms like "specialist" unless referring to external experts)

### Step 2: Update Team Editor Form

Modify the Biography card section to include:
- An optional "Additional Notes" text field for any extra points to include in the bio
- A "Generate with AI" button that triggers the biography generation
- Loading states while the AI is working
- The generated text will populate the bio fields, which remain editable

### Step 3: Update Configuration

Add the new edge function to the Supabase configuration file.

---

## Technical Details

### Edge Function: `supabase/functions/generate-bio/index.ts`

The function will:
- Accept POST requests with team member data
- Use Lovable AI Gateway with the `google/gemini-3-flash-preview` model for fast, quality responses
- Include a system prompt that produces:
  - Professional, flowery language
  - Third-person narrative style
  - Emphasis on dedication and expertise
  - Proper medical terminology (avoiding "specialist" per compliance guidelines)
- Return JSON with `bio_ms` and `bio_en` fields

### Frontend Changes: `src/pages/admin/TeamEditor.tsx`

- Add state for additional notes input and AI generation loading
- Add a text field for "Additional Notes" in the Biography card
- Add a "Generate with AI" button with sparkle icon
- Implement the API call to the edge function
- Auto-populate the biography textareas with the generated content

### Configuration: `supabase/config.toml`

Add the new function configuration with `verify_jwt = false` for simplicity (the function doesn't need authentication since it's just generating text).

