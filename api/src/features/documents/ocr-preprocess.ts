import sharp from 'sharp';

/**
 * Normalizes scans/photos for Tesseract: grayscale, contrast, sharpen, binarize.
 * Falls back to the original buffer if Sharp rejects the input.
 */
export async function preprocessImageForOcr(input: Buffer): Promise<{
  buffer: Buffer;
  applied: boolean;
  error?: string;
}> {
  try {
    const buffer = await sharp(input)
      .grayscale()
      .normalize()
      .sharpen()
      .threshold(150)
      .png()
      .toBuffer();
    return { buffer, applied: true };
  } catch (err) {
    return {
      buffer: input,
      applied: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
