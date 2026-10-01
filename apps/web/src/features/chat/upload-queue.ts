/**
 * Fila de uploads do app: um por vez, na ordem em que foram pedidos, em
 * qualquer conversa. A API aceita um upload por vez por usuário; com a fila,
 * anexar outro arquivo enquanto o anterior sobe só espera a vez, sem erro.
 */
export class UploadQueue {
  private lastUpload: Promise<unknown> = Promise.resolve();

  /** Roda `upload` quando os anteriores terminarem, com ou sem falha. */
  enqueue<TResult>(upload: () => Promise<TResult>): Promise<TResult> {
    const result = this.lastUpload.then(upload);
    this.lastUpload = result.catch(() => undefined);
    return result;
  }
}

/** Instância única do app. */
export const uploadQueue = new UploadQueue();
