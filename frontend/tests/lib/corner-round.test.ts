import {
  cornerRounds,
  createEmptyDocument,
  executeCommand,
  type CornerRound,
  type Entity,
  type PatternDocument,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  applyCornerRoundPick,
  cornerRoundAngle,
  cornerRoundLabel,
  cornerRoundPreview,
  cornerRoundPrompt,
  cornerRoundRejection,
  defaultCornerRadius,
  emptyCornerRoundPicks,
  formatCornerRadius,
  maxCornerRadiusForLines,
  parseCornerRadius,
  radiusFromTangentDistance,
  roundableCorners,
  tangentDragRadius,
  type CornerRoundRejectionReason,
} from '@/lib/corner-round';

function point(id: string, x: number, y: number, fixed = false): Entity {
  return { id, kind: 'point', x, y, construction: false, fixed };
}

function line(id: string, start: string, end: string, construction = false): Entity {
  return { id, kind: 'line', start, end, construction };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

/** A 100 × 100 square: `a` bottom-left, `b` bottom-right, `c` top-right, `d` top-left. */
function square(): PatternDocument {
  return doc([
    point('a', 0, 0),
    point('b', 100, 0),
    point('c', 100, 100),
    point('d', 0, 100),
    line('ab', 'a', 'b'),
    line('bc', 'b', 'c'),
    line('cd', 'c', 'd'),
    line('da', 'd', 'a'),
  ]);
}

/** The square with a 10 mm round at corner `b` between `ab` and `bc`. */
function rounded(radius = 10, source = square()): PatternDocument {
  return executeCommand(source, {
    id: 'r1',
    type: 'add_corner_round',
    params: { first: 'ab', second: 'bc', radius },
  }).document;
}

function firstRound(document: PatternDocument): CornerRound {
  return cornerRounds(document)[0]!;
}

describe('corner-round pick state', () => {
  it('starts empty', () => {
    expect(emptyCornerRoundPicks()).toEqual({ first: null, second: null });
  });

  it('prompts for each slot in turn', () => {
    expect(cornerRoundPrompt(emptyCornerRoundPicks())).toBe(
      'Round corner — pick two lines or a corner.',
    );
    expect(cornerRoundPrompt({ first: 'ab', second: null })).toBe(
      'Round corner — pick the second line.',
    );
    expect(cornerRoundPrompt({ first: 'ab', second: 'bc' })).toBe('Round corner — set the radius.');
  });

  it('explains every rejection', () => {
    const messages: Record<CornerRoundRejectionReason, string> = {
      'needs-lines': 'Rounding needs two straight lines.',
      'not-corner': 'Pick a corner between two lines.',
      distinct: 'Pick two different lines.',
      'no-corner': 'The lines must meet at a corner.',
      'already-rounded': 'This corner is already rounded.',
      mixed: 'Both lines must be cut edges or both construction.',
      'third-edge': 'The corner is shared by more than two edges of this kind.',
      seam: 'Remove the seam allowance first.',
      sharp: 'The corner is too sharp for a round.',
      straight: 'The lines are straight; there is no corner to round.',
      'no-direction': 'The line has no direction.',
      radius: 'The corner cannot be rounded.',
    };

    for (const [reason, message] of Object.entries(messages)) {
      expect(cornerRoundRejection(reason as CornerRoundRejectionReason)).toBe(message);
    }
  });
});

describe('corner-round radius helpers', () => {
  it('computes the largest radius two lines can take', () => {
    expect(maxCornerRadiusForLines(square(), 'ab', 'bc')).toBeCloseTo(99.999, 3);
  });

  it('rejects unusable line pairs', () => {
    expect(maxCornerRadiusForLines(square(), 'a', 'bc')).toBeNull();
    expect(maxCornerRadiusForLines(square(), 'ab', 'ab')).toBeNull();
    expect(maxCornerRadiusForLines(square(), 'ab', 'cd')).toBeNull();
  });

  it('converts a tangent distance to a radius', () => {
    expect(radiusFromTangentDistance(10, Math.PI / 2)).toBeCloseTo(10, 9);
  });

  it('defaults to five millimetres or the largest fitting radius', () => {
    expect(defaultCornerRadius(100)).toBe(5);
    expect(defaultCornerRadius(3.2)).toBe(3.2);
    expect(defaultCornerRadius(0.0012)).toBe(0.001);
  });

  it('parses and formats the field value', () => {
    expect(parseCornerRadius('')).toBeNull();
    expect(parseCornerRadius('  ')).toBeNull();
    expect(parseCornerRadius('abc')).toBeNull();
    expect(parseCornerRadius('0.0005')).toBeNull();
    expect(parseCornerRadius(' 12.5 ')).toBe(12.5);
    expect(formatCornerRadius(10.0004)).toBe('10');
  });

  it('reads the interior angle of an existing round', () => {
    expect(cornerRoundAngle(rounded(), firstRound(rounded()))).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('applyCornerRoundPick', () => {
  it('resolves a corner point into both line slots', () => {
    const result = applyCornerRoundPick({ first: 'ab', second: null }, 'b', square());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.picks).toEqual({ first: 'ab', second: 'bc' });
    expect(result.corner).toBe('b');
    expect(result.maxRadius).toBeCloseTo(99.999, 3);
  });

  it('rejects a point that is not between two lines', () => {
    const document = doc([point('a', 0, 0), point('b', 100, 0), line('ab', 'a', 'b')]);

    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', document)).toEqual({
      status: 'rejected',
      picks: emptyCornerRoundPicks(),
      reason: 'not-corner',
    });
  });

  it('rejects a point with more than two incident lines', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('bd', 'b', 'd'),
    ]);

    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', document)).toEqual({
      status: 'rejected',
      picks: emptyCornerRoundPicks(),
      reason: 'third-edge',
    });
  });

  it('rejects an already rounded corner point', () => {
    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', rounded())).toEqual({
      status: 'rejected',
      picks: emptyCornerRoundPicks(),
      reason: 'already-rounded',
    });
  });

  it('rejects a point between mixed construction lines', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c', true),
    ]);

    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', document)).toEqual({
      status: 'rejected',
      picks: emptyCornerRoundPicks(),
      reason: 'mixed',
    });
  });

  it('resolves a corner point whose lines both start or end there', () => {
    const result = applyCornerRoundPick(emptyCornerRoundPicks(), 'a', square());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.picks).toEqual({ first: 'ab', second: 'da' });
    expect(result.corner).toBe('a');
  });

  it('rejects a point whose lines carry a legacy seam', () => {
    for (const edge of ['ab', 'bc']) {
      const withSeam = executeCommand(square(), {
        id: 'seam',
        type: 'add_seam_allowance',
        params: { edge },
      }).document;

      expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', withSeam)).toEqual({
        status: 'rejected',
        picks: emptyCornerRoundPicks(),
        reason: 'seam',
      });
    }
  });

  it('rejects a non-line, non-point entity', () => {
    const document = doc([
      point('a', 0, 0),
      point('c', 100, 100),
      { id: 'curve', kind: 'curve', p0: 'a', p1: 'a', p2: 'c', p3: 'c', construction: false },
    ]);

    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'curve', document)).toEqual({
      status: 'rejected',
      picks: emptyCornerRoundPicks(),
      reason: 'needs-lines',
    });
  });

  it('fills the first slot', () => {
    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'ab', square())).toEqual({
      status: 'picking',
      picks: { first: 'ab', second: null },
    });
  });

  it('rejects the same line twice', () => {
    const picks = { first: 'ab', second: null };
    expect(applyCornerRoundPick(picks, 'ab', square())).toEqual({
      status: 'rejected',
      picks,
      reason: 'distinct',
    });
  });

  it('restarts when the first pick no longer exists', () => {
    expect(applyCornerRoundPick({ first: 'ghost', second: null }, 'bc', square())).toEqual({
      status: 'picking',
      picks: { first: 'bc', second: null },
    });
  });

  it('rejects lines that do not meet', () => {
    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'cd', square())).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'no-corner',
    });
  });

  it('rejects an already rounded corner', () => {
    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', rounded())).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'already-rounded',
    });
  });

  it('rejects mixed construction flags', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c', true),
    ]);

    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', document)).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'mixed',
    });
  });

  it('rejects a line that already carries a seam allowance', () => {
    const withSeam = executeCommand(square(), {
      id: 'seam',
      type: 'add_seam_allowance',
      params: { edge: 'ab' },
    }).document;

    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', withSeam)).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'seam',
    });
  });

  it('rejects a third cut edge at the corner', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('bd', 'b', 'd'),
    ]);

    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', document)).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'third-edge',
    });
  });

  it('rejects a spike', () => {
    const document = doc([
      point('b', 0, 0),
      point('a', 100, 0.01),
      point('c', 100, 0),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
    ]);

    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', document)).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'sharp',
    });
  });

  it('rejects a straight corner', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 200, 0),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
    ]);

    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', document)).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'straight',
    });
  });

  it('rejects a zero-length line', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 0, 0),
      point('c', 100, 0),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
    ]);

    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', document)).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'no-direction',
    });
  });

  it('rejects a corner with no room for a radius', () => {
    const document = doc([
      point('b', 0, 0),
      point('a', 0.0005, 0),
      point('c', 0, 0.0005),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
    ]);

    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', document)).toEqual({
      status: 'rejected',
      picks: { first: 'ab', second: null },
      reason: 'radius',
    });
    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', document)).toEqual({
      status: 'rejected',
      picks: emptyCornerRoundPicks(),
      reason: 'radius',
    });
  });

  it('rejects a corner point with no direction', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 0, 0),
      point('c', 100, 0),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
    ]);

    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', document)).toEqual({
      status: 'rejected',
      picks: emptyCornerRoundPicks(),
      reason: 'no-direction',
    });
  });

  it('accepts a line pair whose piece allowances differ', () => {
    let document = executeCommand(square(), {
      id: 'piece',
      type: 'create_piece',
      params: {},
    }).document;
    document = executeCommand(document, {
      id: 'loop',
      type: 'set_piece_loop',
      params: { piece: 'piece', edges: ['ab', 'bc', 'cd', 'da'], allowance: 'none' },
    }).document;
    document = executeCommand(document, {
      id: 'allow-ab',
      type: 'set_piece_allowance',
      params: { piece: 'piece', edge: 'ab', width: 10 },
    }).document;

    expect(applyCornerRoundPick({ first: 'ab', second: null }, 'bc', document)).toMatchObject({
      status: 'ready',
      corner: 'b',
    });
  });

  it('accepts a corner point whose piece allowances differ', () => {
    let document = executeCommand(square(), {
      id: 'piece',
      type: 'create_piece',
      params: {},
    }).document;
    document = executeCommand(document, {
      id: 'loop',
      type: 'set_piece_loop',
      params: { piece: 'piece', edges: ['ab', 'bc', 'cd', 'da'], allowance: 'none' },
    }).document;
    document = executeCommand(document, {
      id: 'allow-ab',
      type: 'set_piece_allowance',
      params: { piece: 'piece', edge: 'ab', width: 10 },
    }).document;

    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', document)).toMatchObject({
      status: 'ready',
      corner: 'b',
    });
  });

  it('accepts a corner point whose piece allowances match', () => {
    let document = executeCommand(square(), {
      id: 'piece',
      type: 'create_piece',
      params: {},
    }).document;
    document = executeCommand(document, {
      id: 'loop',
      type: 'set_piece_loop',
      params: { piece: 'piece', edges: ['ab', 'bc', 'cd', 'da'], allowance: 'none' },
    }).document;
    for (const [index, edge] of ['ab', 'bc'].entries()) {
      document = executeCommand(document, {
        id: `allow-${index}`,
        type: 'set_piece_allowance',
        params: { piece: 'piece', edge, width: 10 },
      }).document;
    }

    expect(applyCornerRoundPick(emptyCornerRoundPicks(), 'b', document).status).toBe('ready');
  });

  it('reports a usable corner and its ceiling', () => {
    const result = applyCornerRoundPick({ first: 'ab', second: null }, 'bc', square());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.picks).toEqual({ first: 'ab', second: 'bc' });
    expect(result.corner).toBe('b');
    expect(result.maxRadius).toBeCloseTo(99.999, 3);
  });

  it('accounts for a round at the other end of a picked line', () => {
    const result = applyCornerRoundPick({ first: 'bc', second: null }, 'cd', rounded());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.corner).toBe('c');
    expect(result.maxRadius).toBeCloseTo(89.999, 3);
  });

  it('accepts either pick order', () => {
    const result = applyCornerRoundPick({ first: 'bc', second: null }, 'ab', square());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.corner).toBe('b');
  });

  it('rejects a corner that another line pair already rounded', () => {
    const document = rounded();
    const withLines: PatternDocument = {
      ...document,
      entities: [
        ...document.entities,
        point('e', 50, -50),
        line('bd', 'b', 'd'),
        line('be', 'b', 'e'),
      ],
    };

    expect(applyCornerRoundPick({ first: 'bd', second: null }, 'be', withLines)).toEqual({
      status: 'rejected',
      picks: { first: 'bd', second: null },
      reason: 'already-rounded',
    });
  });

  it('rejects a corner with a missing point', () => {
    const document = doc([
      point('a', 0, 0),
      point('c', 100, 100),
      line('x', 'ghost', 'a'),
      line('y', 'ghost', 'c'),
    ]);

    expect(applyCornerRoundPick({ first: 'x', second: null }, 'y', document)).toEqual({
      status: 'rejected',
      picks: { first: 'x', second: null },
      reason: 'radius',
    });
  });
});

describe('cornerRoundPreview', () => {
  it('needs both picks and a usable radius', () => {
    expect(cornerRoundPreview(square(), emptyCornerRoundPicks(), 10)).toBeNull();
    expect(cornerRoundPreview(square(), { first: 'ab', second: 'bc' }, 0)).toBeNull();
  });

  it('needs two usable lines', () => {
    expect(cornerRoundPreview(square(), { first: 'a', second: 'bc' }, 10)).toBeNull();
    expect(cornerRoundPreview(square(), { first: 'ab', second: 'ab' }, 10)).toBeNull();
    expect(cornerRoundPreview(square(), { first: 'ab', second: 'cd' }, 10)).toBeNull();
  });

  it('needs both far endpoints', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      line('ab', 'a', 'b'),
      line('bx', 'b', 'missing'),
    ]);

    expect(cornerRoundPreview(document, { first: 'ab', second: 'bx' }, 10)).toBeNull();
  });

  it('needs a resolvable corner point', () => {
    const document = doc([
      point('a', 0, 0),
      point('c', 100, 100),
      line('x', 'ghost', 'a'),
      line('y', 'ghost', 'c'),
    ]);

    expect(cornerRoundPreview(document, { first: 'x', second: 'y' }, 10)).toBeNull();
  });

  it('handles either pick order', () => {
    const preview = cornerRoundPreview(square(), { first: 'bc', second: 'ab' }, 10)!;

    expect(preview.corner).toBe('b');
    expect(preview.lines[0].id).toBe('bc');
    expect(preview.lines[1].id).toBe('ab');
  });

  it('returns trimmed lines, tangents and a dashed arc', () => {
    const preview = cornerRoundPreview(square(), { first: 'ab', second: 'bc' }, 10)!;

    expect(preview.corner).toBe('b');
    expect(preview.tangents[0]).toEqual({ x: 90, y: 0 });
    expect(preview.tangents[1].x).toBe(100);
    expect(preview.tangents[1].y).toBeCloseTo(10, 9);
    expect(preview.lines[0]).toEqual({ id: 'ab', from: { x: 0, y: 0 }, to: { x: 90, y: 0 } });
    expect(preview.lines[1].id).toBe('bc');
    expect(preview.lines[1].from).toEqual({ x: 100, y: 100 });
    expect(preview.lines[1].to.x).toBe(100);
    expect(preview.lines[1].to.y).toBeCloseTo(10, 9);
    expect(preview.arc.startsWith('M 90 0 C ')).toBe(true);
  });
});

describe('cornerRoundLabel', () => {
  it('places the label at the middle of the arc', () => {
    const label = cornerRoundLabel(rounded(), firstRound(rounded()))!;

    expect(label.id).toBe('r1');
    expect(label.radius).toBe(10);
    expect(label.text).toBe('R 10');
    expect(label.accessible).toBe('Corner radius 10 millimetres');
    expect(label.x).toBeCloseTo(97.071, 2);
    expect(label.y).toBeCloseTo(2.929, 2);
    expect(Math.hypot(label.outwardX, label.outwardY)).toBeCloseTo(1, 9);
  });

  it('returns null when the round cannot be located', () => {
    const document = rounded();
    const withoutCorner: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'b'),
    };
    expect(cornerRoundLabel(withoutCorner, firstRound(withoutCorner))).toBeNull();

    const zeroRadius: PatternDocument = {
      ...document,
      cornerRounds: [{ ...firstRound(document), radius: 0 }],
    };
    expect(cornerRoundLabel(zeroRadius, firstRound(zeroRadius))).toBeNull();
  });
});

describe('tangentDragRadius', () => {
  it('returns null when the round cannot be resolved', () => {
    const document = rounded();
    const round = firstRound(document);

    const withoutCorner: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'b'),
    };
    expect(tangentDragRadius(withoutCorner, round, 0, { x: 90, y: 0 })).toBeNull();

    const withoutAnchor: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'a'),
    };
    expect(tangentDragRadius(withoutAnchor, round, 0, { x: 90, y: 0 })).toBeNull();

    const zeroRadius: PatternDocument = {
      ...document,
      entities: document.entities.map((entity) =>
        entity.id === 'a' ? { ...entity, x: 100, y: 0 } : entity,
      ),
    };
    expect(tangentDragRadius(zeroRadius, round, 0, { x: 90, y: 0 })).toBeNull();

    const withoutLine: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'ab'),
    };
    expect(tangentDragRadius(withoutLine, round, 0, { x: 90, y: 0 })).toBeNull();
  });

  it('returns null when the lines leave no radius', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('b', 0, 0),
        point('a', 0.0005, 0),
        point('c', 0, 0.0005),
        point('t1', 0.0004, 0, true),
        point('t2', 0, 0.0004, true),
        point('k1', 0, 0, true),
        point('k2', 0, 0, true),
        line('ab', 't1', 'b'),
        line('bc', 'b', 't2'),
      ],
      cornerRounds: [
        {
          id: 'r1',
          corner: 'b',
          ends: [
            { line: 'ab', anchor: 'a', tangent: 't1' },
            { line: 'bc', anchor: 'c', tangent: 't2' },
          ],
          radius: 0.001,
          arc: 'arc',
          controls: ['k1', 'k2'],
          cornerConstruction: false,
        },
      ],
    };

    expect(tangentDragRadius(document, firstRound(document), 0, { x: 0.0004, y: 0 })).toBeNull();
  });

  it('projects the pointer onto the line and clamps to the fit', () => {
    const document = rounded();
    const round = firstRound(document);

    expect(tangentDragRadius(document, round, 0, { x: 90, y: 0 })).toBeCloseTo(10, 3);
    expect(tangentDragRadius(document, round, 1, { x: 100, y: 20 })).toBeCloseTo(20, 3);
    expect(tangentDragRadius(document, round, 0, { x: 100, y: 0 })).toBe(0.001);
    expect(tangentDragRadius(document, round, 0, { x: -100, y: 0 })).toBeCloseTo(99.999, 3);
  });
});

describe('roundableCorners', () => {
  it('lists every two-line corner point', () => {
    expect(roundableCorners(square())).toEqual(['a', 'b', 'c', 'd']);
  });

  it('skips a rounded corner and the derived points it adds', () => {
    expect(roundableCorners(rounded())).toEqual(['a', 'c', 'd']);
  });

  it('skips points on a legacy seam edge', () => {
    const withSeam = executeCommand(square(), {
      id: 'seam',
      type: 'add_seam_allowance',
      params: { edge: 'ab' },
    }).document;

    expect(roundableCorners(withSeam)).toEqual(['c', 'd']);
  });

  it('skips a point between mixed construction lines', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c', true),
      line('cd', 'c', 'd'),
      line('da', 'd', 'a'),
    ]);

    // `b` and `c` each mix a cut and a construction line; `a` and `d` do not.
    expect(roundableCorners(document)).toEqual(['a', 'd']);
  });

  it('skips a branch and a single-line point', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
      point('lone', 50, 50),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('bd', 'b', 'd'),
      line('cd', 'c', 'd'),
      line('da', 'd', 'a'),
      line('lone-line', 'lone', 'a'),
    ]);

    // `b` and `d` each have three lines, `lone` has one, and `a` gains a third.
    expect(roundableCorners(document)).toEqual(['c']);
  });

  it('includes a corner between construction lines', () => {
    const document = doc([
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      line('ab', 'a', 'b', true),
      line('bc', 'b', 'c', true),
    ]);

    expect(roundableCorners(document)).toEqual(['b']);
  });

  it('offers every corner whatever the piece allowances are', () => {
    let document = executeCommand(square(), {
      id: 'piece',
      type: 'create_piece',
      params: {},
    }).document;
    document = executeCommand(document, {
      id: 'loop',
      type: 'set_piece_loop',
      params: { piece: 'piece', edges: ['ab', 'bc', 'cd', 'da'], allowance: 'none' },
    }).document;
    document = executeCommand(document, {
      id: 'allow-ab',
      type: 'set_piece_allowance',
      params: { piece: 'piece', edge: 'ab', width: 10 },
    }).document;
    expect(roundableCorners(document)).toEqual(['a', 'b', 'c', 'd']);

    const withKinds: PatternDocument = {
      ...document,
      pieces: [
        {
          id: 'piece',
          edges: ['ab', 'bc', 'cd', 'da'],
          allowances: [
            { edge: 'ab', width: 10, kind: 'single' },
            { edge: 'bc', width: 10, kind: 'double' },
          ],
        },
      ],
    };
    // A differing pair rounds into a split crescent instead of being hidden.
    expect(roundableCorners(withKinds)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores a piece that does not contain both edge lines', () => {
    const document: PatternDocument = {
      ...square(),
      pieces: [{ id: 'p', edges: ['ab'], allowances: [{ edge: 'ab', width: 10 }] }],
    };

    // A piece that never contains both lines of a corner imposes no rule.
    expect(roundableCorners(document)).toEqual(['a', 'b', 'c', 'd']);
  });
});
