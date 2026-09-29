import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createHealthRouter, type ReadinessCheck } from './health-router';

const healthy: ReadinessCheck = async () => {};
const unavailable: ReadinessCheck = async () => {
  throw new Error('conexão recusada');
};

function buildApp(readinessChecks: Record<string, ReadinessCheck>) {
  return express().use(createHealthRouter({ readinessChecks }));
}

describe('GET /health', () => {
  it('responde ok mesmo com dependências indisponíveis', async () => {
    const response = await request(buildApp({ database: unavailable })).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /health/ready', () => {
  it('responde 200 quando todas as dependências respondem', async () => {
    const response = await request(buildApp({ database: healthy })).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', dependencies: { database: 'ok' } });
  });

  it('responde 503 e aponta a dependência indisponível', async () => {
    const response = await request(buildApp({ database: unavailable, storage: healthy })).get(
      '/health/ready',
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      dependencies: { database: 'unavailable', storage: 'ok' },
    });
  });
});
