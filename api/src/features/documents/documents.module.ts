import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentExtractionService } from './document-extraction.service';
import { MistralOcrService } from './mistral-ocr.service';
import { DocumentValidationService } from './document-validation.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentExtractionService,
    DocumentValidationService,
    MistralOcrService,
  ],
})
export class DocumentsModule {}
