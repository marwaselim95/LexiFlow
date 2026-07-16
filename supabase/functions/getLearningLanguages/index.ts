import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    // Fetch user's learning languages with display names
    const { data: userLangs, error: ulErr } = await supabase
      .from("user_languages")
      .select("language, added_at, supported_languages(name)")
      .eq("user_id", userId)
      .order("added_at", { ascending: true });

    if (ulErr) throw new Error(ulErr.message);

    // Fetch the currently active language from profiles
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("target_language")
      .eq("id", userId)
      .single();

    if (pErr) throw new Error(pErr.message);

    const activeLanguage = profile?.target_language ?? null;

    const languages = (userLangs ?? []).map((row) => {
      // supported_languages is joined as an object { name: string }
      const sl = row.supported_languages as unknown as { name: string } | null;
      return {
        code:     row.language,
        name:     sl?.name ?? row.language,
        addedAt:  row.added_at,
        isActive: row.language === activeLanguage,
      };
    });

    return new Response(JSON.stringify({ languages, activeLanguage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
