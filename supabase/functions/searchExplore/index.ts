import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { callGemini, isSafetyBlock } from "../_shared/gemini.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";
import { validateCardScripts } from "../_shared/textSanitize.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const { query, lang } = await req.json() as { query: string; lang: "native" | "target" };
    if (!query || !lang) {
      return new Response(JSON.stringify({ error: { type: "unknown", message: "query and lang required" } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("native_language, target_language")
      .eq("id", userId)
      .single();

    const targetCode = profile?.target_language ?? "en";
    const nativeCode = profile?.native_language ?? "en";

    // Resolve ISO codes → full language names so prompts get "Arabic" not "ar"
    // and validateCardScripts/deriveExpectedScript can map to the correct script.
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

    // Step 1: get a cluster of related vocab items
    // NOTE: response_format:json_object requires a top-level object, not a bare array.
    // Wrapping in { "words": [...] } is the only reliable shape with Groq.
    const clusterPrompt = `A language learner typed this search query: "${query}"
The query is in: ${lang === "native" ? nativeLang : targetLang}
Target learning language: ${targetLang}

Generate a cluster of 6-8 semantically related ${targetLang} vocabulary words or phrases that address this concept.
Example: for "manipulating language to hide the truth" → [Weasel words, Gaslighting, Cherry-picking, Spin, Equivocation, Doublespeak, Paltering, Straw manning]
Return a JSON object: { "words": ["word1", "word2", ...] }`;

    let cluster: string[];
    try {
      const raw    = await callGemini(clusterPrompt, { jsonMode: true });
      const parsed = JSON.parse(raw);
      // Prefer the explicit key; fall back to the first array-valued key the LLM chose
      cluster =
        Array.isArray(parsed.words)
          ? parsed.words
          : (parsed[Object.keys(parsed)[0]] ?? []);
    } catch (err) {
      if (isSafetyBlock(err)) {
        return new Response(JSON.stringify({ safetyError: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    // Step 2: generate a DetailCard for each vocab item
    const cards = await Promise.all(
      cluster.map(async (word) => {
        const cardPrompt = `You are a language-learning assistant. Generate a full vocabulary card for the ${targetLang} word/phrase: "${word}"
Native language: ${nativeLang}
Target language: ${targetLang}

Return ONLY valid JSON (no markdown):
{
  "headword": "${word}",
  "nativeSynonyms": ["<1-3 synonyms in ${nativeLang}>"],
  "contexts": [
    { "label": "<domain, written in ${targetLang}>", "explanation": "<explanation in ${targetLang}>", "example": "<sentence in ${targetLang} with **${word}** bolded>" }
  ]
}
Every field except nativeSynonyms must be written entirely in ${targetLang}. Do not mix languages within label, explanation, or example.`;
        try {
          const raw    = await callGemini(cardPrompt, { jsonMode: true });
          const card   = JSON.parse(raw);
          // Normalize nativeSynonyms → synonyms to match frontend DetailCardData
          if (card && "nativeSynonyms" in card) {
            card.synonyms = card.nativeSynonyms;
            delete card.nativeSynonyms;
          }
          // Inject required DetailCardData fields missing from the LLM output
          if (card) {
            card.id            = crypto.randomUUID();
            card.stage         = 0;
            card.stage6_streak = 0;
            card.active        = true;
            card.source        = "explore";
          }

          // ── Script-contamination validation ────────────────────────────
          if (card) {
            const validation = validateCardScripts(
              card, nativeLang, targetLang, "searchExplore"
            );

            if (validation.headwordContaminated) {
              console.error(
                `[searchExplore] Headword script-contaminated, dropping card. ` +
                `headword="${card.headword}" targetLang="${targetLang}"`
              );
              return null; // drop this card entirely
            }

            card.synonyms = validation.filteredSynonyms;
            card.contexts = validation.filteredContexts;
          }

          return card;
        } catch (err) {
          if (isSafetyBlock(err)) return null; // skip unsafe individual words
          return null;
        }
      })
    );

    return new Response(JSON.stringify({ cards: cards.filter(Boolean) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (isSafetyBlock(err)) {
      return new Response(JSON.stringify({ safetyError: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return errorResponse(err);
  }
});
