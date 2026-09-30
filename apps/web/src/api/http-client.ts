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
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response.status === 204
    ? (undefined as TResponse)
    : ((await response.json()) as TResponse);
}

/** Envia um corpo JSON. */
export function sendJson<TResponse>(
  path: string,
  method: string,
  body: unknown,
): Promise<TResponse> {
  return requestJson<TResponse>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
  return new ApiError(
    response.status,
    error?.code ?? 'unknown_error',
    error?.message ?? 'Não foi possível concluir a requisição.',
  );
}
