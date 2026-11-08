<script setup lang="ts">
import type { EntityId, LeaderGeometry, TextLayout, Vec2 } from '@sewcraft/geometry';

import type { TextLeaderPreview } from '@/composables/use-drafting-gestures';
import type { EditorTool } from '@/lib/editor-tools';

export interface TextView {
  id: EntityId;
  content: string;
  anchor: Vec2;
  rotation: number;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
  leader: LeaderGeometry | null;
  /** The rotated selection box; also the label's click target. */
  layout: TextLayout;
}

export interface MarkView {
  id: EntityId;
  kind: 'notch' | 'centre_line';
  path: string;
  selected: boolean;
}

defineProps<{
  marks: MarkView[];
  texts: TextView[];
  textPreview: TextLeaderPreview | null;
  tool: EditorTool;
}>();
</script>

<template>
  <g data-testid="marks-layer">
    <g v-for="mark in marks" :key="mark.id" class="group cursor-pointer">
      <path
        :d="mark.path"
        fill="none"
        stroke-width="0.5"
        vector-effect="non-scaling-stroke"
        :class="mark.selected ? 'stroke-primary' : 'stroke-mark group-hover:stroke-primary'"
        :data-entity-id="mark.id"
        data-kind="mark"
        :data-testid="`mark-${mark.id}`"
      />
      <!-- A hairline mark needs its own wide, invisible hit stroke. -->
      <path
        :d="mark.path"
        fill="none"
        stroke="transparent"
        stroke-width="12"
        vector-effect="non-scaling-stroke"
        :data-entity-id="mark.id"
        data-kind="mark"
        :data-testid="`mark-hit-${mark.id}`"
      />
    </g>
  </g>

  <g data-testid="annotation-layer">
    <template v-for="entry in texts" :key="entry.id">
      <g v-if="entry.leader" class="pointer-events-none">
        <line
          :x1="entry.leader.underline.start.x"
          :y1="entry.leader.underline.start.y"
          :x2="entry.leader.underline.end.x"
          :y2="entry.leader.underline.end.y"
          class="stroke-annotation"
          stroke-width="0.5"
          vector-effect="non-scaling-stroke"
          :data-testid="`text-underline-${entry.id}`"
        />
        <line
          v-if="entry.leader.shaft"
          :x1="entry.leader.shaft.start.x"
          :y1="entry.leader.shaft.start.y"
          :x2="entry.leader.shaft.end.x"
          :y2="entry.leader.shaft.end.y"
          class="stroke-annotation"
          stroke-width="0.5"
          vector-effect="non-scaling-stroke"
          :data-testid="`text-leader-${entry.id}`"
        />
        <polygon
          :points="entry.leader.head.map((point) => `${point.x},${point.y}`).join(' ')"
          class="fill-annotation"
          :data-testid="`text-arrow-${entry.id}`"
        />
      </g>
      <polygon
        :points="entry.layout.corners.map((point) => `${point.x},${point.y}`).join(' ')"
        fill="none"
        pointer-events="all"
        :class="tool === 'select' ? 'cursor-move' : 'cursor-pointer'"
        :data-entity-id="entry.id"
        data-kind="text"
        :data-testid="`text-hit-${entry.id}`"
      />
      <text
        :transform="`translate(${entry.anchor.x} ${entry.anchor.y}) rotate(${(entry.rotation * 180) / Math.PI})`"
        :font-size="entry.fontSize"
        :text-anchor="
          entry.alignment === 'left' ? 'start' : entry.alignment === 'center' ? 'middle' : 'end'
        "
        class="pointer-events-none fill-annotation font-annotation italic"
        aria-hidden="true"
        :data-entity-id="entry.id"
        data-kind="text"
        :data-testid="`text-${entry.id}`"
      >
        {{ entry.content }}
      </text>
    </template>

    <g v-if="textPreview" class="pointer-events-none" data-testid="text-leader-preview">
      <text
        :transform="`translate(${textPreview.anchor.x} ${textPreview.anchor.y}) rotate(${((textPreview.entity.rotation ?? 0) * 180) / Math.PI})`"
        :font-size="textPreview.entity.fontSize"
        class="fill-annotation font-annotation italic opacity-60"
        aria-hidden="true"
        data-testid="text-preview"
      >
        {{ textPreview.entity.content }}
      </text>
      <template v-if="textPreview.geometry">
        <line
          :x1="textPreview.geometry.underline.start.x"
          :y1="textPreview.geometry.underline.start.y"
          :x2="textPreview.geometry.underline.end.x"
          :y2="textPreview.geometry.underline.end.y"
          class="stroke-annotation"
          stroke-width="0.5"
          vector-effect="non-scaling-stroke"
          data-testid="text-leader-preview-underline"
        />
        <line
          v-if="textPreview.geometry.shaft"
          :x1="textPreview.geometry.shaft.start.x"
          :y1="textPreview.geometry.shaft.start.y"
          :x2="textPreview.geometry.shaft.end.x"
          :y2="textPreview.geometry.shaft.end.y"
          class="stroke-annotation"
          stroke-width="0.5"
          stroke-dasharray="2 2"
          vector-effect="non-scaling-stroke"
          data-testid="text-leader-preview-shaft"
        />
        <polygon
          :points="textPreview.geometry.head.map((point) => `${point.x},${point.y}`).join(' ')"
          fill="none"
          class="stroke-annotation"
          stroke-width="0.5"
          vector-effect="non-scaling-stroke"
          data-testid="text-leader-preview-arrow"
        />
      </template>
    </g>
  </g>
</template>
