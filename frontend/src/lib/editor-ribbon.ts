import { CONSTRAINT_TOOLS } from './constraint-tools';
import { EDITOR_TOOLS, type EditorTool } from './editor-tools';

export type RibbonAction = 'undo' | 'redo' | 'delete' | 'fit' | 'download_svg';

export interface RibbonConstraintItem {
  kind: 'constraint';
  id: string;
  label: string;
  constraint: (typeof CONSTRAINT_TOOLS)[number]['type'];
}

export interface RibbonToolItem {
  kind: 'tool';
  id: string;
  label: string;
  tool: EditorTool;
}

export interface RibbonActionItem {
  kind: 'action';
  id: string;
  label: string;
  action: RibbonAction;
}

export type RibbonItem = RibbonToolItem | RibbonConstraintItem | RibbonActionItem;

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
}

/**
 * The ribbon is data-driven so a group can gain items (or a new group/tab) by
 * editing this list alone. `id` is the control's `data-testid`.
 */
export const RIBBON_GROUPS: RibbonGroup[] = [
  {
    id: 'tools',
    label: 'Tools',
    items: EDITOR_TOOLS.map((tool) => ({
      kind: 'tool',
      id: `tool-${tool.id}`,
      label: tool.label,
      tool: tool.id,
    })),
  },
  {
    id: 'constraints',
    label: 'Constraints',
    items: CONSTRAINT_TOOLS.map((tool) => ({
      kind: 'constraint',
      id: tool.id,
      label: tool.label,
      constraint: tool.type,
    })),
  },
  {
    id: 'history',
    label: 'History',
    items: [
      { kind: 'action', id: 'undo', label: 'Undo', action: 'undo' },
      { kind: 'action', id: 'redo', label: 'Redo', action: 'redo' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [{ kind: 'action', id: 'delete', label: 'Delete', action: 'delete' }],
  },
  {
    id: 'canvas',
    label: 'Canvas',
    items: [
      { kind: 'action', id: 'fit', label: 'Fit', action: 'fit' },
      { kind: 'action', id: 'download-svg', label: 'Download SVG', action: 'download_svg' },
    ],
  },
];
