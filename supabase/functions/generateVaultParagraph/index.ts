import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { callGemini } from "../_shared/gemini.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const { allowed } = checkRateLimit(userId, "generateVaultParagraph", { maxCalls: 15, windowMs: 60_000 });
    if (!allowed) {
      return new Response(JSON.stringify({ error: { type: "rate_limited", message: "Too many requests" } }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { month, excludeWordIds = [] } = await req.json() as {
      month: string;
      excludeWordIds: string[];
    };

    if (!month) {
      return new Response(JSON.stringify({ error: { type: "unknown", message: "month required" } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startDate = `${month}-01T00:00:00.000Z`;
    const [year, mon] = month.split("-").map(Number);
    const nextMonth   = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
    const endDate     = `${nextMonth}-01T00:00:00.000Z`;

    // Fetch the user's active target language
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("target_language")
      .eq("id", userId)
      .single();

    if (pErr || !profile) throw new Error("Profile not found");

    const { data: allWords, error: wErr } = await supabase
      .from("words")
      .select("id, headword")
      .eq("user_id", userId)
      .eq("target_language", profile.target_language)
      .gte("saved_at", startDate)
      .lt("saved_at", endDate);

    if (wErr) throw new Error(wErr.message);

    let available = (allWords ?? []).filter((w) => !excludeWordIds.includes(w.id));

    // Cycle reset: if we've exhausted everything, restart with full pool
    if (available.length === 0 && excludeWordIds.length > 0) {
      available = allWords ?? [];
    }

    if (available.length === 0) {
      return new Response(JSON.stringify({ error: "No saved words yet this month." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pass id:headword pairs so Gemini returns word IDs directly
    const wordPairs = available.map((w) => `${w.id}: ${w.headword}`).join("\n");

    const makePrompt = (words: string) => `
You are a language-learning assistant generating a reading passage.
Available words (format — id: word):
${words}

Select a coherent subset of these words and write ONE paragraph that:
- Naturally and clearly uses each selected word or phrase
- Has a topic from: self-development, history, philosophy, or general knowledge
- Is at most 200 words long (adjust naturally to the number of words picked)

Return STRICT JSON (no markdown):
{ "paragraph": "<the paragraph text>", "picked_words": ["<id1>", "<id2>", ...] }
The picked_words array must contain the IDs (not the words) of every word used.`;

    let result: { paragraph: string; pickedWordIds: string[] } | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const subsetSize = attempt === 0 ? available.length : Math.min(5, available.length);
      const subset     = available.slice(0, subsetSize);
      const pairs      = subset.map((w) => `${w.id}: ${w.headword}`).join("\n");

      try {
        const raw  = await callGemini(makePrompt(pairs), { jsonMode: true });
        const parsed = JSON.parse(raw);
        if (parsed.paragraph && parsed.picked_words?.length > 0) {
          result = { paragraph: parsed.paragraph, pickedWordIds: parsed.picked_words };
          break;
        }
      } catch {
        // retry
      }
    }

    if (!result) {
      return new Response(JSON.stringify({ error: "Couldn't generate a paragraph, try again." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
