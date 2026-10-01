import type { FileStorage } from '../domain/ports';

/** Armazenamento em memória, para testes. `readableByModel` imita o Cloud Storage. */
export class InMemoryFileStorage implements FileStorage {
  readonly files = new Map<string, Buffer>();

  constructor(private readonly readableByModel = false) {}

  async save(key: string, content: Buffer): Promise<string> {
    const uri = `memory://${key}`;
    this.files.set(uri, content);
    return uri;
  }

  async read(storageUri: string): Promise<Buffer> {
    const content = this.files.get(storageUri);
    if (!content) {
      throw new Error(`Arquivo não encontrado: ${storageUri}`);
    }
    return content;
  }

  async deleteFolder(folderKey: string): Promise<void> {
    for (const uri of this.files.keys()) {
      if (uri.startsWith(`memory://${folderKey}/`)) {
        this.files.delete(uri);
      }
    }
  }

  uriReadableByModel(storageUri: string): string | null {
    return this.readableByModel ? storageUri : null;
  }
}
