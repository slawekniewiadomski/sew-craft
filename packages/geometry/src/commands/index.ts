/** The command dispatcher and the solve/execute entry points. */
import { regenerateCornerRounds } from '../corner-round.js';
import { allPoints, cornerRounds } from '../document.js';
import { regenerateMidpoints } from '../midpoint.js';
import { solve } from '../solver.js';
import type { SolveOptions, SolveResult } from '../solver.js';
import type { EntityId, PatternDocument } from '../types.js';
import { applySetDefaultAllowance } from './default-allowances.js';
import { applySetPieceAllowance, applySetPieceCornerAllowance } from './piece-allowances.js';
import {
  applyAddCornerRound,
  applyRemoveCornerRound,
  applySetCornerRoundRadius,
} from './corner-rounds.js';
import {
  applyAddSeamAllowance,
  applyRemoveSeamAllowance,
  applySetSeamAllowance,
} from './seam-allowances.js';
import {
  applyAddInstance,
  applyCreateAssembly,
  applyDeleteAssembly,
  applyRemoveInstance,
  applyReorderTabs,
  applyUpdateAssembly,
  applyUpdateInstance,
} from './assemblies.js';
import { applyAddConstraint, applyRemoveConstraint, applyUpdateConstraint } from './constraints.js';
import { applyAddDerivedDimension } from './derived-dimensions.js';
import {
  applyAddArc,
  applyAddCircle,
  applyAddCurve,
  applyAddLine,
  applyAddPoint,
  applyDeleteEntity,
  applyMovePoint,
  applySetConstruction,
  applySplitLine,
} from './entities.js';
import {
  applyAddCentreLine,
  applyAddNotch,
  applyAddText,
  applyUpdateCentreLine,
  applyUpdateNotch,
  applyUpdateText,
} from './marks.js';
import {
  applyCreatePiece,
  applyDeletePiece,
  applyPlacePiece,
  applySetPieceLoop,
  applySetRole,
  applyUpdatePiece,
} from './pieces.js';
import { applySetPieceDefaultAllowance } from './piece-defaults.js';
import { noOp, roleFromParams } from './shared.js';
import { applyRemoveVariable, applySetVariable, applyUpdateVariable } from './variables.js';
import type {
  Command,
  CommandApplication,
  CommandType,
  ExecuteResult,
  SolvedDocument,
} from './types.js';

export * from './types.js';
export { DEFAULT_SEAM_ALLOWANCE } from './seam-allowances.js';
export { MAX_ASSEMBLY_NAME_LENGTH } from './assemblies.js';
export { MIN_SPLIT_LENGTH } from './entities.js';
export { MAX_PIECE_NOTES_LENGTH, MAX_PIECE_FABRIC_LENGTH } from './pieces.js';
export { MAX_VARIABLE_NAME_LENGTH, MAX_VARIABLE_COMMENT_LENGTH } from './variables.js';

export { CommandValidationError } from '../errors.js';

export class CommandExecutionError extends Error {
  readonly commandType: CommandType;
  readonly iterations: number;
  readonly residualNorm: number;

  constructor(commandType: CommandType, result: SolveResult) {
    super(
      `[${commandType}] solver did not converge (residual ${result.residualNorm}, iterations ${result.iterations})`,
    );
    this.name = 'CommandExecutionError';
    this.commandType = commandType;
    this.iterations = result.iterations;
    this.residualNorm = result.residualNorm;
  }
}

/**
 * Apply a command to a document without solving. Pure: the input document is
 * never mutated, validation failures throw before any new document is built, and
 * re-applying an already-applied command returns the document unchanged.
 */
export function applyCommand(document: PatternDocument, command: Command): CommandApplication {
  switch (command.type) {
    case 'add_point':
      return applyAddPoint(document, command);
    case 'move_point':
      return applyMovePoint(document, command);
    case 'add_line':
      return applyAddLine(
        document,
        command,
        roleFromParams(command.params.role, command.params.construction),
        'add_line',
      );
    case 'split_line':
      return applySplitLine(document, command);
    case 'add_construction_line':
      return applyAddLine(document, command, 'construction', 'add_construction_line');
    case 'set_construction':
      return applySetConstruction(document, command);
    case 'add_curve':
      return applyAddCurve(document, command);
    case 'add_arc':
      return applyAddArc(document, command);
    case 'add_circle':
      return applyAddCircle(document, command);
    case 'delete_entity':
      return applyDeleteEntity(document, command);
    case 'add_constraint':
      return applyAddConstraint(document, command);
    case 'update_constraint':
      return applyUpdateConstraint(document, command);
    case 'remove_constraint':
      return applyRemoveConstraint(document, command);
    case 'add_seam_allowance':
      return applyAddSeamAllowance(document, command);
    case 'remove_seam_allowance':
      return applyRemoveSeamAllowance(document, command);
    case 'set_seam_allowance':
      return applySetSeamAllowance(document, command);
    case 'add_corner_round':
      return applyAddCornerRound(document, command);
    case 'set_corner_round_radius':
      return applySetCornerRoundRadius(document, command);
    case 'remove_corner_round':
      return applyRemoveCornerRound(document, command);
    case 'create_piece':
      return applyCreatePiece(document, command);
    case 'update_piece':
      return applyUpdatePiece(document, command);
    case 'place_piece':
      return applyPlacePiece(document, command);
    case 'delete_piece':
      return applyDeletePiece(document, command);
    case 'set_piece_loop':
      return applySetPieceLoop(document, command);
    case 'set_role':
      return applySetRole(document, command);
    case 'add_text':
      return applyAddText(document, command);
    case 'update_text':
      return applyUpdateText(document, command);
    case 'add_notch':
      return applyAddNotch(document, command);
    case 'update_notch':
      return applyUpdateNotch(document, command);
    case 'add_centre_line':
      return applyAddCentreLine(document, command);
    case 'update_centre_line':
      return applyUpdateCentreLine(document, command);
    case 'set_piece_allowance':
      return applySetPieceAllowance(document, command);
    case 'set_piece_corner_allowance':
      return applySetPieceCornerAllowance(document, command);
    case 'set_default_allowance':
      return applySetDefaultAllowance(document, command);
    case 'add_derived_dimension':
      return applyAddDerivedDimension(document, command);
    case 'set_piece_default_allowance':
      return applySetPieceDefaultAllowance(document, command);
    case 'set_variable':
      return applySetVariable(document, command);
    case 'update_variable':
      return applyUpdateVariable(document, command);
    case 'remove_variable':
      return applyRemoveVariable(document, command);
    case 'create_assembly':
      return applyCreateAssembly(document, command);
    case 'update_assembly':
      return applyUpdateAssembly(document, command);
    case 'delete_assembly':
      return applyDeleteAssembly(document, command);
    case 'add_instance':
      return applyAddInstance(document, command);
    case 'remove_instance':
      return applyRemoveInstance(document, command);
    case 'update_instance':
      return applyUpdateInstance(document, command);
    case 'reorder_tabs':
      return applyReorderTabs(document, command);
    case 'solve':
      return noOp(document);
  }
}

/**
 * Run the solver over a document and write the solved coordinates back into a
 * new document. Immutable, and a no-op when the solver does not converge.
 */
export function solveDocument(
  document: PatternDocument,
  options: SolveOptions = {},
): SolvedDocument {
  // Derived cut dimensions measure generated geometry and never reach the solver.
  const constraints = document.constraints.filter(
    (constraint) => constraint.type !== 'derived_distance',
  );
  // A trimmed line ends at a fixed tangent; its support anchor is the sharp
  // corner, so line-anchored dimensions still see a line that can move.
  const supportAnchors = new Map<EntityId, EntityId>();
  for (const round of cornerRounds(document)) {
    for (const end of round.ends) supportAnchors.set(end.tangent, round.corner);
  }
  const result = solve(
    allPoints(document),
    constraints,
    options,
    document.entities,
    supportAnchors,
    document,
  );
  if (!result.converged) {
    return { document, result };
  }

  const entities = document.entities.map((entity): typeof entity => {
    if (entity.kind !== 'point') return entity;
    // `solve` returns a coordinate for every point, fixed ones included.
    const coordinate = result.coordinates.get(entity.id)!;
    return { ...entity, x: coordinate.x, y: coordinate.y };
  });

  return {
    document: regenerateMidpoints(regenerateCornerRounds({ ...document, entities })),
    result,
  };
}

/**
 * Apply a command and solve the result. Throws `CommandExecutionError` (leaving
 * the input document untouched) when the solver does not converge.
 */
export function executeCommand(
  document: PatternDocument,
  command: Command,
  options: SolveOptions = {},
): ExecuteResult {
  const application = applyCommand(document, command);
  const solved = solveDocument(application.document, options);

  if (!solved.result.converged) {
    throw new CommandExecutionError(command.type, solved.result);
  }

  return { document: solved.document, inverse: application.inverse, solveResult: solved.result };
}
