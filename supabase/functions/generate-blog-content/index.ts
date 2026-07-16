import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  readJsonWithLimit,
  requireRole,
  sanitizeError,
} from "../_shared/auth-helpers.ts";
import {
  type BlogContentRequest,
  validateBlogContentRequest,
} from "./validation.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface BlogContentResponse {
  title_ms: string;
  title_en: string;
  content_ms: string;
  content_en: string;
  excerpt_ms: string;
  excerpt_en: string;
  suggested_reading_time: number;
}

const systemPrompt = `You are a compassionate health content writer for Klinik Awfa, a family clinic in Malaysia. Your writing must create emotional connections with readers—mostly parents and families seeking health guidance.

## CRITICAL RULES

1. **EMOTIONAL CONNECTION** (Most Important):
   - Begin with empathy—acknowledge the reader's feelings, fears, and concerns
   - Use warm, inclusive language: "kita" (we), "kami faham" (we understand)
   - Include relatable scenarios that parents/patients actually experience
   - End with reassurance, hope, and a gentle call-to-action
   - Write as if speaking to a worried parent sitting in front of you

2. **TONE GUIDELINES**:
   - Empathetic: Focus on understanding fears and concerns, gentle reassurance, validation of feelings
   - Educational: Informative but accessible, use analogies families understand, avoid jargon
   - Motivational: Inspiring action while being supportive, never pushy or salesy

3. **MEDICAL TERMINOLOGY CONSTRAINTS** (VERY IMPORTANT):
   - NEVER use "specialist" or "pakar" when referring to clinic staff
   - Instead use: "pengamal berpengalaman", "doctor with vast experience", "our experienced team"
   - Keep medical terms simple, always explain complex concepts
   - Use everyday language that any parent can understand

4. **CONTENT STRUCTURE**:
   - Compelling headline that speaks to emotions and the reader's situation
   - Opening hook that acknowledges and validates the reader's feelings
   - Clear, scannable content with helpful subheadings
   - Practical information presented with warmth
   - Warm, reassuring conclusion with gentle call-to-action
   - Include a medical disclaimer note at the end

5. **BILINGUAL EXCELLENCE**:
   - Malay (BM): Natural, conversational Bahasa Malaysia—not too formal, like talking to a friend
   - English: Warm, professional, accessible to all education levels
   - Both versions should feel equally genuine and emotional

6. **STRUCTURE FORMAT**:
   - Use Markdown formatting
   - Include 3-5 clear sections with subheadings
   - Add a brief medical disclaimer at the end

## OUTPUT FORMAT

You MUST respond with ONLY valid JSON in this exact format:
{
  "title_ms": "Emotional Malay title",
  "title_en": "Emotional English title",
  "content_ms": "Full emotional Malay content with Markdown formatting...",
  "content_en": "Full emotional English content with Markdown formatting...",
  "excerpt_ms": "Short 1-2 sentence Malay excerpt that captures emotion",
  "excerpt_en": "Short 1-2 sentence English excerpt that captures emotion",
  "suggested_reading_time": 5
}

Do not include any text before or after the JSON. Only return the JSON object.`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // Blog generation is an administrative workflow. A valid JWT alone is
    // insufficient because any ordinary account could otherwise spend AI
    // credits. The shared guard verifies the JWT and reads the authoritative
    // role through the service client.
    await requireRole(req, ["ops", "admin", "special_admin"]);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("AI service is not configured");
    }

    const rawBody = await readJsonWithLimit<unknown>(req, 20 * 1024);
    const body: BlogContentRequest = validateBlogContentRequest(rawBody);
    console.log("generate_blog_start");

    const { topic, key_points, category, tone, target_audience } = body;

    // Build the user prompt
    const userPrompt = `Please write an emotional, engaging health blog article with the following details:

**Topic**: ${topic}

**Key Points to Cover**:
${key_points.map((point, i) => `${i + 1}. ${point}`).join('\n')}

**Category**: ${category}

**Tone**: ${tone}
${tone === 'empathetic' ? '- Focus on understanding fears and concerns, gentle reassurance' : ''}
${tone === 'educational' ? '- Be informative but accessible, use analogies families understand' : ''}
${tone === 'motivational' ? '- Inspire action while being supportive, never pushy' : ''}

**Target Audience**: ${target_audience}

Remember:
- Start by acknowledging how the reader might be feeling
- Include relatable scenarios (e.g., "You might have noticed your child...")
- Use warm, caring language throughout
- End with hope and a gentle invitation to seek help
- Add a medical disclaimer at the end

Write both Malay and English versions with genuine emotional connection.`;

    console.log("Calling Lovable AI Gateway...");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      // Never log the upstream body: it can echo prompts or provider details.
      console.error("generate_blog_gateway_failed", { status: response.status });
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI service error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("AI response received");

    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content received from AI");
    }

    // Parse the JSON response from AI
    let blogContent: BlogContentResponse;
    try {
      // Remove markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith('```')) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();
      
      blogContent = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("generate_blog_parse_failed", {
        name: parseError instanceof Error ? parseError.name : typeof parseError,
        contentLength: content?.length ?? 0,
      });
      throw new Error("Failed to parse AI response");
    }

    // Validate the response structure
    if (!blogContent.title_ms || !blogContent.title_en || 
        !blogContent.content_ms || !blogContent.content_en) {
      throw new Error("Invalid response structure from AI");
    }

    console.log("generate_blog_ok");
    return new Response(
      JSON.stringify(blogContent),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const safe = sanitizeError(error, "generate-blog-content");
    return new Response(
      JSON.stringify(safe.body),
      { status: safe.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
