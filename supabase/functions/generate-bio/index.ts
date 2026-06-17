import { withAuth, HttpError } from "../_shared/auth-helpers.ts";

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

const FN = "generate-bio";

Deno.serve(withAuth<GenerateBioRequest, { bio_ms: string; bio_en: string }>(
  {
    fnName: FN,
    allowedRoles: ["clinical", "ops", "admin", "special_admin"],
    maxBytes: 8 * 1024,
  },
  async (body, { userId }) => {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error(`[${FN}] missing_api_key`);
      throw new HttpError(500, "Internal error");
    }

    const {
      name,
      title_ms,
      title_en,
      qualifications,
      expertise_ms,
      expertise_en,
      years_experience,
      additional_notes,
    } = body ?? ({} as GenerateBioRequest);

    if (!name || typeof name !== "string") {
      throw new HttpError(400, "Invalid request");
    }

    const qualificationsText = qualifications?.length ? qualifications.join(", ") : "Not specified";
    const expertiseMsText = expertise_ms?.length ? expertise_ms.join(", ") : "Perubatan am";
    const expertiseEnText = expertise_en?.length ? expertise_en.join(", ") : "General practice";
    const experienceText = years_experience
      ? `${years_experience} years of experience`
      : "Several years of experience";

    console.log(`[${FN}] invoked by ${userId}`);

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
${additional_notes ? `Additional Notes to Include: ${additional_notes}` : ""}

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
      console.error(`[${FN}] ai_gateway_error`, response.status);
      if (response.status === 429) throw new HttpError(429, "Rate limited");
      if (response.status === 402) throw new HttpError(402, "AI credits exhausted");
      throw new HttpError(502, "Upstream failed");
    }

    const aiResponse = await response.json();
    const content = aiResponse?.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[${FN}] empty_ai_content`);
      throw new HttpError(502, "Upstream failed");
    }

    let bios: { bio_ms: string; bio_en: string };
    try {
      const clean = String(content).replace(/```json\n?|\n?```/g, "").trim();
      bios = JSON.parse(clean);
    } catch {
      console.error(`[${FN}] ai_parse_error`);
      throw new HttpError(502, "Upstream failed");
    }

    if (!bios.bio_ms || !bios.bio_en) {
      throw new HttpError(502, "Upstream failed");
    }
    return bios;
  },
));
