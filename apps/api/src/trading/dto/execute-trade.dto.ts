import { IsString, IsNumber, IsOptional, IsIn, Min, Max, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class ExecuteTradeDto {
  @IsIn(['YES', 'NO'], { message: 'Outcome must be either YES or NO' })
  outcome: 'YES' | 'NO';

  @IsOptional()
  @IsNumber({}, { message: 'Shares must be a number' })
  @Min(0.01, { message: 'Minimum shares is 0.01' })
  @Max(1000000, { message: 'Maximum shares is 1,000,000' })
  @Transform(({ value }) => parseFloat(value))
  shares?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Max spend must be a number' })
  @Min(100, { message: 'Minimum spend is $1.00 (100 cents)' })
  @Max(10000000, { message: 'Maximum spend is $100,000 (10M cents)' })
  @Transform(({ value }) => parseInt(value, 10))
  maxSpendCents?: number;

  @IsOptional()
  @IsString()
  @Length(1, 500, { message: 'Quote signature must be between 1 and 500 characters' })
  quoteSignature?: string;

  @IsString()
  @Length(1, 100, { message: 'Idempotency key must be between 1 and 100 characters' })
  idempotencyKey: string;
}
