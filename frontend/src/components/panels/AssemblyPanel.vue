<script setup lang="ts">
import {
  FINISH_KINDS,
  resolveSeamRun,
  SEAM_LENGTH_TOLERANCE,
  sewabilityReport,
  type AllowanceKind,
  type Assembly,
  type EntityId,
  type FinishKind,
  type ParamInput,
  type PatternDocument,
  type SeamIssue,
  type SeamMatch,
} from '@sewcraft/geometry';
import { computed } from 'vue';

import PieceParametersForm from '@/components/panels/PieceParametersForm.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';
import { formatDimensionValue } from '@/lib/dimensions';
import { edgeLabel } from '@/lib/pieces';
import { tabLabel } from '@/lib/tabs';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    assembly: Assembly;
    selectedInstanceId?: EntityId | null;
    readOnly?: boolean;
  }>(),
  { selectedInstanceId: null, readOnly: false },
);

const emit = defineEmits<{
  'update-assembly': [name: string];
  'update-instance': [patch: { x?: number; y?: number; rotation?: number; mirrored?: boolean }];
  'update-piece': [
    piece: EntityId,
    patch: {
      name?: string | null;
      quantity?: number | null;
      notes?: string | null;
      fabric?: string | null;
      color?: string | null;
    },
  ];
  'set-default': [
    piece: EntityId,
    value:
      | { mode: 'inherit' }
      | { mode: 'none' }
      | { mode: 'preset'; width: ParamInput; kind: AllowanceKind },
  ];
  'open-piece': [piece: EntityId];
  'remove-instance': [instance: EntityId];
  'select-seam': [seam: EntityId | null];
  'remove-seam': [seam: EntityId];
  'toggle-eased': [seam: EntityId, eased: boolean];
  'set-finished': [instance: EntityId, edge: EntityId, kind: FinishKind | null];
  'select-edge': [instance: EntityId, edge: EntityId];
}>();

const instance = computed(
  () => props.assembly.instances.find((entry) => entry.id === props.selectedInstanceId) ?? null,
);

const piece = computed(() =>
  instance.value === null
    ? null
    : (props.document.pieces.find((candidate) => candidate.id === instance.value!.piece) ?? null),
);

const inherited = computed(() => defaultAllowanceSummary(props.document));

/** Rotation is stored in radians and edited in degrees. */
function degrees(rotation: number | undefined): string {
  return formatDimensionValue(((rotation ?? 0) * 180) / Math.PI);
}

function coordinate(value: number | undefined): string {
  /* v8 ignore next -- an instance always stores x and y */
  return formatDimensionValue(value ?? 0);
}

function numberFrom(event: Event): number | null {
  const text = (event.target as HTMLInputElement).value.trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function xChanged(event: Event): void {
  const x = numberFrom(event);
  if (x === null || x === instance.value?.x) return;
  emit('update-instance', { x });
}

function yChanged(event: Event): void {
  const y = numberFrom(event);
  if (y === null || y === instance.value?.y) return;
  emit('update-instance', { y });
}

function angleChanged(event: Event): void {
  const angle = numberFrom(event);
  if (angle === null) return;
  const rotation = (angle * Math.PI) / 180;
  if (rotation === (instance.value?.rotation ?? 0)) return;
  emit('update-instance', { rotation });
}

function toggleMirror(): void {
  emit('update-instance', { mirrored: instance.value?.mirrored !== true });
}

function assemblyName(event: Event): void {
  const name = (event.target as HTMLInputElement).value.trim();
  if (name === '' || name === props.assembly.name) return;
  emit('update-assembly', name);
}

function piecePatch(patch: {
  name?: string | null;
  quantity?: number | null;
  notes?: string | null;
  fabric?: string | null;
  color?: string | null;
}): void {
  /* v8 ignore next -- the piece section renders only when the piece exists */
  if (piece.value === null) return;
  emit('update-piece', piece.value.id, patch);
}

function pieceDefault(
  value:
    | { mode: 'inherit' }
    | { mode: 'none' }
    | { mode: 'preset'; width: ParamInput; kind: AllowanceKind },
): void {
  /* v8 ignore next -- the piece section renders only when the piece exists */
  if (piece.value === null) return;
  emit('set-default', piece.value.id, value);
}

const report = computed(() => sewabilityReport(props.document, props.assembly));
const seams = computed(() => props.assembly.seams ?? []);
const finished = computed(() => props.assembly.finishedEdges ?? []);

interface SeamRow {
  seam: SeamMatch;
  label: string;
  lengths: (number | null)[];
  broken: boolean;
}

const seamRows = computed<SeamRow[]>(() =>
  seams.value.map((seam) => {
    const lengths = seam.sides.map(
      (side) => resolveSeamRun(props.document, props.assembly, side)?.length ?? null,
    );
    return {
      seam,
      label: seamLabel(seam),
      lengths,
      broken: lengths.some((length) => length === null),
    };
  }),
);

/** The piece label an instance places, with the palette fallback. */
function instanceLabel(id: EntityId): string {
  const instance = props.assembly.instances.find((candidate) => candidate.id === id);
  const index = props.document.pieces.findIndex((piece) => piece.id === instance?.piece);
  if (index < 0) return 'Piece';
  const piece = props.document.pieces[index]!;
  return piece.name?.trim() || `Piece ${index + 1}`;
}

/** `Front ↔ Back`, or `Sleeve · 2 sides` when one instance carries both. */
function seamLabel(seam: SeamMatch): string {
  const labels = seam.sides.map((side) => instanceLabel(side.instance));
  const unique = [...new Set(labels)];
  return unique.length === 1 ? `${unique[0]} · ${seam.sides.length} sides` : unique.join(' ↔ ');
}

function edgeName(issue: SeamIssue): string {
  return issue.edge === undefined ? 'an edge' : edgeLabel(props.document, issue.edge);
}

function issueText(issue: SeamIssue): string {
  const owner = issue.instance === undefined ? '' : `${instanceLabel(issue.instance)} · `;
  switch (issue.kind) {
    case 'unmatched_edge':
      return `${owner}${edgeName(issue)} is neither sewn nor finished`;
    case 'edge_used_twice':
      return `${owner}${edgeName(issue)} is claimed twice`;
    case 'missing_reference':
      return issue.seam === undefined
        ? `${owner}${edgeName(issue)} no longer resolves`
        : `A reference in this seam no longer resolves`;
    case 'length_mismatch':
      return `Sides differ by ${issue.delta!.toFixed(1)} mm${
        issue.severity === 'warning' ? ' (eased)' : ''
      }`;
    case 'allowance_mismatch':
      return `Cut allowances differ by ${issue.delta!.toFixed(1)} mm`;
    case 'folded_edge_sewn':
      return `${owner}${edgeName(issue)} has a double-fold allowance and is sewn`;
  }
}

/** A click on an issue selects its seam, or the instance and edge it names. */
function selectIssue(issue: SeamIssue): void {
  if (issue.instance !== undefined && issue.edge !== undefined) {
    emit('select-edge', issue.instance, issue.edge);
    return;
  }
  emit('select-seam', issue.seam ?? null);
}

function markFinished(issue: SeamIssue, event: Event): void {
  const select = event.target as HTMLSelectElement;
  const kind = select.value as FinishKind | '';
  select.value = '';
  /* v8 ignore next -- the menu renders only for a named instance and edge */
  if (kind === '' || issue.instance === undefined || issue.edge === undefined) return;
  emit('set-finished', issue.instance, issue.edge, kind);
}

function changeFinished(instance: EntityId, edge: EntityId, event: Event): void {
  const value = (event.target as HTMLSelectElement).value as FinishKind | '';
  emit('set-finished', instance, edge, value === '' ? null : value);
}

function toggleEased(seam: SeamMatch, event: Event): void {
  emit('toggle-eased', seam.id, (event.target as HTMLInputElement).checked);
}

const finishedGroups = computed(() =>
  FINISH_KINDS.map((kind) => ({
    kind,
    edges: finished.value.filter((edge) => edge.kind === kind),
  })).filter((group) => group.edges.length > 0),
);
</script>

<template>
  <div>
    <SidebarSection label="Check" data-testid="assembly-check">
      <p
        v-if="props.assembly.instances.length === 0"
        class="text-2xs text-muted-foreground"
        data-testid="check-empty"
      >
        Nothing to check
      </p>
      <template v-else>
        <p
          class="text-sm font-medium"
          :class="report.errors === 0 ? 'text-primary' : 'text-destructive'"
          data-testid="check-verdict"
        >
          {{
            report.errors === 0
              ? 'Sewable'
              : `Not sewable · ${report.errors} ${report.errors === 1 ? 'issue' : 'issues'}`
          }}
        </p>
        <p
          v-if="report.warnings > 0"
          class="text-2xs text-muted-foreground"
          data-testid="check-warnings"
        >
          {{ report.warnings }} {{ report.warnings === 1 ? 'warning' : 'warnings' }}
        </p>

        <ul v-if="report.issues.length > 0" class="mt-2 space-y-1" data-testid="check-issues">
          <li
            v-for="(issue, index) in report.issues"
            :key="`${issue.kind}-${index}`"
            class="rounded-md border px-2 py-1 text-2xs"
            :data-testid="`check-issue-${index}`"
          >
            <button
              type="button"
              class="w-full text-left"
              :data-testid="`check-issue-select-${index}`"
              @click="selectIssue(issue)"
            >
              <span
                class="mr-1 font-semibold uppercase"
                :class="issue.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'"
              >
                {{ issue.severity === 'error' ? 'Error' : 'Warning' }}
              </span>
              {{ issueText(issue) }}
            </button>
            <select
              v-if="
                issue.kind === 'unmatched_edge' &&
                issue.instance !== undefined &&
                issue.edge !== undefined
              "
              class="mt-1 w-full rounded-md border bg-background px-1 py-0.5 text-2xs"
              :disabled="props.readOnly"
              :data-testid="`mark-finished-${issue.instance}-${issue.edge}`"
              @change="markFinished(issue, $event)"
            >
              <option value="">Mark finished…</option>
              <option v-for="kind in FINISH_KINDS" :key="kind" :value="kind">{{ kind }}</option>
            </select>
          </li>
        </ul>

        <p class="mt-2 text-2xs text-muted-foreground" data-testid="check-footer">
          {{ report.edgeCount }} edges · {{ report.seamCount }} seams ·
          {{ report.finishedCount }} finished · {{ SEAM_LENGTH_TOLERANCE }} mm tolerance
        </p>
      </template>
    </SidebarSection>

    <SidebarSection label="Seams" data-testid="assembly-seams">
      <p v-if="seamRows.length === 0" class="text-2xs text-muted-foreground">
        No seams yet. Use Sew in the ribbon.
      </p>
      <ul v-else class="space-y-1">
        <li
          v-for="row in seamRows"
          :key="row.seam.id"
          class="rounded-md border px-2 py-1 text-2xs"
          :data-testid="`seam-row-${row.seam.id}`"
        >
          <button
            type="button"
            class="w-full text-left"
            :data-testid="`seam-select-${row.seam.id}`"
            @click="emit('select-seam', row.seam.id)"
          >
            {{ row.label }}
            <span v-if="row.broken" class="ml-1 text-destructive">broken</span>
          </button>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <span
              v-for="(length, index) in row.lengths"
              :key="index"
              class="tabular-nums"
              :data-testid="`seam-length-${row.seam.id}-${index}`"
            >
              {{ length === null ? '—' : `${length.toFixed(1)} mm` }}
            </span>
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                :checked="row.seam.eased === true"
                :disabled="props.readOnly"
                :data-testid="`seam-eased-${row.seam.id}`"
                @change="toggleEased(row.seam, $event)"
              />
              Eased
            </label>
            <SidebarButton
              v-if="row.broken && !props.readOnly"
              :data-testid="`seam-remove-${row.seam.id}`"
              @click="emit('remove-seam', row.seam.id)"
            >
              Remove
            </SidebarButton>
          </div>
        </li>
      </ul>
    </SidebarSection>

    <SidebarSection label="Finished" data-testid="assembly-finished">
      <p v-if="finished.length === 0" class="text-2xs text-muted-foreground">No finished edges.</p>
      <template v-else>
        <div
          v-for="group in finishedGroups"
          :key="group.kind"
          class="mb-2"
          :data-testid="`finished-group-${group.kind}`"
        >
          <p class="text-2xs font-semibold uppercase text-muted-foreground">{{ group.kind }}</p>
          <div
            v-for="edge in group.edges"
            :key="`${edge.instance}:${edge.edge}`"
            class="flex items-center justify-between gap-2 text-2xs"
            :data-testid="`finished-row-${edge.instance}-${edge.edge}`"
          >
            <span class="truncate">
              {{ instanceLabel(edge.instance) }} · {{ edgeLabel(props.document, edge.edge) }}
            </span>
            <select
              class="rounded-md border bg-background px-1 py-0.5 text-2xs"
              :value="edge.kind"
              :disabled="props.readOnly"
              :data-testid="`finished-kind-${edge.instance}-${edge.edge}`"
              @change="changeFinished(edge.instance, edge.edge, $event)"
            >
              <option v-for="kind in FINISH_KINDS" :key="kind" :value="kind">{{ kind }}</option>
              <option value="">Clear</option>
            </select>
          </div>
        </div>
      </template>
    </SidebarSection>

    <SidebarSection label="Selection" data-testid="assembly-selection">
      <p v-if="instance === null" class="text-2xs text-muted-foreground">
        Select an instance to inspect it.
      </p>
      <template v-else>
        <dl class="space-y-2">
          <SidebarField label="X">
            <SidebarInput
              type="number"
              step="0.1"
              class="w-20 tabular-nums"
              :value="coordinate(instance.x)"
              aria-label="Instance X"
              data-testid="instance-x"
              @change="xChanged"
            />
          </SidebarField>
          <SidebarField label="Y">
            <SidebarInput
              type="number"
              step="0.1"
              class="w-20 tabular-nums"
              :value="coordinate(instance.y)"
              aria-label="Instance Y"
              data-testid="instance-y"
              @change="yChanged"
            />
          </SidebarField>
          <SidebarField label="Angle">
            <SidebarInput
              type="number"
              step="1"
              class="w-20 tabular-nums"
              :value="degrees(instance.rotation)"
              aria-label="Instance angle in degrees"
              data-testid="instance-angle"
              @change="angleChanged"
            />
          </SidebarField>
        </dl>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <SidebarButton
            :aria-pressed="instance.mirrored === true ? 'true' : 'false'"
            :class="instance.mirrored === true ? 'bg-accent text-accent-foreground' : ''"
            data-testid="instance-mirror"
            @click="toggleMirror"
          >
            {{ instance.mirrored === true ? 'Mirrored' : 'Mirror' }}
          </SidebarButton>
          <SidebarButton
            :data-testid="`instance-open-piece-${instance.piece}`"
            @click="emit('open-piece', instance.piece)"
          >
            Open piece tab
          </SidebarButton>
          <SidebarButton
            data-testid="instance-remove"
            @click="emit('remove-instance', instance.id)"
          >
            Remove instance
          </SidebarButton>
        </div>
      </template>
    </SidebarSection>

    <SidebarSection v-if="piece !== null" label="Piece" data-testid="assembly-piece">
      <PieceParametersForm
        :piece="piece"
        :document="props.document"
        :inherited="inherited"
        :read-only="props.readOnly"
        prefix="assembly-piece"
        @update-piece="piecePatch"
        @set-default="pieceDefault"
      />
    </SidebarSection>

    <SidebarSection label="Assembly" data-testid="assembly-details">
      <dl class="space-y-2">
        <SidebarField label="Name">
          <SidebarInput
            maxlength="80"
            :value="props.assembly.name"
            :aria-label="`Name for assembly ${props.assembly.id}`"
            data-testid="assembly-name"
            @change="assemblyName"
          />
        </SidebarField>
        <SidebarField label="Placed">
          <span data-testid="assembly-instance-count">
            {{ props.assembly.instances.length }}
            {{ props.assembly.instances.length === 1 ? 'instance' : 'instances' }}
          </span>
        </SidebarField>
        <SidebarField label="Tab">
          <span data-testid="assembly-tab-label">
            {{ tabLabel(props.document, { kind: 'assembly', id: props.assembly.id }) }}
          </span>
        </SidebarField>
      </dl>
    </SidebarSection>
  </div>
</template>
