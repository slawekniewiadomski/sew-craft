import { CONSTRAINT_TOOLS } from './constraint-tools';
import { EDITOR_TOOLS, type EditorTool } from './editor-tools';
import type { RibbonIconName } from './ribbon-icons';

export type RibbonAction =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'fit'
  | 'set_cut_loop'
  | 'download_svg'
  | 'add_instance'
  | 'mirror_instance'
  | 'rotate_instance';

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

/**
 * A family of tools drawn as one split control: the icon half arms `primary`
 * and the caret opens a menu of every `item`.
 */
export interface RibbonToolGroupItem {
  kind: 'tool-group';
  /** The icon half's `data-testid`, e.g. `tool-rectangle`. */
  id: string;
  /** Group caption and tooltip noun, e.g. `Rectangle`. */
  label: string;
  /** The mode the icon half shows by default. */
  primary: RibbonToolItem;
  /** Modes offered by the menu, `primary` included. */
  items: RibbonToolItem[];
  /**
   * Whether the icon half keeps the last armed mode after the group loses the
   * active tool. Defaults to true; a group whose primary must stay primary sets
   * it false.
   */
  rememberLast?: boolean;
}

export type RibbonItem =
  RibbonToolItem | RibbonConstraintItem | RibbonActionItem | RibbonToolGroupItem;

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
  add_text: 'text',
  add_text_leader: 'text-leader',
  add_rectangle: 'rectangle',
  add_center_rectangle: 'rectangle-center',
  add_3point_rectangle: 'rectangle-aligned',
  round_corner: 'round-corner',
  notch: 'notch',
  centre_line: 'centre-line',
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
 * `id` is the bare control name (`rectangle`); the helper adds the `tool-`
 * prefix so the icon half's test id matches a single tool's.
 */
function toolGroup(
  id: string,
  label: string,
  items: RibbonToolItem[],
  primary: RibbonToolItem = items[0]!,
): RibbonToolGroupItem {
  return { kind: 'tool-group', id: `tool-${id}`, label, primary, items };
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
      actionItem('set-cut-loop', 'Set cut loop', 'set_cut_loop', 'piece'),
      actionItem('undo', 'Undo', 'undo', 'undo'),
      actionItem('redo', 'Redo', 'redo', 'redo'),
      actionItem('delete', 'Delete', 'delete', 'delete'),
      actionItem('fit', 'Fit', 'fit', 'fit'),
    ],
  },
  {
    id: 'features',
    label: 'Features',
    items: [toolItem('round_corner'), toolItem('notch'), toolItem('centre_line')],
  },
  {
    id: 'annotation',
    label: 'Annotation',
    items: [
      {
        ...toolGroup('text', 'Text', [toolItem('add_text'), toolItem('add_text_leader')]),
        // Text stays the primary: the split control never remembers the variant.
        rememberLast: false,
      },
    ],
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
      toolGroup('rectangle', 'Rectangle', [
        toolItem('add_rectangle'),
        toolItem('add_center_rectangle'),
        toolItem('add_3point_rectangle'),
      ]),
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

/**
 * The assembly tab's intentionally minimal ribbon: no sketch or constraint
 * tools, only instance placement, history and view actions.
 */
export const ASSEMBLY_RIBBON_GROUPS: RibbonGroup[] = [
  {
    id: 'assembly',
    label: 'Assembly',
    items: [
      toolItem('select'),
      actionItem('add-instance', 'Add piece', 'add_instance', 'piece-add'),
      actionItem('mirror-instance', 'Mirror', 'mirror_instance', 'mirror'),
      actionItem('rotate-instance', 'Rotate 90°', 'rotate_instance', 'rotate'),
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      actionItem('undo', 'Undo', 'undo', 'undo'),
      actionItem('redo', 'Redo', 'redo', 'redo'),
      actionItem('delete', 'Delete', 'delete', 'delete'),
      actionItem('fit', 'Fit', 'fit', 'fit'),
    ],
  },
  {
    id: 'export',
    label: 'Export',
    items: [actionItem('download-svg', 'Download SVG', 'download_svg', 'download')],
  },
];
