let sequence = 0;

/**
 * A process-unique command id. Commands require a client-generated id; the UI
 * only needs uniqueness within a session, not a real ULID.
 */
export function nextCommandId(prefix = 'cmd'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}
