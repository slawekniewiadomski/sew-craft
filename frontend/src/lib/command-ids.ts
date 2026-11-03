let sequence = 0;

/**
 * A short tag unique to this page load. Entity ids become document ids, so the
 * sequence alone would restart at 1 on every reload (and in every tab) and
 * collide with the ids a stored document already carries.
 */
const sessionTag = Math.random().toString(36).slice(2, 6).padEnd(4, '0');

/**
 * A process-unique command id. Commands require a client-generated id; the UI
 * only needs uniqueness within a session, not a real ULID.
 */
export function nextCommandId(prefix = 'cmd'): string {
  sequence += 1;
  return `${prefix}-${sequence}-${sessionTag}`;
}
