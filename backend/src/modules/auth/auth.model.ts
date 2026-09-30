import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class AuthModel {
  constructor(private prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUserWithProfile(email: string, passwordHash: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash },
      });

      await tx.profile.create({
        data: {
          id: created.id,
          nativeLanguage: 'en',
          targetLanguage: 'en',
          onboarded: false,
        },
      });

      await tx.userLanguage.create({
        data: { userId: created.id, language: 'en' },
      });

      return created;
    });
  }

  updateUserPassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }
}
