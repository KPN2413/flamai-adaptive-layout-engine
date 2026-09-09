# Adaptive Layout Engine for Multi-Surface Ads

A framework-agnostic TypeScript layout resolver that takes **one declarative ad specification** and adapts it across very different surfaces without surface-name-specific layout code or CSS media-query layout decisions.

The demo includes:

- Mobile portrait
- Mobile landscape with intentionally constrained height
- Broadcast lower-third
- Square retail kiosk
- A custom/unseen surface editor for interview-style testing

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

Useful commands:

```bash
npm test
npm run build
npm run preview
```

## Demo usage

1. Choose a surface in the left panel.
2. Watch the same ad spec re-resolve into a different composition.
3. Keep **Show safe area and resolved boxes** enabled to inspect geometry.
4. Select **Custom / unseen**, change width and height, and confirm the resolver adapts without code changes.
5. Inspect the **Resolution trace** to see shrinking, truncation, hiding, or hard-constraint conflicts.
6. Inspect the **Resolved layout** table to see renderer-ready rectangles.

## Architecture

```text
Ad Spec + Surface Profile
          │
          ▼
  Constraint Resolver
          │
          ▼
    Resolved Layout
   (typed rectangles)
          │
          ▼
      DOM Renderer
```

The key separation is deliberate:

- `src/spec.ts` defines content and layout intent once.
- `src/surfaces.ts` defines physical/surface constraints.
- `src/resolver.ts` is plain TypeScript and owns all layout decisions.
- `src/render-dom.tsx` only renders already-resolved rectangles.
- `src/App.tsx` is the demo/inspection UI.

A new surface can be added without editing the resolver. A future Canvas renderer can consume the same `ResolvedLayout` without changing the solver.

## Layout algorithm

The resolver is a **priority-ordered rule-based constraint solver**. It is not a lookup table and does not contain checks such as `if (surface.id === "mobile")`.

### Step 1 — Validate the inputs

The resolver checks:

- duplicate element IDs
- valid priority range
- valid min/preferred/max sizing relationships
- positive surface dimensions
- usable safe area
- touch surfaces have a positive minimum tap target
- far-viewing surfaces have a positive minimum text size

TypeScript also prevents unsupported element roles and makes `minTapTarget` mandatory when `touchOnly: true` and `minTextSize` mandatory when `viewingDistance: "far"`.

### Step 2 — Compute the safe rectangle

The visible working rectangle is:

```text
surface bounds - safe-area insets
```

Every resolved element must remain fully inside this rectangle.

### Step 3 — Choose composition from geometry

The solver calculates the **safe-area aspect ratio**, then selects a generic composition family:

```text
ratio < 0.82          → poster
0.82 ≤ ratio < 1.35   → tile
1.35 ≤ ratio < 3.0    → split
ratio ≥ 3.0           → strip
```

These are geometric rules, not surface-name rules. Therefore an unseen surface naturally follows the same code path.

The composition modes create disjoint zones:

- **poster:** hero above content
- **tile:** hero above, then main content + action side zone
- **split:** hero beside a vertical content stack
- **strip:** hero, main content, and action/branding zones horizontally

Because the zones are disjoint, the layout has a strong structural guarantee against overlap before individual elements are even packed.

### Step 4 — Convert element intent into preferred and minimum sizes

For each element the resolver derives a preferred size using:

- the element's typed sizing intent
- available zone size
- surface minimum text size
- surface minimum tap target

Hard surface constraints override softer element preferences. Example: on the broadcast profile, visible text can never be resolved below the broadcast minimum text size.

### Step 5 — Pack a stack and test fit

Elements are placed in semantic order inside a zone. The resolver calculates:

```text
sum(element heights) + gaps
```

If it fits, placement is final.

### Step 6 — Priority-based degradation

If the stack does not fit, degradation is processed from **lowest importance to highest**. In this project, priority `1` is most important and `5` is least important.

For each priority level, the solver attempts:

1. **Shrink** to the minimum allowed size.
2. **Truncate** text to its minimum allowed line count.
3. **Hide** the element only when `allowHide: true`.

Only after exhausting the current lower-priority level does the algorithm touch a higher-priority level.

This means branding/supporting copy degrades before headline/CTA. The constrained mobile-landscape profile demonstrates this behaviour.

### Step 7 — Validate the final geometry

A final validation pass checks:

- every visible rectangle is inside the safe area
- no two visible rectangles overlap
- touch buttons satisfy `minTapTarget`
- far-viewing text satisfies `minTextSize`

If a mathematically impossible custom surface is entered, the engine marks the layout invalid and reports a `HARD_CONSTRAINT_UNSATISFIED` diagnostic rather than silently breaking a hard constraint.

## Priority and degradation policy

The sample spec uses:

| Element | Role | Priority | Can hide? |
| --- | --- | ---: | --- |
| Headline | primary | 1 | No |
| Product image | hero | 1 | No |
| Price | secondary | 2 | No |
| CTA | action | 2 | No |
| Supporting copy | supporting | 3 | Yes |
| Logo | branding | 4 | Yes |

This makes degradation deterministic and explainable in an interview.

## TypeScript design

Important types are in `src/types.ts`:

- discriminated union for `TextElement`, `ImageElement`, and `ButtonElement`
- closed `ElementRole` union so unsupported roles fail compilation
- touch/non-touch surface union
- near/far viewing-distance surface union
- fully typed `ResolvedElement` and `ResolvedLayout`
- `defineAd()` preserves literal element types for the declarative spec

The renderer never needs to infer where an element should go. It receives exact `x`, `y`, `width`, `height`, visibility, font size, and line-limit decisions from the resolver.

## Tests

`src/resolver.test.ts` verifies:

- all required surfaces produce valid layouts
- resolved rectangles remain inside the safe area
- visible rectangles do not overlap
- touch CTA height respects the minimum tap target
- broadcast text respects minimum text size
- constrained mobile landscape degrades lower-priority content
- an unseen interview-style surface resolves without resolver changes

Run:

```bash
npm test
```

## Project structure

```text
adaptive-layout-engine/
├── public/
│   ├── nova-headphones.svg
│   └── nova-logo.svg
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── render-dom.tsx
│   ├── resolver.test.ts
│   ├── resolver.ts
│   ├── spec.ts
│   ├── styles.css
│   ├── surfaces.ts
│   └── types.ts
├── ARCHITECTURE.md
├── README.md
├── index.html
├── package.json
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Deployment

### Vercel

1. Push this folder to a GitHub repository.
2. Import the repository into Vercel.
3. Framework preset: **Vite**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Deploy.

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

No environment variables are required.

## Known limitations

- Text fitting uses typed line/font constraints, not browser font-glyph measurement.
- The current element set is text, image, and button.
- There is one DOM renderer; a Canvas renderer would be a straightforward second backend.
- Composition selection is intentionally understandable rather than a general-purpose linear programming solver.
- Extremely small custom surfaces can be mathematically impossible; these are reported as invalid instead of violating hard constraints.

## What I would improve next

1. Add browser text measurement as a pre-resolution measurement phase.
2. Add a Canvas renderer consuming the same `ResolvedLayout`.
3. Add more formal property-based random-surface tests.
4. Add broadcast-specific title-safe/action-safe constraint types.
5. Add print bleed and QR-code minimum-size constraint types.

## AI tool disclosure

AI tools were used during implementation for:

- architecture brainstorming
- TypeScript implementation assistance
- test-case generation
- documentation drafting
- code review and debugging assistance

The final submission should only be used after the author has run it, reviewed the code, and can explain the resolution algorithm and important TypeScript types. AI use is disclosed because the assignment explicitly permits it.

## Time spent

**Update this honestly before submission.** Record your actual total time across design, implementation, testing, documentation, deployment, and final review. Do not submit a fabricated number.
