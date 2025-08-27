import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class SeedMarketDto {
  @IsNumber({}, { message: 'Liquidity pool amount must be a number' })
  @Min(1000, { message: 'Minimum liquidity is $10.00 (1000 cents)' })
  @Max(10000000000, { message: 'Maximum liquidity is $100M (10B cents)' })
  @Transform(({ value }) => parseInt(value, 10))
  liquidityPoolCents: number;

  @IsOptional()
  @IsNumber({}, { message: 'Initial YES price must be a number' })
  @Min(0.01, { message: 'Initial YES price must be at least 0.01 (1%)' })
  @Max(0.99, { message: 'Initial YES price must be at most 0.99 (99%)' })
  @Transform(({ value }) => parseFloat(value))
  initialPriceYes?: number;
}
