import { IsIn, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class QuoteRequestDto {
  @IsIn(['YES', 'NO'], { message: 'Outcome must be either YES or NO' })
  outcome: 'YES' | 'NO';

  @IsNumber({}, { message: 'Shares must be a number' })
  @Min(0.01, { message: 'Minimum shares is 0.01' })
  @Max(1000000, { message: 'Maximum shares is 1,000,000' })
  @Transform(({ value }) => parseFloat(value))
  shares: number;

  @IsOptional()
  @IsIn(['buy', 'sell'], { message: 'Type must be either buy or sell' })
  type?: 'buy' | 'sell';
}
