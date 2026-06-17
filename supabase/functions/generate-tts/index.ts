import { withAuth, HttpError } from "../_shared/auth-helpers.ts";

const FN = "generate-tts";

interface TTSBody {
  text?: string;
  languageCode?: string;
  voiceName?: string;
}

Deno.serve(withAuth<TTSBody, { audioContent: string }>(
  {
    fnName: FN,
    allowedRoles: ["clinical", "ops", "admin", "special_admin"],
    maxBytes: 16 * 1024,
  },
  async (body, { userId }) => {
    const apiKey = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!apiKey) {
      console.error(`[${FN}] missing_api_key`);
      throw new HttpError(500, "Internal error");
    }

    const text = (body?.text ?? "").toString().trim();
    const languageCode = (body?.languageCode ?? "").toString().trim();
    const voiceName = (body?.voiceName ?? "").toString().trim();

    if (!text || text.length > 5000 || !languageCode || !voiceName) {
      throw new HttpError(400, "Invalid request");
    }

    console.log(`[${FN}] invoked by ${userId} len=${text.length}`);

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
      console.error(`[${FN}] upstream_error`, googleRes.status);
      throw new HttpError(502, "Upstream failed");
    }

    const json = (await googleRes.json()) as { audioContent?: string };
    if (!json.audioContent) {
      console.error(`[${FN}] empty_audio`);
      throw new HttpError(502, "Upstream failed");
    }
    return { audioContent: json.audioContent };
  },
));
