import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** One line on PATCH; sent as full replacement list when editing line items. */
export class UpdateDocumentLineItemDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lineTotal!: number;

  /** Display label (e.g. each); persisted in DocumentLineItem.rawData.unitLabel */
  @IsOptional()
  @IsString()
  unitLabel?: string;
}

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

  /** When set (save or confirm), replaces all line items for the document. Omit to leave lines unchanged. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => UpdateDocumentLineItemDto)
  lineItems?: UpdateDocumentLineItemDto[];

  /** Save edits only | confirm as validated | reject */
  @IsOptional()
  @IsEnum(['save', 'confirm', 'reject'])
  action?: 'save' | 'confirm' | 'reject';
}
