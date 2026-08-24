import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AiModule } from './modules/ai/ai.module';
import { YoutubeModule } from './modules/youtube/youtube.module';

import { UsersModule } from './modules/users/users.module';
import { WordsModule } from './modules/words/words.module';
import { MasteryModule } from './modules/mastery/mastery.module';
import { DetailCardModule } from './modules/detail-card/detail-card.module';
import { ExploreModule } from './modules/explore/explore.module';
import { PronounceModule } from './modules/pronounce/pronounce.module';
import { WatchModule } from './modules/watch/watch.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    AiModule,
    YoutubeModule,
    AuthModule,
    UsersModule,
    WordsModule,
    MasteryModule,
    DetailCardModule,
    ExploreModule,
    PronounceModule,
    WatchModule,
  ],
  providers: [
    // Global JWT auth (all endpoints authenticated unless @Public())
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global rate limiting (replaces supabase _shared/rateLimit.ts)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
