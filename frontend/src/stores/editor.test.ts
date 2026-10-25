import {
  CommandExecutionError,
  CommandValidationError,
  createEmptyDocument,
  executeCommand,
  getEntity,
  type Command,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from './editor';

const point = (id: string, x: number, y: number, fixed = false): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed,
});

const addPoint = (id: string, x: number, y: number): Command => ({
  id,
  type: 'add_point',
  params: { x, y },
});

const addLine = (id: string, start: string, end: string): Command => ({
  id,
  type: 'add_line',
  params: { start, end },
});

const addDistance = (id: string, a: string, b: string, value: number): Command => ({
  id,
  type: 'add_constraint',
  params: { type: 'distance', entities: [a, b], value },
});

describe('editor store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts empty with nothing to undo or redo', () => {
    const store = useEditorStore();

    expect(store.document).toEqual(createEmptyDocument());
    expect(store.journal).toEqual([]);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it('applies a dispatched command and records a journal entry', () => {
    const store = useEditorStore();
    const command = addPoint('p1', 3, 4);

    store.dispatch(command);

    expect(getEntity(store.document, 'p1')).toMatchObject({ x: 3, y: 4 });
    expect(store.journal).toHaveLength(1);
    expect(store.journal[0]?.command).toEqual(command);
    expect(store.journal[0]?.inverse).toEqual({
      id: 'p1',
      type: 'delete_entity',
      params: { id: 'p1' },
    });
    expect(store.journal[0]?.before).toEqual(createEmptyDocument());
    expect(store.canUndo).toBe(true);
  });

  it('undo restores the exact prior document', () => {
    const store = useEditorStore();
    const before = store.document;

    store.dispatch(addPoint('p1', 3, 4));
    store.undo();

    expect(store.document).toBe(before);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(true);
  });

  it('redo reapplies the command', () => {
    const store = useEditorStore();

    store.dispatch(addPoint('p1', 3, 4));
    const after = store.document;
    store.undo();
    store.redo();

    expect(store.document).toEqual(after);
    expect(store.canRedo).toBe(false);
    expect(store.canUndo).toBe(true);
  });

  it('undoes and redoes across several commands', () => {
    const store = useEditorStore();
    const empty = store.document;

    store.dispatch(addPoint('a', 0, 0));
    const first = store.document;
    store.dispatch(addPoint('b', 10, 0));
    const second = store.document;
    store.dispatch(addLine('l', 'a', 'b'));

    store.undo();
    expect(store.document).toBe(second);
    store.undo();
    expect(store.document).toBe(first);
    store.undo();
    expect(store.document).toBe(empty);

    store.redo();
    expect(store.document).toEqual(first);
    store.redo();
    expect(store.document).toEqual(second);
  });

  it('dispatching after an undo drops the redo stack', () => {
    const store = useEditorStore();

    store.dispatch(addPoint('a', 0, 0));
    store.undo();
    expect(store.canRedo).toBe(true);

    store.dispatch(addPoint('b', 10, 0));

    expect(store.canRedo).toBe(false);
    expect(store.journal).toHaveLength(1);
  });

  it('applies a group as one journal entry', () => {
    const store = useEditorStore();
    const before = store.document;
    const commands = [addPoint('a', 0, 0), addPoint('b', 10, 0), addLine('l', 'a', 'b')];

    store.dispatchGroup(commands);

    expect(store.journal).toHaveLength(1);
    expect(store.journal[0]?.commands).toEqual(commands);
    expect(store.journal[0]?.command).toEqual(commands[2]);
    expect(store.journal[0]?.inverses).toEqual([
      { id: 'a', type: 'delete_entity', params: { id: 'a' } },
      { id: 'b', type: 'delete_entity', params: { id: 'b' } },
      { id: 'l', type: 'delete_entity', params: { id: 'l' } },
    ]);
    expect(store.journal[0]?.before).toBe(before);
    expect(getEntity(store.document, 'l')).toMatchObject({ start: 'a', end: 'b' });
  });

  it('undoes a whole group in one step and redoes every command', () => {
    const store = useEditorStore();
    const before = store.document;
    store.dispatchGroup([addPoint('a', 0, 0), addPoint('b', 10, 0), addLine('l', 'a', 'b')]);
    const after = store.document;

    store.undo();

    expect(store.document).toBe(before);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(true);

    store.redo();

    expect(store.document).toEqual(after);
    expect(getEntity(store.document, 'l')).toBeDefined();
    expect(store.journal).toHaveLength(1);
  });

  it('treats an empty group as a no-op', () => {
    const store = useEditorStore();
    const document = store.document;

    store.dispatchGroup([]);

    expect(store.document).toBe(document);
    expect(store.journal).toHaveLength(0);
    expect(store.canUndo).toBe(false);
  });

  it('a failing group leaves the document and journal untouched', () => {
    const store = useEditorStore();
    const document = store.document;

    expect(() => store.dispatchGroup([addPoint('a', 0, 0), addLine('l', 'a', 'missing')])).toThrow(
      CommandValidationError,
    );

    expect(store.document).toBe(document);
    expect(store.journal).toHaveLength(0);
    expect(store.canUndo).toBe(false);
  });

  it('a rejected command leaves the document and journal untouched', () => {
    const store = useEditorStore();
    const document = store.document;

    expect(() => store.dispatch(addLine('l', 'a', 'b'))).toThrow(CommandValidationError);

    expect(store.document).toBe(document);
    expect(store.journal).toHaveLength(0);
  });

  it('a non-converged command rolls back', () => {
    const store = useEditorStore();
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [point('a', 0, 0, true), point('b', 10, 0, true)],
    };
    store.load(document);

    expect(() => store.dispatch(addDistance('d', 'a', 'b', 100))).toThrow(CommandExecutionError);

    expect(store.document).toBe(document);
    expect(store.journal).toHaveLength(0);
  });

  it('replaying the journal on the initial document reproduces the current one', () => {
    const store = useEditorStore();
    const commands: Command[] = [
      addPoint('a', 0, 0),
      addPoint('b', 60, 0),
      addLine('ab', 'a', 'b'),
      addDistance('width', 'a', 'b', 80),
    ];

    commands.forEach((command) => store.dispatch(command));

    const replayed = store.journal.reduce<PatternDocument>(
      (document, entry) => executeCommand(document, entry.command).document,
      createEmptyDocument(),
    );

    expect(store.journal).toHaveLength(commands.length);
    expect(replayed).toEqual(store.document);
  });

  it('load replaces the document and clears history', () => {
    const store = useEditorStore();
    store.dispatch(addPoint('a', 0, 0));

    const loaded = createEmptyDocument();
    store.load(loaded);

    expect(store.document).toBe(loaded);
    expect(store.journal).toEqual([]);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it('refuses a 0.1 seam chain instead of migrating it', () => {
    const store = useEditorStore();
    const legacy = {
      schema: 'sewcraft.pattern/0.1',
      units: 'mm',
      entities: [],
      constraints: [],
      pieces: [],
    };

    expect(() => store.load(legacy as unknown as PatternDocument)).toThrow(
      'Unsupported pattern schema',
    );
  });

  it('undo is a no-op with no history', () => {
    const store = useEditorStore();
    const document = store.document;

    store.undo();

    expect(store.document).toBe(document);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it('redo is a no-op with no future', () => {
    const store = useEditorStore();
    const document = store.document;

    store.redo();

    expect(store.document).toBe(document);
    expect(store.canRedo).toBe(false);
    expect(store.canUndo).toBe(false);
  });

  it('drops an inconsistent corner round on load and keeps its static geometry', () => {
    const store = useEditorStore();
    const square: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('a', 0, 0),
        point('b', 100, 0),
        point('c', 100, 100),
        point('d', 0, 100),
        { id: 'ab', kind: 'line', start: 'a', end: 'b', construction: false },
        { id: 'bc', kind: 'line', start: 'b', end: 'c', construction: false },
        { id: 'cd', kind: 'line', start: 'c', end: 'd', construction: false },
        { id: 'da', kind: 'line', start: 'd', end: 'a', construction: false },
      ],
    };
    const rounded = executeCommand(square, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'ab', second: 'bc', radius: 10 },
    }).document;

    store.load(rounded);
    expect(store.document).toBe(rounded);
    expect(store.document.cornerRounds).toHaveLength(1);

    const inconsistent: PatternDocument = {
      ...rounded,
      cornerRounds: rounded.cornerRounds!.map((round) => ({ ...round, radius: 1000 })),
    };
    store.load(inconsistent);

    expect(store.document.cornerRounds).toEqual([]);
    expect(store.document.entities).toHaveLength(rounded.entities.length);
  });
});

describe('editor store persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts a new project as clean but without a stored copy', () => {
    const store = useEditorStore();
    store.setReadOnly(true);

    store.markNew();

    expect(store.isNew).toBe(true);
    expect(store.isDirty).toBe(false);
    expect(store.readOnly).toBe(false);
    expect(store.savedVersion).toBe(0);
    expect(store.lastSavedAt).toBeNull();
    expect(store.saveState).toBe('idle');
    expect(store.document).toEqual(createEmptyDocument());
  });

  it('adopts a loaded document as the clean baseline', () => {
    const store = useEditorStore();
    const loaded: PatternDocument = {
      ...createEmptyDocument(),
      entities: [point('p', 1, 2)],
    };

    store.markLoaded(loaded, 12, '2026-10-23T14:32:00Z');

    expect(store.isNew).toBe(false);
    expect(store.isDirty).toBe(false);
    expect(store.savedVersion).toBe(12);
    expect(store.lastSavedAt).toBe('2026-10-23T14:32:00Z');

    store.dispatch(addPoint('q', 3, 4));
    expect(store.isDirty).toBe(true);

    // Undo restores the exact saved object, so the document is clean again.
    store.undo();
    expect(store.isDirty).toBe(false);
  });

  it('records the sent snapshot so edits during a save stay dirty', () => {
    const store = useEditorStore();
    store.dispatch(addPoint('p', 1, 2));
    const snapshot = store.document;

    store.markSaving();
    expect(store.saveState).toBe('saving');

    store.markSaved(snapshot, 3, '2026-10-23T15:00:00Z');

    expect(store.saveState).toBe('saved');
    expect(store.savedVersion).toBe(3);
    expect(store.lastSavedAt).toBe('2026-10-23T15:00:00Z');
    expect(store.isDirty).toBe(false);

    store.dispatch(addPoint('q', 3, 4));
    expect(store.isDirty).toBe(true);
    expect(store.saveState).toBe('saved');
  });

  it('marks a failed save while keeping the document', () => {
    const store = useEditorStore();
    store.dispatch(addPoint('p', 1, 2));

    store.markSaveFailed();

    expect(store.saveState).toBe('failed');
    expect(store.isDirty).toBe(true);
    expect(store.document.entities).toHaveLength(1);
  });

  it('rejects every mutation in read-only mode', () => {
    const store = useEditorStore();
    store.dispatch(addPoint('p', 1, 2));
    store.undo();
    const document = store.document;
    const journal = store.journal;

    store.setReadOnly(true);
    store.dispatch(addPoint('q', 3, 4));
    store.dispatchGroup([addPoint('r', 5, 6)]);
    store.undo();
    store.redo();

    expect(store.document).toBe(document);
    expect(store.journal).toBe(journal);
    expect(store.future).toHaveLength(1);
    expect(store.canRedo).toBe(true);
  });

  it('adopts an unknown document as a clean read-only baseline', () => {
    const store = useEditorStore();
    const unknown = {
      schema: 'sewcraft.pattern/0.3',
      units: 'mm',
      entities: [],
      constraints: [],
      pieces: [],
    } as unknown as PatternDocument;

    store.markReadOnlyLoaded(unknown, 4, '2026-10-23T16:00:00Z');

    expect(store.document).toBe(unknown);
    expect(store.isNew).toBe(false);
    expect(store.isDirty).toBe(false);
    expect(store.readOnly).toBe(true);
    expect(store.savedVersion).toBe(4);
    expect(store.lastSavedAt).toBe('2026-10-23T16:00:00Z');
    expect(store.saveState).toBe('idle');
  });

  it('loads a document without normalising it', () => {
    const store = useEditorStore();
    store.dispatch(addPoint('p', 1, 2));

    const legacy = {
      schema: 'sewcraft.pattern/0.3',
      units: 'mm',
      entities: [],
      constraints: [],
    } as unknown as PatternDocument;

    store.loadRaw(legacy);

    expect(store.document).toBe(legacy);
    expect(store.document.pieces).toBeUndefined();
    expect(store.journal).toEqual([]);
    expect(store.future).toEqual([]);
  });
});

describe('active piece and loop capture', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const square = (): Command[] => [
    { id: 'a', type: 'add_point', params: { x: 0, y: 0, piece: 'p1' } },
    { id: 'b', type: 'add_point', params: { x: 100, y: 0, piece: 'p1' } },
    { id: 'c', type: 'add_point', params: { x: 100, y: 100, piece: 'p1' } },
    { id: 'd', type: 'add_point', params: { x: 0, y: 100, piece: 'p1' } },
    { id: 'ab', type: 'add_line', params: { start: 'a', end: 'b', piece: 'p1' } },
    { id: 'bc', type: 'add_line', params: { start: 'b', end: 'c', piece: 'p1' } },
    { id: 'cd', type: 'add_line', params: { start: 'c', end: 'd', piece: 'p1' } },
    { id: 'da', type: 'add_line', params: { start: 'd', end: 'a', piece: 'p1' } },
  ];

  const emptyPiece = (): PatternDocument => ({
    ...createEmptyDocument(),
    pieces: [{ id: 'p1', edges: [], allowances: [] }],
    tabs: [{ kind: 'piece', id: 'p1' }],
  });

  it('activates only a tab that exists', () => {
    const store = useEditorStore();
    store.load(emptyPiece());

    store.setActiveTab({ kind: 'piece', id: 'p1' });
    expect(store.activePieceId).toBe('p1');

    store.setActiveTab({ kind: 'piece', id: 'missing' });
    expect(store.activeTab).toBeNull();
    expect(store.activePieceId).toBeNull();
  });

  it('derives the active piece from a piece tab only', () => {
    const store = useEditorStore();
    const document: PatternDocument = {
      ...emptyPiece(),
      assemblies: [{ id: 'a1', name: 'A', instances: [] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    };
    store.load(document);

    store.setActiveTab({ kind: 'assembly', id: 'a1' });
    expect(store.activePieceId).toBeNull();
    expect(store.activeTab).toEqual({ kind: 'assembly', id: 'a1' });
  });

  it('restores a persisted tab and falls back to the first one', () => {
    const store = useEditorStore();
    const document: PatternDocument = {
      ...emptyPiece(),
      pieces: [
        { id: 'p1', edges: [], allowances: [] },
        { id: 'p2', edges: [], allowances: [] },
      ],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'piece', id: 'p2' },
      ],
    };

    store.load(document, { kind: 'piece', id: 'p2' });
    expect(store.activeTab).toEqual({ kind: 'piece', id: 'p2' });

    store.load(document, { kind: 'piece', id: 'gone' });
    expect(store.activeTab).toEqual({ kind: 'piece', id: 'p1' });
  });

  it('reconciles the active tab after undo removes it', () => {
    const store = useEditorStore();
    const document: PatternDocument = {
      ...emptyPiece(),
      assemblies: [{ id: 'a1', name: 'A', instances: [] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    };
    store.load(document, { kind: 'assembly', id: 'a1' });

    store.dispatch({ id: 'a2', type: 'create_assembly', params: { name: 'B' } });
    store.setActiveTab({ kind: 'assembly', id: 'a2' });

    store.undo();
    expect(store.activeTab).toEqual({ kind: 'assembly', id: 'a1' });

    store.dispatch({ id: 'p2', type: 'create_piece', params: { name: 'Back' } });
    store.setActiveTab({ kind: 'piece', id: 'p2' });
    store.undo();
    expect(store.activeTab).toEqual({ kind: 'assembly', id: 'a1' });
  });

  it('activates the first piece on load and clears it for a new project', () => {
    const store = useEditorStore();
    store.load(emptyPiece());
    expect(store.activePieceId).toBe('p1');

    store.markNew();
    expect(store.activePieceId).toBeNull();
  });

  it('captures one closed chain in the same journal entry', () => {
    const store = useEditorStore();
    store.load(emptyPiece());
    store.setActiveTab({ kind: 'piece', id: 'p1' });

    store.dispatchGroup(square());

    const piece = store.document.pieces[0]!;
    expect(piece.edges).toHaveLength(4);
    expect(piece.allowances).toHaveLength(4);
    expect(store.journal).toHaveLength(1);
    expect(store.journal[0]!.commands?.at(-1)?.type).toBe('set_piece_loop');

    store.undo();
    expect(store.document.pieces[0]!.edges).toEqual([]);
  });

  it('does not capture an open chain or an already looped piece', () => {
    const store = useEditorStore();
    store.load(emptyPiece());
    store.setActiveTab({ kind: 'piece', id: 'p1' });

    store.dispatchGroup(square().slice(0, 7));
    expect(store.document.pieces[0]!.edges).toEqual([]);

    store.dispatchGroup([
      { id: 'da', type: 'add_line', params: { start: 'd', end: 'a', piece: 'p1' } },
    ]);
    expect(store.document.pieces[0]!.edges).toHaveLength(4);

    const commands = store.journal.length;
    store.dispatchGroup([
      { id: 'extra', type: 'add_line', params: { start: 'a', end: 'c', piece: 'p1' } },
    ]);
    expect(store.journal.length).toBe(commands + 1);
    expect(store.document.pieces[0]!.edges).toHaveLength(4);
  });

  it('does not capture without an active piece', () => {
    const store = useEditorStore();
    store.load(emptyPiece());
    store.setActiveTab(null);

    store.dispatchGroup(square());
    expect(store.document.pieces[0]!.edges).toEqual([]);
  });
});
