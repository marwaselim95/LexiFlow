import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ExploreService } from './explore.service';

class SearchExploreDto {
  @IsString()
  query!: string;

  @IsIn(['native', 'target'])
  lang!: 'native' | 'target';
}

@Controller('explore')
export class ExploreController {
  constructor(private readonly explore: ExploreService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('suggestions')
  getSuggestions(@CurrentUser() user: AuthUser) {
    return this.explore.getSuggestions(user.id);
  }

  @Post('search')
  search(@CurrentUser() user: AuthUser, @Body() dto: SearchExploreDto) {
    return this.explore.search(user.id, dto.query, dto.lang);
  }
}
