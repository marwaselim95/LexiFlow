import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class YoutubeModel {
  constructor(private prisma: PrismaService) {}

  async findVideoCaption(videoId: string, lang: string) {
    return this.prisma.videoCaption.findUnique({
      where: { videoId_language: { videoId, language: lang } },
    });
  }

  async upsertVideoCaption(videoId: string, lang: string, captions: any) {
    return this.prisma.videoCaption.upsert({
      where: { videoId_language: { videoId, language: lang } },
      update: { captions, fetchedAt: new Date() },
      create: { videoId, language: lang, captions },
    });
  }
}
