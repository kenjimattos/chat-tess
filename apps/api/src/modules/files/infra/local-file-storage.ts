import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FileStorage } from '../domain/ports';

/** Armazenamento em disco, para desenvolvimento e testes ponta a ponta. */
export class LocalFileStorage implements FileStorage {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  async save(key: string, content: Buffer): Promise<string> {
    const filePath = this.resolveInsideRoot(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return pathToFileURL(filePath).href;
  }

  async read(storageUri: string): Promise<Buffer> {
    const filePath = fileURLToPath(storageUri);
    this.assertInsideRoot(filePath);
    return readFile(filePath);
  }

  /** O LLM não enxerga o disco local: o conteúdo vai embutido. */
  uriReadableByModel(): null {
    return null;
  }

  private resolveInsideRoot(key: string): string {
    const filePath = path.resolve(this.rootDir, key);
    this.assertInsideRoot(filePath);
    return filePath;
  }

  private assertInsideRoot(filePath: string): void {
    if (!filePath.startsWith(this.rootDir + path.sep)) {
      throw new Error(`Caminho fora da pasta de armazenamento: ${filePath}`);
    }
  }
}
