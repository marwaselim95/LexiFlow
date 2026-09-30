import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class WordsModel {
  constructor(private prisma: PrismaService) {}

  async createWordWithContexts(
    tx: any,
    userId: string,
    wordData: {
      headword: string;
      nativeSynonyms: string[];
      targetLanguage: string;
      source: 'manual' | 'watch' | 'explore' | 'selection';
    },
    contexts: Array<{ label: string; explanation: string; example: string }>,
  ) {
    const created = await tx.word.create({
      data: {
        userId,
        headword: wordData.headword,
        nativeSynonyms: wordData.nativeSynonyms,
        targetLanguage: wordData.targetLanguage,
        stage: 1,
        stage6Streak: 0,
        active: true,
        source: wordData.source,
      },
    });

    await tx.wordContext.createMany({
      data: contexts.map((c, i) => ({
        wordId: created.id,
        label: c.label,
        explanation: c.explanation,
        example: c.example,
        sortOrder: i,
      })),
    });

    return created;
  }

  async deleteWord(wordId: string, userId: string) {
    await this.prisma.word.deleteMany({ where: { id: wordId, userId } });
  }

  async getWordsForMonth(
    userId: string,
    targetLanguage: string,
    startDate: Date,
    endDate: Date,
  ) {
    return this.prisma.word.findMany({
      where: {
        userId,
        targetLanguage,
        savedAt: { gte: startDate, lt: endDate },
      },
      select: { id: true, headword: true, savedAt: true },
    });
  }

  async getWordsForMonthWithContexts(
    userId: string,
    targetLanguage: string,
    startDate: Date,
    endDate: Date,
  ) {
    return this.prisma.word.findMany({
      where: {
        userId,
        targetLanguage,
        savedAt: { gte: startDate, lt: endDate },
      },
      include: { contexts: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { savedAt: 'desc' },
    });
  }
}
