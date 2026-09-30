import type { SupportedMimeType } from './file-type';

export interface Attachment {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string | null;
  fileName: string;
  mimeType: SupportedMimeType;
  sizeBytes: number;
  /** Endereço no armazenamento: "gs://bucket/chave" ou "file://caminho". */
  storageUri: string;
}

/** Nome seguro para exibição: sem pastas e sem caracteres de controle. */
export function sanitizeFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? '';
  const cleaned = [...baseName].filter(isPrintable).join('').trim();
  return cleaned.slice(0, 200) || 'arquivo';
}

/** Descarta caracteres de controle (U+0000 a U+001F e U+007F). */
function isPrintable(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint >= 0x20 && codePoint !== 0x7f;
}
