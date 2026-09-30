/**
 * Teste de carga: mede se vários usuários ao mesmo tempo deixam a resposta
 * mais lenta. Sobe a API no ambiente dos testes ponta a ponta (LLM falso e
 * banco `chat_tess_test`) e dispara 1, 5 e 20 turnos simultâneos, cada um de um
 * usuário diferente, com o comando `/slow` (resposta de cerca de 4 s).
 *
 * Como quase todo o tempo de um turno é espera pelo LLM, os tempos dos três
 * cenários devem ficar próximos. Uso: `npm run load-test`.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ALLOWED_TEST_DOMAIN, API_URL, apiEnvironment } from '../test-environment';

const SCENARIOS = [1, 5, 20];
const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

interface Session {
  cookie: string;
  conversationId: string;
}

async function main(): Promise<void> {
  const api = spawn('npx', ['tsx', 'apps/api/src/main.ts'], {
    cwd: ROOT_DIR,
    // Limites altos: aqui só interessa o tempo de resposta.
    env: {
      ...process.env,
      ...apiEnvironment,
      RATE_LIMIT_MESSAGES_PER_MINUTE: '1000',
      DATABASE_POOL_MAX: '5',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  try {
    await waitUntilReady();
    console.log('Usuários simultâneos | p50 (s) | p95 (s) | máx. (s)');
    for (const users of SCENARIOS) {
      const sessions = await Promise.all(Array.from({ length: users }, openSession));
      const durations = await Promise.all(sessions.map(timeSlowTurn));
      console.log(formatRow(users, durations));
    }
  } finally {
    api.kill();
  }
}

async function waitUntilReady(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(`${API_URL}/api/health/ready`).catch(() => null);
    if (response?.ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('A API não respondeu em 60 s.');
}

async function openSession(): Promise<Session> {
  const email = `carga-${randomUUID().slice(0, 8)}${ALLOWED_TEST_DOMAIN}`;
  const login = await fetch(`${API_URL}/api/auth/test-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: 'Carga' }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';

  const created = await fetch(`${API_URL}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({}),
  });
  const { id } = (await created.json()) as { id: string };
  return { cookie, conversationId: id };
}

/** Segundos do envio até o fim do stream da resposta. */
async function timeSlowTurn({ cookie, conversationId }: Session): Promise<number> {
  const startedAt = performance.now();
  const response = await fetch(`${API_URL}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ text: '/slow' }),
  });
  const body = await response.text();
  if (!response.ok || !body.includes('event: done')) {
    throw new Error(`Turno falhou com status ${response.status}: ${body.slice(0, 200)}`);
  }
  return (performance.now() - startedAt) / 1000;
}

function formatRow(users: number, durations: number[]): string {
  const sorted = [...durations].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
  const cells = [percentile(0.5), percentile(0.95), sorted.at(-1) ?? 0].map((value) =>
    value.toFixed(2),
  );
  return [String(users).padStart(20), ...cells.map((cell) => cell.padStart(7))].join(' | ');
}

await main();
