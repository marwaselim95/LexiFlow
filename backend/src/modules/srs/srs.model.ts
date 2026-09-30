import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.module';
import { Tx } from './types/tx.type';

@Injectable()
export class SrsModel {
  constructor(private prisma: PrismaService) {}

  async findWordById(tx: Tx, wordId: string) {
    return tx.word.findUnique({ where: { id: wordId } });
  }

  async createReviewQueue(
    tx: Tx,
    data: {
      userId: string;
      wordId: string;
      scheduledFor: Date;
      questionType: number;
      status: string;
      targetLanguage: string;
    },
  ) {
    return tx.reviewQueue.create({ data });
  }

  async lockWordById(wordId: string) {
    return this.prisma.$queryRawUnsafe<
      Array<{
        stage: number;
        stage6_streak: number;
        active: boolean;
        mastered_at: Date | null;
        user_id: string;
      }>
    >(
      'SELECT stage, stage6_streak, active, mastered_at, user_id FROM words WHERE id = $1::uuid FOR UPDATE',
      wordId,
    );
  }

  async updateWord(
    tx: Tx,
    wordId: string,
    data: {
      stage: number;
      stage6Streak: number;
      active: boolean;
      masteredAt: Date | null;
    },
  ) {
    return tx.word.update({ where: { id: wordId }, data });
  }

  async updateReviewQueueMany(
    tx: Tx,
    reviewId: string,
    data: { status: string; currentMcq: typeof Prisma.DbNull },
  ) {
    return tx.reviewQueue.updateMany({ where: { id: reviewId }, data });
  }

  async createReviewHistory(
    tx: Tx,
    data: {
      userId: string;
      wordId: string;
      reviewId: string;
      isCorrect: boolean;
      stageBefore: number;
      stageAfter: number;
    },
  ) {
    return tx.reviewHistory.create({ data });
  }
}
