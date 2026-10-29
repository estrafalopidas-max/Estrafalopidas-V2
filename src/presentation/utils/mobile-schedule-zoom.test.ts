import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampZoomScale,
  computeTouchDistance,
  computePinchScale,
  computeGridNaturalWidth,
  computeFitToScreenScale,
} from './mobile-schedule-zoom';

test('clampZoomScale keeps scale within bounds and rounds to 2 decimals', () => {
  assert.equal(clampZoomScale(1.0), 1.0);
  assert.equal(clampZoomScale(0.05), 0.22);
  assert.equal(clampZoomScale(3.5), 2.0);
  assert.equal(clampZoomScale(0.4567), 0.46);
  assert.equal(clampZoomScale(Number.NaN), 1.0);
});

test('computeTouchDistance calculates Euclidean distance between two touch points', () => {
  assert.equal(computeTouchDistance({ x: 0, y: 0 }, { x: 30, y: 40 }), 50);
  assert.equal(computeTouchDistance({ x: 10, y: 10 }, { x: 10, y: 10 }), 0);
});

test('computePinchScale scales proportionally to finger spread', () => {
  assert.equal(computePinchScale(100, 150, 1.0), 1.5);
  assert.equal(computePinchScale(200, 100, 1.0), 0.5);
  assert.equal(computePinchScale(200, 20, 0.5), 0.22);
  assert.equal(computePinchScale(100, 300, 1.2), 2.0);
});

test('computeGridNaturalWidth returns 0 for single grade and full readable width for multi-grade', () => {
  assert.equal(computeGridNaturalWidth(1, 'morning'), 0);
  assert.equal(computeGridNaturalWidth(12, 'morning'), 112 + 12 * 138);
  assert.equal(computeGridNaturalWidth(11, 'afternoon'), 112 + 11 * 138);
  assert.equal(computeGridNaturalWidth(2, 'transicion-1'), 2 * (112 + 138));
});

test('computeFitToScreenScale computes panoramic scale for mobile viewports', () => {
  const natural12Grades = computeGridNaturalWidth(12, 'morning'); // 1768px
  const fitScale = computeFitToScreenScale(390, natural12Grades, 24);
  assert.equal(fitScale, 0.22);

  const natural4Grades = computeGridNaturalWidth(4, 'morning'); // 664px
  const fitScale4 = computeFitToScreenScale(390, natural4Grades, 24);
  assert.equal(fitScale4, 0.55);
});
