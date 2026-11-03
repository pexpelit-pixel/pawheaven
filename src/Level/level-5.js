import { LEVEL_ENTRY_PORTALS } from '../world/LevelAnchors.js';

// The first thirteen platforms are the existing Memory Gallery warm-up and teleport puzzle.
// Observatory X begins only after the teleport arrival deck at z=2.8.
const HIGH_ROUTE_LAYOUT = Object.freeze([
  // BOARD PARKOUR: 20 precision boards arranged in a paired left-right slalom.
  { x: -1.40, width: 1.80, depth: 1.80, color: '#6c8fae', edge: '#e1f0ff' },
  { x: -2.00, width: 1.28, depth: 1.48, color: '#8d82b8', edge: '#efe7ff' },
  { x: 2.00, width: 1.24, depth: 1.48, color: '#6da8bd', edge: '#e0f7ff' },
  { x: 1.40, width: 1.30, depth: 1.50, color: '#91cce2', edge: '#f0ffff', slippery: true, checkpoint: true },
  { x: -1.40, width: 1.45, depth: 1.58, color: '#69aab7', edge: '#d8ffff', moving: 0.38 },
  { x: -2.00, width: 1.26, depth: 1.46, color: '#9b83c1', edge: '#f2e8ff' },
  { x: 2.00, width: 1.32, depth: 1.50, color: '#d49b75', edge: '#fff0d9', temporary: true },
  { x: 1.40, width: 1.38, depth: 1.55, color: '#8c7fae', edge: '#f0e8ff', rotor: { length: 2.85, speed: -2.15, phase: 0.25 }, checkpoint: true },
  { x: -1.40, width: 1.48, depth: 1.62, color: '#6f9fb7', edge: '#e1f3ff' },
  { x: -2.00, width: 1.42, depth: 1.56, color: '#69aab7', edge: '#d8ffff', moving: 0.42 },
  { x: 2.00, width: 1.24, depth: 1.46, color: '#a18bc7', edge: '#f1eaff' },
  { x: 1.40, width: 1.30, depth: 1.50, color: '#91cce2', edge: '#f0ffff', slippery: true, checkpoint: true },
  { x: -1.40, width: 1.86, depth: 1.86, color: '#6a9caf', edge: '#e5fbff' },
  { x: -2.00, width: 1.30, depth: 1.50, color: '#d49b75', edge: '#fff0d9', temporary: true },
  { x: 2.00, width: 1.45, depth: 1.58, color: '#69aab7', edge: '#d8ffff', moving: 0.40 },
  { x: 1.40, width: 1.42, depth: 1.56, color: '#8c7fae', edge: '#f0e8ff', rotor: { length: 2.95, speed: 2.35, phase: 1.10 }, checkpoint: true },
  { x: -1.40, width: 1.25, depth: 1.46, color: '#8d82b8', edge: '#efe7ff' },
  { x: -2.00, width: 1.30, depth: 1.50, color: '#91cce2', edge: '#f0ffff', slippery: true },
  { x: 2.00, width: 1.48, depth: 1.62, color: '#69aab7', edge: '#d8ffff', moving: 0.40 },
  { x: 1.40, width: 1.28, depth: 1.48, color: '#6da8bd', edge: '#e0f7ff', checkpoint: true },

  // NEW CONCEPT 1: two long balance beams, the second one moves laterally.
  { name: 'BalanceBeam-01', x: 2.00, z: 94.2, top: 8.66, width: 0.78, depth: 5.0, color: '#72a9bb', edge: '#e1f7ff', beam: true },
  { name: 'BalanceBeam-02', x: -2.00, z: 100.0, top: 8.76, width: 0.72, depth: 5.0, color: '#8e83b7', edge: '#f0eaff', beam: true, moving: 0.36 },

  // NEW CONCEPT 2: a broad arena where a holographic rotor guards the crossing.
  { name: 'HoloRotorDeck', x: 1.40, z: 106.0, top: 8.96, width: 5.2, depth: 5.6, color: '#619bad', edge: '#d8fbff', rotor: { length: 4.7, speed: -1.95, phase: 0.6 } },

  // NEW CONCEPT 3: climb the three large prism blocks instead of hopping more boards.
  { name: 'PrismClimb-01', x: -1.80, z: 112.1, top: 9.55, blockHeight: 1.52, width: 1.80, depth: 1.80, color: '#a88dc1', edge: '#f2e8ff', memoryBlock: true },
  { name: 'PrismClimb-02', x: 1.80, z: 115.4, top: 10.22, blockHeight: 1.62, width: 1.90, depth: 1.90, color: '#70b4b6', edge: '#e0ffff', memoryBlock: true },
  { name: 'PrismClimb-03', x: -1.70, z: 118.8, top: 10.90, blockHeight: 1.72, width: 2.00, depth: 2.00, color: '#d49b75', edge: '#fff0df', memoryBlock: true, checkpoint: true },

  // Final broad deck. The transformed winding centerline route is 135m.
  { name: 'ObservatoryX-Finish', x: 1.00, z: 125.0, top: 11.56, width: 6.0, depth: 7.2, color: '#b18cb7', edge: '#fff0fa', finish: true }
]);

const HIGH_ROUTE_START_Z = 2.8;
const HIGH_ROUTE_Z_SCALE = 0.9462935145719178;

const HIGH_ROUTE_PLATFORMS = Object.freeze(HIGH_ROUTE_LAYOUT.map((spec, index) => {
  const sourceZ = Number.isFinite(spec.z) ? spec.z : 9.0 + index * 4.2;
  const transformedZ = HIGH_ROUTE_START_Z + (sourceZ - HIGH_ROUTE_START_Z) * HIGH_ROUTE_Z_SCALE;
  const platform = {
    name: spec.name || ('ObservatoryX-' + String(index + 1).padStart(2, '0')),
    x: spec.x,
    z: Number(transformedZ.toFixed(3)),
    top: Number.isFinite(spec.top) ? Number(spec.top.toFixed(2)) : Number((7.05 + index * 0.08).toFixed(2)),
    width: spec.width,
    depth: spec.depth,
    color: spec.color,
    edge: spec.edge
  };
  if (Number.isFinite(spec.blockHeight)) platform.blockHeight = spec.blockHeight;
  if (spec.memoryBlock) platform.memoryBlock = true;
  if (spec.beam) platform.beam = true;
  if (spec.moving) {
    platform.movingAxis = 'x';
    platform.moveRange = spec.moving;
    platform.moveSpeed = 1.05 + (index % 3) * 0.16;
    platform.movePhase = (index % 5) * 0.63;
  }
  if (spec.rotor) {
    platform.spinBar = true;
    platform.spinLength = spec.rotor.length;
    platform.spinHeight = 0.72;
    platform.spinSpeed = spec.rotor.speed;
    platform.spinPhase = spec.rotor.phase;
  }
  if (spec.temporary) {
    platform.temporary = true;
    platform.temporaryWarningSeconds = 0.52;
    platform.temporaryHiddenSeconds = 1.65;
    platform.temporaryRestoreSeconds = 0.32;
  }
  if (spec.slippery) {
    platform.slippery = true;
    platform.friction = 0.04;
  }
  if (spec.checkpoint) platform.checkpoint = true;
  if (spec.finish) platform.finish = true;
  return Object.freeze(platform);
}));

// The first 20 objects are the only precision-board parkour section.

const OBSERVATORY_X_FINISH = HIGH_ROUTE_PLATFORMS[HIGH_ROUTE_PLATFORMS.length - 1];
const OBSERVATORY_X_BOARD_CHECKPOINTS = Object.freeze([3, 7, 11, 15, 19]
  .map((index) => HIGH_ROUTE_PLATFORMS[index]));
const OBSERVATORY_X_FINAL_CHECKPOINT = HIGH_ROUTE_PLATFORMS[25];
// They remain spaced so the player cannot jump over any mandatory board.
const BOARD_PARKOUR_COUNT = 20;
const MAX_SPRINT_JUMP_METERS = 5.6 * 1.22 * (2 * 6.6 / 18);
const REQUIRED_SKIP_CLEARANCE = MAX_SPRINT_JUMP_METERS + 0.08;
const teleportSkipGap = HIGH_ROUTE_PLATFORMS[1].z - 2.8
  - 2.4 - HIGH_ROUTE_PLATFORMS[1].depth * 0.5;
if (teleportSkipGap <= REQUIRED_SKIP_CLEARANCE) {
  throw new Error('Observatory X first mandatory board can be skipped from the teleport deck.');
}
for (let index = 0; index < BOARD_PARKOUR_COUNT - 2; index++) {
  const first = HIGH_ROUTE_PLATFORMS[index];
  const landing = HIGH_ROUTE_PLATFORMS[index + 2];
  const centerDistance = Math.hypot(landing.x - first.x, landing.z - first.z);
  const firstRadius = Math.hypot(first.width * 0.5, first.depth * 0.5);
  const landingRadius = Math.hypot(landing.width * 0.5, landing.depth * 0.5);
  const conservativeEdgeGap = centerDistance - firstRadius - landingRadius;
  if (conservativeEdgeGap <= REQUIRED_SKIP_CLEARANCE) {
    throw new Error('Observatory X route permits skipping ' + HIGH_ROUTE_PLATFORMS[index + 1].name
      + ': edge gap ' + conservativeEdgeGap.toFixed(2) + 'm.');
  }
}
if (HIGH_ROUTE_PLATFORMS.slice(0, BOARD_PARKOUR_COUNT).length !== 20) {
  throw new Error('Observatory X must contain exactly 20 precision boards.');
}

// Keep every transition between the beam, rotor, prism climb and finish reachable.
for (let index = 0; index < HIGH_ROUTE_PLATFORMS.length - 1; index++) {
  const current = HIGH_ROUTE_PLATFORMS[index];
  const next = HIGH_ROUTE_PLATFORMS[index + 1];
  const gapZ = Math.max(0, next.z - current.z - (current.depth + next.depth) * 0.5);
  const gapX = Math.max(0, Math.abs(next.x - current.x) - (current.width + next.width) * 0.5);
  const edgeDistance = Math.hypot(gapX, gapZ);
  if (edgeDistance > MAX_SPRINT_JUMP_METERS || next.top - current.top > 0.95) {
    throw new Error('Observatory X transition is outside the safe jump envelope: '
      + current.name + ' -> ' + next.name + '.');
  }
}

if (HIGH_ROUTE_PLATFORMS.length !== 27) {
  throw new Error('Observatory X must contain 20 boards plus 7 varied obstacle structures.');
}
if (HIGH_ROUTE_PLATFORMS.some((platform) => platform.choiceGroup || platform.choiceSide)) {
  throw new Error('Observatory X must remain a single route without branches.');
}

const TELEPORT_ARRIVAL_CENTER = Object.freeze({ x: 0, z: HIGH_ROUTE_START_Z });
const OBSERVATORY_X_LENGTH_METERS = HIGH_ROUTE_PLATFORMS.reduce((length, platform, index) => {
  const previous = index === 0 ? TELEPORT_ARRIVAL_CENTER : HIGH_ROUTE_PLATFORMS[index - 1];
  return length + Math.hypot(platform.x - previous.x, platform.z - previous.z);
}, 0);
if (OBSERVATORY_X_LENGTH_METERS >= 170) {
  throw new Error('Observatory X centerline route must stay below 170 meters.');
}
if (Math.abs(OBSERVATORY_X_LENGTH_METERS - 135) > 0.02) {
  throw new Error('Observatory X centerline route must stay at 135 meters.');
}

export const LEVEL_FIVE_PARKOUR = Object.freeze({
  spawn: Object.freeze({ x: 0, y: 0.42, z: -35.0, yaw: Math.PI }),
  finishTrigger: Object.freeze({ x: OBSERVATORY_X_FINISH.x, z: OBSERVATORY_X_FINISH.z, rx: 2.15, rz: 2.55 }),
  platforms: Object.freeze([
    // Existing warm-up, pressure-plate puzzle, teleport pad, and arrival deck are unchanged.
    Object.freeze({ name: 'MemoryGalleryStartDeck', x: 0, z: -35.0, top: 0.42, width: 7.2, depth: 4.6, color: '#638f99', edge: '#d8fbff', start: true }),
    Object.freeze({ name: 'MemoryCube01', x: 0.0, z: -31.4, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#63b8bd', edge: '#d9ffff', memoryBlock: true }),
    Object.freeze({ name: 'MemoryCube02', x: 1.25, z: -29.5, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#9383c5', edge: '#f0e7ff', memoryBlock: true }),
    Object.freeze({ name: 'MemoryCube03', x: -1.25, z: -27.6, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#6fa8c2', edge: '#e0f6ff', memoryBlock: true }),
    Object.freeze({ name: 'MemoryCube04', x: 1.25, z: -25.7, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#b18bb7', edge: '#ffeafa', memoryBlock: true }),
    Object.freeze({ name: 'MemoryCube05', x: -1.25, z: -23.8, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#68b6a6', edge: '#ddfff1', memoryBlock: true }),
    Object.freeze({ name: 'MemoryCube06', x: 1.25, z: -21.9, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#a48bc8', edge: '#f0e9ff', memoryBlock: true }),
    Object.freeze({ name: 'MemoryCube07', x: -1.25, z: -20.0, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#6cabb8', edge: '#e0faff', memoryBlock: true }),
    Object.freeze({ name: 'MemoryCube08', x: 1.25, z: -18.1, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#b28ca7', edge: '#ffeaf6', memoryBlock: true }),
    Object.freeze({ name: 'MemoryCube09', x: 0.0, z: -16.2, top: 1.19, blockHeight: 1.12, width: 1.12, depth: 1.12, color: '#73b7ad', edge: '#e0fff4', memoryBlock: true }),
    Object.freeze({ name: 'MemoryGalleryFinishDeck', x: 0, z: -13.2, top: 0.42, width: 7.2, depth: 4.8, color: '#8b8caf', edge: '#f0eaff' }),
    Object.freeze({ name: 'GallerySwitchDeck', x: 0, z: -7.0, top: 0.42, width: 10.6, depth: 8.4, color: '#6e999f', edge: '#d6fff5', checkpoint: true }),
    Object.freeze({ name: 'TeleportArrivalDeck', x: 0, z: 2.8, top: 6.8, width: 7.4, depth: 4.8, color: '#5f9caa', edge: '#d8ffff', checkpoint: true }),
    ...HIGH_ROUTE_PLATFORMS
  ])
});

export const level5 = {
  id: 5,
  name: 'Observatory X',
  token: 'quest:v3:level-5',
  mechanic: 'memory-gallery-teleport',
  checkpointLabel: 'Memory Beacon',
  finishTrigger: LEVEL_FIVE_PARKOUR.finishTrigger,
  finishRequirements: Object.freeze({ checkpoints: true, mechanic: true }),
  color: '#78999f',
  bright: '#c8eeee',
  trigger: LEVEL_ENTRY_PORTALS[4].trigger,
  itemX: 0,
  mechanicIntro: 'LEVEL 5: OBSERVATORY X. Selesaikan Memory Gallery dan aktifkan TP Pad. Setelah teleport, tempuh lintasan zig-zag 135 meter: lewati tepat 20 papan presisi, dua jembatan keseimbangan (jembatan kedua bergerak), arena rotor holografik, lalu panjat tiga balok prisma menuju FINISH.',
  reward: { pawTokens: 500, badge: 'Memory Keeper', unlock: 'Starlight Paw' },
  obstacles: []
};

export const puzzleSequence5 = [
  [0, -35.0, 0.42],
  [0, -7.0, 0.42],
  [0, 2.8, 6.8],
  ...OBSERVATORY_X_BOARD_CHECKPOINTS.map(({ x, z, top }) => [x, z, top]),
  [OBSERVATORY_X_FINAL_CHECKPOINT.x, OBSERVATORY_X_FINAL_CHECKPOINT.z, OBSERVATORY_X_FINAL_CHECKPOINT.top]
];
