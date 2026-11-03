import { LEVEL_ENTRY_PORTALS } from '../world/LevelAnchors.js';

export const LEVEL_ONE_PARKOUR = Object.freeze({
  spawn: Object.freeze({ x: 0, y: 0.34, z: -6.48, yaw: Math.PI }),
  finishTrigger: Object.freeze({ x: 4.4, z: 8.35, rx: 1.05, rz: 0.82 }),
  platforms: Object.freeze([
    Object.freeze({ name: 'StartGrove', x: 0, z: -6.48, top: 0.34, width: 2.8, depth: 1.6, color: '#4c8a67', edge: '#c9e9a8', start: true }),
    Object.freeze({ name: 'MossStep01', x: -2.35, z: -4.35, top: 0.74, width: 1.25, depth: 1.25, color: '#658f5d', edge: '#c9e9a8', checkpoint: 1 }),
    Object.freeze({ name: 'MossStep02', x: 0, z: -2.65, top: 1.16, width: 1.20, depth: 1.20, color: '#527f68', edge: '#a7dfb1', saw: true }),
    Object.freeze({ name: 'BalanceBeam', x: 1.75, z: -0.65, top: 0.91, width: 0.65, depth: 1.30, color: '#6f9f71', edge: '#e3d58b', beam: true }),
    Object.freeze({ name: 'PawBeacon02', x: 3.35, z: 0.95, top: 1.38, width: 1.30, depth: 1.30, color: '#65956a', edge: '#c9e9a8', checkpoint: 2 }),
    Object.freeze({ name: 'CanopyHop', x: 0.10, z: 2.55, top: 1.92, width: 1.20, depth: 1.20, color: '#4f8269', edge: '#b7e6a5' }),
    Object.freeze({ name: 'PawBeacon03', x: -2.6, z: 4.65, top: 1.48, width: 1.30, depth: 1.30, color: '#6f9f71', edge: '#e3d58b', checkpoint: 3 }),
    Object.freeze({ name: 'LanternLeap', x: -0.4, z: 6.0, top: 2.02, width: 1.30, depth: 1.30, color: '#527f68', edge: '#c9e9a8' }),
    Object.freeze({ name: 'ExitLily', x: 1.6, z: 6.40, top: 1.54, width: 1.20, depth: 1.25, color: '#5d936d', edge: '#b7e6a5' }),
    Object.freeze({ name: 'FinishGrove', x: 4.4, z: 8.35, top: 1.82, width: 2.65, depth: 2.15, color: '#83b77c', edge: '#fff0df', finish: true })
  ])
});

export const level1 = {
  id: 1, name: 'Moss Garden Parkour', token: 'quest:v3:level-1', mechanic: 'parkour',
  checkpointLabel: 'Paw Beacon',
  finishRequirements: Object.freeze({ checkpoints: true }),
  color: '#70a978', bright: '#c9e9a8', trigger: LEVEL_ENTRY_PORTALS[0].trigger, itemX: 4.4,
  finishTrigger: LEVEL_ONE_PARKOUR.finishTrigger,
  mechanicIntro: 'Parkour Moss Garden: lompat zig-zag melewati batu lumut, seberangi balance beam dan hindari Moss Saw. Injak pressure plate di FINISH untuk menyelesaikan misi dan kembali ke shelter.',
  reward: { pawTokens: 100, badge: 'Moss Scout', unlock: 'Leaflight Trail' },
  obstacles: []
};

export const puzzleSequence1 = [[-2.35,-4.35,0.74],[3.35,0.95,1.38],[-2.6,4.65,1.48]];
