import type { DistanceConstraint, EntityId, PatternDocument } from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import {
  filterReferenceOptions,
  isReferenceEditText,
  referenceOptions,
  referenceSearchText,
  type DimensionReferenceOption,
} from '@/lib/dimensions';

/** The `#` reference picker open over one dimension field. */
export interface ReferencePickerState {
  id: EntityId;
  text: string;
  activeIndex: number;
}

/**
 * The `#` dimension-reference picker both sidebar surfaces share: typing `#`
 * lists the other dimensions the field may follow, the arrow keys move the
 * highlight, Enter links and Escape closes.
 *
 * Only which row is highlighted lives here; the caller owns the draft and the
 * command it emits when a reference is picked.
 */
export function useReferencePicker(
  document: () => PatternDocument,
  onSelect: (id: EntityId, reference: EntityId) => void,
) {
  const picker = ref<ReferencePickerState | null>(null);

  function distanceConstraint(id: EntityId): DistanceConstraint | null {
    const constraint = document().constraints.find((entry) => entry.id === id);
    return constraint !== undefined && constraint.type === 'distance' ? constraint : null;
  }

  /** Every row the picker can offer for one dimension, unfiltered. */
  function optionsFor(id: EntityId): DimensionReferenceOption[] {
    const constraint = distanceConstraint(id);
    return constraint === null ? [] : referenceOptions(document(), constraint);
  }

  /** The rows the open picker offers, filtered by the text typed after `#`. */
  const options = computed<DimensionReferenceOption[]>(() => {
    const current = picker.value;
    if (current === null) return [];
    return filterReferenceOptions(optionsFor(current.id), current.text);
  });

  /** The row Enter would pick, or `null` for an empty list. */
  const activeOption = computed<DimensionReferenceOption | null>(() => {
    const current = picker.value;
    if (current === null || options.value.length === 0) return null;
    return options.value[Math.min(current.activeIndex, options.value.length - 1)]!;
  });

  /** The highlighted row's index, clamped to the filtered list. */
  const activeIndex = computed<number>(() =>
    activeOption.value === null
      ? -1
      : options.value.findIndex((option) => option.id === activeOption.value!.id),
  );

  function open(id: EntityId, text = ''): void {
    picker.value = { id, text, activeIndex: 0 };
  }

  function close(): void {
    picker.value = null;
  }

  function move(step: number): void {
    const current = picker.value!;
    const count = options.value.length;
    if (count === 0) return;
    picker.value = {
      ...current,
      activeIndex: (current.activeIndex + step + count) % count,
    };
  }

  /** Follow the typed text: a `#` token opens the picker, anything else closes it. */
  function onInput(id: EntityId, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (isReferenceEditText(value)) {
      open(id, referenceSearchText(value));
    } else if (picker.value?.id === id) {
      close();
    }
  }

  /** Link the highlight; closing first so the field shows the committed value. */
  function select(id: EntityId, reference: EntityId): void {
    close();
    onSelect(id, reference);
  }

  /**
   * Arrow keys move the highlight, Enter links, Escape closes. Returns whether
   * the key was consumed, so a field with a second picker can fall through.
   */
  function onKeydown(id: EntityId, event: KeyboardEvent): boolean {
    const current = picker.value;
    if (current === null || current.id !== id) return false;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return true;
    }
    if (event.key === 'Enter' && activeOption.value !== null) {
      event.preventDefault();
      select(id, activeOption.value.id);
      return true;
    }
    return false;
  }

  return {
    picker,
    options,
    activeOption,
    activeIndex,
    optionsFor,
    open,
    close,
    onInput,
    select,
    onKeydown,
  };
}
