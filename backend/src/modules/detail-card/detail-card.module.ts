import { Module } from '@nestjs/common';
import { DetailCardService } from './detail-card.service';
import { DetailCardController } from './detail-card.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [DetailCardController],
  providers: [DetailCardService],
})
export class DetailCardModule {}
