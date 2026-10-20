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
});
