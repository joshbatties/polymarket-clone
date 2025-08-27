import { IsString, IsOptional, MaxLength } from 'class-validator';

export class ApproveWithdrawalDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reviewNotes?: string;
}

export class RejectWithdrawalDto {
  @IsString()
  @MaxLength(500)
  reviewNotes: string; // Required for rejections
}
