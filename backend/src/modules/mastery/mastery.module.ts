import { Module } from '@nestjs/common';
import { MasteryService } from './mastery.service';
import { MasteryController } from './mastery.controller';
import { SrsModule } from '../srs/srs.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [SrsModule, AiModule, UsersModule],
  controllers: [MasteryController],
  providers: [MasteryService],
})
export class MasteryModule {}
