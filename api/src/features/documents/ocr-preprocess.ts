import sharp from 'sharp';

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
