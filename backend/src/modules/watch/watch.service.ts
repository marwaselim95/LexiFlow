import { HttpException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';
import { YoutubeService } from '../youtube/youtube.service';
import { UsersService } from '../users/users.service';
import { normalizeCategory, CANONICAL_CATEGORIES } from '../utils/normalize-category.util';

function error(type: string, message: string, status: number): HttpException {
  return new HttpException({ error: { type, message } }, status);
}

const COLD_START_THRESHOLD = 5;
const EXPLORE_RATIO = 0.2;

const REGION_MAP: Record<string, string> = {
  ar: 'SA', zh: 'CN', nl: 'NL', en: 'US', fr: 'FR', de: 'DE',
  el: 'GR', he: 'IL', hi: 'IN', id: 'ID', it: 'IT', ja: 'JP',
  ko: 'KR', fa: 'IR', pl: 'PL', pt: 'BR', ro: 'RO', ru: 'RU',
  es: 'ES', sv: 'SE', th: 'TH', tr: 'TR', uk: 'UA', vi: 'VN',
};

@Injectable()
export class WatchService {
  constructor(
    private prisma: PrismaService,
    private youtube: YoutubeService,
    private users: UsersService,
  ) {}

  // ── getSuggestedVideos ──────────────────────────────────────────────────────

  async getSuggestedVideos(
    userId: string,
    query = '',
  ): Promise<{ videos?: any[]; promptMessage?: string }> {
    // Mock branch
    const mockYt = (process.env.USE_MOCK_YOUTUBE ?? '').trim();
    if (mockYt === 'true') {
      const label = query || 'Sample EN Lesson';
      const mockVideos = Array.from({ length: 5 }).map((_, i) => ({
        videoId: `mock_vid_${i}`,
        title: `[MOCK] ${query ? `Result for '${query}'` : 'Sample EN Lesson Video'} ${i + 1}`,
        channelName: '[MOCK] Mock Channel',
        thumbnailUrl: `https://placehold.co/320x180/153C70/FFFFFF?text=${encodeURIComponent(label)}+${i + 1}`,
        duration: '10:00',
        category: normalizeCategory(query || 'language learning'),
        language: 'en',
      }));
      return { videos: mockVideos };
    }

    const langCode = await this.users.getTargetLanguage(userId);
    const regionCode = REGION_MAP[langCode] ?? 'US';

    // ── EXPLICIT SEARCH PATH (query present) ── bypasses cold-start gate
    if (query) {
      const results = await this.youtube.searchYouTube(query, langCode, regionCode, new Set(), 20);
      return { videos: results };
    }

    // ── PASSIVE / PERSONALIZED FEED PATH ──
    const history = await this.prisma.watchHistory.findMany({
      where: { userId },
      orderBy: { watchedAt: 'desc' },
      select: { videoId: true, categories: true },
    });

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

  async validateVideoUrl(userId: string, url?: string): Promise<{ valid: boolean; reason?: string }> {
    if (!url) throw error('unknown', 'url required', 400);

    const videoId = YoutubeService.extractVideoId(url);
    if (!videoId) return { valid: false, reason: 'invalid_url' };

    const targetLang = await this.users.getTargetLanguage(userId).catch(() => '');
    return this.youtube.validateVideo(videoId, targetLang);
  }

  // ── getVideoCaptions ────────────────────────────────────────────────────────

  async getVideoCaptions(userId: string, videoId?: string): Promise<{ captions: any[] }> {
    if (!videoId) throw error('unknown', 'videoId required', 400);

    let lang = 'en';
    try {
      lang = await this.users.getTargetLanguage(userId);
    } catch {
      // fall back to 'en'
    }

    return this.youtube.getVideoCaptions(videoId, lang);
  }

  // ── recordWatchHistory ──────────────────────────────────────────────────────
  // Replaces the frontend's direct supabase.from('watch_history').insert().

  async recordWatchHistory(userId: string, videoId: string, categories: string[] = []): Promise<{ success: true }> {
    if (!videoId) throw error('unknown', 'videoId required', 400);
    await this.prisma.watchHistory.create({
      data: { userId, videoId, categories },
    });
    return { success: true };
  }
}
