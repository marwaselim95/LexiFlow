import { Module } from '@nestjs/common';
import { SrsService } from './srs.service';
import { SrsModel } from './srs.model';

@Module({
  providers: [SrsService, SrsModel],
  exports: [SrsService],
})
export class SrsModule {}
