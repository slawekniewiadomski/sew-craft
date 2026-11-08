import type { Assembly, PatternDocument, Vec2 } from '@sewcraft/geometry';
import { assemblyBounds } from '@sewcraft/geometry';
import { computed, onBeforeUnmount, ref } from 'vue';

interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 20;
/** How far the wheel may magnify or shrink the fitted view. */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 40;

export interface AssemblyViewportOptions {
  document: () => PatternDocument;
  assembly: () => Assembly | null;
}

/**
 * The assembly canvas's viewport: the fitted box, wheel zoom, middle-button pan
 * and screen↔world conversion. Pointer drag state stays with the canvas.
 */
export function useAssemblyViewport({ document, assembly }: AssemblyViewportOptions) {
  const svg = ref<SVGSVGElement | null>(null);

  const fitBox = ref<ViewRect>({ x: 0, y: 0, width: 100, height: 100 });

  function fittedBox(): ViewRect {
    const bounds = assembly() === null ? null : assemblyBounds(document(), assembly()!);
    if (bounds === null) return { x: 0, y: 0, width: 100, height: 100 };
    return {
      x: bounds.min.x - PADDING,
      y: bounds.min.y - PADDING,
      width: bounds.max.x - bounds.min.x + PADDING * 2,
      height: bounds.max.y - bounds.min.y + PADDING * 2,
    };
  }

  /** The zoomed view's centre in world space; `null` while fitted. */
  const centre = ref<Vec2 | null>(null);
  /** Zoom relative to the fitted view; 1 is fit, larger magnifies. */
  const zoom = ref(1);

  /** The world rectangle the SVG shows. */
  const view = computed(() => {
    const base = fitBox.value;
    /* v8 ignore next -- a fitted view is the only alternative to a centred one */
    if (centre.value === null) return base;
    const width = base.width / zoom.value;
    const height = base.height / zoom.value;
    return {
      x: centre.value.x - width / 2,
      y: centre.value.y - height / 2,
      width,
      height,
    };
  });

  const viewBox = computed(
    () => `${view.value.x} ${view.value.y} ${view.value.width} ${view.value.height}`,
  );

  /** The mm-per-pixel factor of the current viewBox. */
  function unitPerPixel(): number {
    const element = svg.value;
    /* v8 ignore next -- the SVG exists for every pointer event */
    if (element === null || element.clientWidth === 0) return 1;
    return view.value.width / element.clientWidth;
  }

  /** Screen pixels per world millimetre; `null` before the canvas has a size. */
  function pixelsPerMillimetre(): number | null {
    const element = svg.value;
    /* v8 ignore next -- the SVG exists for every pointer event */
    if (element === null || element.clientWidth === 0) return null;
    return element.clientWidth / view.value.width;
  }

  /** The world point under a pointer, or `null` before the canvas has a size. */
  function pointerWorld(pointer: { clientX: number; clientY: number }): Vec2 | null {
    const element = svg.value;
    const scale = pixelsPerMillimetre();
    /* v8 ignore next -- the SVG exists for every pointer event */
    if (element === null || scale === null) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: view.value.x + (pointer.clientX - rect.left) / scale,
      y: view.value.y + (pointer.clientY - rect.top) / scale,
    };
  }

  /** Wheel zoom keeps the world point under the pointer fixed. */
  function onWheel(event: WheelEvent): void {
    const world = pointerWorld(event);
    if (world === null) return;
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * factor));
    const ratio = next / zoom.value;
    const current = view.value;
    const cx = current.x + current.width / 2;
    const cy = current.y + current.height / 2;
    centre.value = {
      x: world.x + (cx - world.x) / ratio,
      y: world.y + (cy - world.y) / ratio,
    };
    zoom.value = next;
  }

  /** A middle-button pan: its screen origin, the view centre and the mm-per-pixel. */
  const pan = ref<{ clientX: number; clientY: number; centre: Vec2; scale: number } | null>(null);

  function beginPan(event: PointerEvent): void {
    const scale = pixelsPerMillimetre();
    if (scale === null) return;
    const current = view.value;
    pan.value = {
      clientX: event.clientX,
      clientY: event.clientY,
      centre: { x: current.x + current.width / 2, y: current.y + current.height / 2 },
      scale,
    };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', onPanMove);
    window.addEventListener('pointerup', endPan);
    window.addEventListener('pointercancel', endPan);
  }

  function onPanMove(event: PointerEvent): void {
    const current = pan.value!;
    centre.value = {
      x: current.centre.x - (event.clientX - current.clientX) / current.scale,
      y: current.centre.y - (event.clientY - current.clientY) / current.scale,
    };
  }

  function endPan(): void {
    pan.value = null;
    window.removeEventListener('pointermove', onPanMove);
    window.removeEventListener('pointerup', endPan);
    window.removeEventListener('pointercancel', endPan);
  }

  onBeforeUnmount(endPan);

  /** Reset to the fitted view, used on mount, tab change and Fit. */
  function resetFit(): void {
    centre.value = null;
    zoom.value = 1;
    fitBox.value = fittedBox();
  }

  return {
    svg,
    view,
    viewBox,
    unitPerPixel,
    onWheel,
    beginPan,
    resetFit,
  };
}
