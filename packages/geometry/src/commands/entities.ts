/** Entity commands, split between geometry and lifecycle, re-exported for the dispatcher. */
export {
  MIN_SPLIT_LENGTH,
  applyAddArc,
  applyAddCircle,
  applyAddCurve,
  applyAddLine,
  applyAddPoint,
  applyMovePoint,
  applySplitLine,
} from './entity-geometry.js';
export {
  applyDeleteEntity,
  applySetConstruction,
  captureBrokenDependents,
} from './entity-lifecycle.js';
