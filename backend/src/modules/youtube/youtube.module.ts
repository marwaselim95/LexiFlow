import { Module } from '@nestjs/common';
import { YoutubeModel } from './youtube.model';
import { YoutubeService } from './youtube.service';

@Module({
  providers: [YoutubeService, YoutubeModel],
  exports: [YoutubeService],
})
export class YoutubeModule {}
