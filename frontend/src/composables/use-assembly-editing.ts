import type { Assembly, Command, EntityId } from '@sewcraft/geometry';
import { onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue';

import { nextCommandId } from '@/lib/command-ids';

export interface AssemblyEditingOptions {
  activeAssembly: ComputedRef<Assembly | null>;
  selectedInstanceId: Ref<EntityId | null>;
  selectedEntityIds: Ref<EntityId[]>;
  selectedDimensionIds: Ref<EntityId[]>;
  /** The view's command wrapper; it reports failures through its error strip. */
  run: (action: () => void) => boolean;
  dispatch: (command: Command) => void;
}

/**
 * Assembly instance editing: selection, the coalesced arrow nudge, and the
 * move/add/remove/mirror/rotate/update commands the canvas and the sidebar
 * panel emit.
 *
 * The active assembly and the shared selection live in the view; this owns the
 * picker flag and the nudge timer that only assembly editing needs.
 */
export function useAssemblyEditing({
  activeAssembly,
  selectedInstanceId,
  selectedEntityIds,
  selectedDimensionIds,
  run,
  dispatch,
}: AssemblyEditingOptions) {
  const assemblyPickerOpen = ref(false);

  function selectInstance(id: EntityId | null): void {
    selectedInstanceId.value = id;
    selectedEntityIds.value = [];
    selectedDimensionIds.value = [];
  }

  function onMoveInstance(id: EntityId, x: number, y: number): void {
    const assembly = activeAssembly.value;
    /* v8 ignore next -- the canvas exists only inside an assembly tab */
    if (assembly === null) return;
    run(() =>
      dispatch({
        id: nextCommandId('instance'),
        type: 'update_instance',
        params: { assembly: assembly.id, instance: id, x, y },
      }),
    );
  }

  /** Arrow nudges coalesce into one journal entry like point nudges do. */
  const instanceNudge = ref<{ id: EntityId | null; dx: number; dy: number }>({
    id: null,
    dx: 0,
    dy: 0,
  });
  let instanceNudgeTimer: ReturnType<typeof setTimeout> | null = null;

  function onNudgeInstance(id: EntityId, dx: number, dy: number): void {
    if (instanceNudge.value.id === null) {
      const instance = activeAssembly.value?.instances.find((entry) => entry.id === id);
      /* v8 ignore next -- the canvas only nudges instances it rendered */
      if (instance === undefined) return;
      instanceNudge.value = { id, dx: 0, dy: 0 };
    }
    instanceNudge.value = {
      id,
      dx: instanceNudge.value.dx + dx,
      dy: instanceNudge.value.dy + dy,
    };
    if (instanceNudgeTimer !== null) clearTimeout(instanceNudgeTimer);
    instanceNudgeTimer = setTimeout(() => {
      const pending = instanceNudge.value;
      instanceNudge.value = { id: null, dx: 0, dy: 0 };
      instanceNudgeTimer = null;
      const assembly = activeAssembly.value;
      /* v8 ignore start -- the assembly exists while its canvas is mounted */
      const instance =
        assembly === null ? undefined : assembly.instances.find((entry) => entry.id === pending.id);
      if (assembly === null || instance === undefined) return;
      /* v8 ignore stop */
      /* v8 ignore next -- the canvas never emits a zero nudge */
      if (pending.dx === 0 && pending.dy === 0) return;
      run(() =>
        dispatch({
          id: nextCommandId('instance'),
          type: 'update_instance',
          params: {
            assembly: assembly.id,
            instance: instance.id,
            x: instance.x + pending.dx,
            y: instance.y + pending.dy,
          },
        }),
      );
    }, 300);
  }

  function onRemoveInstance(id: EntityId): void {
    const assembly = activeAssembly.value;
    /* v8 ignore next -- the canvas exists only inside an assembly tab */
    if (assembly === null) return;
    if (
      run(() =>
        dispatch({
          id: nextCommandId('instance'),
          type: 'remove_instance',
          params: { assembly: assembly.id, instance: id },
        }),
      )
    ) {
      selectedInstanceId.value = null;
    }
  }

  function onAddInstance(piece: EntityId): void {
    const assembly = activeAssembly.value;
    /* v8 ignore next -- the picker exists only inside an assembly tab */
    if (assembly === null) return;
    run(() =>
      dispatch({
        id: nextCommandId('instance'),
        type: 'add_instance',
        params: { assembly: assembly.id, piece, x: 0, y: 0 },
      }),
    );
    assemblyPickerOpen.value = false;
  }

  /** Mirror or rotate the selected instance through one update_instance. */
  function onTransformInstance(kind: 'mirror' | 'rotate'): void {
    const assembly = activeAssembly.value;
    /* v8 ignore start -- the ribbon action exists only inside an assembly tab */
    const instance =
      assembly === null
        ? undefined
        : assembly.instances.find((entry) => entry.id === selectedInstanceId.value);
    if (assembly === null || instance === undefined) return;
    /* v8 ignore stop */
    const patch =
      kind === 'mirror'
        ? { mirrored: instance.mirrored !== true }
        : { rotation: (instance.rotation ?? 0) + Math.PI / 2 };
    run(() =>
      dispatch({
        id: nextCommandId('instance'),
        type: 'update_instance',
        params: { assembly: assembly.id, instance: instance.id, ...patch },
      }),
    );
  }

  function onUpdateInstance(patch: {
    x?: number;
    y?: number;
    rotation?: number;
    mirrored?: boolean;
  }): void {
    const assembly = activeAssembly.value;
    /* v8 ignore next -- the panel renders only with a selected instance */
    if (assembly === null || selectedInstanceId.value === null) return;
    run(() =>
      dispatch({
        id: nextCommandId('instance'),
        type: 'update_instance',
        params: { assembly: assembly.id, instance: selectedInstanceId.value!, ...patch },
      }),
    );
  }

  function onUpdateAssembly(name: string): void {
    const assembly = activeAssembly.value;
    /* v8 ignore next -- the panel exists only inside an assembly tab */
    if (assembly === null) return;
    run(() =>
      dispatch({
        id: nextCommandId('assembly'),
        type: 'update_assembly',
        params: { id: assembly.id, name },
      }),
    );
  }

  onBeforeUnmount(() => {
    if (instanceNudgeTimer !== null) clearTimeout(instanceNudgeTimer);
  });

  return {
    assemblyPickerOpen,
    selectInstance,
    onMoveInstance,
    onNudgeInstance,
    onRemoveInstance,
    onAddInstance,
    onTransformInstance,
    onUpdateInstance,
    onUpdateAssembly,
  };
}
