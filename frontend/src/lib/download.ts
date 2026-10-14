/**
 * Trigger a client-side download of an SVG string. Kept in `lib/` so the DOM
 * interaction is testable and the view stays free of browser plumbing.
 */
export function downloadSvgFile(filename: string, svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
