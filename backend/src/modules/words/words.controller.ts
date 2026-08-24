import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { WordsService } from './words.service';

class ContextBlockDto {
  @IsString()
  label!: string;

  @IsString()
  explanation!: string;

  @IsString()
  example!: string;
}

class WordPayloadDto {
  @IsString()
  headword!: string;

  @IsOptional()
  @IsArray()
  synonyms?: string[];

  @IsOptional()
  @IsArray()
  nativeSynonyms?: string[];

  @IsArray()
  contexts!: ContextBlockDto[];
}

class SaveWordDto {
  // Nested shape sent by the frontend: { word: {...}, source }
  @IsOptional()
  @IsObject()
  word?: WordPayloadDto;

  // Flat shape also accepted for convenience
  @IsOptional()
  @IsString()
  headword?: string;

  @IsOptional()
  @IsArray()
  synonyms?: string[];

  @IsOptional()
  @IsArray()
  nativeSynonyms?: string[];

  @IsOptional()
  @IsArray()
  contexts?: ContextBlockDto[];

  @IsIn(['manual', 'watch', 'explore', 'selection'])
  source!: 'manual' | 'watch' | 'explore' | 'selection';
}

class RemoveWordDto {
  @IsString()
  wordId!: string;
}

class VaultParagraphDto {
  @IsString()
  month!: string;

  @IsOptional()
  @IsArray()
  excludeWordIds?: string[];
}

@Controller('words')
export class WordsController {
  constructor(private readonly words: WordsService) {}

  // ── words ───────────────────────────────────────────────────────────────────

  @Post()
  saveWord(@CurrentUser() user: AuthUser, @Body() body: SaveWordDto) {
    // Frontend sends { word: {...}, source }; a flat shape is also accepted.
    const input = body.word
      ? {
          word: {
            headword: body.word.headword,
            synonyms: body.word.synonyms,
            nativeSynonyms: body.word.nativeSynonyms,
            contexts: body.word.contexts ?? [],
          },
          source: body.source,
        }
      : {
          word: {
            headword: body.headword ?? '',
            synonyms: body.synonyms,
            nativeSynonyms: body.nativeSynonyms,
            contexts: body.contexts ?? [],
          },
          source: body.source,
        };
    return this.words.saveWord(user.id, input as any);
  }

  @Delete(':id')
  removeWordById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.words.removeWord(user.id, id);
  }

  @Post('remove')
  removeWordBody(@CurrentUser() user: AuthUser, @Body() dto: RemoveWordDto) {
    return this.words.removeWord(user.id, dto.wordId);
  }

  // ── vault ───────────────────────────────────────────────────────────────────

  @Get('vault/months')
  getVaultMonths(@CurrentUser() user: AuthUser) {
    return this.words.getVaultMonths(user.id);
  }

  @Get('vault/words')
  getVaultWords(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    return this.words.getVaultWords(user.id, month);
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('vault/paragraph')
  generateVaultParagraph(@CurrentUser() user: AuthUser, @Body() dto: VaultParagraphDto) {
    return this.words.generateVaultParagraph(user.id, dto.month, dto.excludeWordIds ?? []);
  }
}
