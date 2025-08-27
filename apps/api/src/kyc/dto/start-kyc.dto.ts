import { IsString, IsNotEmpty, IsDateString, IsOptional, IsEnum, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class StartKycDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  lastName: string;

  @IsDateString()
  dateOfBirth: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  address: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  city: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  state: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'Postcode must be 4 digits' })
  postcode: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  @Transform(({ value }) => value?.toUpperCase())
  country: string;

  @IsEnum(['PASSPORT', 'DRIVERS_LICENCE', 'NATIONAL_ID'])
  documentType: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  citizenshipCountry?: string;

  @IsOptional()
  @IsString()
  residencyCountry?: string;
}
