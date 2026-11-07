/** Seam-match and finished-edge commands. */
import { CommandValidationError } from '../errors.js';
import { pieceById } from '../piece.js';
import { validateSeam } from '../seams.js';
import type {
  Assembly,
  EntityId,
  FinishKind,
  PatternDocument,
  SeamMatch,
  SeamRun,
} from '../types.js';
import { FINISH_KINDS } from '../types.js';
import { requireAssembly } from './assemblies.js';
import { noOp, replaceAssembly } from './shared.js';
import type { CommandApplication, CommandOf } from './types.js';

/** Copy a side without an explicit `false`, so the stored shape stays minimal. */
function normalizeSide(side: SeamRun): SeamRun {
  return {
    instance: side.instance,
    edges: [...side.edges],
    ...(side.reversed === true ? { reversed: true } : {}),
  };
}

/** The record a side list stores, with `eased` only when it is true. */
function seamRecord(
  id: EntityId,
  sides: readonly SeamRun[],
  eased: boolean | undefined,
): SeamMatch {
  return {
    id,
    sides: sides.map(normalizeSide),
    ...(eased === true ? { eased: true } : {}),
  };
}

/** Resolve a finish kind, rejecting an unknown one at the command boundary. */
function requireFinishKind(kind: FinishKind | null): FinishKind | null {
  if (kind === null) return null;
  if (!(FINISH_KINDS as readonly string[]).includes(kind)) {
    throw new CommandValidationError('set_edge_finished', `unknown finish kind: ${String(kind)}`);
  }
  return kind;
}

/** Whether one instance edge is already claimed by a seam. */
function sewnEdge(assembly: Assembly, instance: EntityId, edge: EntityId): boolean {
  return (assembly.seams ?? []).some((seam) =>
    seam.sides.some((side) => side.instance === instance && side.edges.includes(edge)),
  );
}

/** Sew two or more edge runs together. */
export function applyAddSeamMatch(
  document: PatternDocument,
  command: CommandOf<'add_seam_match'>,
): CommandApplication {
  const { assembly: assemblyId, sides, eased } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'add_seam_match');

  if ((assembly.seams ?? []).some((seam) => seam.id === command.id)) {
    return noOp(document);
  }

  const validation = validateSeam(document, assembly, sides);
  if (!validation.ok) {
    throw new CommandValidationError('add_seam_match', validation.message);
  }

  return {
    document: replaceAssembly(document, {
      ...assembly,
      seams: [...(assembly.seams ?? []), seamRecord(command.id, sides, eased)],
    }),
    inverse: {
      id: command.id,
      type: 'remove_seam_match',
      params: { assembly: assemblyId, seam: command.id },
    },
  };
}

/** Change a seam's sides, its ease flag, or both. */
export function applyUpdateSeamMatch(
  document: PatternDocument,
  command: CommandOf<'update_seam_match'>,
): CommandApplication {
  const { assembly: assemblyId, seam: seamId, sides, eased } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'update_seam_match');
  const seams = assembly.seams ?? [];
  const seam = seams.find((candidate) => candidate.id === seamId);
  if (seam === undefined) {
    throw new CommandValidationError('update_seam_match', `unknown seam: ${seamId}`);
  }
  if (sides === undefined && eased === undefined) {
    throw new CommandValidationError('update_seam_match', 'provide eased or sides');
  }

  if (sides !== undefined) {
    const validation = validateSeam(document, assembly, sides, { ignoreSeam: seamId });
    if (!validation.ok) {
      throw new CommandValidationError('update_seam_match', validation.message);
    }
  }

  const next = seamRecord(
    seam.id,
    sides ?? seam.sides,
    eased === undefined ? seam.eased === true : eased,
  );

  return {
    document: replaceAssembly(document, {
      ...assembly,
      seams: seams.map((candidate) => (candidate.id === seamId ? next : candidate)),
    }),
    inverse: {
      id: command.id,
      type: 'update_seam_match',
      params: {
        assembly: assemblyId,
        seam: seam.id,
        sides: seam.sides,
        eased: seam.eased === true,
      },
    },
  };
}

/** Unsew a seam; an unknown seam is a no-op. */
export function applyRemoveSeamMatch(
  document: PatternDocument,
  command: CommandOf<'remove_seam_match'>,
): CommandApplication {
  const { assembly: assemblyId, seam: seamId } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'remove_seam_match');
  const seams = assembly.seams ?? [];
  const seam = seams.find((candidate) => candidate.id === seamId);
  if (seam === undefined) return noOp(document);

  return {
    document: replaceAssembly(document, {
      ...assembly,
      seams: seams.filter((candidate) => candidate.id !== seamId),
    }),
    inverse: {
      id: seam.id,
      type: 'add_seam_match',
      params: {
        assembly: assemblyId,
        sides: seam.sides,
        ...(seam.eased === true ? { eased: true } : {}),
      },
    },
  };
}

/** Mark an edge as finished, change its kind, or clear the mark. */
export function applySetEdgeFinished(
  document: PatternDocument,
  command: CommandOf<'set_edge_finished'>,
): CommandApplication {
  const { assembly: assemblyId, instance: instanceId, edge, kind } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'set_edge_finished');
  const nextKind = requireFinishKind(kind);

  const instance = assembly.instances.find((candidate) => candidate.id === instanceId);
  if (instance === undefined) {
    throw new CommandValidationError('set_edge_finished', `unknown instance: ${instanceId}`);
  }
  const piece = pieceById(document, instance.piece);
  if (piece === undefined) {
    throw new CommandValidationError(
      'set_edge_finished',
      `instance ${instanceId} places an unknown piece`,
    );
  }
  if (!piece.edges.includes(edge)) {
    throw new CommandValidationError(
      'set_edge_finished',
      `edge ${edge} is not in the loop of piece ${piece.id}`,
    );
  }
  if (sewnEdge(assembly, instanceId, edge)) {
    throw new CommandValidationError('set_edge_finished', `edge ${edge} is sewn to a seam`);
  }

  const finished = assembly.finishedEdges ?? [];
  const previous =
    finished.find((candidate) => candidate.instance === instanceId && candidate.edge === edge)
      ?.kind ?? null;
  if (previous === nextKind) return noOp(document);

  const nextFinished =
    nextKind === null
      ? finished.filter(
          (candidate) => !(candidate.instance === instanceId && candidate.edge === edge),
        )
      : previous === null
        ? [...finished, { instance: instanceId, edge, kind: nextKind }]
        : finished.map((candidate) =>
            candidate.instance === instanceId && candidate.edge === edge
              ? { ...candidate, kind: nextKind }
              : candidate,
          );

  return {
    document: replaceAssembly(document, { ...assembly, finishedEdges: nextFinished }),
    inverse: {
      id: command.id,
      type: 'set_edge_finished',
      params: { assembly: assemblyId, instance: instanceId, edge, kind: previous },
    },
  };
}
