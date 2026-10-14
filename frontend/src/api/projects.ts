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
    throw new Error(`Request failed with status ${response.status}`);
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
};
