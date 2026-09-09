import { useMemo, useState } from 'react';
import { SurfacePreview } from './render-dom';
import { resolveLayout } from './resolver';
import { adSpec } from './spec';
import { surfaces, type SurfaceKey } from './surfaces';
import type { SurfaceProfile } from './types';

const surfaceEntries = Object.entries(surfaces) as [SurfaceKey, SurfaceProfile][];

type Selection = SurfaceKey | 'custom';

function makeCustomSurface(width: number, height: number, touchOnly: boolean): SurfaceProfile {
  const inset = Math.max(8, Math.round(Math.min(width, height) * 0.04));

  if (touchOnly) {
    return {
      id: 'custom-surface',
      label: 'Custom / unseen surface',
      width,
      height,
      safeArea: { top: inset, right: inset, bottom: inset, left: inset },
      touchOnly: true,
      minTapTarget: 48,
      viewingDistance: 'near',
    };
  }

  return {
    id: 'custom-surface',
    label: 'Custom / unseen surface',
    width,
    height,
    safeArea: { top: inset, right: inset, bottom: inset, left: inset },
    touchOnly: false,
    viewingDistance: 'near',
  };
}

function formatRect(x: number, y: number, width: number, height: number): string {
  return `${Math.round(x)}, ${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}`;
}

export default function App() {
  const [selection, setSelection] = useState<Selection>('mobilePortrait');
  const [customWidth, setCustomWidth] = useState(820);
  const [customHeight, setCustomHeight] = useState(460);
  const [customTouch, setCustomTouch] = useState(true);
  const [showDebug, setShowDebug] = useState(true);

  const customSurface = useMemo(
    () => makeCustomSurface(customWidth, customHeight, customTouch),
    [customHeight, customTouch, customWidth],
  );

  const surface = selection === 'custom' ? customSurface : surfaces[selection];
  const layout = useMemo(() => resolveLayout(adSpec, surface), [surface]);
  const visibleCount = layout.elements.filter((element) => !element.hidden).length;
  const degradedCount = layout.elements.filter(
    (element) => element.degradation !== 'none',
  ).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">FlamAI Frontend R&amp;D assignment</div>
          <h1>Adaptive Layout Engine</h1>
          <p>
            One declarative ad spec, resolved by a framework-agnostic TypeScript constraint engine.
          </p>
        </div>
        <div className={`status-pill ${layout.valid ? 'status-pill--ok' : 'status-pill--error'}`}>
          <span className="status-dot" />
          {layout.valid ? 'Valid layout' : 'Constraint conflict'}
        </div>
      </header>

      <main className="workspace">
        <aside className="control-panel">
          <section className="panel-block">
            <div className="section-heading">
              <span>Surface profiles</span>
              <span className="micro-label">same spec</span>
            </div>
            <div className="surface-list">
              {surfaceEntries.map(([key, profile]) => (
                <button
                  key={key}
                  type="button"
                  className={`surface-option ${selection === key ? 'surface-option--active' : ''}`}
                  onClick={() => setSelection(key)}
                >
                  <span>{profile.label}</span>
                  <small>
                    {profile.width} × {profile.height}
                  </small>
                </button>
              ))}
              <button
                type="button"
                className={`surface-option ${selection === 'custom' ? 'surface-option--active' : ''}`}
                onClick={() => setSelection('custom')}
              >
                <span>Custom / unseen</span>
                <small>
                  {customWidth} × {customHeight}
                </small>
              </button>
            </div>
          </section>

          <section className="panel-block">
            <div className="section-heading">Custom surface</div>
            <div className="field-grid">
              <label>
                <span>Width</span>
                <input
                  type="number"
                  min="220"
                  max="2560"
                  value={customWidth}
                  onChange={(event) => setCustomWidth(Number(event.target.value) || 220)}
                  onFocus={() => setSelection('custom')}
                />
              </label>
              <label>
                <span>Height</span>
                <input
                  type="number"
                  min="180"
                  max="1800"
                  value={customHeight}
                  onChange={(event) => setCustomHeight(Number(event.target.value) || 180)}
                  onFocus={() => setSelection('custom')}
                />
              </label>
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={customTouch}
                onChange={(event) => {
                  setCustomTouch(event.target.checked);
                  setSelection('custom');
                }}
              />
              <span>Touch-only surface (48px tap target)</span>
            </label>
          </section>

          <section className="panel-block">
            <div className="section-heading">Resolver inputs</div>
            <dl className="metric-list">
              <div>
                <dt>Safe area</dt>
                <dd>
                  {surface.safeArea.top}/{surface.safeArea.right}/{surface.safeArea.bottom}/{surface.safeArea.left}px
                </dd>
              </div>
              <div>
                <dt>Viewing</dt>
                <dd>{surface.viewingDistance ?? 'near'}</dd>
              </div>
              <div>
                <dt>Tap target</dt>
                <dd>{surface.touchOnly ? `${surface.minTapTarget}px` : 'N/A'}</dd>
              </div>
              <div>
                <dt>Min text</dt>
                <dd>{surface.viewingDistance === 'far' ? `${surface.minTextSize}px` : 'spec-defined'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel-block">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showDebug}
                onChange={(event) => setShowDebug(event.target.checked)}
              />
              <span>Show safe area and resolved boxes</span>
            </label>
          </section>
        </aside>

        <section className="main-panel">
          <div className="preview-card">
            <div className="preview-header">
              <div>
                <div className="eyebrow">Live resolved output</div>
                <h2>{surface.label}</h2>
              </div>
              <div className="preview-stats">
                <span>{layout.composition}</span>
                <span>{visibleCount}/{layout.elements.length} visible</span>
                <span>{degradedCount} degraded</span>
              </div>
            </div>
            <SurfacePreview spec={adSpec} layout={layout} showDebug={showDebug} />
          </div>

          <div className="detail-grid">
            <section className="detail-card">
              <div className="section-heading">
                <span>Resolution trace</span>
                <span className="micro-label">priority-aware</span>
              </div>
              <div className="trace-list">
                {layout.diagnostics.map((diagnostic, index) => (
                  <div className={`trace-item trace-item--${diagnostic.level}`} key={`${diagnostic.code}-${index}`}>
                    <span className="trace-index">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{diagnostic.code.replaceAll('_', ' ')}</strong>
                      <p>{diagnostic.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-card">
              <div className="section-heading">
                <span>Resolved layout</span>
                <span className="micro-label">renderer-ready</span>
              </div>
              <div className="resolved-table-wrap">
                <table className="resolved-table">
                  <thead>
                    <tr>
                      <th>Element</th>
                      <th>P</th>
                      <th>State</th>
                      <th>Rect x,y · w×h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layout.elements.map((element) => (
                      <tr key={element.id}>
                        <td>
                          <strong>{element.id}</strong>
                          <small>{element.role}</small>
                        </td>
                        <td>{element.priority}</td>
                        <td>
                          <span className={`state-tag state-tag--${element.degradation}`}>
                            {element.hidden ? 'hidden' : element.degradation}
                          </span>
                        </td>
                        <td className="mono">
                          {element.hidden
                            ? '—'
                            : formatRect(
                                element.rect.x,
                                element.rect.y,
                                element.rect.width,
                                element.rect.height,
                              )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="architecture-strip">
            <div>
              <span>01</span>
              <strong>Ad spec</strong>
              <small>content + intent</small>
            </div>
            <i>→</i>
            <div>
              <span>02</span>
              <strong>Resolver</strong>
              <small>constraints + priority</small>
            </div>
            <i>→</i>
            <div>
              <span>03</span>
              <strong>Resolved layout</strong>
              <small>typed rectangles</small>
            </div>
            <i>→</i>
            <div>
              <span>04</span>
              <strong>DOM renderer</strong>
              <small>no layout decisions</small>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
