import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateDepositIntentDto {
  @IsInt({ message: 'Amount must be an integer in cents' })
  @Min(100, { message: 'Minimum deposit is $1.00 AUD' }) // $1.00 minimum
  @Max(100000000, { message: 'Maximum deposit is $1,000,000.00 AUD' }) // $1M maximum
  @Transform(({ value }) => parseInt(value, 10))
  amountCents: number;

  @IsOptional()
  @IsString()
  currency?: string = 'AUD';

  @IsOptional()
  @IsString()
  returnUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
