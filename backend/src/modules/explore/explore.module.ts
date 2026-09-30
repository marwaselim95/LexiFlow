import { Module } from '@nestjs/common';
import { ExploreService } from './explore.service';
import { ExploreController } from './explore.controller';
import { ExploreModel } from './explore.model';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [AiModule, UsersModule],
  controllers: [ExploreController],
  providers: [ExploreService, ExploreModel],
})
export class ExploreModule {}
