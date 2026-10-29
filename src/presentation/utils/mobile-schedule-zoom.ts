export const MIN_MOBILE_ZOOM = 0.22;
export const MAX_MOBILE_ZOOM = 2.0;
export const DEFAULT_MOBILE_ZOOM = 1.0;
export const MOBILE_TIME_COL_WIDTH_PX = 112;
export const MOBILE_GRADE_COL_WIDTH_PX = 138;

export function clampZoomScale(
  scale: number,
  minScale: number = MIN_MOBILE_ZOOM,
  maxScale: number = MAX_MOBILE_ZOOM
): number {
  if (!Number.isFinite(scale)) return DEFAULT_MOBILE_ZOOM;
  const clamped = Math.min(maxScale, Math.max(minScale, scale));
  return Math.round(clamped * 100) / 100;
}

export function computeTouchDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

export function computePinchScale(
  initialDistance: number,
  currentDistance: number,
  startScale: number,
  minScale: number = MIN_MOBILE_ZOOM,
  maxScale: number = MAX_MOBILE_ZOOM
): number {
  if (initialDistance <= 0 || currentDistance <= 0 || !Number.isFinite(startScale)) {
    return clampZoomScale(startScale, minScale, maxScale);
  }
  const ratio = currentDistance / initialDistance;
  return clampZoomScale(startScale * ratio, minScale, maxScale);
}

export function computeGridNaturalWidth(
  gradeCount: number,
  shiftType: 'morning' | 'afternoon' | 'transicion-1'
): number {
  if (gradeCount <= 1 && shiftType !== 'transicion-1') {
    return 0;
  }
  if (shiftType === 'transicion-1') {
    return Math.max(1, gradeCount) * (MOBILE_TIME_COL_WIDTH_PX + MOBILE_GRADE_COL_WIDTH_PX);
  }
  return MOBILE_TIME_COL_WIDTH_PX + Math.max(1, gradeCount) * MOBILE_GRADE_COL_WIDTH_PX;
}

export function computeFitToScreenScale(
  viewportWidth: number,
  gridNaturalWidth: number,
  horizontalPadding: number = 24
): number {
  if (gridNaturalWidth <= 0 || viewportWidth <= 0) {
    return DEFAULT_MOBILE_ZOOM;
  }
  const availableWidth = Math.max(200, viewportWidth - horizontalPadding);
  if (availableWidth >= gridNaturalWidth) {
    return DEFAULT_MOBILE_ZOOM;
  }
  return clampZoomScale(availableWidth / gridNaturalWidth, MIN_MOBILE_ZOOM, DEFAULT_MOBILE_ZOOM);
}
