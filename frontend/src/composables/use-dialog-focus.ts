import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/** A component ref whose root element is the focusable button. */
export interface DialogFocusTarget {
  $el: HTMLButtonElement;
}

/**
 * Dialog focus discipline: focus one button on open, keep Tab inside the
 * dialog, and restore whatever was focused before the dialog opened.
 */
export function useDialogFocus(
  initial: Ref<DialogFocusTarget | null>,
  first: Ref<DialogFocusTarget | null>,
  last: Ref<DialogFocusTarget | null>,
) {
  let previouslyFocused: HTMLElement | null = null;

  onMounted(() => {
    previouslyFocused = document.activeElement as HTMLElement | null;
    initial.value?.$el.focus();
  });

  onBeforeUnmount(() => previouslyFocused?.focus());

  function trapTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    if (event.shiftKey && document.activeElement === first.value?.$el) {
      event.preventDefault();
      last.value?.$el.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last.value?.$el) {
      event.preventDefault();
      first.value?.$el.focus();
    }
  }

  return { trapTab };
}
