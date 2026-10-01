import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../auth/http/require-authentication';
import { UploadInProgressError } from '../domain/file-errors';

/**
 * Deixa cada usuário com um upload por vez nesta instância. O arquivo é
 * recebido inteiro em memória, então sem isso uma conta sozinha poderia
 * ocupar a memória da instância com uploads paralelos. Vai depois de
 * `requireAuthentication` e antes de receber o arquivo.
 *
 * O controle é em memória, e não no banco, porque o recurso protegido é a
 * memória de cada instância.
 */
export function createOneUploadAtATime(): RequestHandler {
  const uploadingUserIds = new Set<string>();

  return (_request, response, next) => {
    const userId = authenticatedUser(response).id;
    if (uploadingUserIds.has(userId)) {
      next(new UploadInProgressError());
      return;
    }

    uploadingUserIds.add(userId);
    // `close` acontece ao fim da resposta e também se a conexão cair no meio do envio.
    response.once('close', () => uploadingUserIds.delete(userId));
    next();
  };
}
