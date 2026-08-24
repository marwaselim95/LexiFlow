import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsDefined, IsNumber, IsString } from 'class-validator';

import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { MasteryService } from './mastery.service';

class SubmitAnswerDto {
  @IsString()
  wordId!: string;

  @IsString()
  reviewId!: string;

  // May be boolean or string ("true"/"false") depending on question type
  @IsDefined()
  userAnswer!: unknown;

  @IsNumber()
  questionType!: number;
}

@Controller('mastery')
export class MasteryController {
  constructor(private readonly mastery: MasteryService) {}

  @Get('session')
  getSession(@CurrentUser() user: AuthUser) {
    return this.mastery.getSession(user.id);
  }

  @Post('submit')
  submitAnswer(@CurrentUser() user: AuthUser, @Body() dto: SubmitAnswerDto) {
    return this.mastery.submitAnswer({
      userId: user.id,
      wordId: dto.wordId,
      reviewId: dto.reviewId,
      userAnswer: dto.userAnswer,
      questionType: dto.questionType,
    });
  }
}
