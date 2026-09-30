import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../shared/database/database';
import { INTEGRATION_DATABASE_URL, resetDatabase } from '../../../test/integration-database';
import { PrismaUserRepository } from './prisma-user-repository';

const database = createDatabase(INTEGRATION_DATABASE_URL);
const users = new PrismaUserRepository(database);

const anaIdentity = { email: 'ana@empresa.com', name: 'Ana', avatarUrl: 'https://f.example/a.png' };

describe('PrismaUserRepository', () => {
  beforeEach(() => resetDatabase(database));
  afterAll(() => database.$disconnect());

  it('cria o usuário com o papel padrão', async () => {
    const user = await users.create(anaIdentity);

    expect(user).toEqual({ id: expect.any(String), role: 'user', ...anaIdentity });
  });

  it('encontra o usuário por id e por e-mail', async () => {
    const created = await users.create(anaIdentity);

    expect(await users.findById(created.id)).toEqual(created);
    expect(await users.findByEmail('ana@empresa.com')).toEqual(created);
  });

  it('devolve null quando o usuário não existe', async () => {
    expect(await users.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await users.findByEmail('ninguem@empresa.com')).toBeNull();
  });

  it('atualiza nome e foto sem mudar o e-mail', async () => {
    const created = await users.create(anaIdentity);

    const updated = await users.updateProfile(created.id, { name: 'Ana Lima', avatarUrl: null });

    expect(updated).toEqual({ ...created, name: 'Ana Lima', avatarUrl: null });
    expect(await users.findById(created.id)).toEqual(updated);
  });

  it('troca o papel do usuário', async () => {
    const created = await users.create(anaIdentity);

    const promoted = await users.updateRole(created.id, 'admin');

    expect(promoted.role).toBe('admin');
    expect((await users.findById(created.id))?.role).toBe('admin');
  });

  it('não permite dois usuários com o mesmo e-mail', async () => {
    await users.create(anaIdentity);

    await expect(users.create(anaIdentity)).rejects.toThrow();
  });
});
