import type { PatternDocument } from '@sewcraft/geometry';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  data: T[];
  links?: Record<string, string | null>;
  meta?: Record<string, unknown>;
}

export interface Resource<T> {
  data: T;
}

/**
 * A project's persisted pattern. `document` is null when the project has never
 * been saved, so the client can tell a new project from a missing one.
 */
export interface Pattern {
  id: number | null;
  project_id: number;
  name: string;
  document: PatternDocument | null;
  version: number;
  saved_at: string | null;
}

/** The checkpoint a successful save produced. */
export interface SavedPattern {
  id: number;
  version: number;
  saved_at: string;
  created: boolean;
}

export interface SavePatternPayload {
  document: PatternDocument;
  /** The checkpoint this editor last saw; `null` forces an overwrite. */
  expected_version: number | null;
  /** The schema the stored document had, so the server archives it first. */
  expected_schema?: string;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    ...init,
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

export const projectsApi = {
  list: (): Promise<Paginated<Project>> => request('/projects'),
  create: (payload: { name: string; description?: string }): Promise<Resource<Project>> =>
    request('/projects', { method: 'POST', body: JSON.stringify(payload) }),
  remove: (id: number): Promise<void> => request(`/projects/${id}`, { method: 'DELETE' }),
  getPattern: (id: number): Promise<Resource<Pattern>> => request(`/projects/${id}/pattern`),
  savePattern: (id: number, payload: SavePatternPayload): Promise<Resource<SavedPattern>> =>
    request(`/projects/${id}/pattern`, { method: 'PUT', body: JSON.stringify(payload) }),
};
