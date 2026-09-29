import { currentUserSchema, type CurrentUser } from '@chat-tess/shared';
import { ApiError, requestJson } from './http-client';

/** Devolve o usuário da sessão atual, ou `null` se ninguém entrou. */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    return currentUserSchema.parse(await requestJson('/auth/me'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
}

export const GOOGLE_LOGIN_URL = '/api/auth/google';
