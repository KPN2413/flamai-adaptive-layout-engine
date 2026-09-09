import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AdElement, AdSpec, ResolvedElement, ResolvedLayout } from './types';

interface SurfacePreviewProps {
  spec: AdSpec;
  layout: ResolvedLayout;
  showDebug: boolean;
}

function elementStyle(element: ResolvedElement): CSSProperties {
  return {
    position: 'absolute',
    left: element.rect.x,
    top: element.rect.y,
    width: element.rect.width,
    height: element.rect.height,
    fontSize: element.fontSize,
  };
}

function sourceFor(spec: AdSpec, id: string): AdElement {
  const source = spec.elements.find((element) => element.id === id);
  if (!source) throw new Error(`Renderer could not find source element: ${id}`);
  return source;
}

function ResolvedNode({
  resolved,
  source,
  spec,
  showDebug,
}: {
  resolved: ResolvedElement;
  source: AdElement;
  spec: AdSpec;
  showDebug: boolean;
}) {
  if (resolved.hidden) return null;

  const style = elementStyle(resolved);
  const debugClass = showDebug ? 'ad-node--debug' : '';

  if (source.type === 'text') {
    return (
      <div
        className={`ad-node ad-text ad-text--${source.role} ${debugClass}`}
        style={{
          ...style,
          color: source.role === 'supporting' ? spec.theme.mutedText : spec.theme.text,
          fontWeight: source.weight ?? 600,
          lineHeight: source.sizing.lineHeight,
          WebkitLineClamp: resolved.maxLines ?? source.sizing.preferredLines,
        }}
        data-element-id={source.id}
        title={source.text}
      >
        {source.text}
      </div>
    );
  }

  if (source.type === 'button') {
    return (
      <button
        className={`ad-node ad-button ${debugClass}`}
        style={{
          ...style,
          background: spec.theme.accent,
          color: spec.theme.accentText,
          borderColor: spec.theme.accent,
          fontWeight: 700,
        }}
        type="button"
        aria-label={source.text}
        data-element-id={source.id}
      >
        {source.text}
      </button>
    );
  }

  return (
    <div
      className={`ad-node ad-image-shell ad-image-shell--${source.role} ${debugClass}`}
      style={style}
      data-element-id={source.id}
    >
      <img
        src={source.src}
        alt={source.alt}
        draggable={false}
        style={{ objectFit: source.objectFit }}
      />
    </div>
  );
}

export function SurfacePreview({ spec, layout, showDebug }: SurfacePreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      const bounds = viewport.getBoundingClientRect();
      const horizontalPadding = 28;
      const verticalPadding = 28;
      const nextScale = Math.min(
        (bounds.width - horizontalPadding) / layout.surface.width,
        (bounds.height - verticalPadding) / layout.surface.height,
      );
      setScale(Math.max(0.08, nextScale));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [layout.surface.height, layout.surface.width]);

  const stageStyle = useMemo<CSSProperties>(
    () => ({
      width: layout.surface.width,
      height: layout.surface.height,
      transform: `translate(-50%, -50%) scale(${scale})`,
      background: spec.theme.background,
      borderColor: spec.theme.border,
    }),
    [layout.surface.height, layout.surface.width, scale, spec.theme.background, spec.theme.border],
  );

  return (
    <div className="preview-viewport" ref={viewportRef}>
      <div className="ad-stage" style={stageStyle}>
        <div className="ad-ambient ad-ambient--one" />
        <div className="ad-ambient ad-ambient--two" />

        {showDebug ? (
          <div
            className="safe-area-overlay"
            style={{
              left: layout.safeRect.x,
              top: layout.safeRect.y,
              width: layout.safeRect.width,
              height: layout.safeRect.height,
            }}
          >
            <span>safe area</span>
          </div>
        ) : null}

        {layout.elements.map((resolved) => (
          <ResolvedNode
            key={resolved.id}
            resolved={resolved}
            source={sourceFor(spec, resolved.id)}
            spec={spec}
            showDebug={showDebug}
          />
        ))}
      </div>
    </div>
  );
}
