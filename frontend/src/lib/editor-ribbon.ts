import { CONSTRAINT_TOOLS } from './constraint-tools';
import { EDITOR_TOOLS, type EditorTool } from './editor-tools';
import type { RibbonIconName } from './ribbon-icons';

export type RibbonAction = 'undo' | 'redo' | 'delete' | 'fit' | 'create_piece' | 'download_svg';

export interface RibbonConstraintItem {
  kind: 'constraint';
  id: string;
  label: string;
  icon: RibbonIconName;
  constraint: (typeof CONSTRAINT_TOOLS)[number]['type'];
}

export interface RibbonToolItem {
  kind: 'tool';
  id: string;
  label: string;
  icon: RibbonIconName;
  tool: EditorTool;
}

export interface RibbonActionItem {
  kind: 'action';
  id: string;
  label: string;
  icon: RibbonIconName;
  action: RibbonAction;
}

export type RibbonItem = RibbonToolItem | RibbonConstraintItem | RibbonActionItem;

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
}

/** The glyph each drawing tool shows in the ribbon. */
const TOOL_ICONS: Record<EditorTool, RibbonIconName> = {
  select: 'select',
  add_point: 'point',
  add_line: 'line',
  add_curve: 'curve',
  add_arc: 'arc',
  add_circle: 'circle',
  round_corner: 'round-corner',
  dimension: 'dimension',
  cut_dimension: 'cut-dimension',
};

const TOOL_ITEMS = new Map<EditorTool, RibbonToolItem>(
  EDITOR_TOOLS.map((tool): [EditorTool, RibbonToolItem] => [
    tool.id,
    {
      kind: 'tool',
      id: `tool-${tool.id}`,
      label: tool.label,
      icon: TOOL_ICONS[tool.id],
      tool: tool.id,
    },
  ]),
);

function toolItem(tool: EditorTool): RibbonToolItem {
  return TOOL_ITEMS.get(tool)!;
}

function actionItem(
  id: string,
  label: string,
  action: RibbonAction,
  icon: RibbonIconName,
): RibbonActionItem {
  return { kind: 'action', id, label, action, icon };
}

/**
 * The ribbon is data-driven so a group can gain items by editing this list
 * alone. `id` is the control's `data-testid`; `label` is its tooltip and
 * accessible name. Each group renders its label as a small uppercase caption.
 */
export const RIBBON_GROUPS: RibbonGroup[] = [
  {
    id: 'tools',
    label: 'Tools',
    items: [
      toolItem('select'),
      actionItem('create-piece', 'Create piece', 'create_piece', 'piece'),
      actionItem('undo', 'Undo', 'undo', 'undo'),
      actionItem('redo', 'Redo', 'redo', 'redo'),
      actionItem('delete', 'Delete', 'delete', 'delete'),
      actionItem('fit', 'Fit', 'fit', 'fit'),
    ],
  },
  {
    id: 'features',
    label: 'Features',
    items: [toolItem('round_corner')],
  },
  {
    id: 'sketching',
    label: 'Sketching',
    items: [
      toolItem('add_point'),
      toolItem('add_line'),
      toolItem('add_curve'),
      toolItem('add_arc'),
      toolItem('add_circle'),
      toolItem('dimension'),
      toolItem('cut_dimension'),
    ],
  },
  {
    id: 'constraints',
    label: 'Constraints',
    items: CONSTRAINT_TOOLS.map((tool) => ({
      kind: 'constraint',
      id: tool.id,
      label: tool.label,
      icon: tool.type,
      constraint: tool.type,
    })),
  },
  {
    id: 'export',
    label: 'Export',
    items: [actionItem('download-svg', 'Download SVG', 'download_svg', 'download')],
  },
];
