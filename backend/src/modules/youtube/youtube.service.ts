import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';
import { normalizeCategory, CANONICAL_CATEGORIES } from '../utils/normalize-category.util';

// Port of supabase/functions/getVideoCaptions + the YouTube Data API logic
// from getSuggestedVideos / validateVideoUrl.

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// InnerTube API (Android client) — primary caption source.
const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const INNERTUBE_CLIENT_VERSION = '20.10.38';
const INNERTUBE_UA = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36,gzip(gfe)';

export interface CaptionLine {
  startMs: number;
  endMs: number;
  text: string;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind: string; // "asr" for auto-generated, "" for manual
}

@Injectable()
export class YoutubeService {
  constructor(private prisma: PrismaService) {}

  private get apiKey(): string {
    return process.env.YOUTUBE_API_KEY ?? '';
  }

  // ── Captions (port of getVideoCaptions) ─────────────────────────────────────

  async getVideoCaptions(videoId: string, lang: string): Promise<{ captions: CaptionLine[] }> {
    // Cache check
    const cached = await this.prisma.videoCaption.findUnique({
      where: { videoId_language: { videoId, language: lang } },
    });
    if (cached) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        console.log(
          `[CAPTION_CACHE_HIT] video=${videoId} lang=${lang} age_days=${(age / 86400000).toFixed(1)}`,
        );
        return { captions: cached.captions as unknown as CaptionLine[] };
      }
    }

    // Step 1: discover caption tracks
    let captionTracks: CaptionTrack[];
    let source: string;
    try {
      const innerTubeResult = await this.fetchTracksViaInnerTube(videoId);
      if (innerTubeResult && innerTubeResult.length > 0) {
        captionTracks = innerTubeResult;
        source = 'innertube';
      } else {
        captionTracks = await this.scrapeTracksFromWatchPage(videoId);
        source = 'watchpage';
      }
    } catch (err) {
      console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=track_discovery error=${(err as Error).message}`);
      return { captions: [] };
    }

    if (captionTracks.length === 0) {
      console.log(`[CAPTION_NONE] video=${videoId} — no caption tracks found`);
      return { captions: [] };
    }

    // Step 2: choose best track
    const chosen =
      captionTracks.find((t) => t.languageCode.startsWith(lang) && t.kind !== 'asr') ??
      captionTracks.find((t) => t.languageCode.startsWith(lang)) ??
      captionTracks[0];

    console.log(`[CAPTION_TRACK_SELECTED] video=${videoId} lang=${chosen.languageCode} kind=${chosen.kind || 'manual'} source=${source}`);

    if (!chosen.baseUrl) {
      console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=track_selection error=selected track has no baseUrl`);
      return { captions: [] };
    }

    // Step 3: fetch caption content
    let captions: CaptionLine[];
    try {
      const captionRes = await this.fetchWithTimeout(chosen.baseUrl, 15_000, {
        'User-Agent': source === 'innertube' ? INNERTUBE_UA : BROWSER_UA,
      });

      if (!captionRes.ok) {
        console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_fetch error=HTTP ${captionRes.status}`);
        return { captions: [] };
      }

      const responseText = await captionRes.text();
      if (!responseText || responseText.length === 0) {
        console.error(`[CAPTION_SCRAPE_FAILED] video=${videoId} stage=caption_fetch error=empty response body (source=${source})`);
        return { captions: [] };
      }

      captions = this.parseTranscriptXml(responseText);
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
      await this.prisma.videoCaption.upsert({
        where: { videoId_language: { videoId, language: lang } },
        update: { captions: captions as any, fetchedAt: new Date() },
        create: { videoId, language: lang, captions: captions as any },
      });
      console.log(`[CAPTION_CACHE_WRITE] video=${videoId} lang=${lang} lines=${captions.length}`);
    } catch (err) {
      console.error(`[CAPTION_CACHE_WRITE_FAILED] video=${videoId} error=${(err as Error).message}`);
    }

    return { captions };
  }

  private async fetchWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal, headers });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchTracksViaInnerTube(videoId: string): Promise<CaptionTrack[]> {
    const res = await this.fetchWithTimeout(INNERTUBE_API_URL, 10_000, {
      'Content-Type': 'application/json',
      'User-Agent': INNERTUBE_UA,
    });
    if (!res.ok) return [];

    const data: any = await res.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) return [];

    return tracks.map((t: Record<string, unknown>) => ({
      baseUrl: (t.baseUrl as string) ?? '',
      languageCode: (t.languageCode as string) ?? '',
      kind: (t.kind as string) ?? '',
    }));
  }

  private async scrapeTracksFromWatchPage(videoId: string): Promise<CaptionTrack[]> {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await this.fetchWithTimeout(watchUrl, 15_000, { 'User-Agent': BROWSER_UA });

    if (!res.ok) throw new Error(`Watch page returned HTTP ${res.status}`);

    const html = await res.text();
    if (html.includes('class="g-recaptcha"')) {
      throw new Error('YouTube returned a CAPTCHA challenge');
    }

    const playerResponse = this.extractJsonObject(html, 'ytInitialPlayerResponse');
    if (!playerResponse) throw new Error('ytInitialPlayerResponse not found in watch page HTML');

    const trackList = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(trackList)) return [];

    return trackList.map((t: Record<string, unknown>) => ({
      baseUrl: (t.baseUrl as string) ?? '',
      languageCode: (t.languageCode as string) ?? '',
      kind: (t.kind as string) ?? '',
    }));
  }

  private extractJsonObject(html: string, varName: string): any | null {
    const startToken = `var ${varName} = `;
    const startIndex = html.indexOf(startToken);
    if (startIndex === -1) return null;

    const jsonStart = startIndex + startToken.length;
    let depth = 0;

    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') {
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

  private parseTranscriptXml(xml: string): CaptionLine[] {
    const results: CaptionLine[] = [];

    // srv3 format first: <p t="ms" d="ms">...<s>word</s>...</p>
    const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    let match: RegExpExecArray | null;

    while ((match = pRegex.exec(xml)) !== null) {
      const startMs = parseInt(match[1], 10);
      const durMs = parseInt(match[2], 10);
      const inner = match[3];

      let text = '';
      const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      let sMatch: RegExpExecArray | null;
      while ((sMatch = sRegex.exec(inner)) !== null) {
        text += sMatch[1];
      }
      if (!text) text = inner.replace(/<[^>]+>/g, '');

      text = this.decodeEntities(text).replace(/\n/g, ' ').trim();
      if (text) results.push({ startMs, endMs: startMs + durMs, text });
    }

    if (results.length > 0) return results;

    // Classic format fallback
    const textRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
    while ((match = textRegex.exec(xml)) !== null) {
      const startSec = parseFloat(match[1]);
      const durSec = parseFloat(match[2]);
      const startMs = Math.round(startSec * 1000);
      const endMs = Math.round((startSec + durSec) * 1000);
      const text = this.decodeEntities(match[3]).replace(/\n/g, ' ').trim();
      if (text) results.push({ startMs, endMs, text });
    }

    return results;
  }

  private decodeEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
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

    type Candidate = {
      id: { videoId: string };
      snippet: {
        title: string;
        thumbnails: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
        channelTitle: string;
      };
    };

    const candidates: Candidate[] = (data.items ?? []).filter(
      (item: { id: { videoId: string } }) => !watchedIds.has(item.id.videoId),
    );

    const candidateIds = candidates.map((c) => c.id.videoId);
    const audioLangMap = await this.fetchAudioLanguages(candidateIds);

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

  private async fetchAudioLanguages(videoIds: string[]): Promise<Map<string, string>> {
    if (videoIds.length === 0) return new Map();
    if (!this.apiKey) return new Map();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}&key=${this.apiKey}`,
        { signal: controller.signal },
      );
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) throw new Error(`YouTube videos API HTTP ${res.status}`);

    const data = await res.json();
    const langMap = new Map<string, string>();
    for (const item of data.items ?? []) {
      const audioLang: string | undefined =
        item.snippet?.defaultAudioLanguage ?? item.snippet?.defaultLanguage;
      if (audioLang) {
        langMap.set(item.id, audioLang.split('-')[0].toLowerCase());
      }
    }
    return langMap;
  }

  // ── validateVideoUrl port ───────────────────────────────────────────────────

  static extractVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1);
      if (parsed.hostname.includes('youtube.com')) return parsed.searchParams.get('v');
    } catch {
      // not a URL
    }
    return null;
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
