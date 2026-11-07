/** Assembly and instance commands. */
import { CommandValidationError } from '../errors.js';
import type { Assembly, AssemblyInstance, EntityId, PatternDocument } from '../types.js';
import {
  noOp,
  replaceAssembly,
  requireFinite,
  requirePiece,
  withTab,
  withoutTab,
} from './shared.js';
import type { CommandApplication, CommandOf, CommandType } from './types.js';

/** The longest assembly name `create_assembly`/`update_assembly` accepts. */
export const MAX_ASSEMBLY_NAME_LENGTH = 80;

/** Find an assembly or explain which id is unknown. */
function requireAssembly(document: PatternDocument, id: EntityId, type: CommandType): Assembly {
  const assembly = document.assemblies.find((candidate) => candidate.id === id);
  if (assembly === undefined) {
    throw new CommandValidationError(type, `unknown assembly: ${id}`);
  }
  return assembly;
}

/** Trim and validate an assembly name; empty names are rejected. */
function requireAssemblyName(commandType: CommandType, name: unknown): string {
  if (typeof name !== 'string') {
    throw new CommandValidationError(commandType, 'name must be a string');
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ASSEMBLY_NAME_LENGTH) {
    throw new CommandValidationError(
      commandType,
      `name must be 1–${MAX_ASSEMBLY_NAME_LENGTH} characters after trimming`,
    );
  }
  return trimmed;
}

export function applyCreateAssembly(
  document: PatternDocument,
  command: CommandOf<'create_assembly'>,
): CommandApplication {
  if (document.assemblies.some((assembly) => assembly.id === command.id)) {
    return noOp(document);
  }

  const name =
    command.params.name === undefined
      ? `Assembly ${document.assemblies.length + 1}`
      : requireAssemblyName('create_assembly', command.params.name);

  return {
    document: {
      ...document,
      assemblies: [...document.assemblies, { id: command.id, name, instances: [] }],
      tabs: withTab(document, { kind: 'assembly', id: command.id }),
    },
    inverse: { id: command.id, type: 'delete_assembly', params: { id: command.id } },
  };
}

/** Rename an assembly. */
export function applyUpdateAssembly(
  document: PatternDocument,
  command: CommandOf<'update_assembly'>,
): CommandApplication {
  const { id } = command.params;
  const assembly = requireAssembly(document, id, 'update_assembly');
  const name = requireAssemblyName('update_assembly', command.params.name);

  if (name === assembly.name) return noOp(document);

  return {
    document: replaceAssembly(document, { ...assembly, name }),
    inverse: {
      id: command.id,
      type: 'update_assembly',
      params: { id, name: assembly.name },
    },
  };
}

/** Delete an assembly and its tab; placed pieces are untouched. */
export function applyDeleteAssembly(
  document: PatternDocument,
  command: CommandOf<'delete_assembly'>,
): CommandApplication {
  const { id } = command.params;
  if (!document.assemblies.some((assembly) => assembly.id === id)) {
    return noOp(document);
  }

  return {
    document: {
      ...document,
      assemblies: document.assemblies.filter((assembly) => assembly.id !== id),
      tabs: withoutTab(document, { kind: 'assembly', id }),
    },
    // Restoring an assembly and its instances is not a single command.
    inverse: null,
  };
}

/** Place one instance of a piece in an assembly. */
export function applyAddInstance(
  document: PatternDocument,
  command: CommandOf<'add_instance'>,
): CommandApplication {
  const { assembly: assemblyId, piece: pieceId, x, y, rotation, mirrored } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'add_instance');
  requirePiece(document, pieceId, 'add_instance');
  requireFinite('add_instance', x, 'x');
  requireFinite('add_instance', y, 'y');
  if (rotation !== undefined) requireFinite('add_instance', rotation, 'rotation');

  if (assembly.instances.some((instance) => instance.id === command.id)) {
    return noOp(document);
  }

  const instance: AssemblyInstance = { id: command.id, piece: pieceId, x, y };
  if (rotation !== undefined) instance.rotation = rotation;
  if (mirrored !== undefined) instance.mirrored = mirrored;

  return {
    document: replaceAssembly(document, {
      ...assembly,
      instances: [...assembly.instances, instance],
    }),
    inverse: {
      id: command.id,
      type: 'remove_instance',
      params: { assembly: assemblyId, instance: command.id },
    },
  };
}

/** Remove one placed instance. */
export function applyRemoveInstance(
  document: PatternDocument,
  command: CommandOf<'remove_instance'>,
): CommandApplication {
  const { assembly: assemblyId, instance: instanceId } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'remove_instance');
  const instance = assembly.instances.find((candidate) => candidate.id === instanceId);
  if (instance === undefined) return noOp(document);

  return {
    document: replaceAssembly(document, {
      ...assembly,
      instances: assembly.instances.filter((candidate) => candidate.id !== instanceId),
    }),
    inverse: {
      id: instance.id,
      type: 'add_instance',
      params: {
        assembly: assemblyId,
        piece: instance.piece,
        x: instance.x,
        y: instance.y,
        ...(instance.rotation === undefined ? {} : { rotation: instance.rotation }),
        ...(instance.mirrored === undefined ? {} : { mirrored: instance.mirrored }),
      },
    },
  };
}

/** Move, rotate or mirror one placed instance. */
export function applyUpdateInstance(
  document: PatternDocument,
  command: CommandOf<'update_instance'>,
): CommandApplication {
  const { assembly: assemblyId, instance: instanceId, x, y, rotation, mirrored } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'update_instance');
  const instance = assembly.instances.find((candidate) => candidate.id === instanceId);
  if (instance === undefined) {
    throw new CommandValidationError('update_instance', `unknown instance: ${instanceId}`);
  }
  if (x === undefined && y === undefined && rotation === undefined && mirrored === undefined) {
    throw new CommandValidationError('update_instance', 'provide x, y, rotation or mirrored');
  }
  if (x !== undefined) requireFinite('update_instance', x, 'x');
  if (y !== undefined) requireFinite('update_instance', y, 'y');
  if (rotation !== undefined) requireFinite('update_instance', rotation, 'rotation');

  const next: AssemblyInstance = { ...instance };
  if (x !== undefined) next.x = x;
  if (y !== undefined) next.y = y;
  if (rotation !== undefined) next.rotation = rotation;
  if (mirrored !== undefined) next.mirrored = mirrored;

  if (
    next.x === instance.x &&
    next.y === instance.y &&
    next.rotation === instance.rotation &&
    next.mirrored === instance.mirrored
  ) {
    return noOp(document);
  }

  return {
    document: replaceAssembly(document, {
      ...assembly,
      instances: assembly.instances.map((candidate) =>
        candidate.id === instanceId ? next : candidate,
      ),
    }),
    inverse: {
      id: command.id,
      type: 'update_instance',
      params: {
        assembly: assemblyId,
        instance: instanceId,
        x: instance.x,
        y: instance.y,
        rotation: instance.rotation ?? 0,
        mirrored: instance.mirrored ?? false,
      },
    },
  };
}

/** Replace the tab order with a permutation of the current refs. */
export function applyReorderTabs(
  document: PatternDocument,
  command: CommandOf<'reorder_tabs'>,
): CommandApplication {
  const { tabs } = command.params;
  if (tabs.length !== document.tabs.length) {
    throw new CommandValidationError(
      'reorder_tabs',
      'tabs must be a permutation of the current order',
    );
  }

  const known = new Set(document.tabs.map((tab) => `${tab.kind}:${tab.id}`));
  const seen = new Set<string>();
  for (const tab of tabs) {
    const key = `${tab.kind}:${tab.id}`;
    if (!known.has(key) || seen.has(key)) {
      throw new CommandValidationError(
        'reorder_tabs',
        'tabs must be a permutation of the current order',
      );
    }
    seen.add(key);
  }

  const unchanged = tabs.every(
    (tab, index) => tab.kind === document.tabs[index]!.kind && tab.id === document.tabs[index]!.id,
  );
  if (unchanged) return noOp(document);

  return {
    document: { ...document, tabs: tabs.map((tab) => ({ kind: tab.kind, id: tab.id })) },
    inverse: {
      id: command.id,
      type: 'reorder_tabs',
      params: { tabs: document.tabs.map((tab) => ({ kind: tab.kind, id: tab.id })) },
    },
  };
}
