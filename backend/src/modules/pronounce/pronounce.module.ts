import { Module } from '@nestjs/common';
import { PronounceService } from './pronounce.service';
import { PronounceController } from './pronounce.controller';
import { SpeechModule } from '../speech/speech.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [SpeechModule, UsersModule],
  controllers: [PronounceController],
  providers: [PronounceService],
})
export class PronounceModule {}
