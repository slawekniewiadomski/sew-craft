<script setup lang="ts">
/**
 * The one modal shell: backdrop, `dialog` role, aria wiring, Escape and
 * click-outside.
 *
 * Dismissal is opt-in. A dialog the maker must answer — a save conflict that
 * needs a reload-or-overwrite decision — passes `dismissible: false` and offers
 * only buttons. Focus discipline stays with the caller through
 * `useDialogFocus`, because only the caller knows which control holds focus
 * first; its `trapTab` handler is bound on this component's root as a
 * fallthrough listener.
 */
const props = withDefaults(
  defineProps<{
    /** Id of the element that titles the dialog. */
    labelledBy: string;
    /** Id of the element that describes it, when it has one. */
    describedBy?: string;
    /** `sm` for a confirmation, `md` for a form or an explanation. */
    size?: 'sm' | 'md';
    /** `loose` widens the vertical rhythm for a multi-section form. */
    density?: 'tight' | 'loose';
    /** Whether Escape and a backdrop click cancel the dialog. */
    dismissible?: boolean;
  }>(),
  { describedBy: undefined, size: 'sm', density: 'tight', dismissible: true },
);

const emit = defineEmits<{ cancel: [] }>();

/**
 * Escape cancels a dismissible dialog. A dialog that must be answered keeps the
 * key untouched, exactly as if the shell were not there.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !props.dismissible) return;
  event.preventDefault();
  emit('cancel');
}

function onBackdropClick(): void {
  if (props.dismissible) emit('cancel');
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @keydown="onKeydown"
    @click.self="onBackdropClick"
  >
    <div
      role="dialog"
      aria-modal="true"
      :aria-labelledby="labelledBy"
      :aria-describedby="describedBy"
      class="w-full rounded-md border bg-background p-4 shadow-lg"
      :class="[
        size === 'md' ? 'max-w-md' : 'max-w-sm',
        density === 'loose' ? 'space-y-4' : 'space-y-3',
      ]"
    >
      <slot />
    </div>
  </div>
</template>
