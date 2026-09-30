import { Injectable } from '@nestjs/common';

import { normalizeCategory } from '../utils/normalize-category.util';
import { YoutubeModel } from './youtube.model';
import { fetchWithTimeout } from './utils/fetch-with-timeout.util';
import { BROWSER_UA, fetchTracksViaInnerTube, INNERTUBE_UA, scrapeTracksFromWatchPage } from './utils/innertube.util';
import { parseTranscriptXml } from './utils/transcript-parser.util';
import { CaptionTrack } from './types/caption-track.interface';
import { CaptionLine } from './types/caption-line.interface';
import { extractVideoId as extractVideoIdFromUrl, fetchAudioLanguages } from './utils/video-api.util';
import { Candidate } from './types/candidate.type';

// Port of supabase/functions/getVideoCaptions + the YouTube Data API logic
// from getSuggestedVideos / validateVideoUrl.

// Cache Configuration
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class YoutubeService {
  constructor(private youtubeModel: YoutubeModel) {}

  private get apiKey(): string {
    return process.env.YOUTUBE_API_KEY ?? '';
  }

  // ── Captions (port of getVideoCaptions) ─────────────────────────────────────

  async getVideoCaptions(videoId: string, lang: string): Promise<{ captions: CaptionLine[] }> {
    // Cache check
    const cached = await this.youtubeModel.findVideoCaption(videoId, lang);
    // If the cached captions exist and are still valid (not expired), return them.
    if (cached) {
      // Check if the cached captions are still valid based on the defined TTL (time-to-live).
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      // If it's valid return the cached captions, otherwise proceed to fetch new captions.
      if (age < CACHE_TTL_MS) {
        console.log(
          `[CAPTION_CACHE_HIT] video=${videoId} lang=${lang} age_days=${(age / 86400000).toFixed(1)}`,
        );
        return { captions: cached.captions as unknown as CaptionLine[] };
      }
    }

    // Step 1: discover caption tracks
    let captionTracks: CaptionTrack[]; // Array to hold the discovered caption tracks for the video.
    let source: string; // Variable to indicate the source of the caption tracks (either "innertube" or "watchpage").
    try {
      // First, attempt to fetch caption tracks using the InnerTube API. If that fails or returns no tracks, fall back to scraping the watch page for caption tracks.
      const innerTubeResult = await fetchTracksViaInnerTube(videoId);

      // If InnerTube API returns caption tracks, use them; otherwise, scrape the watch page for caption tracks.
      if (innerTubeResult && innerTubeResult.length > 0) {
        captionTracks = innerTubeResult; // Using them here
        source = 'innertube'; // Putting the source as innertube
      } else {
        // Here we scarpe
        captionTracks = await scrapeTracksFromWatchPage(videoId);
        source = 'watchpage';
      }
      // If everything fails we catch the error and log it, returning an empty captions array.
    } catch (err) {
      console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=track_discovery error=${(err as Error).message}`);
      return { captions: [] };
    }

    // Step 2: handle no tracks found (it didn't fail but returned no tracks)
    if (captionTracks.length === 0) {
      console.log(`[CAPTION_NONE] video=${videoId} — no caption tracks found`);
      return { captions: [] };
    }

    // Step 2: choose best track

    // Getting the choosen one is by getting the one with the right language and if it is not auto generated, if not we get the one with the right language and if it is auto generated, if not we get the first one.
    const chosen =
      captionTracks.find((t) => t.languageCode.startsWith(lang) && t.kind !== 'asr') ?? // Right langauge + not auto generated
      captionTracks.find((t) => t.languageCode.startsWith(lang)) ?? // Right langauge
      captionTracks[0]; // Just anything atp

    // The selected caption Track is logged for debugging purposes, including its language code, kind (manual or auto-generated), and source (InnerTube API or watch page scraping).
    console.log(`[CAPTION_TRACK_SELECTED] video=${videoId} lang=${chosen.languageCode} kind=${chosen.kind || 'manual'} source=${source}`);

    // If the chosen track has no baseUrl, log an error and return an empty captions array. The baseUrl is necessary to fetch the actual caption content.
    if (!chosen.baseUrl) {
      console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=track_selection error=selected track has no baseUrl`);
      return { captions: [] };
    }

    // Step 3: fetch caption content
    let captions: CaptionLine[];
    try {

      // Get the caption content from the chosen track's baseUrl.
      // The fetchWithTimeout method is used to make the HTTP request with a timeout, and the appropriate User-Agent header is set based on the source of the caption tracks (InnerTube API or watch page scraping).
      const captionRes = await fetchWithTimeout(chosen.baseUrl, 15_000, {
        'User-Agent': source === 'innertube' ? INNERTUBE_UA : BROWSER_UA,
      });

      // If the captionRes wasn't ok (HTTP status not in the 200-299 range), log an error and return an empty captions array. This indicates that the request to fetch the caption content failed.
      if (!captionRes.ok) {
        console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_fetch error=HTTP ${captionRes.status}`);
        return { captions: [] };
      }

      // Read the response body as text. If the response body is empty, log an error and return an empty captions array. This indicates that the caption content could not be retrieved successfully.
      const responseText = await captionRes.text();
      if (!responseText || responseText.length === 0) {
        console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_fetch error=empty response body (source=${source})`);
        return { captions: [] };
      }

      // Parse the caption content (XML) into an array of CaptionLine objects. If no captions are parsed, log an error and return an empty captions array. This indicates that the caption content could not be interpreted successfully.
      captions = parseTranscriptXml(responseText);
      if (captions.length === 0) {
        console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_parse error=no captions parsed from ${responseText.length} bytes`);
        return { captions: [] };
      }
    } catch (err) {
      console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_parse error=${(err as Error).message}`);
      return { captions: [] };
    }

    // Step 4: write cache (non-fatal on failure)
    try {
      // Upsert the fetched captions into the database cache. If the upsert operation fails, log an error but do not throw an exception, allowing the function to return the fetched captions even if caching fails.
      await this.youtubeModel.upsertVideoCaption(videoId, lang, captions);
      console.log(`[CAPTION_CACHE_WRITE] video=${videoId} lang=${lang} lines=${captions.length}`);
    } catch (err) {
      console.error(`[CAPTION_CACHE_WRITE_FAILED] video=${videoId} error=${(err as Error).message}`);
    }

    return { captions };
  }

  // ── Data API search (port of getSuggestedVideos helpers) ────────────────────

  async searchYouTube(
    query: string,
    lang: string,
    regionCode: string,
    watchedIds: Set<string>,
    maxResults: number,
  ): Promise<any[]> {
    if (!this.apiKey) throw new Error('AI_MISSING_KEY: YOUTUBE_API_KEY is not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video` +
          `&relevanceLanguage=${lang}&regionCode=${regionCode}&maxResults=${maxResults * 3}` +
          `&key=${this.apiKey}`,
        { signal: controller.signal },
      );
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);

    const data = await res.json();

    const candidates: Candidate[] = (data.items ?? []).filter(
      (item: { id: { videoId: string } }) => !watchedIds.has(item.id.videoId),
    );

    const candidateIds = candidates.map((c) => c.id.videoId);
    const audioLangMap = await fetchAudioLanguages(candidateIds, this.apiKey);

    const languageFiltered = candidates.filter((item) => audioLangMap.get(item.id.videoId) === lang);

    return languageFiltered.slice(0, maxResults).map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      thumbnailUrl:
        item.snippet.thumbnails?.high?.url ??
        item.snippet.thumbnails?.medium?.url ??
        item.snippet.thumbnails?.default?.url ??
        '',
      duration: '',
      category: normalizeCategory(query),
      language: lang,
    }));
  }

  // ── validateVideoUrl port ───────────────────────────────────────────────────

  static extractVideoId(url: string): string | null {
    return extractVideoIdFromUrl(url);
  }

  async validateVideo(videoId: string, targetLang: string): Promise<{ valid: boolean; reason?: string }> {
    if (!this.apiKey) throw new Error('AI_MISSING_KEY: YOUTUBE_API_KEY is not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${this.apiKey}`,
        { signal: controller.signal },
      );
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return { valid: false, reason: 'not_found' };

    const videoLang = (item.snippet?.defaultAudioLanguage ?? item.snippet?.defaultLanguage ?? '').slice(0, 2);
    if (targetLang && videoLang && videoLang !== targetLang) {
      return { valid: false, reason: 'wrong_language' };
    }

    return { valid: true };
  }
}
