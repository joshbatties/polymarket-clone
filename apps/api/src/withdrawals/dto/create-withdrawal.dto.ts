import { IsNumber, IsString, IsOptional, Min, IsUUID } from 'class-validator';

export class CreateWithdrawalDto {
  @IsNumber()
  @Min(100) // Minimum $1.00 withdrawal
  amountCents: number;

  @IsString()
  @IsOptional()
  @IsUUID()
  bankAccountId?: string; // Optional - will use primary if not specified

  @IsString()
  @IsOptional()
  currency?: string = 'AUD';
}
