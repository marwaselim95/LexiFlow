import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { getSupabaseClient, requireAuth } from "../_shared/supabase.ts";
import { normalizeCategory, CANONICAL_CATEGORIES } from "../_shared/normalizeCategory.ts";

const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") ?? "";
const YT_BASE         = "https://www.googleapis.com/youtube/v3";

const COLD_START_THRESHOLD = 5;
const EXPLORE_RATIO = 0.2;

// NOTE: The original product spec references a previously-defined personalization algorithm
// that isn't included in the backend prompt. This implementation uses a reasonable
// interpretation: extract categories from watch history, query YouTube filtered by those
// categories + target language, inject EXPLORE_RATIO of off-category suggestions.
// Swap this logic for the exact algorithm when it is provided.

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  // ── Parse optional search query from request body ─────────────────────────
  let query = "";
  try {
    const body = await req.json();
    query = (typeof body?.query === "string" ? body.query : "").trim();
  } catch {
    // No body or invalid JSON — treat as no query (passive feed)
  }

  // ── Mock branch ───────────────────────────────────────────────────────────
  const mockYt = (Deno.env.get("USE_MOCK_YOUTUBE") ?? "").trim();
  if (mockYt === "true") {
    const label = query || "Sample EN Lesson";
    const mockVideos = Array.from({ length: 5 }).map((_, i) => ({
      videoId: `mock_vid_${i}`,
      title: `[MOCK] ${query ? `Result for '${query}'` : `Sample EN Lesson Video`} ${i + 1}`,
      channelName: "[MOCK] Mock Channel",
      thumbnailUrl: `https://placehold.co/320x180/153C70/FFFFFF?text=${encodeURIComponent(label)}+${i+1}`,
      duration: "10:00",
      category: normalizeCategory(query || "language learning"),
      language: "en",
    }));
    return new Response(JSON.stringify({ videos: mockVideos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Live path ─────────────────────────────────────────────────────────────
  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("target_language")
      .eq("id", userId)
      .single();

    if (pErr || !profile) throw new Error("Profile not found");

    const langCode   = profile.target_language;
    // Map language code to YouTube region code for relevance hints.
    // Covers all 24 supported languages; defaults to US for unmatched.
    const REGION_MAP: Record<string, string> = {
      ar: "SA", zh: "CN", nl: "NL", en: "US", fr: "FR", de: "DE",
      el: "GR", he: "IL", hi: "IN", id: "ID", it: "IT", ja: "JP",
      ko: "KR", fa: "IR", pl: "PL", pt: "BR", ro: "RO", ru: "RU",
      es: "ES", sv: "SE", th: "TH", tr: "TR", uk: "UA", vi: "VN",
    };
    const regionCode = REGION_MAP[langCode] ?? "US";

    // ── EXPLICIT SEARCH PATH (query present) ──────────────────────────────
    // Bypasses cold-start gate — a user with 0 watch history can still search.
    if (query) {
      const results = await searchYouTube(query, langCode, regionCode, new Set(), 20);
      return new Response(JSON.stringify({ videos: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PASSIVE / PERSONALIZED FEED PATH (no query) ───────────────────────
    // Cold-start gate: require minimum watch history for personalized recs.
    const { data: history, error: hErr } = await supabase
      .from("watch_history")
      .select("video_id, categories")
      .eq("user_id", userId)
      .order("watched_at", { ascending: false });

    if (hErr) throw new Error(hErr.message);

    if ((history?.length ?? 0) < COLD_START_THRESHOLD) {
      return new Response(JSON.stringify({ promptMessage: "Search for topics you love to start getting recommendations!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const watchedIds = new Set(history!.map((h) => h.video_id));

    const categoryFreq = new Map<string, number>();
    for (const h of history!) {
      for (const cat of (h.categories ?? [])) {
        categoryFreq.set(cat, (categoryFreq.get(cat) ?? 0) + 1);
      }
    }

    const topCategories = [...categoryFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    const personalizedQuery = topCategories.join(" OR ") || "language learning";
    const personalizedVids  = await searchYouTube(personalizedQuery, langCode, regionCode, watchedIds, 20);

    // Use the full canonical taxonomy (minus "other") for exploration diversity.
    const allCategories = CANONICAL_CATEGORIES.filter((c) => c !== "other");
    const freshCats     = allCategories.filter((c) => !topCategories.includes(c));
    const explorationQuery = freshCats[Math.floor(Math.random() * freshCats.length)] ?? "documentary";
    const explorationVids  = await searchYouTube(explorationQuery, langCode, regionCode, watchedIds, 5);

    const personalizedCount = Math.round(20 * (1 - EXPLORE_RATIO));
    const merged = [
      ...personalizedVids.slice(0, personalizedCount),
      ...explorationVids.slice(0, Math.round(20 * EXPLORE_RATIO)),
    ];

    return new Response(JSON.stringify({ videos: merged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// Fetch a batch of video IDs from /videos to get defaultAudioLanguage,
// then hard-filter to only those matching `lang`. Returns a map of videoId → defaultAudioLanguage.
async function fetchAudioLanguages(videoIds: string[]): Promise<Map<string, string>> {
  if (videoIds.length === 0) return new Map();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(
      `${YT_BASE}/videos?part=snippet&id=${videoIds.join(",")}&key=${YOUTUBE_API_KEY}`,
      { signal: controller.signal }
    );
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) throw new Error(`YouTube videos API HTTP ${res.status}`);

  const data = await res.json();
  const langMap = new Map<string, string>();
  for (const item of (data.items ?? [])) {
    // defaultAudioLanguage is the authoritative field; fall back to defaultLanguage.
    const audioLang: string | undefined =
      item.snippet?.defaultAudioLanguage ?? item.snippet?.defaultLanguage;
    if (audioLang) {
      // Normalise to base language tag (e.g. "en-US" → "en", "fr-FR" → "fr")
      langMap.set(item.id, audioLang.split("-")[0].toLowerCase());
    }
  }
  return langMap;
}

async function searchYouTube(
  query: string,
  lang: string,
  regionCode: string,
  watchedIds: Set<string>,
  maxResults: number
): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    // Fetch extra results to compensate for language-filter attrition.
    // relevanceLanguage and regionCode are hints that bias the ranking;
    // hard enforcement is done below via /videos?part=snippet.
    res = await fetch(
      `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video` +
      `&relevanceLanguage=${lang}&regionCode=${regionCode}&maxResults=${maxResults * 3}` +
      `&key=${YOUTUBE_API_KEY}`,
      { signal: controller.signal }
    );
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);

  const data = await res.json();

  // Exclude already-watched videos first
  const candidates: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      thumbnails: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
      channelTitle: string;
    };
  }> = (data.items ?? []).filter(
    (item: { id: { videoId: string } }) => !watchedIds.has(item.id.videoId)
  );

  // Hard language filter: batch-fetch audio language metadata and keep only
  // videos whose defaultAudioLanguage matches the target language code.
  const candidateIds = candidates.map((c) => c.id.videoId);
  const audioLangMap = await fetchAudioLanguages(candidateIds);

  const languageFiltered = candidates.filter((item) => {
    const audioLang = audioLangMap.get(item.id.videoId);
    // Only include if language is confirmed AND matches target.
    // Videos with no audio language metadata are excluded to avoid language bleed.
    return audioLang === lang;
  });

  return languageFiltered.slice(0, maxResults).map((item) => ({
    videoId:      item.id.videoId,
    title:        item.snippet.title,
    channelName:  item.snippet.channelTitle,
    thumbnailUrl: item.snippet.thumbnails?.high?.url
               ?? item.snippet.thumbnails?.medium?.url
               ?? item.snippet.thumbnails?.default?.url
               ?? "",
    duration:     "",    // YouTube /search does not return duration; use "" as placeholder
    category:     normalizeCategory(query),
    language:     lang,
  }));
}
