export interface Point { x: number; y: number; }

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  height: number;
  color: string;
  /** Optional quadratic bezier control point for curved walls */
  curvePoint?: Point;
  texture?: string;
  /** Interior-specific overrides (if different from exterior) */
  interiorColor?: string;
  interiorTexture?: string;
  /** Exterior-specific overrides */
  exteriorColor?: string;
  exteriorTexture?: string;
}

export type RoomCategory = 'indoor' | 'outdoor' | 'garage' | 'utility';

export interface Room {
  id: string;
  name: string;
  walls: string[];
  floorTexture: string;
  area: number;
  color?: string;
  roomType?: RoomCategory;
  /** Custom label position offset from centroid (in world units) */
  labelOffset?: Point;
}

export interface Door {
  id: string;
  wallId: string;
  position: number; // 0-1 along wall
  width: number;
  height: number;
  type: 'single' | 'double' | 'sliding' | 'french' | 'pocket' | 'bifold';
  swingDirection: 'left' | 'right';
  flipSide: boolean; // flip which side of wall the door opens to (vertical flip)
}

export interface Window {
  id: string;
  wallId: string;
  position: number; // 0-1 along wall
  width: number;
  height: number;
  sillHeight: number;
  type: 'standard' | 'fixed' | 'casement' | 'sliding' | 'bay';
}

export interface FurnitureItem {
  id: string;
  catalogId: string;
  position: Point;
  rotation: number;
  scale: { x: number; y: number; z: number };
  // Per-item overrides (optional — falls back to catalog defaults)
  color?: string;
  width?: number;   // cm
  depth?: number;   // cm
  height?: number;  // cm
  material?: string; // material name/id
  locked?: boolean;
}

export interface ElementGroup {
  id: string;
  elementIds: string[];
}

export type StairType = 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';

export interface Stair {
  id: string;
  position: Point;
  rotation: number;
  width: number;   // default 100cm
  depth: number;   // default 300cm
  riserCount: number; // default 14
  direction: 'up' | 'down';
  stairType: StairType; // default 'straight'
}

export type ColumnFace = 'north' | 'south' | 'east' | 'west';

export interface Column {
  id: string;
  position: Point;
  rotation: number;
  shape: 'round' | 'square';
  diameter: number;  // cm (for round) or side length (for square)
  height: number;    // cm
  color: string;
  /** Per-face paint overrides — square columns only; round columns have no discrete planes */
  faceColors?: Partial<Record<ColumnFace, string>>;
  faceTextures?: Partial<Record<ColumnFace, string>>;
}

export interface Measurement {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Annotation {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  offset: number; // perpendicular offset for dimension line (default 40)
}

// ─── Construction Detail Library ─────────────────────────────────────────────

export interface DetailLayer {
  id: string;
  label: string;       // e.g. "Gypsum Board 12.5mm"
  thickness: number;   // cm (used for proportional cross-section drawing)
  material: string;    // display material name
  color: string;       // hex color for cross-section fill
  pattern?: 'solid' | 'hatch' | 'diagonal';
}

export type DetailCategory = 'Architecture' | 'Structure' | 'MEP';

export interface ConstructionDetailDef {
  id: string;
  name: string;
  category: DetailCategory;
  subcategory: string;  // e.g. "Wall", "Foundation", "Lighting"
  layers: DetailLayer[];
  description?: string;
}

export interface WallDetailAttachment {
  id: string;
  wallId: string;
  detailId: string;        // references ConstructionDetailDef.id
  calloutNumber: number;   // sequential per floor
  position: number;        // 0–1 along wall (leader line attach point)
  layers: DetailLayer[];   // editable snapshot of layers at attach time
}

/** A dimension annotation that drives wall geometry when the label value is edited. */
export interface DrivenAnnotation extends Annotation {
  driven: true;
  /** The wall that stays fixed when the dimension is changed */
  anchorWallId: string;
  /** The wall that moves when the dimension is changed */
  drivenWallId: string;
  /** Whether this measures horizontal (x) or vertical (y) spacing */
  axis: 'x' | 'y';
}

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  rotation: number;
}

// ─── Entourage Library ────────────────────────────────────────────────────────

export type EntourageCategory = 'people' | 'vehicles' | 'trees' | 'landscaping';
export type EntourageViewType = 'plan' | 'elevation';
export type EntourageSource = 'builtin' | 'custom';

export interface EntourageDef {
  id: string;
  name: string;
  category: EntourageCategory;
  viewType: EntourageViewType;
  source: 'builtin';
  svgPath: string;        // SVG path `d` string — rendered via Path2D
  viewBox: string;        // e.g. "0 0 200 85" — nominal width × height
  defaultWidthCm: number; // real-world width for auto-scale on first placement
}

export interface CustomEntourageDef {
  id: string;
  name: string;
  category: EntourageCategory;
  viewType: EntourageViewType;
  source: 'custom';
  imageDataUrl: string;   // base64 PNG data URL
  defaultWidthCm: number; // user-specified at upload time
  viewBox: string;        // "0 0 {naturalWidth} {naturalHeight}" set at upload
}

export interface EntourageItem {
  id: string;
  defId: string;
  source: EntourageSource;
  viewType: EntourageViewType;
  // Plan-view coords (floor plan cm units, same coordinate space as walls)
  x: number;
  y: number;
  // Elevation-view coords — populated when placed in elevation canvas (not used yet)
  elevationFaceId?: string;  // wall id of the viewed facade
  elevationX?: number;       // horizontal position along facade (cm)
  widthCm: number;
  rotation: number;          // degrees; applied in plan view; elevation items don't rotate
  opacity: number;           // 0–1, default 0.85
  locked: boolean;
}

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number; // world coordinate (x for vertical, y for horizontal)
}

export interface BackgroundImage {
  dataUrl: string;
  position: Point;
  scale: number;
  opacity: number;
  rotation: number;
  locked: boolean;
}

// ─── XREF (External Reference) types ────────────────────────────────────────

export interface XRefDxfEntity {
  type: 'LINE' | 'LWPOLYLINE' | 'POLYLINE' | 'ARC';
  points: Point[];
  closed?: boolean;
  // ARC-specific (kept for potential curve tessellation at render time)
  center?: Point;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

export interface XRefDxf {
  id: string;
  name: string;
  type: 'dxf';
  position: Point;
  rotation: number;     // degrees
  scale: number;
  opacity: number;      // 0–1
  visible: boolean;
  sourceText: string;   // raw DXF ASCII stored for Sync/Reload
  entities: XRefDxfEntity[];
  snapPoints: Point[];  // pre-computed endpoint + midpoint pool
}

export interface XRefNative {
  id: string;
  name: string;
  type: 'native';
  position: Point;
  positionY: number;    // 3D elevation offset (cm)
  rotation: number;     // Y-axis degrees for THREE.Group
  scale: number;
  visible: boolean;
  sourceJson: string;   // serialized Project JSON stored for Sync/Reload
  floorIndex: number;
}

export type XRef = XRefDxf | XRefNative;

// ─────────────────────────────────────────────────────────────────────────────

export interface Floor {
  id: string;
  name: string;
  level: number;
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  furniture: FurnitureItem[];
  stairs: Stair[];
  columns: Column[];
  backgroundImage?: BackgroundImage;
  guides: GuideLine[];
  measurements: Measurement[];
  annotations: Annotation[];
  drivenAnnotations?: DrivenAnnotation[];
  wallDetailAttachments?: WallDetailAttachment[];
  textAnnotations: TextAnnotation[];
  groups: ElementGroup[];
  xrefs?: XRef[];
  entourageItems?: EntourageItem[];
}

// ─── Sheets Mode ─────────────────────────────────────────────────────────────

export type SheetSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
export type SheetOrientation = 'landscape' | 'portrait';
export type ViewportSourceType = '2d-plan' | '3d-design' | 'detail' | 'image';

export interface RevisionEntry {
  id: string;
  code: string;        // e.g. "A", "B", "P1"
  date: string;        // ISO date string
  author: string;
  description: string;
}

export interface SheetAnnotation {
  id: string;
  type: 'dimension' | 'text';
  x: number; y: number;   // sheet coords (mm)
  x2?: number; y2?: number; // for dimension
  text: string;
  fontSize?: number;
  color?: string;
}

export interface SheetViewport {
  id: string;
  sourceType: ViewportSourceType;
  sourceRef: string | null;    // floorId for 2d-plan, attachment id for detail, null for image
  label: string;
  plotScale: string;           // e.g. "1:50"
  // Frame position / size in sheet space (mm from top-left)
  x: number; y: number;
  width: number; height: number;
  // Captured snapshot (data URL) — set for '3d-design' and 'image' types
  imageDataUrl?: string;
}

export interface SheetPage {
  id: string;
  title: string;
  sheetNumber: string;        // e.g. "A1-01"
  size: SheetSize;
  orientation: SheetOrientation;
  viewports: SheetViewport[];
  annotations: SheetAnnotation[];
  revisionLog: RevisionEntry[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  floors: Floor[];
  activeFloorId: string;
  sheets?: SheetPage[];
  customEntourage?: CustomEntourageDef[];
  createdAt: Date;
  updatedAt: Date;
}
