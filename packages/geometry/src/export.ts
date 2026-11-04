import { arcGeometry, svgArcCommand } from './arc.js';
import { circleGeometry } from './circle.js';
import { getEntity } from './document.js';
import { centreLineGeometry, notchGeometry, pieceMarks } from './mark.js';
import { formatSvgNumber as formatNumber } from './number.js';
import { pieceCutBounds, pieceCutLoop, pieceFoldLines, pieceLoop, pieceMetrics } from './piece.js';
import { isCut } from './roles.js';
import {
  PATTERN_SCHEMA,
  type ArcEntity,
  type CentreLineMark,
  type CircleEntity,
  type CurveEntity,
  type Entity,
  type EntityId,
  type LineEntity,
  type NotchMark,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from './types.js';
import type { Vec2 } from './vector.js';

export interface SvgExportOptions {
  /** Include the piece's construction geometry. Off by default so exports are cut-ready. */
  construction?: boolean;
  /** Include the piece's stitch loop. On by default. */
  stitch?: boolean;
  /** Include every double-fold fold line. On by default. */
  fold?: boolean;
  /** Include notches and centre lines. On by default. */
  marks?: boolean;
  /** Whitespace around the piece, in millimetres. Defaults to 10 mm. */
  padding?: number;
  /** Override the metadata timestamp (useful for deterministic output). */
  generatedAt?: string;
}

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const DEFAULT_PADDING = 10;

const CUT_COLOR = '#000000';
const STITCH_COLOR = '#374151';
const FOLD_COLOR = '#2563eb';
const CONSTRUCTION_COLOR = '#9ca3af';
const MARK_COLOR = '#b91c1c';

const indent = (line: string): string => `  ${line}`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pointById(document: PatternDocument, id: EntityId): PointEntity | undefined {
  const entity = getEntity(document, id);
  return entity !== undefined && entity.kind === 'point' ? entity : undefined;
}

const entityAttr = (id: EntityId): string => ` data-entity-id="${escapeXml(id)}"`;

function lineElement(document: PatternDocument, line: LineEntity): string | null {
  const start = pointById(document, line.start);
  const end = pointById(document, line.end);
  if (start === undefined || end === undefined) return null;

  return `<line x1="${formatNumber(start.x)}" y1="${formatNumber(start.y)}" x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}"${entityAttr(line.id)} />`;
}

function curveElement(document: PatternDocument, curve: CurveEntity): string | null {
  const p0 = pointById(document, curve.p0);
  const p1 = pointById(document, curve.p1);
  const p2 = pointById(document, curve.p2);
  const p3 = pointById(document, curve.p3);
  if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) return null;

  const d = `M ${formatNumber(p0.x)} ${formatNumber(p0.y)} C ${formatNumber(p1.x)} ${formatNumber(p1.y)} ${formatNumber(p2.x)} ${formatNumber(p2.y)} ${formatNumber(p3.x)} ${formatNumber(p3.y)}`;
  return `<path d="${d}"${entityAttr(curve.id)} />`;
}

function arcElement(document: PatternDocument, arc: ArcEntity): string | null {
  const geometry = arcGeometry(document, arc);
  const start = pointById(document, arc.start);
  const end = pointById(document, arc.end);
  if (geometry === null || start === undefined || end === undefined) return null;

  return `<path d="${svgArcCommand(
    geometry,
    { x: start.x, y: start.y },
    { x: end.x, y: end.y },
  )}"${entityAttr(arc.id)} data-kind="arc" />`;
}

function circleElement(document: PatternDocument, circle: CircleEntity): string | null {
  const geometry = circleGeometry(document, circle);
  if (geometry === null) return null;

  return `<circle cx="${formatNumber(geometry.center.x)}" cy="${formatNumber(geometry.center.y)}" r="${formatNumber(geometry.radius)}"${entityAttr(circle.id)} data-kind="circle" />`;
}

/** Whether a piece owns an entity directly or through its cut loop. */
function belongsToPiece(piece: Piece, entity: Entity): boolean {
  return entity.piece === piece.id || piece.edges.includes(entity.id);
}

/** The piece's construction lines, curves, circles and arcs. */
function renderConstruction(document: PatternDocument, piece: Piece): string[] {
  const construction: string[] = [];
  for (const entity of document.entities) {
    if (
      entity.kind === 'point' ||
      entity.kind === 'text' ||
      entity.kind === 'mark' ||
      isCut(entity)
    ) {
      continue;
    }
    if (!belongsToPiece(piece, entity)) continue;

    const element =
      entity.kind === 'line'
        ? lineElement(document, entity)
        : entity.kind === 'arc'
          ? arcElement(document, entity)
          : entity.kind === 'circle'
            ? circleElement(document, entity)
            : curveElement(document, entity);
    if (element !== null) construction.push(element);
  }
  return construction;
}

/** One notch's open V, or `null` while the mark is broken. */
function notchElement(document: PatternDocument, piece: Piece, mark: NotchMark): string | null {
  const geometry = notchGeometry(document, piece, mark);
  if (geometry === null) return null;

  const [first, second] = geometry.feet;
  const d = [
    `M ${formatNumber(first.x)} ${formatNumber(first.y)}`,
    `L ${formatNumber(geometry.tip.x)} ${formatNumber(geometry.tip.y)}`,
    `L ${formatNumber(second.x)} ${formatNumber(second.y)}`,
  ].join(' ');
  return `<path d="${d}"${entityAttr(mark.id)} data-kind="notch" />`;
}

/** One centre line, dash-dot so it reads apart from a fold line. */
function centreLineElement(document: PatternDocument, mark: CentreLineMark): string | null {
  const geometry = centreLineGeometry(document, mark);
  if (geometry === null) return null;

  return `<line x1="${formatNumber(geometry.start.x)}" y1="${formatNumber(geometry.start.y)}" x2="${formatNumber(geometry.end.x)}" y2="${formatNumber(geometry.end.y)}" stroke-dasharray="6 2 2 2"${entityAttr(mark.id)} data-kind="centre_line" />`;
}

/** The piece's notches and centre lines, in document order. */
function renderMarks(document: PatternDocument, piece: Piece): string[] {
  const elements: string[] = [];
  for (const mark of pieceMarks(document, piece.id)) {
    const element =
      mark.type === 'notch'
        ? notchElement(document, piece, mark)
        : centreLineElement(document, mark);
    if (element !== null) elements.push(element);
  }
  return elements;
}

/** A closed `path` element for a piece loop. */ function loopElement(
  points: readonly Vec2[],
  attributes: string,
): string | null {
  /* v8 ignore next -- every caller passes a resolved, non-empty loop */
  if (points.length === 0) return null;

  const [first, ...rest] = points;
  const commands = [
    `M ${formatNumber(first!.x)} ${formatNumber(first!.y)}`,
    ...rest.map((point) => `L ${formatNumber(point.x)} ${formatNumber(point.y)}`),
    'Z',
  ];
  return `<path d="${commands.join(' ')}"${attributes} />`;
}

/** A metadata comment naming a piece's finished and cut size plus its quantity. */
function pieceMetadata(document: PatternDocument, piece: Piece): string | null {
  const metrics = pieceMetrics(document, piece);
  if (metrics === null) return null;

  const attributes = [
    `id="${escapeXml(piece.id)}"`,
    ...(piece.name === undefined ? [] : [`name="${escapeXml(piece.name)}"`]),
    `finished="${formatNumber(metrics.finished.width)}x${formatNumber(metrics.finished.height)}"`,
    `cut="${formatNumber(metrics.cut.width)}x${formatNumber(metrics.cut.height)}"`,
    `quantity="${metrics.quantity}"`,
  ];
  return `<!-- sewcraft:piece ${attributes.join(' ')} -->`;
}

function computeViewBox(box: ReturnType<typeof pieceCutBounds>, padding: number): ViewBox {
  if (box === null) {
    return { minX: 0, minY: 0, width: 0, height: 0 };
  }

  return {
    minX: box.min.x - padding,
    minY: box.min.y - padding,
    width: box.max.x - box.min.x + 2 * padding,
    height: box.max.y - box.min.y + 2 * padding,
  };
}

/**
 * Serialize one piece to a true-to-scale SVG in millimetres. The output is pure
 * string data (no DOM) with one user unit per millimetre and a `viewBox` in the
 * piece's own cut-bounds coordinates. The `cut` layer is the piece's closed cut
 * loop and is always present; `stitch` and `fold` default to on and can be
 * switched off individually; `construction` is opt-in.
 */
export function toSvgPiece(
  document: PatternDocument,
  piece: Piece,
  options: SvgExportOptions = {},
): string {
  const construction = options.construction ?? false;
  const stitch = options.stitch ?? true;
  const fold = options.fold ?? true;
  const marks = options.marks ?? true;
  const padding = options.padding ?? DEFAULT_PADDING;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const cut = pieceCutLoop(document, piece);
  const loop = pieceLoop(document, piece);
  const folds = pieceFoldLines(document, piece);
  const pieceAttr = ` data-piece="${escapeXml(piece.id)}"`;
  const cutWarnings =
    cut === null || cut.selfIntersections.length === 0 ? '' : ' data-warning="self-intersection"';

  const cutElement = cut === null ? null : loopElement(cut.points, `${pieceAttr}${cutWarnings}`);
  const stitchElement =
    loop === null ? null : loopElement(loop.points, `${pieceAttr} data-kind="stitch"`);
  const foldElements = folds.map((points) => loopElement(points, `${pieceAttr} data-kind="fold"`)!);
  const constructionElements = construction ? renderConstruction(document, piece) : [];
  const markElements = marks ? renderMarks(document, piece) : [];
  const metadata = pieceMetadata(document, piece);
  const box = computeViewBox(pieceCutBounds(document, piece), padding);

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- sewcraft:svg schema="${PATTERN_SCHEMA}" generated="${escapeXml(generatedAt)}" -->`,
    ...(metadata === null ? [] : [metadata]),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(box.width)}mm" height="${formatNumber(box.height)}mm" viewBox="${formatNumber(box.minX)} ${formatNumber(box.minY)} ${formatNumber(box.width)} ${formatNumber(box.height)}">`,
    `<g data-layer="cut" fill="none" stroke="${CUT_COLOR}" stroke-width="1">`,
    ...(cutElement === null ? [] : [indent(cutElement)]),
    '</g>',
  ];

  if (stitch && stitchElement !== null) {
    lines.push(
      `<g data-layer="stitch" fill="none" stroke="${STITCH_COLOR}" stroke-width="0.35">`,
      indent(stitchElement),
      '</g>',
    );
  }

  if (fold && foldElements.length > 0) {
    lines.push(
      `<g data-layer="fold" fill="none" stroke="${FOLD_COLOR}" stroke-width="0.35" stroke-dasharray="6 3">`,
      ...foldElements.map(indent),
      '</g>',
    );
  }

  if (markElements.length > 0) {
    lines.push(
      `<g data-layer="marks" fill="none" stroke="${MARK_COLOR}" stroke-width="0.5">`,
      ...markElements.map(indent),
      '</g>',
    );
  }

  if (constructionElements.length > 0) {
    lines.push(
      `<g data-layer="construction" fill="none" stroke="${CONSTRUCTION_COLOR}" stroke-width="0.5" stroke-dasharray="4 4">`,
      ...constructionElements.map(indent),
      '</g>',
    );
  }

  lines.push('</svg>');

  return lines.join('\n');
}
