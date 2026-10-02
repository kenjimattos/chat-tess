/**
 * Tipos de arquivo aceitos como anexo. O tipo é detectado pelos primeiros
 * bytes do conteúdo, e não pelo nome ou pelo tipo declarado pelo navegador,
 * que o cliente controla.
 */
export const detectableMimeTypes = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export type SupportedMimeType = (typeof detectableMimeTypes)[number];

export const SUPPORTED_FILE_DESCRIPTION = 'PDF, PNG, JPEG ou WEBP';

export function detectMimeType(content: Uint8Array): SupportedMimeType | null {
  if (startsWith(content, [0x25, 0x50, 0x44, 0x46])) {
    return 'application/pdf'; // %PDF
  }
  if (startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(content, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (
    startsWith(content, [0x52, 0x49, 0x46, 0x46]) &&
    matchesAt(content, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp'; // RIFF....WEBP
  }
  return null;
}

export function isImage(mimeType: SupportedMimeType): boolean {
  return mimeType.startsWith('image/');
}

function startsWith(content: Uint8Array, signature: number[]): boolean {
  return matchesAt(content, 0, signature);
}

function matchesAt(content: Uint8Array, offset: number, signature: number[]): boolean {
  return signature.every((byte, index) => content[offset + index] === byte);
}
