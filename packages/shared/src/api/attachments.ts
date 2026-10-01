import { z } from 'zod';
import { attachmentPartSchema } from '../message-parts';

/** Anexos que já subiram para a conversa e ainda não foram enviados em uma mensagem. */
export const pendingAttachmentListSchema = z.array(attachmentPartSchema);
