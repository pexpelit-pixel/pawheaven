import { LEVEL_ENTRY_PORTALS } from '../world/LevelAnchors.js';

export const LEVEL_TWO_PARKOUR = Object.freeze({
  spawn: Object.freeze({ x: 0, y: 0.34, z: -7.45, yaw: Math.PI }),
  finishTrigger: Object.freeze({ x: 4.25, z: 8.85, rx: 1.00, rz: 0.72 }),
  platforms: Object.freeze([
    Object.freeze({ name: 'CloudLaunch', x: 0, z: -7.45, top: 0.34, width: 2.8, depth: 1.55, color: '#4b91a8', edge: '#d4f6f7', start: true }),
    Object.freeze({ name: 'CloudStep01', x: 1.85, z: -5.45, top: 0.78, width: 1.08, depth: 1.05, color: '#5da9bd', edge: '#d4f6f7', checkpoint: 1 }),
    Object.freeze({ name: 'CloudRotor', x: 3.95, z: -3.65, top: 1.24, width: 1.08, depth: 1.02, color: '#4b91a8', edge: '#b7eff2', rotor: true }),
    Object.freeze({ name: 'NeedleBeam', x: 2.10, z: -1.80, top: 0.97, width: 0.52, depth: 1.55, color: '#75bdc9', edge: '#fff0cf', beam: true }),
    Object.freeze({ name: 'SkyBeacon02', x: -0.10, z: -0.05, top: 1.54, width: 1.08, depth: 1.08, color: '#5da9bd', edge: '#d4f6f7', checkpoint: 2 }),
    Object.freeze({ name: 'WindGap', x: -2.55, z: 1.45, top: 2.08, width: 0.96, depth: 0.96, color: '#4b91a8', edge: '#b7eff2' }),
    Object.freeze({ name: 'NeedlePillar', x: -4.65, z: 3.15, top: 1.78, width: 0.92, depth: 1.00, color: '#75bdc9', edge: '#fff0cf', rotor: true }),
    Object.freeze({ name: 'SkyBeacon03', x: -2.55, z: 4.95, top: 2.36, width: 1.12, depth: 1.12, color: '#5da9bd', edge: '#d4f6f7', checkpoint: 3 }),
    Object.freeze({ name: 'CrosswindBeam', x: -0.10, z: 6.35, top: 1.94, width: 0.50, depth: 1.48, color: '#4b91a8', edge: '#fff0cf', beam: true }),
    Object.freeze({ name: 'CloudSpire', x: 2.00, z: 7.75, top: 2.48, width: 0.96, depth: 0.98, color: '#75bdc9', edge: '#b7eff2' }),
    Object.freeze({ name: 'FinishCrown', x: 4.25, z: 8.85, top: 2.20, width: 2.35, depth: 1.75, color: '#83c8d2', edge: '#fff0cf', finish: true })
  ])
});

export const level2 = {
  id: 2, name: 'Cloudbreak Sky Parkour', token: 'quest:v3:level-2', mechanic: 'parkour',
  checkpointLabel: 'Sky Beacon',
  finishRequirements: Object.freeze({ checkpoints: true }),
  color: '#73bfd0', bright: '#b7eff2', trigger: LEVEL_ENTRY_PORTALS[1].trigger, itemX: 4.25,
  finishTrigger: LEVEL_TWO_PARKOUR.finishTrigger,
  mechanicIntro: 'Misi Sky Parkour: taklukkan sebelas pulau awan, lompati celah lebar, seimbangkan K-09 di dua Needle Beam, hindari rotor angin, lalu injak pressure plate di FINISH CROWN. Jatuh mengembalikanmu ke checkpoint terakhir.',
  reward: { pawTokens: 200, badge: 'Cloudbreak Ace', unlock: 'Cloudline Dash' },
  obstacles: []
};

export const puzzleSequence2 = [[1.85,-5.45,0.78],[-0.10,-0.05,1.54],[-2.55,4.95,2.36]];
