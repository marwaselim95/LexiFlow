import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { callGemini } from "../_shared/gemini.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { validateCardScripts } from "../_shared/textSanitize.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const { allowed } = checkRateLimit(userId, "generateDetailCard", { maxCalls: 30, windowMs: 60_000 });
    if (!allowed) {
      return new Response(JSON.stringify({ error: { type: "rate_limited", message: "Too many requests" } }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, nativeLang, targetLang } = await req.json();
    if (!text || !nativeLang || !targetLang) {
      return new Response(JSON.stringify({ error: { type: "unknown", message: "Missing required fields" } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side word-count guard (defense in depth)
    if (text.split(/\s+/).length > 50) {
      return new Response(JSON.stringify({ mode: "too_long", card: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are a language-learning assistant. Analyze this text: "${text}"
Native language: ${nativeLang}
Target language: ${targetLang}

Determine:
1. Does "${text}" contain MULTIPLE distinct vocabulary items that need separate elaboration, OR is it a single vocab item (possibly with surrounding context)?
   - If it has surrounding context, extract just the core word/phrase in its base/simple form (e.g. "I deployed the website" → "deploy", "something feels off" → "feels off").
   - If it is genuinely multiple unrelated items, set mode to "simplified".

2. If mode is "simplified", return:
{
  "mode": "simplified",
  "card": {
    "headword": "${text}",
    "translation": "<single translation or simplified rewrite>"
  }
}

3. If mode is "full", return:
{
  "mode": "full",
  "card": {
    "headword": "<extracted word or phrase in base form>",
    "nativeSynonyms": ["<1-3 ${nativeLang} synonyms>"],
    "contexts": [
      {
        "label": "<context domain e.g. Software Engineering, written in ${targetLang}>",
        "explanation": "<clear explanation in ${targetLang}>",
        "example": "<sentence in ${targetLang} containing the headword in bold using **headword** markdown>"
      }
    ]
  }
}

Every field except the native-language synonyms line must be written entirely in ${targetLang}. Do not mix languages within label, explanation, or example.
Provide 1-3 context blocks based on how many distinct usage contexts the word has.
Return ONLY valid JSON, no markdown fences.`;

    const raw = await callGemini(prompt, { jsonMode: true });
    let parsed: { mode: string; card: Record<string, unknown> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[generateDetailCard] Gemini returned non-JSON:", raw);
      return new Response(
        JSON.stringify({ error: { type: "ai_error", message: "AI response could not be parsed. Please try again." } }),
        { status: 502, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" } }
      );
    }

    // Normalize card shape to match frontend types:
    // - rename nativeSynonyms → synonyms
    // - rename translation → nativeTranslation (simplified mode)
    if (parsed.card && typeof parsed.card === "object") {
      const card = parsed.card as Record<string, unknown>;
      if ("nativeSynonyms" in card) {
        card.synonyms = card.nativeSynonyms;
        delete card.nativeSynonyms;
      }
      if ("translation" in card) {
        card.nativeTranslation = card.translation;
        delete card.translation;
      }
    }

    // ── Script-contamination validation (post-processing, no retry) ──────
    if (parsed.mode === "full" && parsed.card && typeof parsed.card === "object") {
      const card = parsed.card as Record<string, unknown>;
      const validation = validateCardScripts(card, nativeLang, targetLang, "generateDetailCard");

      if (validation.headwordContaminated) {
        console.error(
          `[generateDetailCard] Headword script-contaminated, returning parse error. ` +
          `headword="${card.headword}" targetLang="${targetLang}"`
        );
        return new Response(
          JSON.stringify({ error: { type: "ai_error", message: "AI response could not be parsed. Please try again." } }),
          { status: 502, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" } }
        );
      }

      card.synonyms = validation.filteredSynonyms;
      card.contexts = validation.filteredContexts;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
