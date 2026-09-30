import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class MasteryModel {
  constructor(private prisma: PrismaService) {}

  async getReviewQueue(userId: string, targetLanguage: string, limit: number) {
    return this.prisma.reviewQueue.findMany({
      where: {
        userId,
        targetLanguage,
        status: 'pending',
        scheduledFor: { lte: new Date() },
      },
      orderBy: { scheduledFor: 'asc' },
      take: limit,
      select: { id: true, wordId: true, questionType: true, scheduledFor: true, currentMcq: true },
    });
  }

  async getWordsByIds(wordIds: string[]) {
    return this.prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: {
        id: true,
        headword: true,
        nativeSynonyms: true,
        stage: true,
        contexts: { select: { label: true, explanation: true, example: true } },
      },
    });
  }

  async updateReviewQueueMcq(id: string, currentMcq: any) {
    return this.prisma.reviewQueue.update({
      where: { id },
      data: { currentMcq },
    });
  }

  async findWordByIdAndUserId(wordId: string, userId: string) {
    return this.prisma.word.findFirst({
      where: { id: wordId, userId },
      include: { contexts: { select: { label: true, explanation: true } } },
    });
  }
}
