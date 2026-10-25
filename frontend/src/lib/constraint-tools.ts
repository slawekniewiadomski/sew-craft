import {
  allPoints,
  CONSTRAINT_TYPES,
  cross,
  distance,
  dot,
  lineSupportAnchors,
  magnitude,
  sub,
  type AddConstraintParams,
  type ConstraintType,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';

import { CONSTRAINT_LABELS } from './constraint-view';

/** A ribbon button that arms one constraint placement mode. */
export interface ConstraintTool {
  id: string;
  type: ConstraintType;
  label: string;
}

/** One ribbon button per supported constraint type, in command-spec order. */
export const CONSTRAINT_TOOLS: ConstraintTool[] = CONSTRAINT_TYPES.map((type) => ({
  id: `constraint-${type}`,
  type,
  label: CONSTRAINT_LABELS[type],
}));

export type ConstraintPickKind = 'point' | 'line' | 'curve' | 'arc';

/** One canvas click made while a constraint mode is armed. */
export interface ConstraintPick {
  id: EntityId;
  kind: ConstraintPickKind;
}

export type ConstraintSlotKind = 'point' | 'segment';

export interface ConstraintSlot {
  kind: ConstraintSlotKind;
}

/**
 * The roles of each constraint, in `add_constraint` order. A segment slot takes
 * one line or two points; a point slot takes one point.
 */
export const CONSTRAINT_SLOTS: Record<ConstraintType, ConstraintSlot[]> = {
  coincident: [{ kind: 'point' }, { kind: 'point' }],
  horizontal: [{ kind: 'segment' }],
  vertical: [{ kind: 'segment' }],
  point_on_line: [{ kind: 'point' }, { kind: 'segment' }],
  distance: [{ kind: 'segment' }],
  angle: [{ kind: 'point' }, { kind: 'point' }, { kind: 'point' }],
  equal: [{ kind: 'segment' }, { kind: 'segment' }],
};

export interface ConstraintPlacement {
  type: ConstraintType;
  picks: ConstraintPick[];
}

export type ConstraintRejectionReason = 'curve' | 'point' | 'distinct';

export type ConstraintPickResult =
  | { status: 'picking'; picks: ConstraintPick[] }
  | { status: 'ready'; picks: ConstraintPick[]; params: AddConstraintParams }
  | { status: 'rejected'; picks: ConstraintPick[]; reason: ConstraintRejectionReason };

interface SlotFill {
  picks: ConstraintPick[];
}

/**
 * Assign picks to the first compatible slot, replaying in pick order. A line
 * completes a segment slot; a point either completes a point slot or starts a
 * segment slot, which then waits for a second point.
 */
function fillSlots(type: ConstraintType, picks: ConstraintPick[]): SlotFill[] | null {
  const slots = CONSTRAINT_SLOTS[type];
  const fills: SlotFill[] = slots.map(() => ({ picks: [] }));

  for (const pick of picks) {
    let placed = false;

    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]!;
      const fill = fills[index]!;

      if (slot.kind === 'point') {
        if (fill.picks.length === 0 && pick.kind === 'point') {
          fill.picks.push(pick);
          placed = true;
          break;
        }
        continue;
      }

      if (fill.picks.length === 0 && pick.kind !== 'curve') {
        fill.picks.push(pick);
        placed = true;
        break;
      }

      if (fill.picks.length === 1 && fill.picks[0]!.kind === 'point' && pick.kind === 'point') {
        fill.picks.push(pick);
        placed = true;
        break;
      }
    }

    if (!placed) return null;
  }

  return fills;
}

function isSlotComplete(slot: ConstraintSlot, fill: SlotFill): boolean {
  if (slot.kind === 'point') return fill.picks.length === 1;
  return (
    (fill.picks.length === 1 && fill.picks[0]!.kind === 'line') ||
    (fill.picks.length === 2 && fill.picks.every((pick) => pick.kind === 'point'))
  );
}

function hasDistinctPoints(type: ConstraintType, ids: EntityId[]): boolean {
  switch (type) {
    case 'coincident':
    case 'horizontal':
    case 'vertical':
    case 'distance':
      return ids[0] !== ids[1];
    case 'point_on_line':
      return ids[0] !== ids[1] && ids[0] !== ids[2] && ids[1] !== ids[2];
    case 'angle':
      return new Set(ids).size === ids.length;
    case 'equal': {
      const [a1, a2, b1, b2] = ids as [EntityId, EntityId, EntityId, EntityId];
      if (a1 === a2 || b1 === b2) return false;
      const samePair = (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1);
      return !samePair;
    }
  }
}

function pointMap(document: PatternDocument): Map<EntityId, PointEntity> {
  return new Map(allPoints(document).map((point) => [point.id, point]));
}

/**
 * Whether a relation names the line's supporting line rather than its visible
 * span. `point_on_line`, `horizontal` and `vertical` are direction relations;
 * `distance` and `equal` measure length and keep the raw endpoints.
 */
function usesSupportAnchors(type: ConstraintType): boolean {
  return type === 'point_on_line' || type === 'horizontal' || type === 'vertical';
}

/**
 * Resolve the picked slots to the point ids `add_constraint` expects. Returns
 * `null` for an incomplete tuple, a missing reference or a degenerate one.
 */
export function constraintParams(
  type: ConstraintType,
  picks: ConstraintPick[],
  document: PatternDocument,
): AddConstraintParams | null {
  const fills = fillSlots(type, picks);
  if (!fills) return null;

  const slots = CONSTRAINT_SLOTS[type];
  if (slots.some((slot, index) => !isSlotComplete(slot, fills[index]!))) return null;

  const ids: EntityId[] = [];
  for (let index = 0; index < slots.length; index += 1) {
    const fill = fills[index]!;

    if (fill.picks.length === 2) {
      ids.push(fill.picks[0]!.id, fill.picks[1]!.id);
      continue;
    }

    const pick = fill.picks[0]!;
    if (pick.kind === 'point') {
      ids.push(pick.id);
      continue;
    }

    const line = document.entities.find(
      (entity): entity is LineEntity => entity.id === pick.id && entity.kind === 'line',
    );
    if (line === undefined) return null;

    // Direction relations describe the line's supporting line, so a rounded end
    // names its sharp corner and the reference survives the trim. Length
    // relations keep the visible endpoints because they measure the segment.
    if (usesSupportAnchors(type)) {
      const anchors = lineSupportAnchors(document, line.id);
      if (anchors === null) return null;
      ids.push(anchors.start, anchors.end);
      continue;
    }
    ids.push(line.start, line.end);
  }

  if (!hasDistinctPoints(type, ids)) return null;
  return { type, entities: ids };
}

/**
 * Fill the first compatible slot with one canvas pick. The single authority for
 * placement: only a complete, valid tuple is reported as ready.
 */
export function applyConstraintPick(
  placement: ConstraintPlacement,
  pick: ConstraintPick,
  document: PatternDocument,
): ConstraintPickResult {
  if (pick.kind === 'curve' || pick.kind === 'arc') {
    return { status: 'rejected', picks: placement.picks, reason: 'curve' };
  }

  const candidate = [...placement.picks, pick];
  const fills = fillSlots(placement.type, candidate);
  if (fills === null) {
    return {
      status: 'rejected',
      picks: placement.picks,
      reason: pick.kind === 'line' ? 'point' : 'distinct',
    };
  }

  const slots = CONSTRAINT_SLOTS[placement.type];
  const complete = slots.every((slot, index) => isSlotComplete(slot, fills[index]!));
  if (!complete) return { status: 'picking', picks: candidate };

  const params = constraintParams(placement.type, candidate, document);
  if (params === null) {
    return { status: 'rejected', picks: placement.picks, reason: 'distinct' };
  }

  return { status: 'ready', picks: candidate, params };
}

/** The next thing the user should pick, given the picks so far. */
export function constraintPrompt(type: ConstraintType, picks: ConstraintPick[]): string {
  switch (type) {
    case 'coincident':
      return picks.length === 0 ? 'Pick the first point.' : 'Pick the second point.';
    case 'horizontal':
    case 'vertical':
    case 'distance':
      if (picks.length === 1 && picks[0]!.kind === 'point') return 'Pick the second point.';
      return 'Pick a line, or two points.';
    case 'point_on_line': {
      const fills = fillSlots(type, picks);
      if (fills === null) return 'Pick the point to constrain.';
      const pointSlot = fills[0]!;
      const segmentSlot = fills[1]!;
      if (pointSlot.picks.length === 0) return 'Pick the point to constrain.';
      if (segmentSlot.picks.length === 0) return 'Pick a line, or two points.';
      if (segmentSlot.picks.length === 1 && segmentSlot.picks[0]!.kind === 'point') {
        return "Pick the line's second point.";
      }
      return 'Pick the point to constrain.';
    }
    case 'angle':
      if (picks.length === 0) return 'Pick the first ray point.';
      if (picks.length === 1) return 'Pick the vertex.';
      if (picks.length === 2) return 'Pick the second ray point.';
      return 'Pick the first ray point.';
    case 'equal': {
      const fills = fillSlots(type, picks);
      if (fills === null) return 'Pick the first line, or two points.';
      const first = fills[0]!;
      const second = fills[1]!;
      if (first.picks.length === 0) return 'Pick the first line, or two points.';
      if (first.picks.length === 1 && first.picks[0]!.kind === 'point') {
        return "Pick the first line's second point.";
      }
      if (second.picks.length === 0) return 'Pick the second line, or two points.';
      if (second.picks.length === 1 && second.picks[0]!.kind === 'point') {
        return "Pick the second line's second point.";
      }
      return 'Pick the first line, or two points.';
    }
  }
}

/** User-facing message for a rejected pick. */
export function constraintRejection(reason: ConstraintRejectionReason): string {
  switch (reason) {
    case 'curve':
      return 'Curves and arcs are not supported yet; pick a point or a line.';
    case 'point':
      return 'Pick a point.';
    case 'distinct':
      return 'Pick distinct points.';
  }
}

/**
 * Drop picks whose entity vanished after undo/redo (or whose line lost an
 * endpoint), so an incomplete tuple never dispatches a stale id.
 */
export function prunePicks(picks: ConstraintPick[], document: PatternDocument): ConstraintPick[] {
  const points = pointMap(document);
  const lines = new Map(
    document.entities
      .filter((entity): entity is LineEntity => entity.kind === 'line')
      .map((line) => [line.id, line]),
  );

  return picks.filter((pick) => {
    if (pick.kind === 'point') return points.has(pick.id);
    if (pick.kind === 'curve' || pick.kind === 'arc') return false;

    const line = lines.get(pick.id);
    return line !== undefined && points.has(line.start) && points.has(line.end);
  });
}

export interface ConstraintValueSpec {
  unit: 'mm' | '°';
  label: string;
  invalidMessage: string;
  isValid: (value: number) => boolean;
  toCommandValue: (value: number) => number;
}

/** Numeric input rules for dimensional constraints, or `null` for the others. */
export function constraintValueSpec(type: ConstraintType): ConstraintValueSpec | null {
  if (type === 'distance') {
    return {
      unit: 'mm',
      label: 'Distance (mm)',
      invalidMessage: 'Enter a distance greater than 0 mm.',
      isValid: (value) => Number.isFinite(value) && value > 0,
      toCommandValue: (value) => value,
    };
  }

  if (type === 'angle') {
    return {
      unit: '°',
      label: 'Angle (°)',
      invalidMessage: 'Enter a valid angle in degrees.',
      isValid: (value) => Number.isFinite(value),
      toCommandValue: (value) => (value * Math.PI) / 180,
    };
  }

  return null;
}

function roundMeasurement(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function distanceMeasurement(a: PointEntity, b: PointEntity): string {
  const measured = distance(a, b);
  if (measured === 0) return '';
  const rounded = roundMeasurement(measured);
  return String(rounded === 0 ? measured : rounded);
}

function angleMeasurement(a: PointEntity, vertex: PointEntity, c: PointEntity): string {
  const u = sub(a, vertex);
  const v = sub(c, vertex);
  if (magnitude(u) === 0 || magnitude(v) === 0) return '';
  const degrees = (Math.atan2(cross(u, v), dot(u, v)) * 180) / Math.PI;
  return String(roundMeasurement(degrees));
}

/**
 * The measurement shown in the value field when a dimensional tuple is ready,
 * or an empty string when the geometry cannot produce one.
 */
export function constraintInitialValue(
  type: ConstraintType,
  picks: ConstraintPick[],
  document: PatternDocument,
): string {
  if (type !== 'distance' && type !== 'angle') return '';

  const params = constraintParams(type, picks, document);
  if (params === null) return '';

  const points = pointMap(document);
  const first = points.get(params.entities[0]!);
  const second = points.get(params.entities[1]!);

  if (type === 'distance') {
    if (first === undefined || second === undefined) return '';
    return distanceMeasurement(first, second);
  }

  const third = points.get(params.entities[2]!);
  if (first === undefined || second === undefined || third === undefined) return '';
  return angleMeasurement(first, second, third);
}
