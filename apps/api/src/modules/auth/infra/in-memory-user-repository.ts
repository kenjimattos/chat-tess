import { randomUUID } from 'node:crypto';
import type { UserRepository } from '../domain/ports';
import type { User, UserRole, VerifiedIdentity } from '../domain/user';

export class InMemoryUserRepository implements UserRepository {
  private readonly usersById = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.usersById.values()].find((user) => user.email === email) ?? null;
  }

  async create(identity: VerifiedIdentity): Promise<User> {
    const user: User = { id: randomUUID(), role: 'user', ...identity };
    this.usersById.set(user.id, user);
    return user;
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    return this.update(id, { role });
  }

  async updateProfile(
    id: string,
    { name, avatarUrl }: Pick<VerifiedIdentity, 'name' | 'avatarUrl'>,
  ): Promise<User> {
    return this.update(id, { name, avatarUrl });
  }

  private update(id: string, changes: Partial<User>): User {
    const user = this.usersById.get(id);
    if (!user) {
      throw new Error(`Usuário não encontrado: ${id}`);
    }
    const updatedUser = { ...user, ...changes };
    this.usersById.set(id, updatedUser);
    return updatedUser;
  }
}
