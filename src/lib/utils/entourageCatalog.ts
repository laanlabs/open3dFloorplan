import type { EntourageDef, EntourageCategory } from '$lib/models/types';

export const entourageCatalog: EntourageDef[] = [

  // ── People (elevation only) ────────────────────────────────────────────────
  {
    id: 'person-standing',
    name: 'Standing Adult',
    category: 'people',
    viewType: 'elevation',
    source: 'builtin',
    // 30×170 nominal — head circle (r=12) + torso + legs
    svgPath: [
      'M 15,12 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',  // head
      'M 15,24 L 15,100',          // spine
      'M 4,50 L 15,70 L 26,50',   // arms
      'M 15,100 L 4,170',          // left leg
      'M 15,100 L 26,170',         // right leg
    ].join(' '),
    viewBox: '0 0 30 170',
    defaultWidthCm: 50,
  },
  {
    id: 'person-walking',
    name: 'Walking Adult',
    category: 'people',
    viewType: 'elevation',
    source: 'builtin',
    // 40×170 nominal — striding posture
    svgPath: [
      'M 18,12 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',
      'M 18,24 L 20,100',
      'M 5,48 L 18,68 L 32,44',
      'M 20,100 L 6,170',
      'M 20,100 L 34,170',
    ].join(' '),
    viewBox: '0 0 40 170',
    defaultWidthCm: 55,
  },
  {
    id: 'person-seated',
    name: 'Seated Person',
    category: 'people',
    viewType: 'elevation',
    source: 'builtin',
    // 60×100 nominal — seated in chair
    svgPath: [
      'M 30,12 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',  // head
      'M 30,24 L 30,65',           // torso
      'M 16,48 L 30,60 L 44,48',  // arms
      'M 10,65 L 55,65',          // seat line
      'M 10,65 L 10,100',         // near leg
      'M 55,65 L 55,100',         // far leg
    ].join(' '),
    viewBox: '0 0 60 100',
    defaultWidthCm: 60,
  },
  {
    id: 'person-child',
    name: 'Child',
    category: 'people',
    viewType: 'elevation',
    source: 'builtin',
    // 24×120 nominal — shorter proportions
    svgPath: [
      'M 12,10 m -10,0 a 10,10 0 1 0 20,0 a 10,10 0 1 0 -20,0',
      'M 12,20 L 12,75',
      'M 3,40 L 12,55 L 21,40',
      'M 12,75 L 3,120',
      'M 12,75 L 21,120',
    ].join(' '),
    viewBox: '0 0 24 120',
    defaultWidthCm: 35,
  },

  // ── Vehicles — plan (top-down) ────────────────────────────────────────────
  {
    id: 'vehicle-sedan-plan',
    name: 'Sedan (Plan)',
    category: 'vehicles',
    viewType: 'plan',
    source: 'builtin',
    // 200×85 nominal: body + windshields + wheel circles
    svgPath: [
      // Body outline
      'M 22,0 L 178,0 Q 200,0 200,22 L 200,63 Q 200,85 178,85 L 22,85 Q 0,85 0,63 L 0,22 Q 0,0 22,0 Z',
      // Roof outline (inner box)
      'M 58,0 L 142,0 L 142,85 L 58,85',
      // Front windshield
      'M 152,8 L 194,8 L 194,36 L 152,36',
      // Rear windshield
      'M 6,8 L 48,8 L 48,36 L 6,36',
      // Front-right wheel
      'M 168,4 m -14,0 a 14,14 0 1 0 28,0 a 14,14 0 1 0 -28,0',
      // Front-left wheel
      'M 168,68 m -14,0 a 14,14 0 1 0 28,0 a 14,14 0 1 0 -28,0',
      // Rear-right wheel
      'M 32,4 m -14,0 a 14,14 0 1 0 28,0 a 14,14 0 1 0 -28,0',
      // Rear-left wheel
      'M 32,68 m -14,0 a 14,14 0 1 0 28,0 a 14,14 0 1 0 -28,0',
    ].join(' '),
    viewBox: '0 0 200 85',
    defaultWidthCm: 450,
  },
  {
    id: 'vehicle-suv-plan',
    name: 'SUV (Plan)',
    category: 'vehicles',
    viewType: 'plan',
    source: 'builtin',
    // 210×95 nominal: wider/taller than sedan
    svgPath: [
      'M 24,0 L 186,0 Q 210,0 210,24 L 210,71 Q 210,95 186,95 L 24,95 Q 0,95 0,71 L 0,24 Q 0,0 24,0 Z',
      'M 62,0 L 148,0 L 148,95 L 62,95',
      'M 154,8 L 204,8 L 204,42 L 154,42',
      'M 6,8 L 56,8 L 56,42 L 6,42',
      'M 174,4 m -16,0 a 16,16 0 1 0 32,0 a 16,16 0 1 0 -32,0',
      'M 174,76 m -16,0 a 16,16 0 1 0 32,0 a 16,16 0 1 0 -32,0',
      'M 36,4 m -16,0 a 16,16 0 1 0 32,0 a 16,16 0 1 0 -32,0',
      'M 36,76 m -16,0 a 16,16 0 1 0 32,0 a 16,16 0 1 0 -32,0',
    ].join(' '),
    viewBox: '0 0 210 95',
    defaultWidthCm: 480,
  },
  {
    id: 'vehicle-bicycle-plan',
    name: 'Bicycle (Plan)',
    category: 'vehicles',
    viewType: 'plan',
    source: 'builtin',
    // 80×20 nominal: two wheel circles + frame
    svgPath: [
      // Rear wheel
      'M 14,10 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',
      // Front wheel
      'M 66,10 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',
      // Frame (chain stay + top tube)
      'M 14,10 L 40,4 L 66,10',
      'M 40,4 L 40,16 L 14,10',
    ].join(' '),
    viewBox: '0 0 80 20',
    defaultWidthCm: 175,
  },

  // ── Vehicles — elevation (side view) ──────────────────────────────────────
  {
    id: 'vehicle-sedan-elevation',
    name: 'Sedan (Elevation)',
    category: 'vehicles',
    viewType: 'elevation',
    source: 'builtin',
    // 200×70 nominal: side profile
    svgPath: [
      // Body
      'M 18,40 Q 18,20 30,20 L 70,8 L 130,8 L 155,20 L 182,20 Q 198,20 198,40 L 198,56 Q 198,65 188,65 L 40,65 Q 28,65 28,56 Z',
      // Window
      'M 72,12 L 75,22 L 128,22 L 130,12 Z',
      // B-pillar
      'M 100,12 L 100,22',
      // Front wheel
      'M 155,65 m -22,0 a 22,22 0 1 0 44,0 a 22,22 0 1 0 -44,0',
      // Rear wheel
      'M 45,65 m -22,0 a 22,22 0 1 0 44,0 a 22,22 0 1 0 -44,0',
    ].join(' '),
    viewBox: '0 0 200 90',
    defaultWidthCm: 450,
  },
  {
    id: 'vehicle-suv-elevation',
    name: 'SUV (Elevation)',
    category: 'vehicles',
    viewType: 'elevation',
    source: 'builtin',
    // 210×80 nominal: higher roofline
    svgPath: [
      'M 20,45 Q 20,10 35,10 L 75,4 L 140,4 L 162,10 L 188,14 Q 206,14 206,45 L 206,62 Q 206,75 192,75 L 38,75 Q 24,75 24,62 Z',
      'M 76,6 L 78,18 L 140,18 L 142,6 Z',
      'M 105,6 L 105,18',
      'M 162,75 m -24,0 a 24,24 0 1 0 48,0 a 24,24 0 1 0 -48,0',
      'M 46,75 m -24,0 a 24,24 0 1 0 48,0 a 24,24 0 1 0 -48,0',
    ].join(' '),
    viewBox: '0 0 210 100',
    defaultWidthCm: 480,
  },

  // ── Trees (plan) ──────────────────────────────────────────────────────────
  {
    id: 'tree-deciduous-plan',
    name: 'Deciduous Tree',
    category: 'trees',
    viewType: 'plan',
    source: 'builtin',
    // 100×100 nominal: irregular organic circle + trunk cross
    svgPath: [
      'M 50,3 C 68,1 90,16 95,40 C 100,64 84,92 60,97 C 36,102 10,86 5,62 C 0,38 14,8 38,3 C 42,2 46,3 50,3 Z',
      // Trunk cross
      'M 44,50 L 56,50 M 50,44 L 50,56',
    ].join(' '),
    viewBox: '0 0 100 100',
    defaultWidthCm: 400,
  },
  {
    id: 'tree-conifer-plan',
    name: 'Conifer',
    category: 'trees',
    viewType: 'plan',
    source: 'builtin',
    // 80×80 nominal: starburst representing top-down conifer
    svgPath: [
      'M 40,2 L 43,26 L 58,10 L 48,32 L 72,28 L 54,44 L 74,58 L 50,56 L 52,80 L 40,64 L 28,80 L 30,56 L 6,58 L 26,44 L 8,28 L 32,32 L 22,10 L 37,26 Z',
      'M 40,2 L 40,78',
    ].join(' '),
    viewBox: '0 0 80 80',
    defaultWidthCm: 200,
  },
  {
    id: 'tree-palm-plan',
    name: 'Palm',
    category: 'trees',
    viewType: 'plan',
    source: 'builtin',
    // 80×80 nominal: radiating fronds from center
    svgPath: [
      // Center trunk
      'M 40,36 m -5,0 a 5,5 0 1 0 10,0 a 5,5 0 1 0 -10,0',
      // 8 fronds radiating outward
      'M 40,40 Q 50,25 60,10',
      'M 40,40 Q 58,32 76,24',
      'M 40,40 Q 60,44 78,48',
      'M 40,40 Q 54,58 62,74',
      'M 40,40 Q 40,62 40,80',
      'M 40,40 Q 26,58 18,74',
      'M 40,40 Q 20,44 2,48',
      'M 40,40 Q 22,32 4,24',
      'M 40,40 Q 30,25 20,10',
    ].join(' '),
    viewBox: '0 0 80 80',
    defaultWidthCm: 150,
  },

  // ── Landscaping (plan) ────────────────────────────────────────────────────
  {
    id: 'landscaping-shrub-plan',
    name: 'Shrub Mass',
    category: 'landscaping',
    viewType: 'plan',
    source: 'builtin',
    // 100×60 nominal: irregular blob
    svgPath: 'M 50,4 C 70,0 95,10 97,28 C 99,46 80,58 58,58 C 42,58 20,56 10,44 C 0,32 8,12 28,6 C 36,4 44,6 50,4 Z',
    viewBox: '0 0 100 60',
    defaultWidthCm: 200,
  },
  {
    id: 'landscaping-hedge-plan',
    name: 'Hedge Strip',
    category: 'landscaping',
    viewType: 'plan',
    source: 'builtin',
    // 150×40 nominal: rectangle with bumpy top/bottom edge
    svgPath: [
      // Top bumpy edge
      'M 0,20 C 0,10 12,0 20,8 C 28,16 32,2 45,6 C 58,10 62,0 75,4 C 88,8 92,2 105,8 C 118,14 122,2 135,6 C 148,10 150,14 150,20',
      // Bottom bumpy edge
      'L 150,20 C 150,26 138,40 128,32 C 118,24 114,38 100,34 C 86,30 82,40 68,36 C 54,32 50,40 36,34 C 22,28 18,40 8,34 C 4,32 0,28 0,20 Z',
    ].join(' '),
    viewBox: '0 0 150 40',
    defaultWidthCm: 300,
  },
  {
    id: 'landscaping-planter-plan',
    name: 'Planter Box',
    category: 'landscaping',
    viewType: 'plan',
    source: 'builtin',
    // 80×50 nominal: rectangle with inner soil indication
    svgPath: [
      'M 0,0 L 80,0 L 80,50 L 0,50 Z',         // outer box
      'M 6,6 L 74,6 L 74,44 L 6,44 Z',          // inner ledge
      // Diagonal soil texture lines
      'M 6,20 L 20,6 M 6,36 L 36,6 M 6,44 L 50,6 M 20,44 L 74,6 M 44,44 L 74,14 M 64,44 L 74,28',
    ].join(' '),
    viewBox: '0 0 80 50',
    defaultWidthCm: 120,
  },
];

// ── Category hierarchy for accordion UI ───────────────────────────────────────

export interface EntourageSubcategory {
  label: string;
  ids: string[];
}

export interface EntourageCategoryGroup {
  category: EntourageCategory;
  label: string;
  subcategories: EntourageSubcategory[];
}

export const entourageCategories: EntourageCategoryGroup[] = [
  {
    category: 'people',
    label: 'People',
    subcategories: [
      { label: 'Figures', ids: ['person-standing', 'person-walking', 'person-seated', 'person-child'] },
    ],
  },
  {
    category: 'vehicles',
    label: 'Vehicles',
    subcategories: [
      { label: 'Plan view', ids: ['vehicle-sedan-plan', 'vehicle-suv-plan', 'vehicle-bicycle-plan'] },
      { label: 'Elevation view', ids: ['vehicle-sedan-elevation', 'vehicle-suv-elevation'] },
    ],
  },
  {
    category: 'trees',
    label: 'Trees',
    subcategories: [
      { label: 'Plan view', ids: ['tree-deciduous-plan', 'tree-conifer-plan', 'tree-palm-plan'] },
    ],
  },
  {
    category: 'landscaping',
    label: 'Landscaping',
    subcategories: [
      { label: 'Plan view', ids: ['landscaping-shrub-plan', 'landscaping-hedge-plan', 'landscaping-planter-plan'] },
    ],
  },
];
