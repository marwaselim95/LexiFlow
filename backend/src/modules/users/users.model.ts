import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class UsersModel {
  constructor(private prisma: PrismaService) {}

  async findProfileById(userId: string) {
    return this.prisma.profile.findUnique({ where: { id: userId } });
  }

  async findSupportedLanguages(codes: string[]) {
    return this.prisma.supportedLanguage.findMany({
      where: { code: { in: codes } },
      select: { code: true, name: true },
    });
  }

  async findUserLanguages(userId: string) {
    return this.prisma.userLanguage.findMany({
      where: { userId },
      orderBy: { addedAt: 'asc' },
      include: { supported: { select: { name: true } } },
    });
  }

  async upsertUserLanguage(userId: string, language: string) {
    return this.prisma.userLanguage.upsert({
      where: { userId_language: { userId, language } },
      update: {},
      create: { userId, language },
    });
  }

  async findUserLanguage(userId: string, language: string) {
    return this.prisma.userLanguage.findUnique({
      where: { userId_language: { userId, language } },
    });
  }

  async updateProfileTargetLanguage(userId: string, language: string) {
    return this.prisma.profile.update({
      where: { id: userId },
      data: { targetLanguage: language },
    });
  }

  async updateProfileNativeLanguage(userId: string, language: string) {
    return this.prisma.profile.update({
      where: { id: userId },
      data: { nativeLanguage: language },
    });
  }

  async findSupportedLanguageByCode(code: string) {
    return this.prisma.supportedLanguage.findUnique({
      where: { code },
      select: { code: true, name: true },
    });
  }
}
