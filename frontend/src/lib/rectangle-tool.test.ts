import {
  createEmptyDocument,
  executeCommand,
  type Command,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { ENDPOINT_TOLERANCE } from './drafting';
import {
  buildRectangleCommands,
  MIN_RECTANGLE_SIZE,
  newRectangleCorners,
  RECTANGLE_CLICKS,
  rectangleCorners,
  type RectangleMode,
} from './rectangle-tool';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

function fresh(x: number, y: number) {
  return { kind: 'new' as const, x, y };
}

function existing(id: EntityId) {
  return { kind: 'point' as const, id };
}

function idGenerator(): (prefix: string) => EntityId {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };
}

const empty = createEmptyDocument();

describe('RECTANGLE_CLICKS', () => {
  it('asks for two clicks in the diagonal and centre modes and three when rotated', () => {
    expect(RECTANGLE_CLICKS).toEqual({ diagonal: 2, center: 2, three_point: 3 });
  });
});

describe('MIN_RECTANGLE_SIZE', () => {
  it('treats a sub-thousandth-of-a-millimetre side as degenerate', () => {
    expect(MIN_RECTANGLE_SIZE).toBe(0.001);
  });
});

describe('rectangleCorners', () => {
  it('derives an axis-aligned rectangle from two opposite corners', () => {
    expect(rectangleCorners(empty, 'diagonal', [fresh(10, 20), fresh(60, 80)])).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 80 },
      { x: 10, y: 80 },
    ]);
  });

  it('keeps the traversal order when the corners are clicked the other way round', () => {
    expect(rectangleCorners(empty, 'diagonal', [fresh(60, 80), fresh(10, 20)])).toEqual([
      { x: 60, y: 80 },
      { x: 10, y: 80 },
      { x: 10, y: 20 },
      { x: 60, y: 20 },
    ]);
  });

  it('refuses a diagonal gesture with a zero width or height', () => {
    expect(rectangleCorners(empty, 'diagonal', [fresh(10, 20), fresh(10, 80)])).toBeNull();
    expect(rectangleCorners(empty, 'diagonal', [fresh(10, 20), fresh(60, 20)])).toBeNull();
    expect(rectangleCorners(empty, 'diagonal', [fresh(10, 20), fresh(10.0005, 80)])).toBeNull();
  });

  it('refuses a diagonal gesture that repeats a corner', () => {
    expect(rectangleCorners(empty, 'diagonal', [fresh(10, 20), fresh(10, 20)])).toBeNull();
    expect(
      rectangleCorners(empty, 'diagonal', [fresh(10, 20), fresh(10 + ENDPOINT_TOLERANCE, 20)]),
    ).toBeNull();
    expect(
      rectangleCorners(doc([pt('a', 10, 20)]), 'diagonal', [existing('a'), existing('a')]),
    ).toBeNull();
  });

  it('refuses a gesture whose clicked point has disappeared', () => {
    expect(rectangleCorners(empty, 'diagonal', [existing('gone'), fresh(10, 40)])).toBeNull();
    expect(rectangleCorners(empty, 'center', [existing('gone'), fresh(10, 40)])).toBeNull();
    expect(
      rectangleCorners(empty, 'three_point', [fresh(0, 0), existing('gone'), fresh(10, 40)]),
    ).toBeNull();
  });

  it('refuses a gesture with a click count the mode does not use', () => {
    expect(rectangleCorners(empty, 'diagonal', [fresh(10, 20)])).toBeNull();
    expect(
      rectangleCorners(empty, 'diagonal', [fresh(10, 20), fresh(60, 80), fresh(1, 1)]),
    ).toBeNull();
    expect(rectangleCorners(empty, 'center', [fresh(10, 20)])).toBeNull();
    expect(rectangleCorners(empty, 'three_point', [fresh(0, 0), fresh(60, 0)])).toBeNull();
  });

  it('mirrors one corner around the centre click', () => {
    expect(rectangleCorners(empty, 'center', [fresh(50, 50), fresh(70, 90)])).toEqual([
      { x: 30, y: 10 },
      { x: 70, y: 10 },
      { x: 70, y: 90 },
      { x: 30, y: 90 },
    ]);
  });

  it('refuses a centred gesture with a zero width or height', () => {
    expect(rectangleCorners(empty, 'center', [fresh(50, 50), fresh(50, 90)])).toBeNull();
    expect(rectangleCorners(empty, 'center', [fresh(50, 50), fresh(70, 50)])).toBeNull();
    expect(rectangleCorners(empty, 'center', [fresh(50, 50), fresh(50.0004, 90)])).toBeNull();
  });

  it('refuses a centred gesture whose second click repeats the centre', () => {
    expect(rectangleCorners(empty, 'center', [fresh(50, 50), fresh(50, 50)])).toBeNull();
  });

  it('derives the width perpendicular to the first side in three-point mode', () => {
    const corners = rectangleCorners(empty, 'three_point', [
      fresh(0, 0),
      fresh(30, 40),
      fresh(20, 10),
    ])!;

    expect(corners[0]).toEqual({ x: 0, y: 0 });
    expect(corners[1]).toEqual({ x: 30, y: 40 });
    expect(corners[2]!.x).toBeCloseTo(38);
    expect(corners[2]!.y).toBeCloseTo(34);
    expect(corners[3]!.x).toBeCloseTo(8);
    expect(corners[3]!.y).toBeCloseTo(-6);
  });

  it('builds the rectangle on the side the third click falls on', () => {
    const above = rectangleCorners(empty, 'three_point', [
      fresh(0, 0),
      fresh(100, 0),
      fresh(50, 40),
    ]);
    const below = rectangleCorners(empty, 'three_point', [
      fresh(0, 0),
      fresh(100, 0),
      fresh(50, -40),
    ]);

    expect(above).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 0, y: 40 },
    ]);
    expect(below).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: -40 },
      { x: 0, y: -40 },
    ]);
  });

  it('refuses a three-point gesture with no first side', () => {
    expect(
      rectangleCorners(empty, 'three_point', [fresh(0, 0), fresh(0, 0), fresh(10, 40)]),
    ).toBeNull();
    expect(
      rectangleCorners(empty, 'three_point', [fresh(0, 0), fresh(0.0005, 0), fresh(10, 40)]),
    ).toBeNull();
  });

  it('refuses a three-point gesture whose first side is shorter than the minimum', () => {
    const document = doc([pt('a', 0, 0), pt('b', 0.0005, 0)]);

    expect(
      rectangleCorners(document, 'three_point', [existing('a'), existing('b'), fresh(10, 40)]),
    ).toBeNull();
  });

  it('refuses a three-point gesture whose third click lies on the first side', () => {
    expect(
      rectangleCorners(empty, 'three_point', [fresh(0, 0), fresh(100, 0), fresh(50, 0)]),
    ).toBeNull();
    expect(
      rectangleCorners(empty, 'three_point', [fresh(0, 0), fresh(100, 0), fresh(50, 0.0005)]),
    ).toBeNull();
  });

  it('resolves clicked points from the document', () => {
    const document = doc([pt('a', 0, 0), pt('b', 100, 50)]);

    expect(rectangleCorners(document, 'diagonal', [existing('a'), existing('b')])).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]);
    expect(rectangleCorners(document, 'center', [existing('a'), existing('b')])).toEqual([
      { x: -100, y: -50 },
      { x: 100, y: -50 },
      { x: 100, y: 50 },
      { x: -100, y: 50 },
    ]);
  });
});

describe('newRectangleCorners', () => {
  it('keeps only the corners no existing point already occupies', () => {
    const document = doc([pt('a', 0, 0), pt('c', 100, 40)]);

    expect(
      newRectangleCorners(document, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 40 },
        { x: 0, y: 40 },
      ]),
    ).toEqual([
      { x: 100, y: 0 },
      { x: 0, y: 40 },
    ]);
  });
});

describe('buildRectangleCommands', () => {
  it('creates four points then the four sides in traversal order', () => {
    const commands = buildRectangleCommands(
      empty,
      'diagonal',
      [fresh(0, 0), fresh(100, 50)],
      idGenerator(),
    );

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 0, y: 0 } },
      { id: 'point-2', type: 'add_point', params: { x: 100, y: 0 } },
      { id: 'point-3', type: 'add_point', params: { x: 100, y: 50 } },
      { id: 'point-4', type: 'add_point', params: { x: 0, y: 50 } },
      { id: 'line-5', type: 'add_line', params: { start: 'point-1', end: 'point-2' } },
      { id: 'line-6', type: 'add_line', params: { start: 'point-2', end: 'point-3' } },
      { id: 'line-7', type: 'add_line', params: { start: 'point-3', end: 'point-4' } },
      { id: 'line-8', type: 'add_line', params: { start: 'point-4', end: 'point-1' } },
    ]);
  });

  it('reuses the points a gesture snapped to', () => {
    const document = doc([pt('a', 0, 0), pt('b', 100, 50)]);

    const commands = buildRectangleCommands(
      document,
      'diagonal',
      [existing('a'), existing('b')],
      idGenerator(),
    );

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 100, y: 0 } },
      { id: 'point-2', type: 'add_point', params: { x: 0, y: 50 } },
      { id: 'line-3', type: 'add_line', params: { start: 'a', end: 'point-1' } },
      { id: 'line-4', type: 'add_line', params: { start: 'point-1', end: 'b' } },
      { id: 'line-5', type: 'add_line', params: { start: 'b', end: 'point-2' } },
      { id: 'line-6', type: 'add_line', params: { start: 'point-2', end: 'a' } },
    ]);
  });

  it('emits no command for a degenerate gesture', () => {
    expect(
      buildRectangleCommands(empty, 'diagonal', [fresh(0, 0), fresh(0, 50)], idGenerator()),
    ).toEqual([]);
    expect(
      buildRectangleCommands(
        empty,
        'three_point',
        [fresh(0, 0), fresh(100, 0), fresh(50, 0)],
        idGenerator(),
      ),
    ).toEqual([]);
  });

  it('generates an id per command so a batch is unique', () => {
    const commands = buildRectangleCommands(
      empty,
      'center',
      [fresh(50, 50), fresh(70, 90)],
      idGenerator(),
    );

    expect(new Set(commands.map((command) => command.id)).size).toBe(commands.length);
  });

  it('builds a batch the command core accepts as one rectangle', () => {
    const modes: [RectangleMode, Parameters<typeof buildRectangleCommands>[2]][] = [
      ['diagonal', [fresh(0, 0), fresh(100, 50)]],
      ['center', [fresh(50, 50), fresh(70, 90)]],
      ['three_point', [fresh(0, 0), fresh(100, 0), fresh(50, 40)]],
    ];

    for (const [mode, clicks] of modes) {
      let sequence = 0;
      const commands: Command[] = buildRectangleCommands(empty, mode, clicks, () => {
        sequence += 1;
        return `id-${sequence}`;
      });

      const applied = commands.reduce<PatternDocument>(
        (document, command) => executeCommand(document, command).document,
        empty,
      );
      const points = applied.entities.filter(
        (entity): entity is PointEntity => entity.kind === 'point',
      );
      const lines = applied.entities.filter(
        (entity): entity is LineEntity => entity.kind === 'line',
      );

      expect({ mode, points: points.length, lines: lines.length }).toEqual({
        mode,
        points: 4,
        lines: 4,
      });
      expect(applied.constraints).toEqual([]);
      expect(new Set(points.map((point) => `${point.x},${point.y}`)).size).toBe(4);
    }
  });
});
