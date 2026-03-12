/**
 * Furniture Thumbnail Generator
 * Renders GLB models to small preview images using an offscreen Three.js renderer.
 * Cached as data URLs after first render.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { base } from '$app/paths';

const SIZE = 128;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 4, 3);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-2, 1, -1);
  scene.add(fill);

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
}

const loader = new GLTFLoader();

function loadModel(file: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      `${base}/models/${file}.glb`,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject
    );
  });
}

export function getThumbnail(file: string): string | null {
  return cache.get(file) ?? null;
}

export async function generateThumbnail(file: string): Promise<string | null> {
  if (cache.has(file)) return cache.get(file)!;
  if (pending.has(file)) return pending.get(file)!;

  const promise = (async () => {
    try {
      ensureRenderer();
      const model = await loadModel(file);

      // Clear scene of previous models (keep lights)
      const toRemove: THREE.Object3D[] = [];
      scene!.children.forEach(c => { if (!(c instanceof THREE.Light)) toRemove.push(c); });
      toRemove.forEach(c => scene!.remove(c));

      scene!.add(model);

      // Fit camera to model
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim === 0) return null;

      const pad = 1.3;
      const half = (maxDim * pad) / 2;
      camera!.left = -half;
      camera!.right = half;
      camera!.top = half;
      camera!.bottom = -half;
      camera!.near = 0.01;
      camera!.far = maxDim * 10;

      // Isometric-ish angle
      const dist = maxDim * 2;
      camera!.position.set(
        center.x + dist * 0.7,
        center.y + dist * 0.8,
        center.z + dist * 0.7
      );
      camera!.lookAt(center);
      camera!.updateProjectionMatrix();

      renderer!.render(scene!, camera!);
      const dataUrl = renderer!.domElement.toDataURL('image/png');

      scene!.remove(model);
      cache.set(file, dataUrl);
      pending.delete(file);
      return dataUrl;
    } catch {
      pending.delete(file);
      return null;
    }
  })();

  pending.set(file, promise);
  return promise;
}

/** Get the GLB filename for a catalog ID (mirrors MODEL_MAP keys) */
const MODEL_FILES: Record<string, string> = {
  sofa: 'loungeDesignSofa',
  loveseat: 'loungeDesignSofa',
  chair: 'loungeChair',
  coffee_table: 'tableCoffee',
  tv_stand: 'cabinetTelevision',
  bookshelf: 'bookcaseOpen',
  side_table: 'sideTable',
  fireplace: 'toaster',
  television: 'televisionModern',
  storage: 'bookcaseClosed',
  table: 'tableCross',
  bed_queen: 'bedDouble',
  bed_twin: 'bedSingle',
  nightstand: 'cabinetBedDrawerTable',
  dresser: 'cabinetBedDrawer',
  wardrobe: 'bookcaseClosedDoors',
  stove: 'kitchenStove',
  fridge: 'kitchenFridgeLarge',
  sink_k: 'kitchenSink',
  counter: 'kitchenCabinet',
  dishwasher: 'kitchenCabinetDrawer',
  oven: 'kitchenStoveElectric',
  toilet: 'toilet',
  bathtub: 'bathtub',
  shower: 'shower',
  sink_b: 'bathroomSink',
  washer_dryer: 'washerDryerStacked',
  desk: 'tableCross',
  office_chair: 'chairDesk',
  dining_table: 'tableCross',
  dining_chair: 'chair',
  potted_plant: 'pottedPlant',
  floor_plant: 'plantSmall1',

  // Outdoor Furniture
  fire_pit: 'outdoor_campfire_stones',
  campfire: 'outdoor_campfire_logs',
  tent: 'outdoor_tent_detailedOpen',
  outdoor_sign: 'outdoor_sign',
  outdoor_pot_large: 'outdoor_pot_large',
  outdoor_pot_small: 'outdoor_pot_small',

  // Landscaping — Trees
  tree_oak: 'outdoor_tree_oak',
  tree_default: 'outdoor_tree_default',
  tree_detailed: 'outdoor_tree_detailed',
  tree_pine: 'outdoor_tree_pineRoundA',
  tree_pine_tall: 'outdoor_tree_pineTallA_detailed',
  tree_palm: 'outdoor_tree_palm',
  tree_palm_bend: 'outdoor_tree_palmBend',
  tree_palm_tall: 'outdoor_tree_palmTall',
  tree_fat: 'outdoor_tree_fat',
  tree_simple: 'outdoor_tree_simple',
  tree_thin: 'outdoor_tree_thin',
  tree_tall: 'outdoor_tree_tall',
  tree_cone: 'outdoor_tree_cone',
  tree_blocky: 'outdoor_tree_blocks',
  tree_small: 'outdoor_tree_small',

  // Landscaping — Bushes & Plants
  bush: 'outdoor_plant_bush',
  bush_detailed: 'outdoor_plant_bushDetailed',
  bush_large: 'outdoor_plant_bushLarge',
  bush_large_triangle: 'outdoor_plant_bushLargeTriangle',
  bush_small: 'outdoor_plant_bushSmall',
  bush_triangle: 'outdoor_plant_bushTriangle',
  cactus_short: 'outdoor_cactus_short',
  cactus_tall: 'outdoor_cactus_tall',
  hanging_moss: 'outdoor_hanging_moss',

  // Landscaping — Flowers
  flower_purple: 'outdoor_flower_purpleA',
  flower_red: 'outdoor_flower_redA',
  flower_yellow: 'outdoor_flower_yellowA',
  flower_purple_b: 'outdoor_flower_purpleB',
  flower_red_b: 'outdoor_flower_redB',
  flower_yellow_b: 'outdoor_flower_yellowB',
  lily: 'outdoor_lily_large',

  // Landscaping — Grass
  grass_tuft: 'outdoor_grass',
  grass_large: 'outdoor_grass_large',
  grass_leafs: 'outdoor_grass_leafs',
  grass_leafs_large: 'outdoor_grass_leafsLarge',

  // Landscaping — Rocks & Stones
  rock_large: 'outdoor_rock_largeA',
  rock_large_b: 'outdoor_rock_largeB',
  rock_tall: 'outdoor_rock_tallA',
  rock_small: 'outdoor_rock_smallA',
  rock_small_b: 'outdoor_rock_smallB',
  stone_large: 'outdoor_stone_largeA',
  stone_tall: 'outdoor_stone_tallA',

  // Landscaping — Misc
  mushroom_red: 'outdoor_mushroom_red',
  mushroom_group: 'outdoor_mushroom_redGroup',
  mushroom_tan: 'outdoor_mushroom_tan',
  log_single: 'outdoor_log',
  log_large: 'outdoor_log_large',
  log_stack: 'outdoor_log_stack',
  stump_old: 'outdoor_stump_old',
  stump_round: 'outdoor_stump_round',
  corn: 'outdoor_crops_cornStageD',
  pumpkin: 'outdoor_crop_pumpkin',
  statue_column: 'outdoor_statue_column',
  obelisk: 'outdoor_statue_obelisk',

  // Fencing
  fence_simple: 'outdoor_fence_simple',
  fence_planks: 'outdoor_fence_planks',
  fence_gate: 'outdoor_fence_gate',
  fence_corner: 'outdoor_fence_corner',
};

export function getModelFile(catalogId: string): string | null {
  return MODEL_FILES[catalogId] ?? null;
}

/** Preload all thumbnails */
export function preloadThumbnails(): void {
  const files = new Set(Object.values(MODEL_FILES));
  for (const file of files) {
    generateThumbnail(file);
  }
}
