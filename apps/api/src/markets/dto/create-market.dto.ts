import { IsString, IsNumber, IsOptional, IsUrl, IsDateString, Min, Max, Length, Matches } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateMarketDto {
  @IsString()
  @Length(3, 100, { message: 'Slug must be between 3 and 100 characters' })
  @Matches(/^[a-z0-9-_]+$/, { message: 'Slug can only contain lowercase letters, numbers, hyphens, and underscores' })
  slug: string;

  @IsString()
  @Length(5, 200, { message: 'Title must be between 5 and 200 characters' })
  title: string;

  @IsString()
  @Length(10, 2000, { message: 'Description must be between 10 and 2000 characters' })
  description: string;

  @IsString()
  @Length(2, 50, { message: 'Category must be between 2 and 50 characters' })
  category: string;

  @IsOptional()
  @IsUrl({}, { message: 'Image URL must be a valid URL' })
  imageUrl?: string;

  @IsNumber({}, { message: 'Liquidity parameter must be a number' })
  @Min(1, { message: 'Liquidity parameter must be at least 1' })
  @Max(10000, { message: 'Liquidity parameter must be at most 10000' })
  @Transform(({ value }) => parseFloat(value))
  liquidityParam: number;

  @IsOptional()
  @IsNumber({}, { message: 'Minimum trade amount must be a number' })
  @Min(100, { message: 'Minimum trade amount must be at least $1.00 (100 cents)' })
  @Max(10000000, { message: 'Minimum trade amount must be at most $100,000 (10M cents)' })
  @Transform(({ value }) => parseInt(value, 10))
  minTradeCents?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Maximum trade amount must be a number' })
  @Min(1000, { message: 'Maximum trade amount must be at least $10.00 (1000 cents)' })
  @Max(1000000000, { message: 'Maximum trade amount must be at most $10M (1B cents)' })
  @Transform(({ value }) => parseInt(value, 10))
  maxTradeCents?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Open date must be a valid ISO 8601 date string' })
  @Type(() => Date)
  openAt?: Date;

  @IsDateString({}, { message: 'Close date must be a valid ISO 8601 date string' })
  @Type(() => Date)
  closeAt: Date;

  @IsOptional()
  @IsDateString({}, { message: 'Resolve date must be a valid ISO 8601 date string' })
  @Type(() => Date)
  resolveAt?: Date;

  @IsOptional()
  @IsUrl({}, { message: 'Resolution source URL must be a valid URL' })
  resolutionSourceUrl?: string;
}
