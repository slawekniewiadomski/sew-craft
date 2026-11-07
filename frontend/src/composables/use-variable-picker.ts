import type { EntityId, PatternDocument } from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import { variableOptions, variableQueryIsComplete } from '@/lib/formula';

/** The `$` token picker open over one value field. */
export interface VariablePickerState<Field extends string = string> {
  /** Which field owns the picker; a panel can have more than one kind. */
  field: Field;
  id: EntityId;
  activeIndex: number;
}

/**
 * The `$` variable picker every value field shares: a partial token filters the
 * variables, the arrow keys move the highlight, Enter inserts and Escape closes.
 *
 * The field that owns it keeps its own draft; this only owns which variable is
 * highlighted and hands the chosen slug back through `onPick`, so the caller
 * decides where the token lands.
 */
export function useVariablePicker<Field extends string = string>(
  document: () => PatternDocument,
  onPick: (field: Field, id: EntityId, slug: string) => void,
) {
  const picker = ref<VariablePickerState<Field> | null>(null);
  /** The partial token being typed, which filters the list. */
  const query = ref('');

  const options = computed(() => {
    const text = query.value.toLowerCase();
    return variableOptions(document()).filter(
      (option) => option.slug.includes(text) || option.name.toLowerCase().includes(text),
    );
  });

  /** Whether the picker is open for one field. */
  function isOpen(field: Field, id: EntityId): boolean {
    const current = picker.value;
    return current !== null && current.field === field && current.id === id;
  }

  /**
   * Open the picker for the partial token that was just typed. `null` closes it:
   * either there is no token, or the token already names a whole variable.
   */
  function open(field: Field, id: EntityId, text: string | null): void {
    query.value = text ?? '';
    picker.value =
      text === null || variableQueryIsComplete(document(), text)
        ? null
        : { field, id, activeIndex: 0 };
  }

  function close(): void {
    picker.value = null;
  }

  /** Insert one variable's token into the field that owns the picker. */
  function pick(field: Field, id: EntityId, slug: string): void {
    picker.value = null;
    onPick(field, id, slug);
  }

  /** Insert the row the highlight is on, if there is one. */
  function pickActive(field: Field, id: EntityId): void {
    const option = active();
    if (option !== null) pick(field, id, option.slug);
  }

  function active() {
    const current = picker.value;
    if (current === null || options.value.length === 0) return null;
    return options.value[Math.min(current.activeIndex, options.value.length - 1)]!;
  }

  /**
   * Arrow keys move the highlight, Enter inserts, Escape closes. Returns whether
   * the key was consumed, so a field with a second picker can fall through.
   */
  function onKeydown(field: Field, id: EntityId, event: KeyboardEvent): boolean {
    const current = picker.value;
    if (current === null || current.field !== field || current.id !== id) return false;
    const count = options.value.length;

    if (event.key === 'ArrowDown' && count > 0) {
      event.preventDefault();
      picker.value = { ...current, activeIndex: (current.activeIndex + 1) % count };
      return true;
    }
    if (event.key === 'ArrowUp' && count > 0) {
      event.preventDefault();
      picker.value = { ...current, activeIndex: (current.activeIndex - 1 + count) % count };
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      picker.value = null;
      return true;
    }
    if (event.key === 'Enter' && count > 0) {
      event.preventDefault();
      pickActive(field, id);
      return true;
    }
    return false;
  }

  return { picker, options, isOpen, active, open, close, pick, pickActive, onKeydown };
}
