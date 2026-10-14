export type EditorTool = 'select' | 'add_point' | 'add_line' | 'add_curve';

export interface EditorToolDefinition {
  id: EditorTool;
  label: string;
}

export const EDITOR_TOOLS: EditorToolDefinition[] = [
  { id: 'select', label: 'Select' },
  { id: 'add_point', label: 'Point' },
  { id: 'add_line', label: 'Line' },
  { id: 'add_curve', label: 'Curve' },
];
