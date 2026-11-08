<script setup lang="ts">
import type { EntityId } from '@sewcraft/geometry';

import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
import type { EntityProperties } from '@/lib/entity-properties';

const props = defineProps<{ entity: EntityProperties }>();

const emit = defineEmits<{ 'update-text': [id: EntityId, patch: Record<string, unknown>] }>();

function onTextContent(event: Event): void {
  emit('update-text', props.entity.id, { content: (event.target as HTMLInputElement).value });
}

function onTextAlignment(event: Event): void {
  emit('update-text', props.entity.id, {
    alignment: (event.target as HTMLSelectElement).value,
  });
}

function onTextNumber(field: 'rotation' | 'fontSize', event: Event): void {
  const text = props.entity.text!;
  const input = event.target as HTMLInputElement;
  const value = Number(input.value.trim());
  if (input.value.trim() === '' || !Number.isFinite(value)) {
    input.value = String(field === 'rotation' ? text.rotation : text.fontSize);
    return;
  }
  emit('update-text', props.entity.id, { [field]: value });
}
</script>

<template>
  <SidebarSection
    v-if="entity.text"
    label="Annotation text"
    heading-id="entity-text-heading"
    data-testid="entity-text"
  >
    <dl class="space-y-2">
      <SidebarField label="Content">
        <SidebarInput
          maxlength="120"
          class="w-44"
          :value="entity.text.content"
          aria-label="Label content"
          data-testid="text-content"
          @change="onTextContent"
        />
      </SidebarField>
      <SidebarField label="Alignment">
        <SidebarSelect
          :value="entity.text.alignment"
          aria-label="Label alignment"
          data-testid="text-alignment"
          @change="onTextAlignment"
        >
          <option value="left">Left</option>
          <option value="center">Centre</option>
          <option value="right">Right</option>
        </SidebarSelect>
      </SidebarField>
      <SidebarField label="Rotation">
        <span class="inline-flex items-center gap-1">
          <SidebarInput
            type="number"
            step="0.1"
            class="w-20 tabular-nums"
            :value="entity.text.rotation"
            aria-label="Label rotation in radians"
            data-testid="text-rotation"
            @change="onTextNumber('rotation', $event)"
          />
          <span class="text-2xs text-muted-foreground">rad</span>
        </span>
      </SidebarField>
      <SidebarField label="Size">
        <span class="inline-flex items-center gap-1">
          <SidebarInput
            type="number"
            min="1"
            max="100"
            step="0.5"
            class="w-20 tabular-nums"
            :value="entity.text.fontSize"
            aria-label="Label size in millimetres"
            data-testid="text-size"
            @change="onTextNumber('fontSize', $event)"
          />
          <span class="text-2xs text-muted-foreground">mm</span>
        </span>
      </SidebarField>
    </dl>
  </SidebarSection>
</template>
