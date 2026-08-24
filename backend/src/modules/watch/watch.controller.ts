import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';

import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { WatchService } from './watch.service';

class ValidateVideoDto {
  @IsString()
  url!: string;
}

class RecordWatchDto {
  @IsString()
  videoId!: string;

  @IsOptional()
  @IsArray()
  categories?: string[];
}

@Controller('videos')
export class WatchController {
  constructor(private readonly watch: WatchService) {}

  @Post('suggested')
  getSuggestedVideos(@CurrentUser() user: AuthUser, @Body() body: { query?: string }) {
    return this.watch.getSuggestedVideos(user.id, (body?.query ?? '').trim());
  }

  @Post('validate')
  validateVideoUrl(@CurrentUser() user: AuthUser, @Body() dto: ValidateVideoDto) {
    return this.watch.validateVideoUrl(user.id, dto.url);
  }

  @Get('captions')
  getVideoCaptions(@CurrentUser() user: AuthUser, @Query('videoId') videoId?: string) {
    return this.watch.getVideoCaptions(user.id, videoId);
  }

  // Also accept POST body form for parity with the old edge function contract
  @Post('captions')
  getVideoCaptionsBody(@CurrentUser() user: AuthUser, @Body() body: { videoId?: string }) {
    return this.watch.getVideoCaptions(user.id, body?.videoId);
  }
}

@Controller('watch')
export class WatchHistoryController {
  constructor(private readonly watch: WatchService) {}

  @Post('history')
  recordWatchHistory(@CurrentUser() user: AuthUser, @Body() dto: RecordWatchDto) {
    return this.watch.recordWatchHistory(user.id, dto.videoId, dto.categories ?? []);
  }
}
