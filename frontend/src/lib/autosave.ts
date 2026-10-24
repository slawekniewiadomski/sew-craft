/** Timer surface the scheduler needs; injected so tests can drive time. */
export interface AutosaveTimers {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
}

/** Whether a write was an explicit save or the background writer. */
export type SaveOrigin = 'manual' | 'autosave';

/** What a write told the scheduler to do next. */
export type AutosaveOutcome = 'saved' | 'retry' | 'stop';

export interface AutosaveOptions {
  /** Perform one write with the given origin and say what should happen next. */
  write: (origin: SaveOrigin) => Promise<AutosaveOutcome>;
  /** Whether a scheduled write is meaningful right now (ready, dirty, not paused). */
  shouldWrite: () => boolean;
  /** Idle delay after the last change; default 1.5 s. */
  debounceMs?: number;
  /** Hard ceiling measured from the first unsaved change; default 10 s. */
  maxWaitMs?: number;
  /** Transient-failure ladder, capped by its last entry; default 2/4/8/16/30 s. */
  retryDelaysMs?: readonly number[];
  timers?: AutosaveTimers;
}

/**
 * The background writer's timing contract: debounce, ceiling, in-flight
 * coalescing, retry ladder and cancellation. It owns no document state — the
 * caller passes the write and the eligibility check, the store stays the only
 * state holder.
 */
export interface AutosaveScheduler {
  /** A committed change: restart the idle timer, bounded by the ceiling. */
  schedule(): void;
  /** Write now, as an explicit manual save, and drop pending timers. */
  flush(): Promise<AutosaveOutcome | null>;
  /** Arm the next retry after a write made outside the scheduler failed. */
  retry(): void;
  /** Drop every pending timer; an in-flight write finishes without rescheduling. */
  cancel(): void;
}

const DEFAULT_DEBOUNCE_MS = 1500;
const DEFAULT_MAX_WAIT_MS = 10_000;
const DEFAULT_RETRY_DELAYS_MS = [2000, 4000, 8000, 16_000, 30_000] as const;

const defaultTimers: AutosaveTimers = {
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

export function createAutosave({
  write,
  shouldWrite,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  timers = defaultTimers,
}: AutosaveOptions): AutosaveScheduler {
  let idle: number | null = null;
  let ceiling: number | null = null;
  let retryTimer: number | null = null;
  let attempt = 0;
  let writing = false;
  let changedDuringWrite = false;
  let cancelled = false;

  function clearIdle(): void {
    if (idle !== null) timers.clearTimeout(idle);
    idle = null;
  }

  function clearCeiling(): void {
    if (ceiling !== null) timers.clearTimeout(ceiling);
    ceiling = null;
  }

  function clearTimers(): void {
    clearIdle();
    clearCeiling();
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    retryTimer = null;
  }

  function startDebounce(): void {
    idle = timers.setTimeout(() => {
      idle = null;
      void runWrite('autosave');
    }, debounceMs);

    // The ceiling is measured from the first change of a burst, so continuous
    // editing still writes instead of postponing forever.
    if (ceiling === null) {
      ceiling = timers.setTimeout(() => {
        ceiling = null;
        void runWrite('autosave');
      }, maxWaitMs);
    }
  }

  function armRetry(): void {
    const delay = retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)]!;
    attempt += 1;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      void runWrite('autosave');
    }, delay);
  }

  async function runWrite(origin: SaveOrigin): Promise<AutosaveOutcome> {
    clearTimers();
    writing = true;
    changedDuringWrite = false;

    let outcome: AutosaveOutcome;
    try {
      outcome = await write(origin);
    } finally {
      writing = false;
    }

    // A cancel during the request (unmount, reload) discards the follow-up: the
    // document is no longer this scheduler's work.
    if (cancelled) return outcome;

    if (outcome === 'saved') {
      attempt = 0;
      if (changedDuringWrite && shouldWrite()) startDebounce();
      return outcome;
    }

    if (outcome === 'retry') {
      armRetry();
      return outcome;
    }

    attempt = 0;
    return outcome;
  }

  function schedule(): void {
    if (writing) {
      // The in-flight response only marks what it sent as clean; the newer
      // document is written once that request settles.
      changedDuringWrite = true;
      return;
    }

    cancelled = false;
    // A new change restarts the idle delay and cancels a pending retry, but the
    // ceiling stays anchored to the first change of the burst.
    clearIdle();
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    retryTimer = null;
    attempt = 0;

    if (!shouldWrite()) {
      clearCeiling();
      return;
    }

    startDebounce();
  }

  async function flush(): Promise<AutosaveOutcome | null> {
    if (writing) return null;

    cancelled = false;
    attempt = 0;

    return runWrite('manual');
  }

  function retry(): void {
    if (writing) {
      changedDuringWrite = true;
      return;
    }

    cancelled = false;
    clearTimers();

    if (!shouldWrite()) return;

    armRetry();
  }

  function cancel(): void {
    cancelled = true;
    clearTimers();
  }

  return { schedule, flush, retry, cancel };
}

/** The browser's 64 KiB keepalive ceiling, with headroom for headers. */
export const KEEPALIVE_BUDGET_BYTES = 60 * 1024;

/** Whether a serialised request body fits a `keepalive` fetch on page hide. */
export function fitsKeepaliveBudget(body: string): boolean {
  return new TextEncoder().encode(body).length <= KEEPALIVE_BUDGET_BYTES;
}
