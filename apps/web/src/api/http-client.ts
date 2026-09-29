export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Faz uma requisição à API e devolve o corpo JSON, ou lança `ApiError`. */
export async function requestJson<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw toApiError(response.status, body);
  }
  return body as TResponse;
}

function toApiError(status: number, body: unknown): ApiError {
  const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
  return new ApiError(
    status,
    error?.code ?? 'unknown_error',
    error?.message ?? 'Não foi possível concluir a requisição.',
  );
}
