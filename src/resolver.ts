import type {
  AdElement,
  AdSpec,
  CompositionMode,
  Rect,
  ResolvedElement,
  ResolvedLayout,
  ResolutionDiagnostic,
  SurfaceProfile,
} from './types';

interface WorkItem {
  element: AdElement;
  height: number;
  minHeight: number;
  fontSize?: number;
  minFontSize?: number;
  maxLines?: number;
  minLines?: number;
  degradation: ResolvedElement['degradation'];
  hidden: boolean;
}

interface PackOptions {
  align: 'left' | 'center';
  justify: 'start' | 'center';
}

const EPSILON = 0.01;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function surfaceMinTextSize(surface: SurfaceProfile): number {
  return surface.viewingDistance === 'far' ? surface.minTextSize : 0;
}

function surfaceMinTapTarget(surface: SurfaceProfile): number {
  return surface.touchOnly ? surface.minTapTarget : 0;
}

function safeRectFor(surface: SurfaceProfile): Rect {
  return {
    x: surface.safeArea.left,
    y: surface.safeArea.top,
    width: surface.width - surface.safeArea.left - surface.safeArea.right,
    height: surface.height - surface.safeArea.top - surface.safeArea.bottom,
  };
}

export function selectComposition(surface: SurfaceProfile): CompositionMode {
  const safeRect = safeRectFor(surface);
  const aspectRatio = safeRect.width / safeRect.height;

  if (aspectRatio >= 3) return 'strip';
  if (aspectRatio >= 1.35) return 'split';
  if (aspectRatio >= 0.82) return 'tile';
  return 'poster';
}

function validateSpec(spec: AdSpec): void {
  const ids = new Set<string>();

  for (const element of spec.elements) {
    if (ids.has(element.id)) {
      throw new Error(`Duplicate ad element id: ${element.id}`);
    }
    ids.add(element.id);

    if (element.priority < 1 || element.priority > 5) {
      throw new Error(`Element ${element.id} has an invalid priority.`);
    }

    if (element.type === 'text') {
      const { sizing } = element;
      if (
        sizing.minFontSize > sizing.preferredFontSize ||
        sizing.preferredFontSize > sizing.maxFontSize ||
        sizing.minLines > sizing.preferredLines ||
        sizing.minLines < 1
      ) {
        throw new Error(`Element ${element.id} has invalid text sizing constraints.`);
      }
    } else if (element.type === 'button') {
      const { sizing } = element;
      if (
        sizing.minHeight > sizing.preferredHeight ||
        sizing.preferredHeight > sizing.maxHeight ||
        sizing.minFontSize > sizing.preferredFontSize ||
        sizing.preferredFontSize > sizing.maxFontSize
      ) {
        throw new Error(`Element ${element.id} has invalid button sizing constraints.`);
      }
    } else {
      const { sizing } = element;
      if (
        sizing.minHeight > sizing.preferredHeight ||
        sizing.preferredHeight > sizing.maxHeight
      ) {
        throw new Error(`Element ${element.id} has invalid image sizing constraints.`);
      }
    }
  }

  if (!spec.elements.some((element) => element.role === 'primary')) {
    throw new Error('Ad spec must include a primary element.');
  }
  if (!spec.elements.some((element) => element.role === 'hero')) {
    throw new Error('Ad spec must include a hero element.');
  }
  if (!spec.elements.some((element) => element.role === 'action')) {
    throw new Error('Ad spec must include an action element.');
  }
}

function validateSurface(surface: SurfaceProfile): void {
  if (surface.width <= 0 || surface.height <= 0) {
    throw new Error(`Surface ${surface.id} must have positive dimensions.`);
  }

  const safeRect = safeRectFor(surface);
  if (safeRect.width <= 0 || safeRect.height <= 0) {
    throw new Error(`Surface ${surface.id} safe area consumes the entire surface.`);
  }

  if (surface.touchOnly && surface.minTapTarget <= 0) {
    throw new Error(`Touch surface ${surface.id} requires a positive minTapTarget.`);
  }

  if (surface.viewingDistance === 'far' && surface.minTextSize <= 0) {
    throw new Error(`Far-viewing surface ${surface.id} requires a positive minTextSize.`);
  }
}

function createWorkItem(
  element: AdElement,
  zone: Rect,
  surface: SurfaceProfile,
): WorkItem {
  const sizeScale = clamp(Math.pow(Math.min(zone.width / 360, zone.height / 280), 0.2), 0.78, 1.45);
  const hardTextMin = surfaceMinTextSize(surface);

  if (element.type === 'text') {
    const minFontSize = Math.max(element.sizing.minFontSize, hardTextMin);
    const maxFontSize = Math.max(element.sizing.maxFontSize, minFontSize);
    const fontSize = clamp(
      element.sizing.preferredFontSize * sizeScale,
      minFontSize,
      maxFontSize,
    );
    const lines = element.sizing.preferredLines;

    return {
      element,
      height: fontSize * element.sizing.lineHeight * lines,
      minHeight: minFontSize * element.sizing.lineHeight * element.sizing.minLines,
      fontSize,
      minFontSize,
      maxLines: lines,
      minLines: element.sizing.minLines,
      degradation: 'none',
      hidden: false,
    };
  }

  if (element.type === 'button') {
    const minHeight = Math.max(element.sizing.minHeight, surfaceMinTapTarget(surface));
    const maxHeight = Math.max(element.sizing.maxHeight, minHeight);
    const minFontSize = Math.max(element.sizing.minFontSize, hardTextMin);
    const maxFontSize = Math.max(element.sizing.maxFontSize, minFontSize);

    return {
      element,
      height: clamp(element.sizing.preferredHeight * sizeScale, minHeight, maxHeight),
      minHeight,
      fontSize: clamp(
        element.sizing.preferredFontSize * sizeScale,
        minFontSize,
        maxFontSize,
      ),
      minFontSize,
      degradation: 'none',
      hidden: false,
    };
  }

  return {
    element,
    height: clamp(
      element.sizing.preferredHeight * sizeScale,
      element.sizing.minHeight,
      element.sizing.maxHeight,
    ),
    minHeight: element.sizing.minHeight,
    degradation: 'none',
    hidden: false,
  };
}

function visibleItems(items: WorkItem[]): WorkItem[] {
  return items.filter((item) => !item.hidden);
}

function stackHeight(items: WorkItem[], gap: number): number {
  const visible = visibleItems(items);
  if (visible.length === 0) return 0;
  return visible.reduce((sum, item) => sum + item.height, 0) + gap * (visible.length - 1);
}

function setDegradation(
  item: WorkItem,
  next: ResolvedElement['degradation'],
): void {
  const rank: Record<ResolvedElement['degradation'], number> = {
    none: 0,
    shrunk: 1,
    truncated: 2,
    hidden: 3,
  };

  if (rank[next] > rank[item.degradation]) {
    item.degradation = next;
  }
}

function shrinkItem(
  item: WorkItem,
  diagnostics: ResolutionDiagnostic[],
): void {
  if (item.hidden || item.height <= item.minHeight + EPSILON) return;

  item.height = item.minHeight;
  if (item.fontSize !== undefined && item.minFontSize !== undefined) {
    item.fontSize = item.minFontSize;
  }
  setDegradation(item, 'shrunk');
  diagnostics.push({
    level: 'info',
    code: 'ELEMENT_SHRUNK',
    elementId: item.element.id,
    message: `${item.element.label} shrank to its minimum allowed size before higher-priority content was compromised.`,
  });
}

function truncateItem(
  item: WorkItem,
  diagnostics: ResolutionDiagnostic[],
): void {
  if (
    item.hidden ||
    item.element.type !== 'text' ||
    !item.element.allowTruncate ||
    item.maxLines === undefined ||
    item.minLines === undefined ||
    item.maxLines <= item.minLines
  ) {
    return;
  }

  item.maxLines = item.minLines;
  const fontSize = item.fontSize ?? item.element.sizing.minFontSize;
  item.height = fontSize * item.element.sizing.lineHeight * item.maxLines;
  setDegradation(item, 'truncated');
  diagnostics.push({
    level: 'warning',
    code: 'TEXT_TRUNCATED',
    elementId: item.element.id,
    message: `${item.element.label} was truncated to ${item.maxLines} line(s) to satisfy the surface bounds.`,
  });
}

function hideItem(
  item: WorkItem,
  diagnostics: ResolutionDiagnostic[],
): void {
  if (item.hidden || !item.element.allowHide) return;

  item.hidden = true;
  item.height = 0;
  setDegradation(item, 'hidden');
  diagnostics.push({
    level: 'warning',
    code: 'ELEMENT_HIDDEN',
    elementId: item.element.id,
    message: `${item.element.label} was removed because lower-priority content degrades before higher-priority content.`,
  });
}

function fitStack(
  items: WorkItem[],
  zone: Rect,
  initialGap: number,
  diagnostics: ResolutionDiagnostic[],
): { gap: number; valid: boolean } {
  let gap = initialGap;

  for (let priority = 5; priority >= 1 && stackHeight(items, gap) > zone.height; priority -= 1) {
    const samePriority = items.filter((item) => item.element.priority === priority);

    for (const item of samePriority) {
      shrinkItem(item, diagnostics);
      if (stackHeight(items, gap) <= zone.height) return { gap, valid: true };
    }

    for (const item of samePriority) {
      truncateItem(item, diagnostics);
      if (stackHeight(items, gap) <= zone.height) return { gap, valid: true };
    }

    for (const item of samePriority) {
      hideItem(item, diagnostics);
      if (stackHeight(items, gap) <= zone.height) return { gap, valid: true };
    }
  }

  if (stackHeight(items, gap) > zone.height && gap > 4) {
    gap = 4;
  }

  if (stackHeight(items, gap) <= zone.height) {
    return { gap, valid: true };
  }

  // The hard constraints are mathematically impossible in this zone. We keep
  // geometry safe by dropping the least-important remaining item, but mark the
  // layout invalid instead of silently violating a tap-target/text-size rule.
  const remaining = visibleItems(items).sort(
    (a, b) => b.element.priority - a.element.priority,
  );
  for (const item of remaining) {
    if (stackHeight(items, gap) <= zone.height) break;
    item.hidden = true;
    item.height = 0;
    setDegradation(item, 'hidden');
    diagnostics.push({
      level: 'error',
      code: 'HARD_CONSTRAINT_UNSATISFIED',
      elementId: item.element.id,
      message: `${item.element.label} had to be removed because the surface is too small to satisfy all non-negotiable minimum constraints.`,
    });
  }

  return { gap, valid: stackHeight(items, gap) <= zone.height };
}

function widthForItem(item: WorkItem, zone: Rect): number {
  if (item.element.type === 'button') {
    return clamp(zone.width * 0.74, Math.min(120, zone.width), zone.width);
  }

  if (item.element.type === 'image' && item.element.role === 'branding') {
    return clamp(zone.width * 0.42, Math.min(84, zone.width), zone.width);
  }

  return zone.width;
}

function packStack(
  elements: AdElement[],
  zone: Rect,
  surface: SurfaceProfile,
  diagnostics: ResolutionDiagnostic[],
  options: PackOptions,
): { elements: ResolvedElement[]; valid: boolean } {
  if (elements.length === 0) return { elements: [], valid: true };

  const items = elements.map((element) => createWorkItem(element, zone, surface));
  const initialGap = clamp(Math.min(zone.width, zone.height) * 0.04, 8, 22);
  const fitted = fitStack(items, zone, initialGap, diagnostics);
  const totalHeight = stackHeight(items, fitted.gap);
  let y = options.justify === 'center' ? zone.y + Math.max(0, (zone.height - totalHeight) / 2) : zone.y;

  const resolved: ResolvedElement[] = [];
  const visible = visibleItems(items);

  for (const item of items) {
    if (item.hidden) {
      resolved.push({
        id: item.element.id,
        type: item.element.type,
        role: item.element.role,
        priority: item.element.priority,
        rect: { x: zone.x, y: zone.y, width: 0, height: 0 },
        hidden: true,
        degradation: item.degradation,
        ...(item.fontSize !== undefined ? { fontSize: round(item.fontSize) } : {}),
        ...(item.maxLines !== undefined ? { maxLines: item.maxLines } : {}),
      });
      continue;
    }

    const width = widthForItem(item, zone);
    const x = options.align === 'center' ? zone.x + (zone.width - width) / 2 : zone.x;

    resolved.push({
      id: item.element.id,
      type: item.element.type,
      role: item.element.role,
      priority: item.element.priority,
      rect: {
        x: round(x),
        y: round(y),
        width: round(width),
        height: round(item.height),
      },
      hidden: false,
      degradation: item.degradation,
      ...(item.fontSize !== undefined ? { fontSize: round(item.fontSize) } : {}),
      ...(item.maxLines !== undefined ? { maxLines: item.maxLines } : {}),
    });

    y += item.height;
    const isLastVisible = item === visible[visible.length - 1];
    if (!isLastVisible) y += fitted.gap;
  }

  return { elements: resolved, valid: fitted.valid };
}

function placeHero(
  hero: AdElement | undefined,
  zone: Rect,
  diagnostics: ResolutionDiagnostic[],
): { element?: ResolvedElement; valid: boolean } {
  if (!hero) return { valid: false };

  let valid = true;
  if (hero.type === 'image' && zone.height + EPSILON < hero.sizing.minHeight) {
    valid = false;
    diagnostics.push({
      level: 'error',
      code: 'HARD_CONSTRAINT_UNSATISFIED',
      elementId: hero.id,
      message: `${hero.label} received ${round(zone.height)}px height, below its ${hero.sizing.minHeight}px minimum.`,
    });
  }

  return {
    valid,
    element: {
      id: hero.id,
      type: hero.type,
      role: hero.role,
      priority: hero.priority,
      rect: {
        x: round(zone.x),
        y: round(zone.y),
        width: round(zone.width),
        height: round(zone.height),
      },
      hidden: false,
      degradation: 'none',
    },
  };
}

function insetRect(rect: Rect, inset: number): Rect {
  const safeInset = Math.min(inset, rect.width / 4, rect.height / 4);
  return {
    x: rect.x + safeInset,
    y: rect.y + safeInset,
    width: Math.max(0, rect.width - safeInset * 2),
    height: Math.max(0, rect.height - safeInset * 2),
  };
}

function deriveZones(
  safeRect: Rect,
  composition: CompositionMode,
): Record<string, Rect> {
  const outerGap = clamp(Math.min(safeRect.width, safeRect.height) * 0.035, 10, 28);

  if (composition === 'poster') {
    const heroHeight = safeRect.height * 0.47;
    return {
      hero: insetRect(
        { x: safeRect.x, y: safeRect.y, width: safeRect.width, height: heroHeight },
        outerGap * 0.35,
      ),
      content: {
        x: safeRect.x,
        y: safeRect.y + heroHeight + outerGap,
        width: safeRect.width,
        height: safeRect.height - heroHeight - outerGap,
      },
    };
  }

  if (composition === 'tile') {
    const heroHeight = safeRect.height * 0.56;
    const bodyY = safeRect.y + heroHeight + outerGap;
    const bodyHeight = safeRect.height - heroHeight - outerGap;
    const sideWidth = Math.max(160, safeRect.width * 0.3);
    const mainWidth = safeRect.width - sideWidth - outerGap;

    return {
      hero: insetRect(
        { x: safeRect.x, y: safeRect.y, width: safeRect.width, height: heroHeight },
        outerGap * 0.4,
      ),
      main: {
        x: safeRect.x,
        y: bodyY,
        width: mainWidth,
        height: bodyHeight,
      },
      side: {
        x: safeRect.x + mainWidth + outerGap,
        y: bodyY,
        width: sideWidth,
        height: bodyHeight,
      },
    };
  }

  if (composition === 'split') {
    const heroWidth = safeRect.width * 0.43;
    return {
      hero: insetRect(
        { x: safeRect.x, y: safeRect.y, width: heroWidth, height: safeRect.height },
        outerGap * 0.45,
      ),
      content: {
        x: safeRect.x + heroWidth + outerGap,
        y: safeRect.y,
        width: safeRect.width - heroWidth - outerGap,
        height: safeRect.height,
      },
    };
  }

  const heroWidth = safeRect.width * 0.23;
  const actionWidth = safeRect.width * 0.22;
  const mainX = safeRect.x + heroWidth + outerGap;
  const mainWidth = safeRect.width - heroWidth - actionWidth - outerGap * 2;

  return {
    hero: insetRect(
      { x: safeRect.x, y: safeRect.y, width: heroWidth, height: safeRect.height },
      outerGap * 0.3,
    ),
    main: {
      x: mainX,
      y: safeRect.y,
      width: mainWidth,
      height: safeRect.height,
    },
    side: {
      x: mainX + mainWidth + outerGap,
      y: safeRect.y,
      width: actionWidth,
      height: safeRect.height,
    },
  };
}

function roleRank(element: AdElement): number {
  const ranks: Record<AdElement['role'], number> = {
    primary: 1,
    supporting: 2,
    secondary: 3,
    action: 4,
    branding: 5,
    hero: 6,
  };
  return ranks[element.role];
}

function ordered(elements: AdElement[]): AdElement[] {
  return [...elements].sort((a, b) => roleRank(a) - roleRank(b));
}

function rectWithin(inner: Rect, outer: Rect): boolean {
  return (
    inner.x + EPSILON >= outer.x &&
    inner.y + EPSILON >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON
  );
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x + EPSILON ||
    b.x + b.width <= a.x + EPSILON ||
    a.y + a.height <= b.y + EPSILON ||
    b.y + b.height <= a.y + EPSILON
  );
}

function validateResolvedGeometry(
  elements: ResolvedElement[],
  safeRect: Rect,
  surface: SurfaceProfile,
  diagnostics: ResolutionDiagnostic[],
): boolean {
  let valid = true;
  const visible = elements.filter((element) => !element.hidden);

  for (const element of visible) {
    if (!rectWithin(element.rect, safeRect)) {
      valid = false;
      diagnostics.push({
        level: 'error',
        code: 'VALIDATION',
        elementId: element.id,
        message: `${element.id} is outside the safe area.`,
      });
    }

    if (element.type === 'button' && surface.touchOnly && element.rect.height + EPSILON < surface.minTapTarget) {
      valid = false;
      diagnostics.push({
        level: 'error',
        code: 'VALIDATION',
        elementId: element.id,
        message: `${element.id} violates the ${surface.minTapTarget}px minimum tap target.`,
      });
    }

    if (
      element.fontSize !== undefined &&
      surface.viewingDistance === 'far' &&
      element.fontSize + EPSILON < surface.minTextSize
    ) {
      valid = false;
      diagnostics.push({
        level: 'error',
        code: 'VALIDATION',
        elementId: element.id,
        message: `${element.id} violates the ${surface.minTextSize}px far-viewing minimum text size.`,
      });
    }
  }

  for (let i = 0; i < visible.length; i += 1) {
    const a = visible[i];
    if (!a) continue;
    for (let j = i + 1; j < visible.length; j += 1) {
      const b = visible[j];
      if (!b) continue;
      if (overlaps(a.rect, b.rect)) {
        valid = false;
        diagnostics.push({
          level: 'error',
          code: 'VALIDATION',
          message: `${a.id} overlaps ${b.id}.`,
        });
      }
    }
  }

  return valid;
}

export function resolveLayout(spec: AdSpec, surface: SurfaceProfile): ResolvedLayout {
  validateSpec(spec);
  validateSurface(surface);

  const diagnostics: ResolutionDiagnostic[] = [];
  const safeRect = safeRectFor(surface);
  const composition = selectComposition(surface);
  diagnostics.push({
    level: 'info',
    code: 'COMPOSITION_SELECTED',
    message: `${composition} composition selected from the safe-area aspect ratio (${round(safeRect.width / safeRect.height)}), not from a surface-name lookup.`,
  });

  const zones = deriveZones(safeRect, composition);
  const hero = spec.elements.find((element) => element.role === 'hero');
  const nonHero = ordered(spec.elements.filter((element) => element.role !== 'hero'));
  const resolved: ResolvedElement[] = [];
  let valid = true;

  const heroPlacement = placeHero(hero, zones.hero ?? safeRect, diagnostics);
  valid = valid && heroPlacement.valid;
  if (heroPlacement.element) resolved.push(heroPlacement.element);

  if (composition === 'poster' || composition === 'split') {
    const packed = packStack(
      nonHero,
      zones.content ?? safeRect,
      surface,
      diagnostics,
      {
        align: composition === 'poster' ? 'center' : 'left',
        justify: composition === 'poster' ? 'start' : 'center',
      },
    );
    resolved.push(...packed.elements);
    valid = valid && packed.valid;
  } else {
    const main = nonHero.filter((element) =>
      ['primary', 'supporting', 'secondary'].includes(element.role),
    );
    const side = nonHero.filter((element) =>
      ['action', 'branding'].includes(element.role),
    );

    const mainPacked = packStack(
      main,
      zones.main ?? safeRect,
      surface,
      diagnostics,
      { align: 'left', justify: 'center' },
    );
    const sidePacked = packStack(
      side,
      zones.side ?? safeRect,
      surface,
      diagnostics,
      { align: 'center', justify: 'center' },
    );

    resolved.push(...mainPacked.elements, ...sidePacked.elements);
    valid = valid && mainPacked.valid && sidePacked.valid;
  }

  const byId = new Map(resolved.map((element) => [element.id, element]));
  const orderedResolved = spec.elements.map((element) => {
    const match = byId.get(element.id);
    if (match) return match;

    return {
      id: element.id,
      type: element.type,
      role: element.role,
      priority: element.priority,
      rect: { x: safeRect.x, y: safeRect.y, width: 0, height: 0 },
      hidden: true,
      degradation: 'hidden' as const,
    };
  });

  valid = validateResolvedGeometry(orderedResolved, safeRect, surface, diagnostics) && valid;

  return {
    surface,
    safeRect,
    composition,
    elements: orderedResolved,
    diagnostics,
    valid,
  };
}
