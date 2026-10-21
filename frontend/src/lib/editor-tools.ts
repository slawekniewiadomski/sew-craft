export type EditorTool =
  | 'select'
  | 'add_point'
  | 'add_line'
  | 'add_curve'
  | 'add_arc'
  | 'add_circle'
  | 'round_corner'
  | 'dimension'
  | 'add_allowance';

export interface EditorToolDefinition {
  id: EditorTool;
  label: string;
}

export const EDITOR_TOOLS: EditorToolDefinition[] = [
  { id: 'select', label: 'Select' },
  { id: 'add_point', label: 'Point' },
  { id: 'add_line', label: 'Line' },
  { id: 'add_curve', label: 'Curve' },
  { id: 'add_arc', label: 'Arc' },
  { id: 'add_circle', label: 'Circle' },
  { id: 'round_corner', label: 'Round corner' },
  { id: 'dimension', label: 'Dimension' },
  { id: 'add_allowance', label: 'Seam allowance' },
];
