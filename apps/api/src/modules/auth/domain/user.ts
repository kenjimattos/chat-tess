export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
}

/** Identidade confirmada por um provedor externo (por exemplo, o Google). */
export interface VerifiedIdentity {
  email: string;
  name: string;
  avatarUrl: string | null;
}
