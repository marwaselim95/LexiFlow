import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const url   = new URL(req.url);
    const month = url.searchParams.get("month") ??
      ((await req.json().catch(() => ({}))).month as string | undefined);

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return new Response(JSON.stringify({ error: { type: "unknown", message: "month required (YYYY-MM)" } }), {
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

    const { data, error } = await supabase
      .from("words")
      .select("id, headword, native_synonyms, stage, active, saved_at, mastered_at, source, word_contexts(*)")
      .eq("user_id", userId)
      .eq("target_language", profile.target_language)
      .gte("saved_at", startDate)
      .lt("saved_at", endDate)
      .order("saved_at", { ascending: false });

    if (error) throw new Error(error.message);

    // Transform raw DB rows into the VaultWord shape expected by the frontend
    const vaultWords = (data ?? []).map((row: {
      id: string;
      headword: string;
      native_synonyms: string[];
      stage: number;
      active: boolean;
      saved_at: string;
      source: string;
      word_contexts: { label: string; explanation: string; example: string }[];
    }) => ({
      id:              row.id,
      headword:        row.headword,
      nativeTranslation: row.native_synonyms?.[0] ?? "",
      savedAt:         row.saved_at,
      stage:           row.stage,
      cardData: {
        id:            row.id,
        headword:      row.headword,
        synonyms:      row.native_synonyms ?? [],
        contexts:      (row.word_contexts ?? []).map((c) => ({
          label:       c.label,
          explanation: c.explanation,
          example:     c.example,
        })),
        stage:         row.stage,
        stage6_streak: 0,
        active:        row.active,
        savedAt:       row.saved_at,
        source:        row.source as "manual" | "watch" | "explore" | "selection",
      },
    }));

    return new Response(JSON.stringify(vaultWords), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
