import { describe, expect, it } from 'vitest';
import { detectMimeType } from './file-type';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe('detectMimeType', () => {
  it('reconhece PDF', () => {
    expect(detectMimeType(ascii('%PDF-1.7\n...'))).toBe('application/pdf');
  });

  it('reconhece PNG', () => {
    expect(detectMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe(
      'image/png',
    );
  });

  it('reconhece JPEG', () => {
    expect(detectMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe('image/jpeg');
  });

  it('reconhece WEBP', () => {
    expect(detectMimeType(ascii('RIFF\x00\x00\x00\x00WEBPVP8 '))).toBe('image/webp');
  });

  it('recusa um RIFF que não é WEBP', () => {
    expect(detectMimeType(ascii('RIFF\x00\x00\x00\x00WAVEfmt '))).toBeNull();
  });

  it('recusa tipos não suportados, mesmo com extensão enganosa', () => {
    expect(detectMimeType(ascii('<html><script>'))).toBeNull();
    expect(detectMimeType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip
    expect(detectMimeType(bytes())).toBeNull();
  });
});
