import { effectiveDefaultAllowance, effectivePieceAllowance } from '../defaults.js';
import { CommandValidationError } from '../errors.js';
import { sameParam } from '../expression.js';
import { ALLOWANCE_KINDS } from '../types.js';
import type {
  Allowance,
  AllowanceKind,
  AllowancePreset,
  EntityId,
  PatternDocument,
  Piece,
} from '../types.js';
import { requireLengthParam } from './constraint-validation.js';
import { noOp } from './shared.js';
import type { Command, CommandApplication, CommandOf, CommandType, ParamInput } from './types.js';

export function effectiveKind(allowance: Allowance): AllowanceKind {
  return allowance.kind ?? 'seam';
}

/** The preset `create_piece`/`set_piece_loop` copies onto new loop edges, or `null`. */
export function resolveCreateAllowance(
  document: PatternDocument,
  allowance: 'default' | 'none' | AllowancePreset | undefined,
  type: CommandType,
  piece: Piece,
): AllowancePreset | null {
  if (allowance === 'none') return null;
  if (allowance === undefined || allowance === 'default') {
    return effectivePieceAllowance(document, piece);
  }

  return requireAllowancePreset(document, type, allowance);
}

/** Validate and copy one allowance preset, recording a formula's current value. */
export function requireAllowancePreset(
  document: PatternDocument,
  commandType: CommandType,
  preset: { width: ParamInput; kind?: AllowanceKind },
): AllowancePreset {
  if (typeof preset !== 'object' || preset === null) {
    throw new CommandValidationError(
      commandType,
      'allowance must be "default", "none" or a preset',
    );
  }
  const width = requireLengthParam(document, commandType, preset.width, 'allowance width');
  if (preset.kind !== undefined && !ALLOWANCE_KINDS.includes(preset.kind)) {
    throw new CommandValidationError(commandType, `unknown allowance kind: ${String(preset.kind)}`);
  }

  return {
    width,
    ...(preset.kind === undefined ? {} : { kind: preset.kind }),
  };
}

/** A command that restores an allowance to its previous width and kind. */
export function restoreAllowance(id: EntityId, piece: EntityId, allowance: Allowance): Command {
  return {
    id: `${id}:restore`,
    type: 'set_piece_allowance',
    params: {
      piece,
      edge: allowance.edge,
      width: allowance.width,
      ...(allowance.kind === undefined ? {} : { kind: allowance.kind }),
    },
  };
}

export function applySetDefaultAllowance(
  document: PatternDocument,
  command: CommandOf<'set_default_allowance'>,
): CommandApplication {
  const { width, kind, remove } = command.params;
  const current = effectiveDefaultAllowance(document);

  if (remove === true) {
    if (width !== undefined || kind !== undefined) {
      throw new CommandValidationError('set_default_allowance', 'remove takes no width or kind');
    }
    if (current === null) {
      return noOp(document);
    }

    return {
      document: { ...document, defaults: { allowance: null } },
      inverse: restoreDefaultAllowance(command.id, current),
    };
  }

  if (width === undefined) {
    throw new CommandValidationError(
      'set_default_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const nextWidth = requireLengthParam(document, 'set_default_allowance', width, 'width');
  if (kind !== undefined && !ALLOWANCE_KINDS.includes(kind)) {
    throw new CommandValidationError(
      'set_default_allowance',
      `unknown allowance kind: ${String(kind)}`,
    );
  }

  const nextKind = kind ?? 'seam';
  if (
    current !== null &&
    sameParam(current.width, nextWidth) &&
    (current.kind ?? 'seam') === nextKind
  ) {
    return noOp(document);
  }

  return {
    document: { ...document, defaults: { allowance: { width: nextWidth, kind: nextKind } } },
    inverse:
      current === null
        ? {
            id: `${command.id}:remove`,
            type: 'set_default_allowance',
            params: { remove: true },
          }
        : restoreDefaultAllowance(command.id, current),
  };
}

/** A command that restores the document's previous default allowance preset. */
function restoreDefaultAllowance(id: EntityId, preset: AllowancePreset): Command {
  return {
    id: `${id}:restore`,
    type: 'set_default_allowance',
    params: {
      width: preset.width,
      ...(preset.kind === undefined ? {} : { kind: preset.kind }),
    },
  };
}
