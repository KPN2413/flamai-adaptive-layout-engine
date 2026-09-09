# Interview Guide

Use this to understand the project before submitting. Do not memorise wording without understanding the code.

## 30-second explanation

This project takes one declarative ad specification and a surface profile as input. The TypeScript resolver first computes the usable safe rectangle, selects a generic composition based on aspect ratio, creates non-overlapping semantic zones, and tries to fit elements at preferred sizes. If space is insufficient, it degrades lower-priority elements first by shrinking, truncating, and finally hiding them when allowed. A final validation pass checks bounds, overlap, tap targets, and minimum text size. React only renders the already-resolved rectangles.

## The most important file

`src/resolver.ts`

Be able to explain these functions:

1. `selectComposition()`
2. `createWorkItem()`
3. `fitStack()`
4. `packStack()`
5. `deriveZones()`
6. `validateResolvedGeometry()`
7. `resolveLayout()`

## Why this is not hardcoded per surface

There is no code such as:

```ts
if (surface.id === 'mobile-portrait') { ... }
```

The resolver only uses:

- width
- height
- safe area
- touch constraint
- viewing-distance constraint
- element roles/priorities

The predefined surface names live in `surfaces.ts`, outside the algorithm.

## Why four composition modes are allowed

The assignment permits a rule-based cascade. The composition is selected from the safe-area aspect ratio, so an unknown fifth surface follows the same algorithm automatically.

```text
narrow → poster
square-ish → tile
landscape → split
ultra-wide → strip
```

## Priority explanation

Smaller number means higher importance.

- Priority 1: headline, hero
- Priority 2: price, CTA
- Priority 3: supporting copy
- Priority 4: logo

When space is insufficient, priority 4 is degraded before priority 3, then priority 2, then priority 1.

For each priority level:

```text
shrink → truncate (text only) → hide (only if allowed)
```

This is why the constrained mobile-landscape layout removes branding while keeping the headline and CTA.

## Hard vs soft constraints

Hard constraints:

- safe area
- minimum tap target
- far-view minimum text size
- valid dimensions/types

Soft constraints:

- preferred font size
- preferred height
- preferred line count
- optional visibility
- normal gap size

The solver may relax soft constraints but should not silently violate hard ones.

## What happens if the surface is impossible?

The resolver records `HARD_CONSTRAINT_UNSATISFIED`. It does not silently make a 48px tap target become 20px just to make the preview look valid.

## Why there is a final overlap check if zones already prevent overlap

The zones and stack algorithm are the main prevention mechanism. The final pairwise check is defensive validation so a future change cannot accidentally introduce overlap without being detected.

## TypeScript points to explain

### Discriminated element union

`AdElement` can be text, image, or button. Checking `element.type` narrows to the correct properties.

### Closed role union

An invalid role such as `role: 'random'` fails TypeScript compilation.

### Conditional surface constraints

A surface with `touchOnly: true` must include `minTapTarget`.

A surface with `viewingDistance: 'far'` must include `minTextSize`.

### Resolved output

The renderer receives exact geometry and does not decide layout:

```text
id, role, priority, x, y, width, height, hidden, fontSize, maxLines
```

## Likely interview questions

### “Add a new surface right now.”

Create a `SurfaceProfile` object with dimensions and constraints, pass it to `resolveLayout(adSpec, newSurface)`, and render the returned layout. No resolver branch is added.

### “Why not CSS media queries?”

Media queries can make a responsive page, but the assignment requires a layout engine. Here TypeScript decides composition, geometry, degradation, and hard-constraint compliance. CSS only paints the result. The demo dashboard itself uses normal CSS media queries for its own responsive chrome; the ad engine does not.

### “Why not use a linear programming solver?”

The assignment says a well-reasoned priority-ordered algorithm is enough. A smaller deterministic solver is easier to verify and explain for this element set.

### “What is the time complexity?”

Normal resolution work is effectively O(n). The defensive pairwise overlap validation is O(n²). Ad specs contain only a small number of elements, so this is acceptable.

### “How would you add Canvas?”

Create a Canvas renderer that reads the same `ResolvedLayout`. The resolver does not change.

### “How would you improve text handling?”

Add a measurement adapter that gets actual text dimensions from the browser, then feed measured intrinsic sizes into the framework-independent resolver.

## Demo order

1. Start with mobile portrait.
2. Switch to mobile landscape and point out logo degradation in the trace.
3. Switch to broadcast and point out the far-view minimum text size.
4. Switch to square kiosk and point out the 60px CTA minimum.
5. Select Custom / unseen and type a new width/height live.
6. Show the resolved-layout table and safe-area boxes.
7. Open `resolver.ts` and explain the seven functions listed at the top of this guide.
