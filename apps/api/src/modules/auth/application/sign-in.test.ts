import { beforeEach, describe, expect, it } from 'vitest';
import { RecordingEventPublisher } from '../../../test/recording-event-publisher';
import { fixedClock } from '../../../kernel/time/clock';
import { EmailNotAllowedError } from '../domain/auth-errors';
import type { VerifiedIdentity } from '../domain/user';
import { FakeSessionTokens } from '../infra/fake-session-tokens';
import { InMemoryAllowedEmailRepository } from '../infra/in-memory-allowed-email-repository';
import { InMemoryUserRepository } from '../infra/in-memory-user-repository';
import { SignIn } from './sign-in';

const NOW = new Date('2026-09-30T10:00:00Z');

const ana: VerifiedIdentity = {
  email: 'ana@empresa.com',
  name: 'Ana Souza',
  avatarUrl: 'https://fotos.example/ana.png',
};

describe('SignIn', () => {
  let users: InMemoryUserRepository;
  let events: RecordingEventPublisher;
  let signIn: SignIn;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    events = new RecordingEventPublisher();
    signIn = new SignIn(
      users,
      new InMemoryAllowedEmailRepository(['ana@empresa.com', '@parceiro.com']),
      new FakeSessionTokens(),
      events,
      fixedClock(NOW),
    );
  });

  describe('quando o e-mail está na lista de permitidos', () => {
    it('cria o usuário no primeiro acesso e abre a sessão', async () => {
      const { user, sessionToken } = await signIn.execute(ana);

      expect(user).toMatchObject({ ...ana, role: 'user' });
      expect(await users.findByEmail('ana@empresa.com')).toEqual(user);
      expect(sessionToken).toBe(`session-of:${user.id}`);
    });

    it('reaproveita o usuário nos acessos seguintes e atualiza o perfil', async () => {
      const firstLogin = await signIn.execute(ana);

      const secondLogin = await signIn.execute({ ...ana, name: 'Ana S. Lima', avatarUrl: null });

      expect(secondLogin.user).toEqual({
        ...firstLogin.user,
        name: 'Ana S. Lima',
        avatarUrl: null,
      });
    });

    it('trata variações de maiúsculas como o mesmo usuário', async () => {
      const firstLogin = await signIn.execute(ana);

      const secondLogin = await signIn.execute({ ...ana, email: ' Ana@Empresa.com ' });

      expect(secondLogin.user.id).toBe(firstLogin.user.id);
    });

    it('aceita qualquer e-mail de um domínio permitido', async () => {
      const { user } = await signIn.execute({ ...ana, email: 'bia@parceiro.com' });

      expect(user.email).toBe('bia@parceiro.com');
    });

    it('publica o evento de login, indicando se foi o primeiro acesso', async () => {
      const { user } = await signIn.execute(ana);
      await signIn.execute(ana);

      expect(events.ofType('auth.login_succeeded')).toEqual([
        {
          type: 'auth.login_succeeded',
          occurredAt: NOW,
          actorUserId: user.id,
          payload: { email: 'ana@empresa.com', isFirstLogin: true },
        },
        {
          type: 'auth.login_succeeded',
          occurredAt: NOW,
          actorUserId: user.id,
          payload: { email: 'ana@empresa.com', isFirstLogin: false },
        },
      ]);
    });
  });

  describe('papel de administrador', () => {
    function signInWithAdmins(adminEmailPatterns: string[]) {
      return new SignIn(
        users,
        new InMemoryAllowedEmailRepository(['ana@empresa.com', '@parceiro.com']),
        new FakeSessionTokens(),
        events,
        fixedClock(NOW),
        adminEmailPatterns,
      );
    }

    it('dá o papel de administrador a quem está na lista de administradores', async () => {
      const { user } = await signInWithAdmins(['ana@empresa.com']).execute(ana);

      expect(user.role).toBe('admin');
      expect((await users.findByEmail(ana.email))?.role).toBe('admin');
    });

    it('mantém usuário comum quem não está na lista', async () => {
      const { user } = await signInWithAdmins(['@outra.com']).execute(ana);

      expect(user.role).toBe('user');
    });

    it('retira o papel de quem saiu da lista de administradores', async () => {
      await signInWithAdmins(['ana@empresa.com']).execute(ana);

      const { user } = await signInWithAdmins([]).execute(ana);

      expect(user.role).toBe('user');
    });
  });

  describe('quando o e-mail não está na lista de permitidos', () => {
    const intruder: VerifiedIdentity = { ...ana, email: 'intruso@outro.com' };

    it('recusa o login', async () => {
      await expect(signIn.execute(intruder)).rejects.toThrow(EmailNotAllowedError);
    });

    it('não cria o usuário', async () => {
      await signIn.execute(intruder).catch(() => {});

      expect(await users.findByEmail('intruso@outro.com')).toBeNull();
    });

    it('publica o evento de login negado', async () => {
      await signIn.execute(intruder).catch(() => {});

      expect(events.events).toEqual([
        {
          type: 'auth.login_denied',
          occurredAt: NOW,
          actorUserId: null,
          payload: { email: 'intruso@outro.com', reason: 'email_not_allowed' },
        },
      ]);
    });
  });
});
