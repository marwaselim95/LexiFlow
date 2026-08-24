import { Body, Controller, Post } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DetailCardService } from './detail-card.service';

class GenerateDetailCardDto {
  @IsString()
  text!: string;

  @IsString()
  nativeLang!: string;

  @IsString()
  targetLang!: string;
}

class CheckTyposDto {
  @IsString()
  text!: string;
}

class TranslateExplanationsDto {
  @IsArray()
  explanations!: string[];

  @IsString()
  nativeLang!: string;
}

@Controller()
export class DetailCardController {
  constructor(private readonly detailCard: DetailCardService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('detail-card')
  generateDetailCard(@CurrentUser() user, @Body() dto: GenerateDetailCardDto) {
    return this.detailCard.generateDetailCard(dto);
  }

  @Post('typos')
  checkTypos(@CurrentUser() user, @Body() dto: CheckTyposDto) {
    return this.detailCard.checkTypos(dto.text);
  }

  @Post('explanations/translate')
  translateExplanations(@CurrentUser() user, @Body() dto: TranslateExplanationsDto) {
    return this.detailCard.translateExplanations(dto.explanations, dto.nativeLang);
  }
}
