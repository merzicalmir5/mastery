import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Document,
  DocumentLineItem,
  DocumentSourceType,
  DocumentStatus,
  DocumentType,
  DocumentValidationIssue,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { JwtUser } from '../../core/auth/current-user.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentValidationService } from './document-validation.service';
import { UpdateDocumentDto } from './dto/update-document.dto';

export type DocumentApiRow = {
  id: string;
  companyName: string;
  fileName: string;
  originalMimeType: string | null;
  storagePath: string | null;
  sourceType: DocumentSourceType;
  documentType: string | null;
  documentNumber: string | null;
  supplierName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  status: DocumentStatus;
  ingestionNotes: string | null;
  uploadedByUserId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: {
    id: string;
    itemOrder: number;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  validationIssues: {
    id: string;
    fieldPath: string;
    code: string;
    message: string;
    severity: string;
  }[];
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

@Injectable()
export class DocumentsService {
  private readonly uploadRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly extraction: DocumentExtractionService,
    private readonly validation: DocumentValidationService,
  ) {
    this.uploadRoot = this.config.get<string>('UPLOAD_DIR') ?? path.join(process.cwd(), 'uploads');
  }

  async upload(file: Express.Multer.File, user: JwtUser): Promise<DocumentApiRow> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Empty file.');
    }
    const ext = path.extname(file.originalname).toLowerCase();
    let sourceType: DocumentSourceType;
    try {
      sourceType = this.mapExtToSourceType(ext);
    } catch {
      throw new BadRequestException(`Unsupported extension: ${ext || '(none)'}`);
    }

    const duplicate = await this.prisma.document.findFirst({
      where: {
        companyName: user.companyName,
        fileName: file.originalname,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('A document with the same file name already exists.');
    }

    const id = randomUUID();
    const relDir = user.sub;
    const dir = path.join(this.uploadRoot, relDir);
    await fs.mkdir(dir, { recursive: true });
    const storedFileName = `${id}${ext}`;
    const absolutePath = path.join(dir, storedFileName);
    const storagePath = path.posix.join(relDir.replace(/\\/g, '/'), storedFileName);

    await fs.writeFile(absolutePath, file.buffer);
    console.log('[documents.upload] saved file', {
      originalName: file.originalname,
      mimeType: file.mimetype,
      sourceType,
      absolutePath,
      storagePath,
      size: file.size,
    });

    await this.prisma.document.create({
      data: {
        id,
        companyName: user.companyName,
        fileName: file.originalname,
        originalMimeType: file.mimetype,
        storagePath,
        sourceType,
        uploadedByUserId: user.sub,
        status: DocumentStatus.UPLOADED,
      },
    });

    await this.processDocument(id, absolutePath, sourceType);
    return this.findOne(id, user);
  }

  async findAllForUser(
    user: JwtUser,
    params: { page: number; pageSize: number; status?: string },
  ): Promise<PaginatedResult<DocumentApiRow>> {
    const page = Number.isFinite(params.page) ? Math.max(1, Math.trunc(params.page)) : 1;
    const pageSizeRaw = Number.isFinite(params.pageSize) ? Math.trunc(params.pageSize) : 10;
    const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
    const status = this.mapStatusFilter(params.status);
    const where: Prisma.DocumentWhereInput = {
      companyName: user.companyName,
      ...(status ? { status } : {}),
    };
    const skip = (page - 1) * pageSize;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: {
          lineItems: { orderBy: { itemOrder: 'asc' } },
          validationIssues: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toApiRow(r)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findAllForUserUnpaged(user: JwtUser): Promise<DocumentApiRow[]> {
    const rows = await this.prisma.document.findMany({
      where: { companyName: user.companyName },
      include: {
        lineItems: { orderBy: { itemOrder: 'asc' } },
        validationIssues: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toApiRow(r));
  }

  async findOne(id: string, user: JwtUser): Promise<DocumentApiRow> {
    const row = await this.prisma.document.findFirst({
      where: { id, companyName: user.companyName },
      include: {
        lineItems: { orderBy: { itemOrder: 'asc' } },
        validationIssues: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException('Document not found.');
    }
    return this.toApiRow(row);
  }

  async update(id: string, dto: UpdateDocumentDto, user: JwtUser): Promise<DocumentApiRow> {
    const existing = await this.prisma.document.findFirst({
      where: { id, companyName: user.companyName },
      include: { lineItems: true },
    });
    if (!existing) {
      throw new NotFoundException('Document not found.');
    }

    const data: Prisma.DocumentUpdateInput = {};

    if (dto.documentType !== undefined) {
      data.documentType = dto.documentType as DocumentType;
    }
    if (dto.supplierName !== undefined) {
      data.supplierName = dto.supplierName;
    }
    if (dto.documentNumber !== undefined) {
      data.documentNumber = dto.documentNumber;
    }
    if (dto.issueDate !== undefined) {
      data.issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.currency !== undefined) {
      data.currency = dto.currency;
    }
    if (dto.subtotal !== undefined) {
      data.subtotal = dto.subtotal;
    }
    if (dto.tax !== undefined) {
      data.tax = dto.tax;
    }
    if (dto.total !== undefined) {
      data.total = dto.total;
    }

    const action = dto.action ?? 'save';

    if (action === 'confirm') {
      const snapshot = this.snapshotForFinal(existing, dto);
      data.status = DocumentStatus.VALIDATED;
      data.reviewedAt = new Date();
      data.reviewedBy = { connect: { id: user.sub } };
      data.finalData = snapshot as object;
    } else if (action === 'reject') {
      data.status = DocumentStatus.REJECTED;
      data.reviewedAt = new Date();
      data.reviewedBy = { connect: { id: user.sub } };
    }

    await this.prisma.document.update({
      where: { id },
      data,
    });

    if (action === 'save' || action === 'confirm') {
      await this.validation.run(id);
    }

    return this.findOne(id, user);
  }

  async remove(id: string, user: JwtUser): Promise<void> {
    const existing = await this.prisma.document.findFirst({
      where: { id, companyName: user.companyName },
      select: { id: true, storagePath: true },
    });
    if (!existing) {
      throw new NotFoundException('Document not found.');
    }

    await this.prisma.document.delete({ where: { id } });

    if (existing.storagePath) {
      const absolutePath = path.join(this.uploadRoot, existing.storagePath);
      await fs.unlink(absolutePath).catch(() => undefined);
    }
  }

  private snapshotForFinal(
    doc: Document & { lineItems: DocumentLineItem[] },
    dto: UpdateDocumentDto,
  ): Record<string, unknown> {
    const sub =
      dto.subtotal !== undefined ? dto.subtotal : doc.subtotal != null ? Number(doc.subtotal) : null;
    const tax = dto.tax !== undefined ? dto.tax : doc.tax != null ? Number(doc.tax) : null;
    const tot = dto.total !== undefined ? dto.total : doc.total != null ? Number(doc.total) : null;
    const issue =
      dto.issueDate !== undefined
        ? dto.issueDate
        : doc.issueDate
          ? doc.issueDate.toISOString().slice(0, 10)
          : null;
    const due =
      dto.dueDate !== undefined
        ? dto.dueDate
        : doc.dueDate
          ? doc.dueDate.toISOString().slice(0, 10)
          : null;
    return {
      documentType: dto.documentType ?? doc.documentType,
      supplierName: dto.supplierName ?? doc.supplierName,
      documentNumber: dto.documentNumber ?? doc.documentNumber,
      issueDate: issue,
      dueDate: due,
      currency: dto.currency ?? doc.currency,
      subtotal: sub,
      tax,
      total: tot,
      lineItems: doc.lineItems.map((li) => ({
        description: li.description,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        lineTotal: Number(li.lineTotal),
      })),
      confirmedAt: new Date().toISOString(),
    };
  }

  private async processDocument(
    id: string,
    absolutePath: string,
    sourceType: DocumentSourceType,
  ): Promise<void> {
    const extracted = await this.extraction.extractFromFile(absolutePath, sourceType);
    console.log('[documents.processDocument] extracted', {
      id,
      sourceType,
      documentType: extracted.documentType,
      supplierName: extracted.supplierName,
      documentNumber: extracted.documentNumber,
      issueDate: extracted.issueDate?.toISOString?.() ?? extracted.issueDate,
      dueDate: extracted.dueDate?.toISOString?.() ?? extracted.dueDate,
      currency: extracted.currency,
      subtotal: extracted.subtotal,
      tax: extracted.tax,
      total: extracted.total,
      lineItemsCount: extracted.lineItems.length,
      ingestionNotes: extracted.ingestionNotes,
    });

    const lineCreates = extracted.lineItems.map((li, i) => ({
      documentId: id,
      itemOrder: i,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: li.lineTotal,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.documentLineItem.deleteMany({ where: { documentId: id } });
      await tx.document.update({
        where: { id },
        data: {
          documentType: extracted.documentType ?? undefined,
          supplierName: extracted.supplierName,
          documentNumber: extracted.documentNumber,
          issueDate: extracted.issueDate,
          dueDate: extracted.dueDate,
          currency: extracted.currency,
          subtotal:
            extracted.subtotal !== null && extracted.subtotal !== undefined
              ? new Prisma.Decimal(extracted.subtotal)
              : null,
          tax:
            extracted.tax !== null && extracted.tax !== undefined
              ? new Prisma.Decimal(extracted.tax)
              : null,
          total:
            extracted.total !== null && extracted.total !== undefined
              ? new Prisma.Decimal(extracted.total)
              : null,
          rawExtractedData: extracted.rawExtractedData as Prisma.InputJsonValue,
          ingestionNotes: extracted.ingestionNotes,
          status: DocumentStatus.NEEDS_REVIEW,
        },
      });
      if (lineCreates.length) {
        await tx.documentLineItem.createMany({ data: lineCreates });
      }
    });

    await this.validation.run(id);
  }

  private mapExtToSourceType(ext: string): DocumentSourceType {
    const e = ext.toLowerCase();
    if (e === '.pdf') {
      return DocumentSourceType.PDF;
    }
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(e)) {
      return DocumentSourceType.IMAGE;
    }
    if (e === '.csv') {
      return DocumentSourceType.CSV;
    }
    if (e === '.txt') {
      return DocumentSourceType.TXT;
    }
    throw new Error('bad ext');
  }

  private mapStatusFilter(status?: string): DocumentStatus | undefined {
    if (!status) {
      return undefined;
    }
    const normalized = status.toLowerCase();
    const map: Record<string, DocumentStatus> = {
      uploaded: DocumentStatus.UPLOADED,
      needs_review: DocumentStatus.NEEDS_REVIEW,
      validated: DocumentStatus.VALIDATED,
      rejected: DocumentStatus.REJECTED,
    };
    const mapped = map[normalized];
    if (!mapped) {
      throw new BadRequestException('Invalid status filter.');
    }
    return mapped;
  }

  private toApiRow(
    doc: Document & {
      lineItems: DocumentLineItem[];
      validationIssues: DocumentValidationIssue[];
    },
  ): DocumentApiRow {
    return {
      id: doc.id,
      companyName: doc.companyName,
      fileName: doc.fileName,
      originalMimeType: doc.originalMimeType,
      storagePath: doc.storagePath,
      sourceType: doc.sourceType,
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      supplierName: doc.supplierName,
      issueDate: doc.issueDate?.toISOString().slice(0, 10) ?? null,
      dueDate: doc.dueDate?.toISOString().slice(0, 10) ?? null,
      currency: doc.currency,
      subtotal: doc.subtotal != null ? Number(doc.subtotal) : null,
      tax: doc.tax != null ? Number(doc.tax) : null,
      total: doc.total != null ? Number(doc.total) : null,
      status: doc.status,
      ingestionNotes: doc.ingestionNotes,
      uploadedByUserId: doc.uploadedByUserId,
      reviewedByUserId: doc.reviewedByUserId,
      reviewedAt: doc.reviewedAt?.toISOString() ?? null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      lineItems: doc.lineItems.map((li) => ({
        id: li.id,
        itemOrder: li.itemOrder,
        description: li.description,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        lineTotal: Number(li.lineTotal),
      })),
      validationIssues: doc.validationIssues.map((v) => ({
        id: v.id,
        fieldPath: v.fieldPath,
        code: v.code,
        message: v.message,
        severity: v.severity,
      })),
    };
  }
}
