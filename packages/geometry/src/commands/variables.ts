/** Named value and measured variable commands. */
import { CommandValidationError } from '../errors.js';
import {
  evaluateQuantity,
  isExpressionParam,
  resolveParam,
  resolveVariable,
  sameParam,
} from '../expression.js';
import {
  isMeasuredVariable,
  isValueVariable,
  measurementChain,
  measurementChainMessage,
  measurementLength,
} from '../measurement.js';
import type { Quantity, ExpressionError } from '../expression.js';
import type { EntityId, Param, PatternDocument, Unit, Variable } from '../types.js';
import { noOp } from './shared.js';
import type { CommandApplication, CommandOf, CommandType, ParamInput } from './types.js';

/** The longest variable name a command accepts. */
export const MAX_VARIABLE_NAME_LENGTH = 60;

/** The longest variable comment a command accepts. */
export const MAX_VARIABLE_COMMENT_LENGTH = 120;

/** The longest variable slug a command mints. */
const MAX_VARIABLE_SLUG_LENGTH = 40;

const UNIT_MM_PER: Record<Unit, number> = { mm: 1, cm: 10 };

/** Mint a slug from a display name: ascii-folded, lowercased, underscore-joined. */
function slugFromName(name: string): string {
  const folded = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const base = folded
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_VARIABLE_SLUG_LENGTH);
  if (base === '') return 'v';
  const prefixed = /^[a-z]/.test(base) ? base : `v${base}`;
  return prefixed.slice(0, MAX_VARIABLE_SLUG_LENGTH);
}

/** A slug no variable in the document uses yet. */
function uniqueVariableSlug(document: PatternDocument, base: string): string {
  const taken = new Set((document.variables ?? []).map((variable) => variable.slug));
  let candidate = base;
  let index = 2;
  while (taken.has(candidate)) {
    const suffix = `_${index}`;
    candidate = `${base.slice(0, MAX_VARIABLE_SLUG_LENGTH - suffix.length)}${suffix}`;
    index += 1;
  }
  return candidate;
}

/** Validate a display name: trimmed, non-empty, within bounds and unique. */
function requireVariableName(
  document: PatternDocument,
  commandType: CommandType,
  name: string,
  currentSlug?: string,
): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > MAX_VARIABLE_NAME_LENGTH) {
    throw new CommandValidationError(
      commandType,
      `variable name must be 1-${MAX_VARIABLE_NAME_LENGTH} characters`,
    );
  }
  const clash = (document.variables ?? []).find(
    (variable) =>
      variable.slug !== currentSlug && variable.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash !== undefined) {
    throw new CommandValidationError(
      commandType,
      `variable name "${trimmed}" is already used by ${clash.slug}`,
    );
  }
  return trimmed;
}

/** Validate a comment: trimmed, bounded, empty becomes absent. */
function requireVariableComment(commandType: CommandType, comment: string): string | undefined {
  const trimmed = comment.trim();
  if (trimmed.length > MAX_VARIABLE_COMMENT_LENGTH) {
    throw new CommandValidationError(
      commandType,
      `variable comment must be at most ${MAX_VARIABLE_COMMENT_LENGTH} characters`,
    );
  }
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Validate a variable value and record what it resolves to. A literal is a length
 * in the variable's unit; a formula may be a length or a ratio, but never an area.
 */
function requireVariableValue(
  document: PatternDocument,
  commandType: CommandType,
  value: ParamInput,
): Param {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new CommandValidationError(
        commandType,
        'variable value must be a finite number of at least 0',
      );
    }
    return value;
  }

  let quantity: Quantity;
  try {
    quantity = evaluateQuantity(value.expr, {
      lookup: (slug) => resolveVariable(document, slug),
    });
  } catch (error) {
    // `evaluateQuantity` only throws `ExpressionError`, so its message is the detail.
    throw new CommandValidationError(
      commandType,
      `value is not a valid formula: ${(error as ExpressionError).message}`,
    );
  }
  if (quantity.exponent !== 0 && quantity.exponent !== 1) {
    const found =
      quantity.exponent === 2 ? 'an area' : `a quantity with exponent ${quantity.exponent}`;
    throw new CommandValidationError(
      commandType,
      `a variable must be a length or a ratio, not ${found}`,
    );
  }
  return { expr: value.expr, lastKnown: quantity.value };
}

/** A variable's literal converted between units, keeping the measurement. */
function convertLiteral(value: number, from: Unit, to: Unit): number {
  return (value * UNIT_MM_PER[from]) / UNIT_MM_PER[to];
}

/**
 * Validate a measured variable's chain, store it in traversal order and record the
 * total it resolves to right now.
 */
function requireMeasurementSources(
  document: PatternDocument,
  commandType: CommandType,
  sources: EntityId[],
): { sources: EntityId[]; lastKnown: number } {
  const result = measurementChain(document.entities, sources);
  if (result.problem !== undefined) {
    throw new CommandValidationError(commandType, measurementChainMessage(result.problem));
  }
  const total = measurementLength(document.entities, result.chain);
  if (total === null) {
    throw new CommandValidationError(
      commandType,
      'the selected sources do not currently resolve to a length',
    );
  }
  return { sources: result.chain, lastKnown: total };
}

/**
 * Refresh the reading every measured variable keeps before an entity is removed,
 * so a chain that breaks falls back to the number it was showing. A chain that is
 * already broken keeps its older reading.
 */
export function captureMeasuredValues(document: PatternDocument): PatternDocument {
  if (document.variables === undefined) return document;
  let changed = false;
  const variables = document.variables.map((variable) => {
    if (!isMeasuredVariable(variable)) return variable;
    const total = measurementLength(document.entities, variable.sources);
    if (total === null || total === variable.lastKnown) return variable;
    changed = true;
    return { ...variable, lastKnown: total };
  });
  return changed ? { ...document, variables } : document;
}

/** Whether two variables of the same kind would store the same fields. */
function sameVariable(a: Variable, b: Variable): boolean {
  if (a.slug !== b.slug || a.name !== b.name || a.unit !== b.unit || a.comment !== b.comment) {
    return false;
  }
  // The caller only compares an existing variable with its own replacement, so the
  // two always share a kind.
  if (isMeasuredVariable(a)) {
    const other = b as Extract<Variable, { kind: 'measurement' }>;
    return (
      a.sources.length === other.sources.length &&
      a.sources.every((id, index) => id === other.sources[index])
    );
  }
  return sameParam(a.value, (b as Extract<Variable, { kind?: 'value' }>).value);
}

/** Rewrite every formula parameter in the document through `rewrite`. */
function mapFormulaParams(
  document: PatternDocument,
  rewrite: (param: Param) => Param,
): PatternDocument {
  const mapped: PatternDocument = {
    ...document,
    constraints: document.constraints.map((constraint) =>
      constraint.type === 'distance' && constraint.value !== undefined
        ? { ...constraint, value: rewrite(constraint.value) }
        : constraint,
    ),
    pieces: document.pieces.map((piece) => {
      const allowances = piece.allowances.map((allowance) => ({
        ...allowance,
        width: rewrite(allowance.width),
      }));
      const allowance = piece.defaults?.allowance;
      const defaults =
        piece.defaults === undefined || allowance === undefined || allowance === null
          ? piece.defaults
          : { ...piece.defaults, allowance: { ...allowance, width: rewrite(allowance.width) } };
      return { ...piece, allowances, ...(defaults === undefined ? {} : { defaults }) };
    }),
  };

  if (document.variables !== undefined) {
    mapped.variables = document.variables.map((variable) =>
      isMeasuredVariable(variable) ? variable : { ...variable, value: rewrite(variable.value) },
    );
  }
  if (document.cornerRounds !== undefined) {
    mapped.cornerRounds = document.cornerRounds.map((round) => ({
      ...round,
      radius: rewrite(round.radius),
    }));
  }
  const preset = document.defaults?.allowance;
  if (preset !== undefined && preset !== null) {
    mapped.defaults = {
      ...document.defaults,
      allowance: { ...preset, width: rewrite(preset.width) },
    };
  }
  return mapped;
}

/**
 * Record what every formula currently resolves to before a variable disappears,
 * so a dependent keeps the number it was showing rather than an older one.
 */
function captureFormulaValues(document: PatternDocument): PatternDocument {
  return mapFormulaParams(document, (param) =>
    isExpressionParam(param)
      ? { expr: param.expr, lastKnown: resolveParam(document, param) }
      : param,
  );
}

/** Create a variable, or update the one already stored under the same slug. */
export function applySetVariable(
  document: PatternDocument,
  command: CommandOf<'set_variable'>,
): CommandApplication {
  const { slug: requestedSlug, name, unit, kind, value, sources, comment } = command.params;
  const variables = document.variables ?? [];
  const existing =
    requestedSlug === undefined
      ? undefined
      : variables.find((variable) => variable.slug === requestedSlug);

  if (existing !== undefined) {
    return applyUpdateVariable(document, {
      ...command,
      type: 'update_variable',
      params: {
        slug: existing.slug,
        ...(name === undefined ? {} : { name }),
        ...(unit === undefined ? {} : { unit }),
        ...(value === undefined ? {} : { value }),
        ...(sources === undefined ? {} : { sources }),
        ...(comment === undefined ? {} : { comment }),
      },
    });
  }

  if (name === undefined && requestedSlug === undefined) {
    throw new CommandValidationError('set_variable', 'slug or name is required');
  }
  if (requestedSlug !== undefined && !/^[a-z][a-z0-9_]{0,39}$/.test(requestedSlug)) {
    throw new CommandValidationError(
      'set_variable',
      'slug must be lowercase letters, digits and underscores, starting with a letter',
    );
  }

  const measured = kind === 'measurement';
  if (measured) {
    if (value !== undefined) {
      throw new CommandValidationError('set_variable', 'a measured variable takes no value');
    }
    if (sources === undefined) {
      throw new CommandValidationError('set_variable', 'a measured variable needs sources');
    }
  } else {
    if (sources !== undefined) {
      throw new CommandValidationError('set_variable', 'sources apply only to a measured variable');
    }
    if (value === undefined) {
      throw new CommandValidationError('set_variable', 'a variable needs a value or sources');
    }
  }

  const displayName = requireVariableName(document, 'set_variable', name ?? requestedSlug!);
  const slug = requestedSlug ?? uniqueVariableSlug(document, slugFromName(displayName));
  const trimmedComment =
    comment === undefined || comment === null
      ? undefined
      : requireVariableComment('set_variable', comment);

  const next: Variable = measured
    ? {
        slug,
        name: displayName,
        unit: unit ?? 'mm',
        kind: 'measurement',
        ...requireMeasurementSources(document, 'set_variable', sources!),
        ...(trimmedComment === undefined ? {} : { comment: trimmedComment }),
      }
    : {
        slug,
        name: displayName,
        unit: unit ?? 'mm',
        value: requireVariableValue(document, 'set_variable', value!),
        ...(trimmedComment === undefined ? {} : { comment: trimmedComment }),
      };

  return {
    document: { ...document, variables: [...variables, next] },
    inverse: { id: `${command.id}:remove`, type: 'remove_variable', params: { slug } },
  };
}

/** Change a variable's name, unit, value, chain or comment; its slug never moves. */
export function applyUpdateVariable(
  document: PatternDocument,
  command: CommandOf<'update_variable'>,
): CommandApplication {
  const { slug, name, unit, value, sources, comment } = command.params;
  const variables = document.variables ?? [];
  const existing = variables.find((variable) => variable.slug === slug);
  if (existing === undefined) {
    throw new CommandValidationError('update_variable', `unknown variable: ${slug}`);
  }
  if (isMeasuredVariable(existing) && value !== undefined) {
    throw new CommandValidationError(
      'update_variable',
      'a measured variable reads its value from geometry; update its sources',
    );
  }
  if (isValueVariable(existing) && sources !== undefined) {
    throw new CommandValidationError(
      'update_variable',
      'sources apply only to a measured variable',
    );
  }

  const nextName =
    name === undefined
      ? existing.name
      : requireVariableName(document, 'update_variable', name, slug);
  const nextUnit = unit ?? existing.unit;
  const measured = isMeasuredVariable(existing);
  const nextChain =
    sources === undefined
      ? undefined
      : requireMeasurementSources(document, 'update_variable', sources);
  let nextValue: Param | undefined;
  if (!measured) {
    if (value !== undefined) {
      nextValue = requireVariableValue(document, 'update_variable', value);
    } else if (nextUnit !== existing.unit && !isExpressionParam(existing.value)) {
      // A unit switch converts a literal so the measurement does not move.
      nextValue = convertLiteral(existing.value, existing.unit, nextUnit);
    }
  }
  const nextComment =
    comment === undefined
      ? existing.comment
      : comment === null
        ? undefined
        : requireVariableComment('update_variable', comment);

  const common = {
    slug,
    name: nextName,
    unit: nextUnit,
    ...(nextComment === undefined ? {} : { comment: nextComment }),
  };
  const next: Variable = measured
    ? {
        ...common,
        kind: 'measurement',
        ...(nextChain ?? {
          sources: (existing as Extract<Variable, { kind: 'measurement' }>).sources,
          ...(existing.kind === 'measurement' && existing.lastKnown !== undefined
            ? { lastKnown: existing.lastKnown }
            : {}),
        }),
      }
    : {
        ...common,
        value: nextValue ?? (existing as Extract<Variable, { kind?: 'value' }>).value,
      };
  if (sameVariable(existing, next)) return noOp(document);

  return {
    document: {
      ...document,
      variables: variables.map((variable) => (variable.slug === slug ? next : variable)),
    },
    inverse: {
      id: `${command.id}:restore`,
      type: 'update_variable',
      params: {
        slug,
        name: existing.name,
        unit: existing.unit,
        ...(isMeasuredVariable(existing)
          ? { sources: existing.sources }
          : { value: existing.value }),
        ...(existing.comment === undefined ? { comment: null } : { comment: existing.comment }),
      },
    },
  };
}

/** Remove a variable, leaving every dependent on the number it last showed. */
export function applyRemoveVariable(
  document: PatternDocument,
  command: CommandOf<'remove_variable'>,
): CommandApplication {
  const { slug } = command.params;
  const variables = document.variables ?? [];
  const existing = variables.find((variable) => variable.slug === slug);
  if (existing === undefined) return noOp(document);

  const captured = captureFormulaValues(document);
  // The variable exists, so the document has a variable list to filter.
  const remaining = captured.variables!.filter((variable) => variable.slug !== slug);

  return {
    document: { ...captured, variables: remaining },
    inverse: {
      id: `${command.id}:restore`,
      type: 'set_variable',
      params: {
        slug: existing.slug,
        name: existing.name,
        unit: existing.unit,
        ...(isMeasuredVariable(existing)
          ? { kind: 'measurement' as const, sources: existing.sources }
          : { value: existing.value }),
        ...(existing.comment === undefined ? {} : { comment: existing.comment }),
      },
    },
  };
}
