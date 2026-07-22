import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { callGemini } from "../_shared/gemini.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { validateCardScripts } from "../_shared/textSanitize.ts";

// Number of recent vault words to sample as seeds
const SAMPLE_SIZE  = 20;
const SEED_COUNT   = 3;
const OUTPUT_COUNT = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const { allowed } = checkRateLimit(userId, "getExploreSuggestions", { maxCalls: 10, windowMs: 60_000 });
    if (!allowed) {
      return new Response(JSON.stringify({ error: { type: "rate_limited", message: "Too many requests" } }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("native_language, target_language")
      .eq("id", userId)
      .single();

    const targetCode = profile?.target_language ?? "en";
    const nativeCode = profile?.native_language ?? "en";

    // Resolve ISO codes → full language names so prompts get "Arabic" not "ar".
    const { data: langRows } = await supabase
      .from("supported_languages")
      .select("code, name")
      .in("code", [nativeCode, targetCode]);

    const codeToName: Record<string, string> = {};
    if (langRows) {
      for (const row of langRows) codeToName[row.code] = row.name;
    }

    const targetLang = codeToName[targetCode] ?? targetCode;
    const nativeLang = codeToName[nativeCode] ?? nativeCode;

    // Fetch recent vault words as seeds — filtered by active language
    const { data: vaultWords, error: vErr } = await supabase
      .from("words")
      .select("id, headword")
      .eq("user_id", userId)
      .eq("target_language", targetCode)
      .order("saved_at", { ascending: false })
      .limit(SAMPLE_SIZE);

    if (vErr) throw new Error(vErr.message);
    if (!vaultWords || vaultWords.length === 0) {
      return new Response(JSON.stringify({ emptyMessage: "Save some words to start exploring!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick seed sample (random subset)
    const shuffled  = [...vaultWords].sort(() => Math.random() - 0.5);
    const seeds     = shuffled.slice(0, Math.min(SEED_COUNT, shuffled.length));
    const seedWords = seeds.map((s) => s.headword).join(", ");

    // Ask Gemini for semantically related vocabulary suggestions.
    // NOTE: response_format:json_object requires a top-level object, not a bare array.
    // Wrapping in { "suggestions": [...] } is the only reliable shape with Groq.
    const suggestionPrompt = `Given these ${targetLang} vocabulary words: ${seedWords}
Suggest exactly ${OUTPUT_COUNT} semantically related vocabulary items (words or phrases) in ${targetLang} that a language learner would find useful.
Do NOT repeat the seed words.
Return a JSON object: { "suggestions": ["word1", "word2", ...] }`;

    const rawSuggestions = await callGemini(suggestionPrompt, { jsonMode: true });
    const parsedSuggestions = JSON.parse(rawSuggestions);
    // Prefer the explicit key; fall back to the first array-valued key the LLM chose
    const suggestions: string[] =
      Array.isArray(parsedSuggestions.suggestions)
        ? parsedSuggestions.suggestions
        : (parsedSuggestions[Object.keys(parsedSuggestions)[0]] ?? []);

    // Generate a full DetailCard for each suggestion (reusing generateDetailCard logic inline)
    const cards = await Promise.all(
      suggestions.map(async (suggestion) => {
        const prompt = `You are a language-learning assistant. Generate a full vocabulary card for: "${suggestion}"
Native language: ${nativeLang}
Target language: ${targetLang}

Return ONLY valid JSON (no markdown):
{
  "mode": "full",
  "card": {
    "headword": "${suggestion}",
    "nativeSynonyms": ["<1-3 synonyms in ${nativeLang}>"],
    "contexts": [
      { "label": "<domain, written in ${targetLang}>", "explanation": "<explanation in ${targetLang}>", "example": "<sentence in ${targetLang} with **${suggestion}** bolded>" }
    ]
  }
}
Every field except nativeSynonyms must be written entirely in ${targetLang}. Do not mix languages within label, explanation, or example.`;
        try {
          const raw  = await callGemini(prompt, { jsonMode: true });
          const parsed = JSON.parse(raw);
          const card = parsed.card ?? null;
          if (!card) return null;
          // Normalize nativeSynonyms → synonyms to match frontend DetailCardData
          if ("nativeSynonyms" in card) {
            card.synonyms = card.nativeSynonyms;
            delete card.nativeSynonyms;
          }
          // Inject required DetailCardData fields missing from the LLM output
          card.id            = crypto.randomUUID();
          card.stage         = 0;
          card.stage6_streak = 0;
          card.active        = true;
          card.source        = "explore";

          // ── Script-contamination validation ────────────────────────────
          const validation = validateCardScripts(
            card, nativeLang, targetLang, "getExploreSuggestions"
          );

          if (validation.headwordContaminated) {
            console.error(
              `[getExploreSuggestions] Headword script-contaminated, dropping card. ` +
              `headword="${card.headword}" targetLang="${targetLang}"`
            );
            return null; // drop this card entirely
          }

          card.synonyms = validation.filteredSynonyms;
          card.contexts = validation.filteredContexts;

          return card;
        } catch {
          return null;
        }
      })
    );

    return new Response(JSON.stringify({ cards: cards.filter(Boolean) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
