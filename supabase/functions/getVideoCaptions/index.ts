import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { getSupabaseClient, getServiceClient, requireAuth } from "../_shared/supabase.ts";

// Cache TTL: 30 days in milliseconds
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// InnerTube API (Android client) — the primary caption source.
// The Android client context is critical: YouTube serves caption track URLs
// via this client that work without browser TLS fingerprint requirements,
// unlike the timedtext endpoint which returns empty for non-browser clients.
const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_UA = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

// Browser User-Agent for watch-page fallback
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36,gzip(gfe)";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const supabase = getSupabaseClient(req);
    const userId   = await requireAuth(supabase);

    const url     = new URL(req.url);
    const videoId = url.searchParams.get("videoId") ??
      ((await req.json().catch(() => ({}))).videoId as string | undefined);

    if (!videoId) {
      return new Response(
        JSON.stringify({ error: { type: "unknown", message: "videoId required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("target_language")
      .eq("id", userId)
      .single();

    const lang = profile?.target_language ?? "en";

    // ── Cache check ──────────────────────────────────────────────────────────
    const serviceClient = getServiceClient();
    const { data: cached } = await serviceClient
      .from("video_captions")
      .select("captions, fetched_at")
      .eq("video_id", videoId)
      .eq("language", lang)
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < CACHE_TTL_MS) {
        console.log(`[CAPTION_CACHE_HIT] video=${videoId} lang=${lang} age_days=${(age / 86400000).toFixed(1)}`);
        return jsonResponse({ captions: cached.captions });
      }
    }

    // ── Step 1: Discover caption tracks ──────────────────────────────────────
    // Primary: InnerTube Android API. Fallback: watch page HTML scraping.
    let captionTracks: CaptionTrack[];
    let source: string;
    try {
      const innerTubeResult = await fetchTracksViaInnerTube(videoId);
      if (innerTubeResult && innerTubeResult.length > 0) {
        captionTracks = innerTubeResult;
        source = "innertube";
      } else {
        captionTracks = await scrapeTracksFromWatchPage(videoId);
        source = "watchpage";
      }
    } catch (err) {
      console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=track_discovery error=${(err as Error).message}`);
      return jsonResponse({ captions: [] });
    }

    if (captionTracks.length === 0) {
      console.log(`[CAPTION_NONE] video=${videoId} — no caption tracks found`);
      return jsonResponse({ captions: [] });
    }

    // ── Step 2: Choose the best track ────────────────────────────────────────
    // Priority: manual track in target lang > ASR in target lang > any track
    const chosen =
      captionTracks.find((t) => t.languageCode.startsWith(lang) && t.kind !== "asr") ??
      captionTracks.find((t) => t.languageCode.startsWith(lang)) ??
      captionTracks[0];

    console.log(`[CAPTION_TRACK_SELECTED] video=${videoId} lang=${chosen.languageCode} kind=${chosen.kind || "manual"} source=${source}`);

    if (!chosen.baseUrl) {
      console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=track_selection error=selected track has no baseUrl`);
      return jsonResponse({ captions: [] });
    }

    // ── Step 3: Fetch caption content ────────────────────────────────────────
    // The baseUrl returns XML by default (srv3 or classic text format).
    // We parse whichever format YouTube serves.
    let captions: { startMs: number; endMs: number; text: string }[];
    try {
      const captionRes = await fetchWithTimeout(chosen.baseUrl, 15_000, {
        "User-Agent": source === "innertube" ? INNERTUBE_UA : BROWSER_UA,
      });

      if (!captionRes.ok) {
        console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_fetch error=HTTP ${captionRes.status}`);
        return jsonResponse({ captions: [] });
      }

      const responseText = await captionRes.text();

      if (!responseText || responseText.length === 0) {
        console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_fetch error=empty response body (source=${source})`);
        return jsonResponse({ captions: [] });
      }

      captions = parseTranscriptXml(responseText);

      if (captions.length === 0) {
        console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_parse error=no captions parsed from ${responseText.length} bytes`);
        return jsonResponse({ captions: [] });
      }
    } catch (err) {
      console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_parse error=${(err as Error).message}`);
      return jsonResponse({ captions: [] });
    }

    // ── Step 4: Write to cache ───────────────────────────────────────────────
    try {
      await serviceClient
        .from("video_captions")
        .upsert(
          { video_id: videoId, language: lang, captions, fetched_at: new Date().toISOString() },
          { onConflict: "video_id,language" }
        );
      console.log(`[CAPTION_CACHE_WRITE] video=${videoId} lang=${lang} lines=${captions.length}`);
    } catch (err) {
      // Cache write failure is non-fatal — log and continue
      console.error(`[CAPTION_CACHE_WRITE_FAILED] video=${videoId} error=${(err as Error).message}`);
    }

    return jsonResponse({ captions });
  } catch (err) {
    return errorResponse(err);
  }
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind: string;  // "asr" for auto-generated, "" for manual
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── InnerTube API (primary source) ────────────────────────────────────────────

/**
 * Fetch caption tracks via YouTube's InnerTube API using the Android client
 * context. This bypasses the timedtext endpoint restrictions because Android
 * client requests use different auth/fingerprint requirements.
 */
async function fetchTracksViaInnerTube(videoId: string): Promise<CaptionTrack[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(INNERTUBE_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": INNERTUBE_UA,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: INNERTUBE_CLIENT_VERSION,
          },
        },
        videoId,
      }),
    });
    clearTimeout(timer);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }

  if (!response.ok) {
    return [];
  }

  // deno-lint-ignore no-explicit-any
  const data: any = await response.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!Array.isArray(tracks) || tracks.length === 0) {
    return [];
  }

  return tracks.map((t: Record<string, unknown>) => ({
    baseUrl:      (t.baseUrl as string) ?? "",
    languageCode: (t.languageCode as string) ?? "",
    kind:         (t.kind as string) ?? "",
  }));
}

// ── Watch-page scraping (fallback) ────────────────────────────────────────────

/**
 * Fallback: scrape the YouTube watch page HTML to extract caption tracks
 * from the `ytInitialPlayerResponse` JSON blob.
 */
async function scrapeTracksFromWatchPage(videoId: string): Promise<CaptionTrack[]> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetchWithTimeout(watchUrl, 15_000, { "User-Agent": BROWSER_UA });

  if (!res.ok) {
    throw new Error(`Watch page returned HTTP ${res.status}`);
  }

  const html = await res.text();

  // Check for bot-block / captcha
  if (html.includes('class="g-recaptcha"')) {
    throw new Error("YouTube returned a CAPTCHA challenge");
  }

  const playerResponse = extractJsonObject(html, "ytInitialPlayerResponse");
  if (!playerResponse) {
    throw new Error("ytInitialPlayerResponse not found in watch page HTML");
  }

  const trackList =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!Array.isArray(trackList)) {
    return [];
  }

  return trackList.map((t: Record<string, unknown>) => ({
    baseUrl:      (t.baseUrl as string) ?? "",
    languageCode: (t.languageCode as string) ?? "",
    kind:         (t.kind as string) ?? "",
  }));
}

/**
 * Extract a JSON object from HTML that's assigned to a variable like:
 *   var NAME = {...};
 *
 * Uses brace-depth walking (not regex capture) to correctly handle braces
 * inside string literals. This avoids truncation at a `};` that appears
 * inside a JSON string value.
 */
// deno-lint-ignore no-explicit-any
function extractJsonObject(html: string, varName: string): any | null {
  const startToken = `var ${varName} = `;
  const startIndex = html.indexOf(startToken);
  if (startIndex === -1) return null;

  const jsonStart = startIndex + startToken.length;
  let depth = 0;

  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

// ── Transcript XML parser ─────────────────────────────────────────────────────

/**
 * Parse YouTube's caption XML response into { startMs, endMs, text }[].
 * Supports two formats:
 *   - srv3: <p t="ms" d="ms"><s>word</s>...</p>
 *   - classic: <text start="seconds" dur="seconds">content</text>
 */
function parseTranscriptXml(xml: string): { startMs: number; endMs: number; text: string }[] {
  const results: { startMs: number; endMs: number; text: string }[] = [];

  // Try srv3 format first: <p t="ms" d="ms">...<s>word</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const inner = match[3];

    // Extract text from <s> tags, or use inner text if no <s> tags
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/g, "");
    }

    text = decodeEntities(text).replace(/\n/g, " ").trim();
    if (text) {
      results.push({ startMs, endMs: startMs + durMs, text });
    }
  }

  if (results.length > 0) return results;

  // Fall back to classic format: <text start="seconds" dur="seconds">content</text>
  const textRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  while ((match = textRegex.exec(xml)) !== null) {
    const startSec = parseFloat(match[1]);
    const durSec = parseFloat(match[2]);
    const startMs = Math.round(startSec * 1000);
    const endMs = Math.round((startSec + durSec) * 1000);
    const text = decodeEntities(match[3]).replace(/\n/g, " ").trim();
    if (text) {
      results.push({ startMs, endMs, text });
    }
  }

  return results;
}

/** Decode common HTML entities in transcript text. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}
