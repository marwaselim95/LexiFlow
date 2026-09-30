import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class ExploreModel {
  constructor(private prisma: PrismaService) {}

  async getVaultWords(userId: string, targetLanguage: string, limit: number) {
    return this.prisma.word.findMany({
      where: { userId, targetLanguage },
      select: { id: true, headword: true },
      orderBy: { savedAt: 'desc' },
      take: limit,
    });
  }
}
