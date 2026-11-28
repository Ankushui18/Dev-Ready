export type LayerType =
  | 'FRAME'
  | 'COMPONENT'
  | 'INSTANCE'
  | 'GROUP'
  | 'TEXT'
  | 'RECTANGLE'
  | 'ELLIPSE'
  | 'VECTOR'
  | 'IMAGE';

export type ScreenStatus = 'ready' | 'in-progress' | 'done';

export type UnitMode = 'px' | 'rem';

export type CanvasViewMode = 'inspect' | 'preview' | 'diff';

export type CodeTarget =
  | 'react-tailwind-ts'
  | 'react-tailwind'
  | 'react-css'
  | 'html-css'
  | 'vue'
  | 'svelte'
  | 'react-native'
  | 'swiftui'
  | 'compose'
  | 'flutter'
  | 'tailwind'
  | 'css';

export interface FillSpec {
  type: 'SOLID' | 'LINEAR_GRADIENT' | 'IMAGE';
  color?: string; // hex e.g. #0D99FF
  opacity?: number; // 0..1
  gradient?: string; // CSS linear-gradient(...)
  token?: string; // e.g. --color-accent-primary
}

export interface StrokeSpec {
  color: string;
  width: number;
  align?: 'INSIDE' | 'CENTER' | 'OUTSIDE';
  dash?: number[];
  token?: string;
}

export interface EffectSpec {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  x?: number;
  y?: number;
  blur: number;
  spread?: number;
  color?: string;
  token?: string;
}

export interface AutoLayoutSpec {
  direction: 'HORIZONTAL' | 'VERTICAL';
  gap: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  alignItems?: 'START' | 'CENTER' | 'END' | 'STRETCH';
  justifyContent?: 'START' | 'CENTER' | 'END' | 'SPACE_BETWEEN';
  wrap?: boolean;
  gapToken?: string;
  paddingToken?: string;
}

export interface TypographySpec {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number; // in px
  letterSpacing?: number; // in px
  textAlign?: 'LEFT' | 'CENTER' | 'RIGHT';
  textTransform?: 'NONE' | 'UPPERCASE' | 'LOWERCASE' | 'CAPITALIZE';
  token?: string;
}

export interface InspectLayer {
  id: string;
  name: string;
  type: LayerType;
  /** Absolute coordinates relative to the root artboard (0,0) */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  radius?: number | [number, number, number, number];
  radiusToken?: string;
  clipsContent?: boolean;
  visible?: boolean;
  componentName?: string;
  fills?: FillSpec[];
  strokes?: StrokeSpec[];
  effects?: EffectSpec[];
  autoLayout?: AutoLayoutSpec;
  typography?: TypographySpec;
  text?: string;
  svg?: string;
  imageUrl?: string;
  interactive?: boolean;
  children?: InspectLayer[];
}

export interface TokenEntry {
  name: string;
  category: 'color' | 'spacing' | 'radius' | 'typography' | 'shadow';
  value: string;
  modes?: Record<string, string>;
}

export interface AssetEntry {
  id: string;
  name: string;
  format: 'SVG' | 'PNG';
  width: number;
  height: number;
  svg?: string;
  dataUrl?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type AnnotationCategory = 'dev' | 'a11y' | 'interaction' | 'content';

export interface LayerAnnotation {
  id: string;
  layerId: string;
  category: AnnotationCategory;
  text: string;
  createdAt: string;
}

export type DevResourceKind = 'github' | 'linear' | 'jira' | 'storybook' | 'figma' | 'docs' | 'link';

export interface DevResource {
  id: string;
  layerId?: string;
  label: string;
  url: string;
  kind: DevResourceKind;
}

export interface CodeConnectEntry {
  componentName: string;
  importPath: string;
  snippet: string;
  docsUrl?: string;
}

export interface VersionHistoryEntry {
  id: string;
  summary: string;
  author?: string;
  status?: ScreenStatus;
  timestamp: string;
  /** Optional full layer-tree snapshot for Figma-style Compare Changes diffing */
  rootSnapshot?: InspectLayer;
}

export interface CanvasMeasurement {
  id: string;
  fromLayerId: string;
  toLayerId: string;
  orientation: 'horizontal' | 'vertical';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distance: number;
  labelX: number;
  labelY: number;
}

export interface DevReadyBundle {
  version: 1;
  id: string;
  name: string;
  fileName?: string;
  pageName?: string;
  figmaUrl?: string;
  status: ScreenStatus;
  updatedAt: string;
  source: 'demo' | 'figma-plugin' | 'file' | 'cloud-link';
  width: number;
  height: number;
  backgroundColor: string;
  /** Optional 2x PNG screenshot data URL captured directly from Figma */
  screenshotDataUrl?: string;
  root: InspectLayer;
  tokens: TokenEntry[];
  tokenModes?: string[];
  assets?: AssetEntry[];
  notes?: string;
  checklist?: ChecklistItem[];
  annotations?: LayerAnnotation[];
  devResources?: DevResource[];
  codeConnect?: Record<string, CodeConnectEntry>;
  history?: VersionHistoryEntry[];
  measurements?: CanvasMeasurement[];
}
