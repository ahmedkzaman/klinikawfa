import { withAuth, HttpError } from "../_shared/auth-helpers.ts";

const FN = "structure-medical-notes";

const SYSTEM_PROMPT = `You are a medical documentation assistant. Your task is to analyze a medical consultation transcript and extract structured clinical notes.

Analyze the conversation between doctor and patient and organize the information into the following sections:

1. **Chief Complaint (CC)**: The primary reason for the consultation in the patient's own words
2. **History of Present Illness (HPI)**: Details about current symptoms including onset, duration, severity, location, quality, timing, context, modifying factors
3. **Past Medical History (PMH)**: Previous illnesses, surgeries, hospitalizations, chronic conditions
4. **Family History (FH)**: Relevant medical conditions in family members
5. **Allergies**: Drug allergies, food allergies, environmental allergies (note reactions if mentioned)
6. **Social History**: Smoking, alcohol, occupation, living situation, lifestyle factors
7. **Examination Findings**: Any physical examination observations noted during the video consultation
8. **Assessment**: The doctor's clinical impression or working diagnosis
9. **Plan**: Treatment plan, medications prescribed, tests ordered, follow-up instructions

Important guidelines:
- Only include information that was actually discussed in the transcript
- If a section has no relevant information, leave it empty
- Use clear, professional medical language
- Summarize lengthy discussions into concise clinical notes
- Preserve important details like medication names, dosages, and specific symptoms`;

interface Body { transcript?: string }

Deno.serve(withAuth<Body, Record<string, unknown>>(
  {
    fnName: FN,
    allowedRoles: ["clinical", "admin", "special_admin"],
    maxBytes: 20 * 1024,
  },
  async (body, { userId }) => {
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) {
      throw new HttpError(400, "Invalid request");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error(`[${FN}] missing_api_key`);
      throw new HttpError(500, "Internal error");
    }

    // Never log transcript content (PHI). Only length + caller id.
    console.log(`[${FN}] invoked by ${userId} len=${transcript.length}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Please analyze this medical consultation transcript and extract structured clinical notes:\n\n${transcript}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "structure_medical_notes",
              description: "Structure the extracted medical information into clinical note sections",
              parameters: {
                type: "object",
                properties: {
                  chief_complaint: { type: "string" },
                  history_present_illness: { type: "string" },
                  past_medical_history: { type: "string" },
                  family_history: { type: "string" },
                  allergies: { type: "string" },
                  social_history: { type: "string" },
                  examination_findings: { type: "string" },
                  assessment: { type: "string" },
                  plan: { type: "string" },
                },
                required: ["chief_complaint"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "structure_medical_notes" } },
      }),
    });

    if (!response.ok) {
      console.error(`[${FN}] ai_gateway_error`, response.status);
      if (response.status === 429) throw new HttpError(429, "Rate limited");
      if (response.status === 402) throw new HttpError(402, "AI credits exhausted");
      throw new HttpError(502, "Upstream failed");
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error(`[${FN}] no_tool_call`);
      throw new HttpError(502, "Upstream failed");
    }

    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      console.error(`[${FN}] parse_error`);
      throw new HttpError(502, "Upstream failed");
    }
  },
));
