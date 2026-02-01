import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GenerateBioRequest {
  name: string;
  title_ms: string;
  title_en: string;
  qualifications: string[];
  expertise_ms: string[];
  expertise_en: string[];
  years_experience: number | null;
  additional_notes?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const body: GenerateBioRequest = await req.json();
    const { 
      name, 
      title_ms, 
      title_en, 
      qualifications, 
      expertise_ms, 
      expertise_en, 
      years_experience, 
      additional_notes 
    } = body;

    console.log("Generating biography for:", name);

    // Build context for the AI
    const qualificationsText = qualifications.length > 0 
      ? qualifications.join(", ") 
      : "Not specified";
    
    const expertiseMsText = expertise_ms.length > 0 
      ? expertise_ms.join(", ") 
      : "Perubatan am";
    
    const expertiseEnText = expertise_en.length > 0 
      ? expertise_en.join(", ") 
      : "General practice";
    
    const experienceText = years_experience 
      ? `${years_experience} years of experience` 
      : "Several years of experience";

    const systemPrompt = `You are a professional medical biography writer. Your task is to create eloquent, professional biographies for healthcare practitioners. 

IMPORTANT GUIDELINES:
- Write in third person
- Use professional, flowery, and elegant language
- Emphasize dedication to patient care and expertise
- NEVER use the word "specialist" or "pakar" (reserved for external specialists only)
- Instead, use terms like "practitioner", "expert in", "skilled in", "focused on", "passionate about", "pengamal", "mahir dalam", "berpengalaman dalam"
- Keep biographies between 3-5 sentences
- Make the text feel warm, professional, and trustworthy
- Highlight years of experience naturally if provided
- Incorporate the qualifications and areas of interest seamlessly

You must respond with valid JSON only, no markdown, no explanations. The JSON must have exactly this structure:
{
  "bio_ms": "Biography in Malay...",
  "bio_en": "Biography in English..."
}`;

    const userPrompt = `Please generate professional biographies in both Malay and English for this healthcare practitioner:

Name: ${name}
Title (Malay): ${title_ms}
Title (English): ${title_en}
Qualifications: ${qualificationsText}
Special Interests (Malay): ${expertiseMsText}
Special Interests (English): ${expertiseEnText}
Experience: ${experienceText}
${additional_notes ? `Additional Notes to Include: ${additional_notes}` : ''}

Remember: Create warm, professional, flowery prose. Do NOT use "specialist" or "pakar" terms.`;

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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), 
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }), 
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("AI response content:", content);

    // Parse the JSON response from AI
    let bios: { bio_ms: string; bio_en: string };
    try {
      // Remove any markdown code blocks if present
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      bios = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Failed to parse AI response as JSON");
    }

    if (!bios.bio_ms || !bios.bio_en) {
      throw new Error("AI response missing required fields");
    }

    console.log("Successfully generated biographies");

    return new Response(
      JSON.stringify(bios),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-bio function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
