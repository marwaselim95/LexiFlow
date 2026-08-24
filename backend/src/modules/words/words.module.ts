import { Module } from '@nestjs/common';
import { WordsService } from './words.service';
import { WordsController } from './words.controller';
import { SrsModule } from '../srs/srs.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [SrsModule, AiModule, UsersModule],
  controllers: [WordsController],
  providers: [WordsService],
})
export class WordsModule {}
