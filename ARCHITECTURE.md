# Architecture

## Goal

Resolve one surface-independent advertising specification into valid, renderer-ready geometry across very different surfaces while preserving hard constraints and predictable priority-based degradation.

## Design principles

1. **Single source of truth:** content and layout intent live in `spec.ts`.
2. **No surface-name branching:** the resolver sees geometry and constraints, not a list of named layout templates.
3. **Hard constraints stay hard:** safe area, touch target, and far-viewing text minimums are never silently broken.
4. **Lower-priority content degrades first.**
5. **Resolver is framework-agnostic:** `resolver.ts` imports no React or DOM APIs.
6. **Renderer is decision-free:** it consumes resolved rectangles.
7. **Diagnostics are first-class:** every degradation is explainable in the UI.

## Data flow

```text
┌────────────────────┐     ┌─────────────────────┐
│ Declarative AdSpec │     │  SurfaceProfile     │
│ content + intent   │     │ geometry + hard     │
│ priorities         │     │ constraints         │
└─────────┬──────────┘     └──────────┬──────────┘
          │                           │
          └──────────────┬────────────┘
                         ▼
              ┌────────────────────┐
              │ Constraint Resolver│
              │                    │
              │ 1. validate        │
              │ 2. safe rect       │
              │ 3. composition     │
              │ 4. size intents    │
              │ 5. pack            │
              │ 6. degrade         │
              │ 7. validate output │
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │  ResolvedLayout    │
              │ typed rectangles   │
              │ visibility         │
              │ font sizes/lines   │
              │ diagnostics        │
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │    DOM Renderer    │
              │ absolute rendering │
              │ no layout choices  │
              └────────────────────┘
```

## Module responsibilities

### `src/types.ts`

Defines the public data model.

Key decisions:

- `ElementRole` is a closed union.
- `AdElement` is a discriminated union by `type`.
- `SurfaceProfile` combines two constraint unions:
  - touch surface ⇒ `minTapTarget` required
  - far viewing ⇒ `minTextSize` required
- `ResolvedLayout` is complete enough for any renderer.

### `src/spec.ts`

Contains one ad definition. It does not know any surface dimensions or names.

Each element declares:

- semantic role
- numeric priority
- content
- sizing intent
- whether hiding/truncation is allowed

### `src/surfaces.ts`

Contains surface data only:

- dimensions
- safe-area insets
- interaction constraint
- viewing-distance constraint

A fifth profile can be added here without changing `resolver.ts`.

### `src/resolver.ts`

Owns the constraint-resolution algorithm.

It never imports React, CSS, browser measurement APIs, or the predefined surfaces map.

### `src/render-dom.tsx`

Converts each `ResolvedElement.rect` into absolute DOM positioning. It handles visual styling but does not decide geometry.

### `src/App.tsx`

Demo tooling only:

- surface picker
- custom/unseen surface editor
- diagnostics
- resolved-geometry table
- debug overlays

## Composition selection

A surface's safe-area aspect ratio determines a composition family:

```text
portrait/narrow          square-ish          landscape           ultra-wide
     poster                 tile                split               strip
<--------------|----------------|--------------------|------------------>
              0.82             1.35                 3.0
```

This is intentionally based on geometry rather than surface IDs.

## Why composition zones prevent overlap

Each composition divides the safe rectangle into non-overlapping zones. The hero, main content, and action/branding stacks occupy different zones. Within any one zone, elements are packed sequentially along the vertical axis.

Therefore overlap can only happen if either:

- zone derivation is wrong, or
- stack packing is wrong.

The final validation pass catches both cases, and automated tests verify the standard surfaces.

## Degradation state machine

For each priority level from lowest importance to highest importance:

```text
preferred
   │
   ├── insufficient space
   ▼
 shrink to minimum
   │
   ├── still insufficient
   ▼
 truncate text (if allowed)
   │
   ├── still insufficient
   ▼
 hide (if allowed)
```

Then the resolver moves to the next more-important priority level only if required.

This is deterministic: the same spec + same surface always produces the same layout.

## Hard vs soft constraints

### Hard

- safe-area bounds
- minimum tap target for touch buttons
- minimum text size for far viewing
- positive surface dimensions
- type-valid spec/surface structure

### Soft

- preferred font size
- preferred image/button height
- preferred line count
- optional visibility
- standard stack gap

Soft constraints may degrade. Hard constraints must not silently degrade.

## Failure model

For a realistic standard profile the layout should be valid.

For an impossibly small custom surface, the resolver:

1. exhausts normal degradation,
2. refuses to silently shrink below hard minimums,
3. may remove least-important remaining content to keep geometry safe,
4. reports `HARD_CONSTRAINT_UNSATISFIED`,
5. returns `valid: false` when the remaining requirements still cannot be satisfied.

This makes failure observable instead of producing clipping or hidden CSS overflow bugs.

## Extensibility

### Add a new surface

Create a new `SurfaceProfile`. No resolver change is required.

### Add a Canvas renderer

Read `ResolvedLayout.elements` and draw each rectangle. No resolver change is required.

### Add a new constraint

Example: `broadcastTitleSafe`.

1. Extend `SurfaceProfile` typing.
2. Apply it while deriving the safe rectangle or zones.
3. Add validation/test coverage.
4. Renderer remains unchanged.

### Add browser text measurement

The cleanest extension is a measurement phase:

```text
Spec + Surface → Measurement Adapter → Resolver → Resolved Layout → Renderer
```

The resolver can accept measured intrinsic sizes while remaining independent from the DOM.

## Complexity

Let `n` be the number of ad elements.

- validation: `O(n)`
- sizing: `O(n)`
- priority degradation: bounded priority levels (5), each scanning at most `n` elements ⇒ `O(n)`
- final overlap validation: `O(n²)`

For ad specs with a small number of elements, the quadratic validation step is negligible and improves correctness/debuggability.

## Interview explanation in one sentence

> The engine derives a composition from the available geometry, packs semantic element groups into disjoint zones, then resolves overflow by shrinking, truncating, or hiding lower-priority elements before touching higher-priority content, while validating safe-area, tap-target, text-size, and overlap constraints at the end.
