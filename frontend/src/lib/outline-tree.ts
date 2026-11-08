import {
  constraintEntityIds,
  type Constraint,
  type Entity,
  type EntityId,
  type PatternDocument,
} from '@sewcraft/geometry';

import { constraintLabel } from './constraint-view';
import { dimensionRows } from './dimensions';
import { edgeLabel, pieceForEntity } from './pieces';
import type { RibbonIconName } from './ribbon-icons';

/** What a tree row represents: an entity kind, a dimension, or another constraint. */
export type OutlineRowKind =
  | 'point'
  | 'line'
  | 'curve'
  | 'arc'
  | 'circle'
  | 'text'
  | 'notch'
  | 'centre_line'
  | 'distance'
  | 'derived_distance'
  | 'constraint';

/** How clicking a row selects: its entity, its dimension, or the entities it references. */
export type OutlineRowTarget = 'entity' | 'dimension' | 'references';

/** One selectable row inside a category group. */
export interface OutlineRow {
  id: EntityId;
  kind: OutlineRowKind;
  /** The value that distinguishes the row: a span, a label, a size or a point list. */
  label: string;
  icon: RibbonIconName;
  /** The human name of the row kind, shown before the label. */
  typeLabel: string;
  target: OutlineRowTarget;
  /** The entities a constraint row selects; empty for every other row. */
  references: EntityId[];
}

/** The categories a piece's children are grouped into. */
export type OutlineGroupId = 'geometry' | 'dimensions' | 'constraints' | 'text' | 'marks';

export interface OutlineGroup {
  id: OutlineGroupId;
  label: string;
  rows: OutlineRow[];
}

/** One root of the outline: a piece, or the unowned bucket. */
export interface OutlinePieceNode {
  /** `null` for the unowned bucket. */
  pieceId: EntityId | null;
  label: string;
  groups: OutlineGroup[];
  /** The number of rows below this root. */
  count: number;
}

const GROUP_ORDER: OutlineGroupId[] = ['geometry', 'dimensions', 'constraints', 'text', 'marks'];

const GROUP_LABELS: Record<OutlineGroupId, string> = {
  geometry: 'Geometry',
  dimensions: 'Dimensions',
  constraints: 'Constraints',
  text: 'Text',
  marks: 'Marks',
};

const TYPE_LABELS: Record<OutlineRowKind, string> = {
  point: 'Point',
  line: 'Line',
  curve: 'Curve',
  arc: 'Arc',
  circle: 'Circle',
  text: 'Text',
  notch: 'Notch',
  centre_line: 'Centre line',
  distance: 'Distance',
  derived_distance: 'Cut dimension',
  constraint: 'Constraint',
};

const TYPE_ICONS: Record<OutlineRowKind, RibbonIconName> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
  text: 'text',
  notch: 'notch',
  centre_line: 'centre-line',
  distance: 'dimension',
  derived_distance: 'cut-dimension',
  constraint: 'constraints',
};

/** A dimension's readable size: the resolved value, or a dash when it cannot resolve. */
function dimensionLabel(value: string): string {
  return value === '—' ? value : `${value} mm`;
}

function entityRow(document: PatternDocument, entity: Entity): OutlineRow {
  const row = (kind: OutlineRowKind, label: string): OutlineRow => ({
    id: entity.id,
    kind,
    label,
    icon: TYPE_ICONS[kind],
    typeLabel: TYPE_LABELS[kind],
    target: 'entity',
    references: [],
  });

  switch (entity.kind) {
    case 'point':
      return row('point', entity.id);
    case 'line':
    case 'curve':
    case 'arc':
    case 'circle':
      return row(entity.kind, edgeLabel(document, entity.id));
    case 'text':
      return row('text', entity.content);
    case 'mark':
      return entity.type === 'notch' ? row('notch', 'Notch') : row('centre_line', 'Centre line');
  }
}

/** The group an entity belongs to; marks and labels sit apart from the geometry. */
function entityGroup(entity: Entity): OutlineGroupId {
  switch (entity.kind) {
    case 'text':
      return 'text';
    case 'mark':
      return 'marks';
    default:
      return 'geometry';
  }
}

/** A constraint row: dimensions select themselves, other constraints their references. */
function constraintRow(constraint: Constraint, dimensionValue: string | undefined): OutlineRow {
  if (constraint.type === 'distance' || constraint.type === 'derived_distance') {
    const kind = constraint.type === 'distance' ? 'distance' : 'derived_distance';
    return {
      id: constraint.id,
      kind,
      label: dimensionLabel(dimensionValue!),
      icon: TYPE_ICONS[kind],
      typeLabel: TYPE_LABELS[kind],
      target: 'dimension',
      references: [],
    };
  }

  const references = constraintEntityIds(constraint);
  return {
    id: constraint.id,
    kind: 'constraint',
    label: constraintLabel(constraint),
    icon: TYPE_ICONS.constraint,
    typeLabel: TYPE_LABELS.constraint,
    target: 'references',
    references,
  };
}

/**
 * The document as a tree: every piece is a root, its entities, dimensions and
 * constraints sit in category groups, and anything unowned collects at the end
 * so a legacy document never hides geometry.
 */
export function outlineTree(document: PatternDocument): OutlinePieceNode[] {
  interface Bucket {
    node: OutlinePieceNode;
    groups: Map<OutlineGroupId, OutlineRow[]>;
  }

  const buckets = new Map<EntityId | null, Bucket>();
  for (const [index, piece] of document.pieces.entries()) {
    buckets.set(piece.id, {
      node: {
        pieceId: piece.id,
        label: piece.name ?? `Piece ${index + 1}`,
        groups: [],
        count: 0,
      },
      groups: new Map(),
    });
  }

  const unowned: Bucket = {
    node: { pieceId: null, label: 'Unassigned', groups: [], count: 0 },
    groups: new Map(),
  };

  /** Callers resolve an owner to `null` or a piece already in the map. */
  function bucket(owner: EntityId | null): Bucket {
    return owner === null ? unowned : buckets.get(owner)!;
  }

  function push(owner: EntityId | null, group: OutlineGroupId, row: OutlineRow): void {
    const target = bucket(owner);
    const rows = target.groups.get(group) ?? [];
    rows.push(row);
    target.groups.set(group, rows);
  }

  /**
   * The piece a constraint belongs to: its stored owner when it still exists,
   * otherwise the owner of the first entity it references. Older documents and
   * an edited dimension may no longer carry `piece`, so the tree infers it
   * rather than dropping the row into the unowned bucket.
   */
  function constraintOwner(constraint: Constraint): EntityId | null {
    if (constraint.piece !== undefined && buckets.has(constraint.piece)) return constraint.piece;
    if (constraint.type === 'derived_distance') return null;

    for (const id of constraintEntityIds(constraint)) {
      const owner = pieceForEntity(document, id)?.id;
      if (owner !== undefined) return owner;
    }
    return null;
  }

  const dimensionValues = new Map(dimensionRows(document).map((row) => [row.id, row.value]));

  for (const entity of document.entities) {
    push(
      pieceForEntity(document, entity.id)?.id ?? null,
      entityGroup(entity),
      entityRow(document, entity),
    );
  }

  for (const constraint of document.constraints) {
    const group: OutlineGroupId =
      constraint.type === 'distance' || constraint.type === 'derived_distance'
        ? 'dimensions'
        : 'constraints';
    push(
      constraintOwner(constraint),
      group,
      constraintRow(constraint, dimensionValues.get(constraint.id)),
    );
  }

  const nodes: OutlinePieceNode[] = [];
  for (const { node, groups } of [...buckets.values(), unowned]) {
    node.groups = GROUP_ORDER.flatMap((id): OutlineGroup[] => {
      const rows = groups.get(id);
      return rows === undefined ? [] : [{ id, label: GROUP_LABELS[id], rows }];
    });
    node.count = node.groups.reduce((total, group) => total + group.rows.length, 0);
    if (node.pieceId !== null || node.count > 0) nodes.push(node);
  }

  return nodes;
}

/** The number of rows across every root, for the sidebar badge. */
export function outlineRowCount(nodes: OutlinePieceNode[]): number {
  return nodes.reduce((total, node) => total + node.count, 0);
}
