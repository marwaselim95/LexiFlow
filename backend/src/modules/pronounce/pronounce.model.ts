import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class PronounceModel {
  constructor(private prisma: PrismaService) {}

  async getPhonemeReferences(language: string) {
    return this.prisma.phonemeReference.findMany({
      where: { language },
      orderBy: { phoneme: 'asc' },
    });
  }

  async getPhonemeAssessments(userId: string, targetLanguage: string) {
    return this.prisma.phonemeAssessment.findMany({
      where: { userId, targetLanguage },
      select: { phoneme: true, status: true },
    });
  }

  async getPhonemeExampleWord(language: string, phoneme: string) {
    return this.prisma.phonemeExampleWord.findUnique({
      where: { language_phoneme: { language, phoneme } },
      select: { word: true },
    });
  }

  async upsertPhonemeAssessment(
    userId: string,
    targetLanguage: string,
    phoneme: string,
    status: string,
  ) {
    return this.prisma.phonemeAssessment.upsert({
      where: {
        userId_targetLanguage_phoneme: {
          userId,
          targetLanguage,
          phoneme,
        },
      },
      update: { status, lastAssessedAt: new Date(), attempts: { increment: 1 } },
      create: {
        userId,
        targetLanguage,
        phoneme,
        status,
        attempts: 1,
      },
    });
  }
}
