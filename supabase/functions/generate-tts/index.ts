import { corsHeaders } from "@supabase/supabase-js/cors";

interface TTSBody {
  text: string;
  languageCode: string;
  voiceName: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_TTS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as Partial<TTSBody>;
    const text = (body.text ?? "").toString().trim();
    const languageCode = (body.languageCode ?? "").toString().trim();
    const voiceName = (body.voiceName ?? "").toString().trim();

    if (!text || text.length > 5000 || !languageCode || !voiceName) {
      return new Response(
        JSON.stringify({ error: "Invalid input: text (1-5000), languageCode, voiceName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const googleRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, name: voiceName },
          audioConfig: { audioEncoding: "MP3" },
        }),
      },
    );

    if (!googleRes.ok) {
      const errText = await googleRes.text();
      console.error("Google TTS error", googleRes.status, errText);
      return new Response(
        JSON.stringify({ error: "TTS upstream failed", status: googleRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = (await googleRes.json()) as { audioContent?: string };
    if (!json.audioContent) {
      return new Response(
        JSON.stringify({ error: "No audioContent returned" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ audioContent: json.audioContent }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-tts error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
