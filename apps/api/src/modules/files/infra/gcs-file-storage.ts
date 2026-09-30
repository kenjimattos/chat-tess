import { Storage } from '@google-cloud/storage';
import type { FileStorage } from '../domain/ports';

const GCS_URI_PATTERN = /^gs:\/\/([^/]+)\/(.+)$/;

/** Armazenamento no Cloud Storage. O Vertex AI lê os arquivos direto pelo endereço gs://. */
export class GcsFileStorage implements FileStorage {
  private readonly storage = new Storage();

  constructor(private readonly bucketName: string) {}

  async save(key: string, content: Buffer, mimeType: string): Promise<string> {
    await this.storage.bucket(this.bucketName).file(key).save(content, {
      contentType: mimeType,
      resumable: false,
    });
    return `gs://${this.bucketName}/${key}`;
  }

  async read(storageUri: string): Promise<Buffer> {
    const { bucket, key } = parseGcsUri(storageUri);
    const [content] = await this.storage.bucket(bucket).file(key).download();
    return content;
  }

  uriReadableByModel(storageUri: string): string {
    return storageUri;
  }
}

function parseGcsUri(storageUri: string): { bucket: string; key: string } {
  const match = GCS_URI_PATTERN.exec(storageUri);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Endereço do Cloud Storage inválido: ${storageUri}`);
  }
  return { bucket: match[1], key: match[2] };
}
