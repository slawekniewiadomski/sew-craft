/** The localStorage key that holds the current Sanctum personal access token. */
export const AUTH_TOKEN_KEY = 'sewcraft.auth.token';

/** The token the API client attaches to every request, or `null` when signed out. */
export function readAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Store or clear the API token; `null` signs the browser out. */
export function writeAuthToken(token: string | null): void {
  if (token === null) window.localStorage.removeItem(AUTH_TOKEN_KEY);
  else window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * A non-2xx API response. `body` keeps the parsed JSON so callers can react to
 * the documented `409` conflict payload without reparsing.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    const message = (body as { message?: unknown } | null)?.message;
    super(typeof message === 'string' ? message : `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

const baseUrl = import.meta.env.VITE_API_URL ?? '/api';

/** One JSON request against the API, carrying the current bearer token. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = readAuthToken();
  if (token !== null) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
