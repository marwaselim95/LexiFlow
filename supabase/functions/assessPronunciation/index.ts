import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";

// SpeechSuper API — server-side only
const SPEECHSUPER_API_KEY    = Deno.env.get("SPEECHSUPER_API_KEY") ?? "";
const SPEECHSUPER_APP_KEY    = Deno.env.get("SPEECHSUPER_APP_KEY") ?? "";
const SPEECHSUPER_BASE       = "https://api.speechsuper.com";

// Phoneme status thresholds (see THRESHOLDS.md)
// SpeechSuper returns a 0–100 score per phoneme
// excellent: >= 80, good: 50–79, wrong: < 50
function bucketScore(score: number): "excellent" | "good" | "wrong" {
  if (score >= 80) return "excellent";
  if (score >= 50) return "good";
  return "wrong";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const formData  = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const word      = formData.get("word") as string | null;
    const targetLang = formData.get("targetLang") as string | null;

    if (!audioFile || !word || !targetLang) {
      return new Response(JSON.stringify({ error: { type: "unknown", message: "audio, word, and targetLang required" } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBytes = await audioFile.arrayBuffer();
    const audioB64   = btoa(String.fromCharCode(...new Uint8Array(audioBytes)));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    // Map ISO 639-1 codes to SpeechSuper locale codes.
    // Languages without dedicated SpeechSuper support fall back to en-US.
    const SPEECHSUPER_LOCALE_MAP: Record<string, string> = {
      ar: "ar-SA", zh: "zh-CN", nl: "nl-NL", en: "en-US", fr: "fr-FR", de: "de-DE",
      el: "el-GR", he: "he-IL", hi: "hi-IN", id: "id-ID", it: "it-IT", ja: "ja-JP",
      ko: "ko-KR", fa: "fa-IR", pl: "pl-PL", pt: "pt-BR", ro: "ro-RO", ru: "ru-RU",
      es: "es-ES", sv: "sv-SE", th: "th-TH", tr: "tr-TR", uk: "uk-UA", vi: "vi-VN",
    };

    const payload = {
      appKey: SPEECHSUPER_APP_KEY,
      request: {
        coreType:   "word.eval",
        refText:    word,
        audioType:  "mp3",
        audioData:  audioB64,
        language:   SPEECHSUPER_LOCALE_MAP[targetLang] ?? "en-US",
      },
    };

    let res: Response;
    try {
      res = await fetch(`${SPEECHSUPER_BASE}/word/eval`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SPEECHSUPER_API_KEY}`,
        },
        body:   JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) throw new Error(`SpeechSuper HTTP ${res.status}`);

    const data = await res.json();

    // Normalize phoneme breakdown
    const rawPhonemes: { phoneme: string; score: number }[] =
      data?.result?.phonemeList ?? data?.result?.words?.[0]?.phonemes ?? [];

    const phonemeBreakdown = rawPhonemes.map((p) => ({
      phoneme: p.phoneme,
      status:  bucketScore(p.score),
    }));

    const overallScore: number = data?.result?.pronunciation ?? data?.result?.fluency ?? 0;

    // Upsert phoneme_assessments for each phoneme
    for (const ph of phonemeBreakdown) {
      await supabase.from("phoneme_assessments").upsert(
        {
          user_id:         userId,
          target_language: targetLang,
          phoneme:         ph.phoneme,
          status:          ph.status,
          last_assessed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,target_language,phoneme" }
      );
      // Increment attempts separately (upsert above sets status; increment via rpc or raw update)
      await supabase.rpc("increment_phoneme_attempts", {
        p_user_id:  userId,
        p_lang:     targetLang,
        p_phoneme:  ph.phoneme,
      });
    }

    return new Response(JSON.stringify({ score: overallScore, phonemeBreakdown }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
