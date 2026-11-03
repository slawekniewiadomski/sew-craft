import { vi } from 'vitest';

/** The download helper every editor suite replaces with a no-op spy. */
export function downloadMock(): { downloadSvgFile: ReturnType<typeof vi.fn> } {
  return { downloadSvgFile: vi.fn() };
}

/** The project API every editor suite replaces; the store only reads getPattern. */
export function projectsApiMock() {
  class ApiError extends Error {
    constructor(
      public status: number,
      public body: unknown,
    ) {
      super(
        (body as { message?: string } | null)?.message ?? `Request failed with status ${status}`,
      );
      this.name = 'ApiError';
    }
  }

  return {
    ApiError,
    projectsApi: {
      list: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
      getPattern: vi.fn(),
      savePattern: vi.fn(),
    },
  };
}
