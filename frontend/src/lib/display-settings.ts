/**
 * What the canvases draw and what an export contains. Kept apart from the
 * document: these are per-project preferences, persisted in localStorage the
 * same way the active tab is.
 */
export interface PieceDisplaySettings {
  construction: boolean;
  allowances: boolean;
  constraints: boolean;
  dimensions: boolean;
}

export interface AssemblyDisplaySettings {
  cutShapes: boolean;
  allowances: boolean;
  stitch: boolean;
  folds: boolean;
  notches: boolean;
  labels: boolean;
  /** Seam, finished and unmatched edge overlays. */
  seams: boolean;
}

export interface ExportSettings {
  construction: boolean;
  stitch: boolean;
  fold: boolean;
}

export interface DisplaySettings {
  piece: PieceDisplaySettings;
  assembly: AssemblyDisplaySettings;
  export: ExportSettings;
}

/** One checkbox row of the canvas display menu. */
export interface CanvasDisplayItem {
  /** Stable id used by the menu's test hook and the emitted patch. */
  key: string;
  label: string;
}

/** A fresh copy of the built-in preferences: everything visible, export lean. */
export function defaultDisplaySettings(): DisplaySettings {
  return {
    piece: { construction: true, allowances: true, constraints: true, dimensions: true },
    assembly: {
      cutShapes: true,
      allowances: true,
      stitch: true,
      folds: true,
      notches: true,
      labels: true,
      seams: true,
    },
    export: { construction: false, stitch: true, fold: true },
  };
}

/** The localStorage key these preferences are stored under, per project. */
export function persistedDisplayKey(patternId: string): string {
  return `sewcraft:display:${patternId}`;
}

/** Read one settings group, ignoring anything that is not an object. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** One boolean field from a stored group, falling back to its default. */
function pickFlag(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Parse a stored settings payload. Missing, malformed or partially valid data
 * falls back field by field, so a stale or hand-edited entry never hides the
 * canvas.
 */
export function parseDisplaySettings(value: string | null | undefined): DisplaySettings {
  const defaults = defaultDisplaySettings();
  if (value == null || value === '') return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return defaults;
  }

  const record = asRecord(parsed);
  const piece = asRecord(record.piece);
  const assembly = asRecord(record.assembly);
  const exported = asRecord(record.export);

  return {
    piece: {
      construction: pickFlag(piece, 'construction', defaults.piece.construction),
      allowances: pickFlag(piece, 'allowances', defaults.piece.allowances),
      constraints: pickFlag(piece, 'constraints', defaults.piece.constraints),
      dimensions: pickFlag(piece, 'dimensions', defaults.piece.dimensions),
    },
    assembly: {
      cutShapes: pickFlag(assembly, 'cutShapes', defaults.assembly.cutShapes),
      allowances: pickFlag(assembly, 'allowances', defaults.assembly.allowances),
      stitch: pickFlag(assembly, 'stitch', defaults.assembly.stitch),
      folds: pickFlag(assembly, 'folds', defaults.assembly.folds),
      notches: pickFlag(assembly, 'notches', defaults.assembly.notches),
      labels: pickFlag(assembly, 'labels', defaults.assembly.labels),
      // A payload written before seams existed keeps the overlay visible.
      seams: pickFlag(assembly, 'seams', defaults.assembly.seams),
    },
    export: {
      construction: pickFlag(exported, 'construction', defaults.export.construction),
      stitch: pickFlag(exported, 'stitch', defaults.export.stitch),
      fold: pickFlag(exported, 'fold', defaults.export.fold),
    },
  };
}

type DisplayStorage = Pick<Storage, 'setItem'>;

/** The persisted preferences for a project, or the defaults when none apply. */
export function readDisplaySettings(
  storage: Pick<Storage, 'getItem'>,
  patternId: string,
): DisplaySettings {
  return parseDisplaySettings(storage.getItem(persistedDisplayKey(patternId)));
}

/** Persist the preferences for a project. */
export function writeDisplaySettings(
  storage: DisplayStorage,
  patternId: string,
  settings: DisplaySettings,
): void {
  storage.setItem(persistedDisplayKey(patternId), JSON.stringify(settings));
}
