import type { PatternDocument } from '@sewcraft/geometry';

import { request } from './client';

export { ApiError } from './client';

export interface Project {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  /** The owner's public identity, when the API eager-loaded it. */
  owner?: { id: number; email: string };
  /** Whether the signed-in account owns this project and may edit it. */
  can_edit: boolean;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  data: T[];
  links?: Record<string, string | null>;
  meta?: Record<string, unknown>;
  /** How many projects the signed-in account owns, across all pages. */
  my_project_count?: number;
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
  /** Omitted means `manual`; `autosave` rows are coalesced in history. */
  origin?: 'manual' | 'autosave';
}

export interface SavePatternOptions {
  /** Keep the request alive when the page is hidden or unloading. */
  keepalive?: boolean;
}

export interface UpdateProjectPayload {
  name: string;
  /** `null` clears an existing description. */
  description: string | null;
}

export const projectsApi = {
  list: (): Promise<Paginated<Project>> => request('/projects'),
  get: (id: number): Promise<Resource<Project>> => request(`/projects/${id}`),
  create: (payload: { name: string; description?: string }): Promise<Resource<Project>> =>
    request('/projects', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: number, payload: UpdateProjectPayload): Promise<Resource<Project>> =>
    request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: number): Promise<void> => request(`/projects/${id}`, { method: 'DELETE' }),
  getPattern: (id: number): Promise<Resource<Pattern>> => request(`/projects/${id}/pattern`),
  savePattern: (
    id: number,
    payload: SavePatternPayload,
    options: SavePatternOptions = {},
  ): Promise<Resource<SavedPattern>> =>
    request(`/projects/${id}/pattern`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      keepalive: options.keepalive ?? false,
    }),
};
