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

/**
 * A stored pattern uses a schema this build does not read. The editor opens the
 * document read-only and explains the break; it is never migrated or rewritten.
 */
export class UnsupportedPatternSchemaError extends Error {
  readonly schema: string;

  constructor(schema: string) {
    super(`Unsupported pattern schema: ${schema}`);
    this.name = 'UnsupportedPatternSchemaError';
    this.schema = schema;
  }
}
