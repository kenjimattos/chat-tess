import sharp from 'sharp';
import { InvalidImageError } from '../domain/file-errors';
import type { ImageResizer } from '../domain/ports';

/** Redimensiona com o sharp (libvips), sem carregar a imagem inteira descompactada. */
export class SharpImageResizer implements ImageResizer {
  constructor(private readonly maxSidePixels: number) {}

  async fitWithinLimit(content: Buffer): Promise<Buffer> {
    try {
      const { width, height } = await sharp(content).metadata();
      if (Math.max(width, height) <= this.maxSidePixels) {
        return content;
      }
      return await sharp(content)
        // A imagem reduzida sai sem os metadados; a rotação do EXIF é aplicada antes.
        .autoOrient()
        .resize({ width: this.maxSidePixels, height: this.maxSidePixels, fit: 'inside' })
        .toBuffer();
    } catch {
      throw new InvalidImageError();
    }
  }
}
