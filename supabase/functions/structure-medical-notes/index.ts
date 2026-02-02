import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Transcript is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[structure-medical-notes] Processing transcript...");

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
          { role: "user", content: `Please analyze this medical consultation transcript and extract structured clinical notes:\n\n${transcript}` }
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
                  chief_complaint: {
                    type: "string",
                    description: "Primary reason for consultation"
                  },
                  history_present_illness: {
                    type: "string",
                    description: "Details about current symptoms"
                  },
                  past_medical_history: {
                    type: "string",
                    description: "Previous illnesses, surgeries, conditions"
                  },
                  family_history: {
                    type: "string",
                    description: "Relevant family medical conditions"
                  },
                  allergies: {
                    type: "string",
                    description: "Drug, food, or other allergies"
                  },
                  social_history: {
                    type: "string",
                    description: "Smoking, alcohol, occupation, lifestyle"
                  },
                  examination_findings: {
                    type: "string",
                    description: "Physical examination observations"
                  },
                  assessment: {
                    type: "string",
                    description: "Clinical impression or diagnosis"
                  },
                  plan: {
                    type: "string",
                    description: "Treatment plan and follow-up"
                  }
                },
                required: ["chief_complaint"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "structure_medical_notes" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted, please add funds" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error(`[structure-medical-notes] AI API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `AI processing error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Extract the structured notes from the tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("[structure-medical-notes] No tool call in response");
      return new Response(
        JSON.stringify({ error: "Failed to extract structured notes" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const structuredNotes = JSON.parse(toolCall.function.arguments);
    console.log("[structure-medical-notes] Notes structured successfully");

    return new Response(
      JSON.stringify(structuredNotes),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[structure-medical-notes] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
