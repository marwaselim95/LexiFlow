import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.module';

// Port of the Postgres RPCs schedule_review + on_answer
// (supabase/migrations/003_rpc_functions.sql and 009_multi_language_support.sql).

// Delay intervals per stage (from migration 003)
const STAGE_DELAY_MS: Record<number, number> = {
  1: 3 * 60 * 60 * 1000, // 3 hours
  2: 24 * 60 * 60 * 1000, // 1 day
  3: 3 * 24 * 60 * 60 * 1000, // 3 days
  4: 7 * 24 * 60 * 60 * 1000, // 1 week
  5: 21 * 24 * 60 * 60 * 1000, // 3 weeks
  6: 61 * 24 * 60 * 60 * 1000, // 2 months (approx)
};

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

@Injectable()
export class SrsService {
  constructor(private prisma: PrismaService) {}

  /** Inserts one pending review_queue row for the word based on its current stage. */
  async scheduleReview(tx: Tx, wordId: string): Promise<void> {
    const word = await tx.word.findUnique({ where: { id: wordId } });
    if (!word) throw new NotFoundException(`word not found: ${wordId}`);

    const delayMs = STAGE_DELAY_MS[word.stage] ?? STAGE_DELAY_MS[2];
    const scheduledFor = new Date(Date.now() + delayMs);
    // Question type mirrors the stage number exactly
    const questionType = word.stage;

    await tx.reviewQueue.create({
      data: {
        userId: word.userId,
        wordId,
        scheduledFor,
        questionType,
        status: 'pending',
        targetLanguage: word.targetLanguage,
      },
    });
  }

  /**
   * Processes one answered review item transactionally:
   *   1. Updates words.stage / stage6_streak / active / mastered_at
   *   2. Marks the review_queue row as completed (clearing current_mcq cache)
   *   3. Inserts a review_history row
   *   4. Schedules the next review unless the word is now mastered
   * Returns { isCorrect, newStage }.
   */
  async onAnswer(
    reviewId: string,
    wordId: string,
    isCorrect: boolean,
  ): Promise<{ isCorrect: boolean; newStage: number }> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the word row for the duration of the transaction
      // (equivalent of SELECT ... FOR UPDATE in the original RPC).
      const lockRows = await tx.$queryRawUnsafe<Array<{ stage: number; stage6_streak: number; active: boolean; mastered_at: Date | null; user_id: string }>>(
        'SELECT stage, stage6_streak, active, mastered_at, user_id FROM words WHERE id = $1::uuid FOR UPDATE',
        wordId,
      );
      if (!lockRows || lockRows.length === 0) {
        throw new NotFoundException(`word not found: ${wordId}`);
      }
      const locked = lockRows[0];

      const stageBefore = locked.stage;
      let streak = locked.stage6_streak;
      let active = locked.active;
      let masteredAt = locked.mastered_at;
      let stageAfter = stageBefore;

      // OnAnswer state machine (spec verbatim)
      if (stageBefore === 1) {
        stageAfter = isCorrect ? 2 : 1;
      } else if (stageBefore === 2) {
        stageAfter = isCorrect ? 3 : 2;
      } else if (stageBefore === 3) {
        stageAfter = isCorrect ? 4 : 2;
      } else if (stageBefore === 4) {
        stageAfter = isCorrect ? 5 : 2;
      } else if (stageBefore === 5) {
        stageAfter = isCorrect ? 6 : 2;
      } else if (stageBefore === 6) {
        if (isCorrect) {
          streak += 1;
          if (streak >= 3) {
            active = false;
            masteredAt = new Date();
          }
          stageAfter = 6;
        } else {
          stageAfter = 2;
          streak = 0;
        }
      }

      await tx.word.update({
        where: { id: wordId },
        data: {
          stage: stageAfter,
          stage6Streak: streak,
          active,
          masteredAt,
        },
      });

      // Mark queue item done and clear cached question so the next cycle
      // generates a fresh one (belt-and-suspenders from submitAnswer).
      await tx.reviewQueue.updateMany({
        where: { id: reviewId },
        data: { status: 'completed', currentMcq: Prisma.DbNull },
      });

      await tx.reviewHistory.create({
        data: {
          userId: locked.user_id,
          wordId,
          reviewId,
          isCorrect,
          stageBefore,
          stageAfter,
        },
      });

      // Schedule next review only if the word is still active
      if (active) {
        await this.scheduleReview(tx, wordId);
      }

      return { isCorrect, newStage: stageAfter };
    });
  }
}
