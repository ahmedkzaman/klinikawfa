import { withAuth, HttpError } from "../_shared/auth-helpers.ts";

type RequestBody = {
  title_ms: string;
  description_ms: string;
  cta_ms: string;
  services_ms: string[];
};

type ResponseBody = {
  title_en: string;
  description_en: string;
  cta_en: string;
  services_en: string[];
};

const FN = "translate-service-content";

Deno.serve(withAuth<RequestBody, ResponseBody>(
  { fnName: FN, allowedRoles: ["admin", "special_admin"], maxBytes: 24 * 1024 },
  async (body) => {
    if (!body?.title_ms || !body.description_ms || !body.cta_ms || !Array.isArray(body.services_ms)) {
      throw new HttpError(400, "Malay service content is incomplete");
    }
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new HttpError(500, "Translation service is not configured");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_TRANSLATION_MODEL") ?? "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Translate Malaysian Bahasa Melayu clinic service content into clear, natural professional English. Preserve the HTML tags and paragraph structure in description_en. Return JSON only with title_en, description_en, cta_en, and services_en (array). Do not add claims or change meaning." },
          { role: "user", content: JSON.stringify(body) },
        ],
      }),
    });
    if (!response.ok) {
      if (response.status === 429) throw new HttpError(429, "Translation rate limit reached");
      throw new HttpError(502, "Translation provider failed");
    }
    const content = (await response.json())?.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, "Translation provider returned no content");
    try {
      const parsed = JSON.parse(content) as ResponseBody;
      if (!parsed.title_en || !parsed.description_en || !parsed.cta_en || !Array.isArray(parsed.services_en)) throw new Error("invalid shape");
      return parsed;
    } catch {
      throw new HttpError(502, "Translation provider returned invalid content");
    }
  },
));
