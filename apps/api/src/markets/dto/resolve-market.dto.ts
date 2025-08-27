import { IsString, IsEnum, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { Outcome } from '@prisma/client';

export class ResolveMarketDto {
  @IsEnum(Outcome)
  outcome: Outcome;

  @IsString()
  @MaxLength(500)
  resolverNotes: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  sourceUrl?: string;
}
