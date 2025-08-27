import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  bankName: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  accountName: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'BSB must be 6 digits' })
  bsb: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 20)
  @Matches(/^\d+$/, { message: 'Account number must contain only digits' })
  accountNumber: string;
}
