import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { InvalidImageError } from '../domain/file-errors';
import { SharpImageResizer } from './sharp-image-resizer';

const MAX_SIDE = 100;
const resizer = new SharpImageResizer(MAX_SIDE);

function blankImage(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#1d4ed8' } });
}

describe('SharpImageResizer', () => {
  it('reduz a imagem maior que o limite, mantendo a proporção', async () => {
    const wide = await blankImage(400, 200).png().toBuffer();

    const resized = await sharp(await resizer.fitWithinLimit(wide)).metadata();

    expect(resized).toMatchObject({ width: 100, height: 50 });
  });

  it.each(['png', 'jpeg', 'webp'] as const)('mantém o formato %s', async (format) => {
    const tall = await blankImage(200, 400).toFormat(format).toBuffer();

    const resized = await sharp(await resizer.fitWithinLimit(tall)).metadata();

    expect(resized).toMatchObject({ format, width: 50, height: 100 });
  });

  it('devolve como veio a imagem que já cabe no limite', async () => {
    const small = await blankImage(MAX_SIDE, 40).png().toBuffer();

    expect(await resizer.fitWithinLimit(small)).toBe(small);
  });

  it('aplica a rotação do EXIF antes de reduzir', async () => {
    // Orientação 6: a foto foi gravada deitada e deve aparecer em pé.
    const rotated = await blankImage(400, 200).withMetadata({ orientation: 6 }).jpeg().toBuffer();

    const resized = await sharp(await resizer.fitWithinLimit(rotated)).metadata();

    expect(resized).toMatchObject({ width: 50, height: 100 });
    expect(resized.orientation).toBeUndefined();
  });

  it('recusa o conteúdo que não é uma imagem legível', async () => {
    const onlyPngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

    await expect(resizer.fitWithinLimit(onlyPngSignature)).rejects.toThrow(InvalidImageError);
  });
});
