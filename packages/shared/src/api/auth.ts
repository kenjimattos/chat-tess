import { z } from 'zod';

export const currentUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(['user', 'admin']),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const testLoginRequestSchema = z.object({
  email: z.email(),
  name: z.string().min(1).optional(),
});
export type TestLoginRequest = z.infer<typeof testLoginRequestSchema>;

/** Motivo do login não concluído, devolvido ao frontend em `?login_error=`. */
export const loginErrorSchema = z.enum([
  'cancelled',
  'invalid_state',
  'email_not_allowed',
  'login_failed',
]);
export type LoginError = z.infer<typeof loginErrorSchema>;
