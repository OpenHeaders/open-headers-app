import { describe, it, expect } from 'vitest';
import {
  calculateViewportScale,
} from '../../../../../../src/renderer/components/record/player/utils/playerUtils';

// ======================================================================
// calculateViewportScale
// ======================================================================
describe('calculateViewportScale', () => {
  it('scales down when container is smaller', () => {
    const scale = calculateViewportScale({ width: 1024, height: 768 }, 540, 458);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThanOrEqual(1);
  });

  it('does not scale above 1', () => {
    const scale = calculateViewportScale({ width: 100, height: 100 }, 2000, 2000);
    expect(scale).toBe(1);
  });

  it('uses default viewport when null', () => {
    const scale = calculateViewportScale(null, 540, 458);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThanOrEqual(1);
  });

  it('accounts for padding in width calculation', () => {
    // scaleX = (containerWidth - 40) / viewportWidth
    // scaleY = (containerHeight - 90) / viewportHeight
    const viewport = { width: 500, height: 400 };
    const scale = calculateViewportScale(viewport, 540, 490);
    const expectedScaleX = (540 - 40) / 500; // 1.0
    const expectedScaleY = (490 - 90) / 400; // 1.0
    expect(scale).toBe(Math.min(expectedScaleX, expectedScaleY, 1));
  });

  it('returns minimum of scaleX and scaleY', () => {
    const viewport = { width: 1000, height: 100 };
    // scaleX = (540 - 40) / 1000 = 0.5
    // scaleY = (500 - 90) / 100 = 4.1
    const scale = calculateViewportScale(viewport, 540, 500);
    expect(scale).toBeCloseTo(0.5);
  });
});
