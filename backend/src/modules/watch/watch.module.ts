import { Module } from '@nestjs/common';
import { WatchService } from './watch.service';
import { WatchController, WatchHistoryController } from './watch.controller';
import { YoutubeModule } from '../youtube/youtube.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [YoutubeModule, UsersModule],
  controllers: [WatchController, WatchHistoryController],
  providers: [WatchService],
})
export class WatchModule {}
