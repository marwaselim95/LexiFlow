import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';

import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

class LanguageDto {
  @IsString()
  language!: string;
}

@Controller('languages')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getLearningLanguages(@CurrentUser() user: AuthUser) {
    return this.users.getLearningLanguagesFor(user.id);
  }

  @Post()
  addLearningLanguage(@CurrentUser() user: AuthUser, @Body() dto: LanguageDto) {
    return this.users.addLearningLanguage(user.id, dto.language);
  }

  @Post('active')
  setActiveLanguage(@CurrentUser() user: AuthUser, @Body() dto: LanguageDto) {
    return this.users.setActiveLanguage(user.id, dto.language);
  }

  @Post('native')
  updateNativeLanguage(@CurrentUser() user: AuthUser, @Body() dto: LanguageDto) {
    return this.users.updateNativeLanguage(user.id, dto.language);
  }
}
