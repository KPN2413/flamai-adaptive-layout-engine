import { describe, expect, it } from 'vitest';
import { resolveLayout } from './resolver';
import { adSpec } from './spec';
import { surfaces } from './surfaces';
import type { Rect, SurfaceProfile } from './types';

function overlaps(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

describe('constraint resolver', () => {
  it.each(Object.values(surfaces))('produces a valid standard layout for $label', (surface) => {
    const layout = resolveLayout(adSpec, surface);
    expect(layout.valid).toBe(true);

    const visible = layout.elements.filter((element) => !element.hidden);
    for (const element of visible) {
      expect(element.rect.x).toBeGreaterThanOrEqual(layout.safeRect.x);
      expect(element.rect.y).toBeGreaterThanOrEqual(layout.safeRect.y);
      expect(element.rect.x + element.rect.width).toBeLessThanOrEqual(
        layout.safeRect.x + layout.safeRect.width + 0.01,
      );
      expect(element.rect.y + element.rect.height).toBeLessThanOrEqual(
        layout.safeRect.y + layout.safeRect.height + 0.01,
      );
    }

    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const a = visible[i];
        const b = visible[j];
        if (!a || !b) continue;
        expect(overlaps(a.rect, b.rect), `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('protects the CTA tap target on touch surfaces', () => {
    for (const surface of Object.values(surfaces)) {
      if (!surface.touchOnly) continue;
      const layout = resolveLayout(adSpec, surface);
      const cta = layout.elements.find((element) => element.id === 'cta');
      expect(cta?.hidden).toBe(false);
      expect(cta?.rect.height ?? 0).toBeGreaterThanOrEqual(surface.minTapTarget);
    }
  });

  it('protects minimum text size for far-viewing broadcast surfaces', () => {
    const surface = surfaces.broadcastLowerThird;
    const layout = resolveLayout(adSpec, surface);

    for (const element of layout.elements) {
      if (element.hidden || element.fontSize === undefined) continue;
      expect(element.fontSize).toBeGreaterThanOrEqual(surface.minTextSize);
    }
  });

  it('degrades lower-priority content on the constrained mobile landscape', () => {
    const layout = resolveLayout(adSpec, surfaces.mobileLandscape);
    const lowPriority = layout.elements.filter((element) => element.priority >= 3);
    expect(lowPriority.some((element) => element.degradation !== 'none')).toBe(true);

    const headline = layout.elements.find((element) => element.id === 'headline');
    const cta = layout.elements.find((element) => element.id === 'cta');
    expect(headline?.hidden).toBe(false);
    expect(cta?.hidden).toBe(false);
  });

  it('resolves an unseen surface without adding a surface-specific code branch', () => {
    const unseen: SurfaceProfile = {
      id: 'interview-surface',
      label: 'Interview surface',
      width: 742,
      height: 914,
      safeArea: { top: 28, right: 24, bottom: 34, left: 24 },
      touchOnly: true,
      minTapTarget: 52,
      viewingDistance: 'near',
    };

    const layout = resolveLayout(adSpec, unseen);
    expect(layout.valid).toBe(true);
    expect(layout.elements.find((element) => element.id === 'headline')?.hidden).toBe(false);
    expect(layout.elements.find((element) => element.id === 'cta')?.hidden).toBe(false);
  });
});
