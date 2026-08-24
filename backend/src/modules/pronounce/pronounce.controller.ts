import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString } from 'class-validator';

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PronounceService } from './pronounce.service';

class WordForPhonemeDto {
  @IsString()
  phoneme!: string;
}

@Controller()
export class PronounceController {
  constructor(private readonly pronounce: PronounceService) {}

  @Get('phonemes')
  getPhonemeList(@CurrentUser() user: AuthUser) {
    return this.pronounce.getPhonemeList(user.id);
  }

  // Accept both GET /phonemes/word?phoneme=... and POST body
  @Get('phonemes/word')
  getWordForPhonemeQuery(@CurrentUser() user: AuthUser, @Query('phoneme') phoneme?: string) {
    return this.pronounce.getWordForPhoneme(user.id, phoneme);
  }

  @Post('phonemes/word')
  getWordForPhonemeBody(@CurrentUser() user: AuthUser, @Body() dto: WordForPhonemeDto) {
    return this.pronounce.getWordForPhoneme(user.id, dto.phoneme);
  }

  // Multipart upload: audio file + word + targetLang (matches the frontend FormData call)
  @Post('pronunciation/assess')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024 } }))
  assessPronunciation(
    @CurrentUser() user: AuthUser,
    @UploadedFile() audio: Express.Multer.File | undefined,
    @Body('word') word?: string,
    @Body('targetLang') targetLang?: string,
  ) {
    return this.pronounce.assessPronunciation({
      userId: user.id,
      audioBuffer: audio?.buffer ?? Buffer.alloc(0),
      word: word ?? '',
      targetLang: targetLang ?? '',
    });
  }
}
