import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/** A dialog focus target: a native element or a component whose root is one. */
export type DialogFocusTarget = HTMLElement | { $el: HTMLElement };

function elementOf(target: DialogFocusTarget): HTMLElement {
  return '$el' in target ? target.$el : target;
}

/**
 * Dialog focus discipline: focus one target on open, keep Tab inside the
 * dialog, and restore whatever was focused before the dialog opened.
 */
export function useDialogFocus<
  Initial extends DialogFocusTarget,
  First extends DialogFocusTarget,
  Last extends DialogFocusTarget,
>(initial: Ref<Initial | null>, first: Ref<First | null>, last: Ref<Last | null>) {
  let previouslyFocused: HTMLElement | null = null;

  onMounted(() => {
    previouslyFocused = document.activeElement as HTMLElement | null;
    if (initial.value !== null) elementOf(initial.value).focus();
  });

  onBeforeUnmount(() => previouslyFocused?.focus());

  function trapTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    if (
      event.shiftKey &&
      first.value !== null &&
      document.activeElement === elementOf(first.value)
    ) {
      event.preventDefault();
      if (last.value !== null) elementOf(last.value).focus();
      return;
    }

    if (
      !event.shiftKey &&
      last.value !== null &&
      document.activeElement === elementOf(last.value)
    ) {
      event.preventDefault();
      if (first.value !== null) elementOf(first.value).focus();
    }
  }

  return { trapTab };
}
