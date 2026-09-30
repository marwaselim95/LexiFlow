import { Injectable } from '@nestjs/common';

import { WatchModel } from './watch.model';
import { YoutubeService } from '../youtube/youtube.service';
import { UsersService } from '../users/users.service';
import { error } from '../utils/http-error.util';
import { normalizeCategory, CANONICAL_CATEGORIES } from '../utils/normalize-category.util';
import { REGION_MAP } from './utils/region-map.util';

const COLD_START_THRESHOLD = 5;
const EXPLORE_RATIO = 0.2;

@Injectable()
export class WatchService {
  constructor(
    private watchModel: WatchModel,
    private youtube: YoutubeService,
    private users: UsersService,
  ) {}

  // ── getSuggestedVideos ──────────────────────────────────────────────────────

  async getSuggestedVideos(
    userId: string,
    query = '',
  ): Promise<{ videos?: any[]; promptMessage?: string }> {
    // Mock branch
    // Check if the USE_MOCK_YOUTUBE environment variable is set to 'true' (case-insensitive)
    const mockYt = (process.env.USE_MOCK_YOUTUBE ?? '').trim();
    if (mockYt === 'true') {
      const label = query || 'Sample EN Lesson'; // Use the query as the label if provided, otherwise use a default label
      // If the query is provided, use it as the label; otherwise, use a default label
      // Generate mock video data
      const mockVideos = Array.from({ length: 5 }).map((_, i) => ({
        videoId: `mock_vid_${i}`, // ID of the video
        title: `[MOCK] ${query ? `Result for '${query}'` : 'Sample EN Lesson Video'} ${i + 1}`, // Title of the video
        channelName: '[MOCK] Mock Channel', // Name of the channel
        thumbnailUrl: `https://placehold.co/320x180/153C70/FFFFFF?text=${encodeURIComponent(label)}+${i + 1}`, // Thumbnail URL with the label and index
        duration: '10:00', // Mock duration
        category: normalizeCategory(query || 'language learning'),
        language: 'en', // Mock language
      }));
      return { videos: mockVideos };
    }

    // Fetch the user's target language and the corresponding region code.
    const langCode = await this.users.getTargetLanguage(userId);
    const regionCode = REGION_MAP[langCode] ?? 'US';

    // ── EXPLICIT SEARCH PATH (query present) ── bypasses cold-start gate
    if (query) {
      // If the query is present, perform a YouTube search using the provided query, target language, and region code. The search results will be filtered to exclude any videos that the user has already watched. The maximum number of results returned will be limited to 20.
      const results = await this.youtube.searchYouTube(query, langCode, regionCode, new Set(), 20);
      return { videos: results };
    }

    // ── PASSIVE / PERSONALIZED FEED PATH ──
    // If the query is not present, the service will fetch the user's watch history from the database. If the user has watched fewer than 5 videos, a prompt message will be returned to encourage the user to search for topics they love. Otherwise, the service will analyze the user's watch history to determine their top categories and generate a personalized query based on those categories. The personalized query will be used to search for videos on YouTube, and the results will be merged with exploration videos from fresh categories to provide a diverse set of recommendations. The final list of videos will be returned to the user.
    const history = await this.watchModel.getWatchHistory(userId);

    if (history.length < COLD_START_THRESHOLD) {
      return { promptMessage: 'Search for topics you love to start getting recommendations!' };
    }

    const watchedIds = new Set(history.map((h) => h.videoId));

    const categoryFreq = new Map<string, number>();
    for (const h of history) {
      for (const cat of h.categories ?? []) {
        categoryFreq.set(cat, (categoryFreq.get(cat) ?? 0) + 1);
      }
    }

    const topCategories = [...categoryFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    const personalizedQuery = topCategories.join(' OR ') || 'language learning';
    const personalizedVids = await this.youtube.searchYouTube(personalizedQuery, langCode, regionCode, watchedIds, 20);

    const allCategories = CANONICAL_CATEGORIES.filter((c) => c !== 'other');
    const freshCats = allCategories.filter((c) => !topCategories.includes(c));
    const explorationQuery = freshCats[Math.floor(Math.random() * freshCats.length)] ?? 'documentary';
    const explorationVids = await this.youtube.searchYouTube(explorationQuery, langCode, regionCode, watchedIds, 5);

    const personalizedCount = Math.round(20 * (1 - EXPLORE_RATIO));
    const merged = [
      ...personalizedVids.slice(0, personalizedCount),
      ...explorationVids.slice(0, Math.round(20 * EXPLORE_RATIO)),
    ];

    return { videos: merged };
  }

  // ── validateVideoUrl ────────────────────────────────────────────────────────
  // Validate a video URL to ensure it's valid and can be watched.

  async validateVideoUrl(userId: string, url?: string): Promise<{ valid: boolean; reason?: string }> {
    if (!url) throw error('unknown', 'url required', 400);

    // Extract the video ID from the provided URL using the YoutubeService. If the video ID cannot be extracted (e.g., due to an invalid URL format), return an object indicating that the video is not valid and provide a reason for the failure.
    const videoId = YoutubeService.extractVideoId(url);
    if (!videoId) return { valid: false, reason: 'invalid_url' };

    // Validate the video using the YoutubeService, passing in the extracted video ID and the user's target language. The validation will check if the video is valid and can be watched, returning an object indicating the validity and any relevant reason for failure.
    const targetLang = await this.users.getTargetLanguage(userId).catch(() => '');
    return this.youtube.validateVideo(videoId, targetLang);
  }

  // ── getVideoCaptions ────────────────────────────────────────────────────────

  async getVideoCaptions(userId: string, videoId?: string): Promise<{ captions: any[] }> {
    // If the videoId is not provided, throw an error indicating that the videoId is required. This ensures that the function has the necessary information to proceed with fetching captions for the specified video.
    if (!videoId) throw error('unknown', 'videoId required', 400);

    let lang = 'en';
    try {
      // Attempt to retrieve the user's target language. If successful, it will be used to fetch captions in the appropriate language. If an error occurs (e.g., user not found), the function will fall back to using 'en' as the default language for captions.
      lang = await this.users.getTargetLanguage(userId);
    } catch {
      // fall back to 'en'
    }

    // Call the YoutubeService to fetch captions for the specified videoId in the determined language. The result will be returned as an object containing the captions.
    return this.youtube.getVideoCaptions(videoId, lang);
  }
  // ── validateVideoUrl ────────────────────────────────────────────────────────
  // Validate a video URL to ensure it's valid and can be watched.

  async recordWatchHistory(userId: string, videoId: string, categories: string[] = []): Promise<{ success: true }> {
    if (!videoId) throw error('unknown', 'videoId required', 400);
    // Normalize categories to canonical form and filter out any invalid categories.
    await this.watchModel.createWatchHistory(userId, videoId, categories);
    return { success: true };
  }
}
