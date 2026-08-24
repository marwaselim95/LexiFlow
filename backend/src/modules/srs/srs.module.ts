import { Module } from '@nestjs/common';
import { SrsService } from './srs.service';

@Module({
  providers: [SrsService],
  exports: [SrsService],
})
export class SrsModule {}
