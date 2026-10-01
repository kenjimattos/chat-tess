import { Storage } from '@google-cloud/storage';
import type { FileStorage } from '../domain/ports';

const GCS_URI_PATTERN = /^gs:\/\/([^/]+)\/(.+)$/;

/** Armazenamento no Cloud Storage. O Agent Platform lê os arquivos direto pelo endereço gs://. */
export class GcsFileStorage implements FileStorage {
  /** `storage` é o cliente do Cloud Storage; os testes passam um dublê no lugar dele. */
  constructor(
    private readonly bucketName: string,
    private readonly storage: Storage = new Storage(),
  ) {}

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

  async delete(storageUri: string): Promise<void> {
    const { bucket, key } = parseGcsUri(storageUri);
    await this.storage.bucket(bucket).file(key).delete({ ignoreNotFound: true });
  }

  async deleteFolder(folderKey: string): Promise<void> {
    await this.storage.bucket(this.bucketName).deleteFiles({ prefix: `${folderKey}/` });
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
