export type EditorTool =
  | 'select'
  | 'add_point'
  | 'add_line'
  | 'add_curve'
  | 'add_arc'
  | 'add_circle'
  | 'add_text'
  | 'add_text_leader'
  | 'add_rectangle'
  | 'add_center_rectangle'
  | 'add_3point_rectangle'
  | 'round_corner'
  | 'dimension'
  | 'cut_dimension';

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
  { id: 'add_text', label: 'Text' },
  { id: 'add_text_leader', label: 'Text with leader' },
  { id: 'add_rectangle', label: 'Rectangle' },
  { id: 'add_center_rectangle', label: 'Centre rectangle' },
  { id: 'add_3point_rectangle', label: '3-point rectangle' },
  { id: 'round_corner', label: 'Round corner' },
  { id: 'dimension', label: 'Dimension' },
  { id: 'cut_dimension', label: 'Cut dimension' },
];
