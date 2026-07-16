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

    // Validate against supported_languages table
    const { data: supported, error: slErr } = await supabase
      .from("supported_languages")
      .select("code")
      .eq("code", language)
      .single();

    if (slErr || !supported) {
      return new Response(JSON.stringify({ error: { type: "unknown", message: `Unsupported language code: ${language}` } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert with ON CONFLICT DO NOTHING for idempotency
    const { error: insertErr } = await supabase
      .from("user_languages")
      .upsert(
        { user_id: userId, language },
        { onConflict: "user_id,language", ignoreDuplicates: true }
      );

    if (insertErr) throw new Error(insertErr.message);

    return new Response(JSON.stringify({ success: true, language }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
