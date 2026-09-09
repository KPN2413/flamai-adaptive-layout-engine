export type ElementRole =
  | 'primary'
  | 'secondary'
  | 'supporting'
  | 'hero'
  | 'action'
  | 'branding';

export type Priority = 1 | 2 | 3 | 4 | 5;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSizingIntent {
  minFontSize: number;
  preferredFontSize: number;
  maxFontSize: number;
  preferredLines: number;
  minLines: number;
  lineHeight: number;
}

export interface BoxSizingIntent {
  minHeight: number;
  preferredHeight: number;
  maxHeight: number;
}

export interface BaseElement {
  id: string;
  role: ElementRole;
  priority: Priority;
  label: string;
  allowHide: boolean;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  sizing: TextSizingIntent;
  allowTruncate: boolean;
  weight?: 400 | 500 | 600 | 700 | 800;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  alt: string;
  objectFit: 'contain' | 'cover';
  sizing: BoxSizingIntent;
}

export interface ButtonElement extends BaseElement {
  type: 'button';
  text: string;
  sizing: BoxSizingIntent & {
    minFontSize: number;
    preferredFontSize: number;
    maxFontSize: number;
  };
}

export type AdElement = TextElement | ImageElement | ButtonElement;

export interface AdTheme {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  accent: string;
  accentText: string;
  border: string;
}

export interface AdSpec<TElements extends readonly AdElement[] = readonly AdElement[]> {
  id: string;
  name: string;
  elements: TElements;
  theme: AdTheme;
}

interface SurfaceBase {
  id: string;
  label: string;
  width: number;
  height: number;
  safeArea: Insets;
}

type InteractionConstraint =
  | {
      touchOnly: true;
      minTapTarget: number;
    }
  | {
      touchOnly?: false;
      minTapTarget?: number;
    };

type ViewingConstraint =
  | {
      viewingDistance: 'far';
      minTextSize: number;
    }
  | {
      viewingDistance?: 'near';
      minTextSize?: number;
    };

export type SurfaceProfile = SurfaceBase & InteractionConstraint & ViewingConstraint;

export type CompositionMode = 'poster' | 'tile' | 'split' | 'strip';

export type DegradationKind =
  | 'none'
  | 'shrunk'
  | 'truncated'
  | 'hidden';

export interface ResolvedElement {
  id: string;
  type: AdElement['type'];
  role: ElementRole;
  priority: Priority;
  rect: Rect;
  hidden: boolean;
  degradation: DegradationKind;
  fontSize?: number;
  maxLines?: number;
}

export interface ResolutionDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'COMPOSITION_SELECTED'
    | 'ELEMENT_SHRUNK'
    | 'TEXT_TRUNCATED'
    | 'ELEMENT_HIDDEN'
    | 'HARD_CONSTRAINT_UNSATISFIED'
    | 'VALIDATION';
  message: string;
  elementId?: string;
}

export interface ResolvedLayout {
  surface: SurfaceProfile;
  safeRect: Rect;
  composition: CompositionMode;
  elements: ResolvedElement[];
  diagnostics: ResolutionDiagnostic[];
  valid: boolean;
}

export function defineAd<const TElements extends readonly AdElement[]>(input: {
  id: string;
  name: string;
  elements: TElements;
  theme: AdTheme;
}): AdSpec<TElements> {
  return input;
}
