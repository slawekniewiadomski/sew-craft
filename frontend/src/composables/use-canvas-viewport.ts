import type { PatternDocument, Vec2 } from '@sewcraft/geometry';
import { bounds } from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import {
  fitToBounds,
  niceStep,
  ticksAlong,
  viewportTransform,
  visibleWorldRect,
  zoomAt,
  type Size,
  type Viewport,
} from '@/lib/viewport';

/** One entity or mark under the pointer, as the SVG data attributes describe it. */
export interface CanvasHit {
  id: string;
  kind: string;
}

export interface CanvasViewportOptions {
  document: () => PatternDocument;
  /** The marquee owns the pointer, so the wheel must not rescale under it. */
  canZoom: () => boolean;
}

/**
 * The canvas viewport: its element, size, pan/zoom transform and the ruler ticks
 * derived from it. Also the screen↔element conversion and the hit extraction
 * every gesture starts from.
 *
 * Pointer state that belongs to a gesture (marquee, drags) stays with the canvas.
 */
export function useCanvasViewport({ document, canZoom }: CanvasViewportOptions) {
  const svg = ref<SVGSVGElement | null>(null);
  const viewport = ref<Viewport>({ x: -40, y: -40, scale: 1 });
  const size = ref<Size>({ width: 800, height: 600 });
  let resizeObserver: ResizeObserver | null = null;

  const gridStep = computed(() => niceStep(viewport.value.scale));
  const gridPath = computed(() => `M ${gridStep.value} 0 L 0 0 0 ${gridStep.value}`);
  const transform = computed(() => viewportTransform(viewport.value));
  const visible = computed(() => visibleWorldRect(viewport.value, size.value));
  const xTicks = computed(() => ticksAlong(visible.value, 'x', gridStep.value));
  const yTicks = computed(() => ticksAlong(visible.value, 'y', gridStep.value));

  function svgRect(): DOMRect {
    return svg.value!.getBoundingClientRect();
  }

  function updateSize(): void {
    const rect = svgRect();
    size.value = { width: rect.width, height: rect.height };
  }

  function screenPoint(event: { clientX: number; clientY: number }): Vec2 {
    const rect = svgRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function hitEntity(event: Event): CanvasHit | null {
    const element = (event.target as Element).closest('[data-entity-id]');
    if (!element) return null;
    return {
      id: element.getAttribute('data-entity-id')!,
      kind: element.getAttribute('data-kind')!,
    };
  }

  function onWheel(event: WheelEvent): void {
    // The rectangle must not change scale under the pointer mid-gesture.
    if (!canZoom()) return;
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    viewport.value = zoomAt(viewport.value, screenPoint(event), factor);
  }

  function fit(): void {
    const documentBounds = bounds(document());
    if (documentBounds) {
      updateSize();
      viewport.value = fitToBounds(documentBounds, size.value);
    }
  }

  onMounted(() => {
    updateSize();
    window.addEventListener('resize', updateSize);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(svg.value!);
    }
    fit();
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateSize);
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return {
    svg,
    viewport,
    size,
    gridStep,
    gridPath,
    transform,
    visible,
    xTicks,
    yTicks,
    svgRect,
    updateSize,
    screenPoint,
    hitEntity,
    onWheel,
    fit,
  };
}
