import type { User, VerifiedIdentity } from './user';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(identity: VerifiedIdentity): Promise<User>;
  /** Atualiza nome e foto com os dados mais recentes do provedor de identidade. */
  updateProfile(id: string, profile: Pick<VerifiedIdentity, 'name' | 'avatarUrl'>): Promise<User>;
}

export interface AllowedEmailRepository {
  listPatterns(): Promise<string[]>;
  /** Adiciona os padrões que ainda não existem. */
  addPatterns(patterns: string[]): Promise<void>;
}

export interface SessionTokens {
  issue(userId: string): Promise<string>;
  /** Devolve o id do usuário, ou `null` se o token for inválido ou estiver expirado. */
  verify(token: string): Promise<string | null>;
}
