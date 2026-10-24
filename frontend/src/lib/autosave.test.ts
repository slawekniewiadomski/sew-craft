import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAutosave,
  fitsKeepaliveBudget,
  KEEPALIVE_BUDGET_BYTES,
  type AutosaveOutcome,
} from './autosave';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(write: () => Promise<AutosaveOutcome>, shouldWrite = () => true) {
  return createAutosave({ write, shouldWrite });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createAutosave', () => {
  it('writes once after the idle delay, not before', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => 'saved' as const);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1499);
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('autosave');
  });

  it('restarts the idle timer on every change and keeps one ceiling', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => 'saved' as const);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.schedule();

    // 3 s after the first change, but only 1 s after the last: still waiting.
    await vi.advanceTimersByTimeAsync(1499);
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('forces a write at the maximum wait during continuous editing', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => 'saved' as const);
    const scheduler = setup(write);

    scheduler.schedule();
    for (let second = 0; second < 9; second += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      scheduler.schedule();
    }

    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('writes again when the document changed during an in-flight write', async () => {
    vi.useFakeTimers();
    const first = deferred<AutosaveOutcome>();
    const write = vi.fn(() => first.promise);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(write).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    first.resolve('saved');
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1500);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending write', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => 'saved' as const);
    const scheduler = setup(write);

    scheduler.schedule();
    scheduler.cancel();

    await vi.advanceTimersByTimeAsync(20000);
    expect(write).not.toHaveBeenCalled();
  });

  it('finishes an in-flight write after a cancel without scheduling another', async () => {
    vi.useFakeTimers();
    const pending = deferred<AutosaveOutcome>();
    const write = vi.fn(() => pending.promise);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);

    scheduler.schedule();
    scheduler.cancel();
    pending.resolve('saved');

    await vi.advanceTimersByTimeAsync(20000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending retry', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => 'retry' as const);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(write).toHaveBeenCalledTimes(1);

    scheduler.cancel();
    await vi.advanceTimersByTimeAsync(60000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('replaces a pending retry with the idle debounce on a new change', async () => {
    vi.useFakeTimers();
    const outcomes: AutosaveOutcome[] = ['retry', 'saved'];
    const write = vi.fn(async () => outcomes.shift()!);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(write).toHaveBeenCalledTimes(1);

    // The retry would fire at 2 s; the new change writes 1.5 s after itself.
    await vi.advanceTimersByTimeAsync(500);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('flushes immediately as a manual save and drops the pending timers', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => 'saved' as const);
    const scheduler = setup(write);

    scheduler.schedule();
    await expect(scheduler.flush()).resolves.toBe('saved');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('manual');

    await vi.advanceTimersByTimeAsync(20000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('does not flush while a write is already in flight', async () => {
    vi.useFakeTimers();
    const pending = deferred<AutosaveOutcome>();
    const write = vi.fn(() => pending.promise);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);

    await expect(scheduler.flush()).resolves.toBeNull();
    expect(write).toHaveBeenCalledTimes(1);

    pending.resolve('saved');
    await vi.advanceTimersByTimeAsync(0);
  });

  it('skips scheduling and retrying when no write is meaningful', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => 'saved' as const);
    const scheduler = setup(write, () => false);

    scheduler.schedule();
    scheduler.retry();

    await vi.advanceTimersByTimeAsync(20000);
    expect(write).not.toHaveBeenCalled();
  });

  it('walks the retry ladder and caps at 30 s', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => 'retry' as const);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(write).toHaveBeenCalledTimes(1);

    for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      const before = write.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1);
      expect(write.mock.calls.length).toBe(before + 1);
    }
  });

  it('resets the ladder once a write succeeds', async () => {
    vi.useFakeTimers();
    const outcomes: AutosaveOutcome[] = ['retry', 'saved', 'retry'];
    const write = vi.fn(async () => outcomes.shift()!);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(2);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(write).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(4);
  });

  it('resets the ladder after a terminal stop', async () => {
    vi.useFakeTimers();
    const outcomes: AutosaveOutcome[] = ['retry', 'stop', 'retry'];
    const write = vi.fn(async () => outcomes.shift()!);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(2);

    // A stop is terminal, so the caller decides when to try again; the ladder
    // starts over rather than inheriting the failed attempt's delay.
    scheduler.retry();
    await vi.advanceTimersByTimeAsync(1999);
    expect(write).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('flags a change instead of arming a retry while a write is in flight', async () => {
    vi.useFakeTimers();
    const pending = deferred<AutosaveOutcome>();
    const write = vi.fn(() => pending.promise);
    const scheduler = setup(write);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1500);

    scheduler.retry();
    pending.resolve('saved');
    await vi.advanceTimersByTimeAsync(1500);

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('writes on the retry ladder after a flushed manual save failed', async () => {
    vi.useFakeTimers();
    const outcomes: AutosaveOutcome[] = ['retry', 'saved'];
    const write = vi.fn(async () => outcomes.shift()!);
    const scheduler = setup(write);

    await expect(scheduler.flush()).resolves.toBe('retry');
    await vi.advanceTimersByTimeAsync(2000);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('autosave');
  });
});

describe('fitsKeepaliveBudget', () => {
  it('accepts a body within the browser budget', () => {
    expect(fitsKeepaliveBudget('x'.repeat(KEEPALIVE_BUDGET_BYTES))).toBe(true);
  });

  it('rejects a body above the browser budget', () => {
    expect(fitsKeepaliveBudget('x'.repeat(KEEPALIVE_BUDGET_BYTES + 1))).toBe(false);
  });
});
