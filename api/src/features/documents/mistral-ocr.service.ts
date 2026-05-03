import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import sharp from 'sharp';

export type MistralOcrProcessResult = {
  fullText: string;
  model: string;
};

@Injectable()
export class MistralOcrService {
  constructor(private readonly config: ConfigService) {}

  async processImage(buffer: Buffer): Promise<MistralOcrProcessResult> {
    const apiKey = this.config.get<string>('MISTRAL_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY is not set');
    }

    const serverURL = this.config.get<string>('MISTRAL_API_BASE')?.trim();
    const model =
      this.config.get<string>('MISTRAL_OCR_MODEL')?.trim() ?? 'mistral-ocr-latest';
    const timeoutMs = Number(this.config.get('MISTRAL_OCR_TIMEOUT_MS') ?? 120_000);

    const mime = await this.mimeFromBuffer(buffer);
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;

    const mistral = new Mistral({
      apiKey,
      ...(serverURL ? { serverURL } : {}),
      timeoutMs,
    });

    console.log('[mistral.ocr] request', {
      model,
      serverURL: serverURL ?? '(SDK default: https://api.mistral.ai)',
      timeoutMs,
    });

    const result = await mistral.ocr.process(
      {
        model,
        document: {
          type: 'image_url',
          imageUrl: dataUrl,
        },
      },
      { timeoutMs },
    );

    const maxLogChars = 4000;
    const pages = result.pages ?? [];
    const trimForLog = (s: string, max: number) =>
      s.length <= max ? s : `${s.slice(0, max)}… (truncated, ${s.length} chars total)`;

    console.log('[mistral.ocr] response', {
      model: result.model,
      usageInfo: result.usageInfo,
      documentAnnotation: result.documentAnnotation ?? null,
      pageCount: pages.length,
      pages: pages.map((p) => ({
        index: p.index,
        markdownLength: p.markdown?.length ?? 0,
        markdown: trimForLog(p.markdown ?? '', maxLogChars),
        imageObjectCount: p.images?.length ?? 0,
        tableCount: p.tables?.length ?? 0,
        header: p.header ?? null,
        footer: p.footer ?? null,
        dimensions: p.dimensions,
      })),
    });
    const fullText = pages
      .map((p) => p.markdown ?? '')
      .join('\n\n')
      .trim();

    console.log('[mistral.ocr] fullText (joined markdown)', {
      length: fullText.length,
      preview: trimForLog(fullText, maxLogChars),
    });

    return {
      fullText,
      model: result.model ?? model,
    };
  }

  private async mimeFromBuffer(buffer: Buffer): Promise<string> {
    try {
      const meta = await sharp(buffer).metadata();
      const fmt = meta.format;
      if (fmt === 'jpeg') return 'image/jpeg';
      if (fmt === 'png') return 'image/png';
      if (fmt === 'webp') return 'image/webp';
      if (fmt === 'gif') return 'image/gif';
      if (fmt === 'tiff') return 'image/tiff';
      if (fmt === 'avif') return 'image/avif';
    } catch {
      // fall through
    }
    return 'application/octet-stream';
  }
}
