import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class WatchModel {
  constructor(private prisma: PrismaService) {}

  async getWatchHistory(userId: string) {
    return this.prisma.watchHistory.findMany({
      where: { userId },
      orderBy: { watchedAt: 'desc' },
      select: { videoId: true, categories: true },
    });
  }

  async createWatchHistory(userId: string, videoId: string, categories: string[]) {
    return this.prisma.watchHistory.create({
      data: { userId, videoId, categories },
    });
  }
}
