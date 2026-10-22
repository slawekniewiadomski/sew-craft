import { arcGeometry, svgArcCommand } from './arc.js';
import { circleGeometry } from './circle.js';
import { bounds, getEntity } from './document.js';
import { formatSvgNumber as formatNumber } from './number.js';
import { pieceCutBounds, pieceCutLoop, pieceFoldLines, pieceLoop, pieceMetrics } from './piece.js';
import {
  PATTERN_SCHEMA,
  type ArcEntity,
  type CircleEntity,
  type CurveEntity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from './types.js';
import type { Vec2 } from './vector.js';

/**
 * A precomputed seam-allowance outline for one stitch edge. Legacy edges that
 * close no piece keep this outline; a piece's allowances are derived from its
 * loop instead and never take this path.
 */
export interface SvgSeamAllowancePath {
  edge: EntityId;
  path: readonly Vec2[];
}

export interface SvgExportOptions {
  /** Include construction geometry. Off by default so exports are cut-ready. */
  construction?: boolean;
  /** Include the stitch loops of every piece. On by default. */
  stitch?: boolean;
  /** Include every double-fold fold line. On by default. */
  fold?: boolean;
  /** Legacy seam-allowance outlines for edges outside any piece. Empty by default. */
  seamAllowance?: readonly SvgSeamAllowancePath[];
  /** Whitespace around the drawing, in millimetres. Defaults to 10 mm. */
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

interface Box {
  min: Vec2;
  max: Vec2;
}

interface PieceRender {
  cut: string | null;
  stitch: string | null;
  fold: string[];
  metadata: string | null;
  bounds: Box | null;
}

const DEFAULT_PADDING = 10;

const CUT_COLOR = '#000000';
const STITCH_COLOR = '#374151';
const FOLD_COLOR = '#2563eb';
const CONSTRUCTION_COLOR = '#9ca3af';
const SEAM_ALLOWANCE_COLOR = '#2563eb';

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

/** Split the document's line, curve, circle and arc entities into cut and construction layers. */
function renderEntities(document: PatternDocument): { cut: string[]; construction: string[] } {
  const cut: string[] = [];
  const construction: string[] = [];

  for (const entity of document.entities) {
    if (entity.kind === 'point') continue;

    const element =
      entity.kind === 'line'
        ? lineElement(document, entity)
        : entity.kind === 'arc'
          ? arcElement(document, entity)
          : entity.kind === 'circle'
            ? circleElement(document, entity)
            : curveElement(document, entity);
    if (element === null) continue;

    (entity.construction ? construction : cut).push(element);
  }

  return { cut, construction };
}

/** A closed `path` element for a piece loop. */
function loopElement(points: readonly Vec2[], attributes: string, closed: boolean): string | null {
  if (points.length === 0) return null;

  const [first, ...rest] = points;
  const commands = [
    `M ${formatNumber(first!.x)} ${formatNumber(first!.y)}`,
    ...rest.map((point) => `L ${formatNumber(point.x)} ${formatNumber(point.y)}`),
    ...(closed ? ['Z'] : []),
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

function renderPiece(document: PatternDocument, piece: Piece): PieceRender {
  const cut = pieceCutLoop(document, piece);
  const loop = pieceLoop(document, piece);
  const folds = pieceFoldLines(document, piece);
  const pieceAttr = ` data-piece="${escapeXml(piece.id)}"`;

  const cutWarnings =
    cut === null || cut.selfIntersections.length === 0 ? '' : ' data-warning="self-intersection"';

  return {
    cut: cut === null ? null : loopElement(cut.points, `${pieceAttr}${cutWarnings}`, true),
    stitch:
      loop === null ? null : loopElement(loop.points, `${pieceAttr} data-kind="stitch"`, true),
    fold: folds.map((fold) => loopElement(fold, `${pieceAttr} data-kind="fold"`, true)!),
    metadata: pieceMetadata(document, piece),
    bounds: pieceCutBounds(document, piece),
  };
}

function seamElement(entry: SvgSeamAllowancePath): string | null {
  return loopElement(entry.path, ` data-edge="${escapeXml(entry.edge)}"`, false);
}

/** The union of two boxes, or `null` while neither exists. */
function unionBox(a: Box | null, b: Box | null): Box | null {
  if (a === null) return b;
  if (b === null) return a;
  return {
    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y) },
    max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y) },
  };
}

/** The union of every piece's cut bounds, or `null` when no piece resolves. */
function cutBoundsOf(pieces: readonly PieceRender[]): Box | null {
  return pieces.reduce<Box | null>((box, piece) => unionBox(box, piece.bounds), null);
}

function computeViewBox(box: Box | null, padding: number): ViewBox {
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
 * Serialize a pattern to a true-to-scale SVG in millimetres. The output is pure
 * string data (no DOM) with one user unit per millimetre and a `viewBox` in
 * pattern coordinates.
 *
 * A document with pieces exports its derived geometry: the `cut` layer is the
 * closed cut loop of every piece and is always present, while `stitch` and
 * `fold` default to on and can be switched off individually. A document without
 * pieces keeps the legacy contract, where `cut` is every non-construction
 * entity and the `viewBox` follows the document bounds. Legacy allowances stay in
 * their own `seam-allowance` layer, and `construction` remains opt-in.
 */
export function toSvg(document: PatternDocument, options: SvgExportOptions = {}): string {
  const construction = options.construction ?? false;
  const stitch = options.stitch ?? true;
  const fold = options.fold ?? true;
  const padding = options.padding ?? DEFAULT_PADDING;
  const seamAllowance = options.seamAllowance ?? [];
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const legacy = renderEntities(document);
  const pieces = document.pieces.map((piece) => renderPiece(document, piece));
  const pieceCut = pieces
    .map((piece) => piece.cut)
    .filter((element): element is string => element !== null);
  const pieceStitch = pieces
    .map((piece) => piece.stitch)
    .filter((element): element is string => element !== null);
  const pieceFold = pieces.flatMap((piece) => piece.fold);
  const metadata = pieces
    .map((piece) => piece.metadata)
    .filter((element): element is string => element !== null);

  const cutElements = pieceCut.length > 0 ? pieceCut : legacy.cut;
  const stitchElements = pieces.length > 0 ? pieceStitch : [];
  const cutBounds = cutBoundsOf(pieces);
  const box = computeViewBox(cutBounds ?? bounds(document), padding);

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- sewcraft:svg schema="${PATTERN_SCHEMA}" generated="${escapeXml(generatedAt)}" -->`,
    ...metadata,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(box.width)}mm" height="${formatNumber(box.height)}mm" viewBox="${formatNumber(box.minX)} ${formatNumber(box.minY)} ${formatNumber(box.width)} ${formatNumber(box.height)}">`,
    `<g data-layer="cut" fill="none" stroke="${CUT_COLOR}" stroke-width="1">`,
    ...cutElements.map(indent),
    '</g>',
  ];

  if (stitch && stitchElements.length > 0) {
    lines.push(
      `<g data-layer="stitch" fill="none" stroke="${STITCH_COLOR}" stroke-width="0.35">`,
      ...stitchElements.map(indent),
      '</g>',
    );
  }

  if (fold && pieceFold.length > 0) {
    lines.push(
      `<g data-layer="fold" fill="none" stroke="${FOLD_COLOR}" stroke-width="0.35" stroke-dasharray="6 3">`,
      ...pieceFold.map(indent),
      '</g>',
    );
  }

  const seams = seamAllowance
    .map(seamElement)
    .filter((element): element is string => element !== null);
  if (seams.length > 0) {
    lines.push(
      `<g data-layer="seam-allowance" fill="none" stroke="${SEAM_ALLOWANCE_COLOR}" stroke-width="0.5" stroke-dasharray="6 3">`,
      ...seams.map(indent),
      '</g>',
    );
  }

  if (construction && legacy.construction.length > 0) {
    lines.push(
      `<g data-layer="construction" fill="none" stroke="${CONSTRUCTION_COLOR}" stroke-width="0.5" stroke-dasharray="4 4">`,
      ...legacy.construction.map(indent),
      '</g>',
    );
  }

  lines.push('</svg>');

  return lines.join('\n');
}
