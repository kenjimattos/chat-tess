import type { Database } from '../../../shared/database/database';
import type { User as UserRecord } from '../../../generated/prisma/client';
import type { UserRepository } from '../domain/ports';
import type { User, UserRole, VerifiedIdentity } from '../domain/user';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly database: Database) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.database.user.findUnique({ where: { id } });
    return record && toUser(record);
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.database.user.findUnique({ where: { email } });
    return record && toUser(record);
  }

  async create(identity: VerifiedIdentity): Promise<User> {
    const record = await this.database.user.create({ data: identity });
    return toUser(record);
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    const record = await this.database.user.update({
      where: { id },
      data: { role: role === 'admin' ? 'ADMIN' : 'USER' },
    });
    return toUser(record);
  }

  async updateProfile(
    id: string,
    { name, avatarUrl }: Pick<VerifiedIdentity, 'name' | 'avatarUrl'>,
  ): Promise<User> {
    const record = await this.database.user.update({ where: { id }, data: { name, avatarUrl } });
    return toUser(record);
  }
}

function toUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    avatarUrl: record.avatarUrl,
    role: record.role === 'ADMIN' ? 'admin' : 'user',
  };
}
