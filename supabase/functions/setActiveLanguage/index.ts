import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const { language } = await req.json();
    if (!language || typeof language !== "string") {
      return new Response(JSON.stringify({ error: { type: "unknown", message: "language code required" } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user has this language in their user_languages
    const { data: userLang, error: ulErr } = await supabase
      .from("user_languages")
      .select("language")
      .eq("user_id", userId)
      .eq("language", language)
      .single();

    if (ulErr || !userLang) {
      return new Response(JSON.stringify({
        error: { type: "unknown", message: `Language '${language}' not in your learning languages. Add it first.` },
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profiles.target_language to the new active language
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ target_language: language })
      .eq("id", userId);

    if (updateErr) throw new Error(updateErr.message);

    return new Response(JSON.stringify({ success: true, activeLanguage: language }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
