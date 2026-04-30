import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import type { Express } from 'express';

import { CurrentUser, type JwtUser } from '../../core/auth/current-user.decorator';
import { DocumentsService } from './documents.service';
import { UpdateDocumentDto } from './dto/update-document.dto';

const uploadBody = {
  schema: {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
    },
    required: ['file'],
  },
};

@Controller('documents')
@UseGuards(JwtAuthGuard)
@ApiTags('documents')
@ApiBearerAuth('access-token')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBody)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) {
      throw new BadRequestException('Missing file field.');
    }
    return this.documentsService.upload(file, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('status') status?: string,
  ) {
    return this.documentsService.findAllForUser(user, { page, pageSize, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documentsService.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() user: JwtUser, @Body() body: UpdateDocumentDto) {
    return this.documentsService.update(id, body, user);
  }
}
