/**
 * A rejected command: the payload is invalid or the resulting geometry cannot
 * satisfy the document's invariants. Throw before building a new document so the
 * caller keeps the input untouched.
 *
 * `commandType` is normally a `Command['type']`, but derived-geometry passes
 * (corner-round regeneration and document normalization) share the class and
 * report `corner_round` instead.
 */
export class CommandValidationError extends Error {
  readonly commandType: string;

  constructor(commandType: string, message: string) {
    super(`[${commandType}] ${message}`);
    this.name = 'CommandValidationError';
    this.commandType = commandType;
  }
}
