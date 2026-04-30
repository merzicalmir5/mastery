import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateDocumentDto {
  @IsOptional()
  @IsEnum(['INVOICE', 'PURCHASE_ORDER'])
  documentType?: 'INVOICE' | 'PURCHASE_ORDER';

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total?: number;

  /** Save edits only | confirm as validated | reject */
  @IsOptional()
  @IsEnum(['save', 'confirm', 'reject'])
  action?: 'save' | 'confirm' | 'reject';
}
