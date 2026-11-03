import { LEVEL_ENTRY_PORTALS } from '../world/LevelAnchors.js';

export const LEVEL_FOUR_PARKOUR = Object.freeze({
  spawn: Object.freeze({ x: 0, y: 0.42, z: -26.0, yaw: Math.PI }),
  finishTrigger: Object.freeze({ x: -5.2, z: 44.0, rx: 1.55, rz: 1.30 }),
  platforms: Object.freeze([
    Object.freeze({ name: 'VioletStartDeck', x: 0, z: -26.0, top: 0.42, width: 7.6, depth: 6.2, color: '#7760a8', edge: '#e7d7ff', start: true }),
    Object.freeze({ name: 'ShatterStep01', x: -2.8, z: -20.6, top: 0.95, width: 1.85, depth: 1.75, color: '#8a70b8', edge: '#eadcff' }),
    Object.freeze({ name: 'VioletMovingWest', x: -6.0, z: -16.8, top: 1.55, width: 1.95, depth: 1.65, color: '#987cc7', edge: '#f0e4ff', movingAxis: 'z', moveRange: 0.78, moveSpeed: 0.82, movePhase: 0.4 }),
    Object.freeze({ name: 'HoloRotorWest', x: -8.4, z: -12.7, top: 2.20, width: 2.05, depth: 1.85, color: '#9074c0', edge: '#f0e4ff', spinBar: true, spinLength: 3.15, spinHeight: 0.82, spinSpeed: 1.48, spinPhase: 0.2 }),
    Object.freeze({ name: 'VioletLogBeam01', x: -6.0, z: -9.0, top: 2.00, width: 0.65, depth: 1.95, color: '#69558d', edge: '#e8d8ff', beam: true }),
    Object.freeze({ name: 'RuinBeacon01', x: -3.0, z: -5.2, top: 2.65, width: 1.82, depth: 1.78, color: '#a48bd0', edge: '#fff0ff', checkpoint: 1 }),
    Object.freeze({ name: 'VioletMovingEast', x: 1.0, z: -1.1, top: 3.25, width: 1.88, depth: 1.52, color: '#8f73bd', edge: '#f0e4ff', movingAxis: 'x', moveRange: 1.02, moveSpeed: 0.92, movePhase: 1.1 }),
    Object.freeze({ name: 'VioletTurnPad', x: 2.0, z: 3.0, top: 3.65, width: 1.85, depth: 1.75, color: '#a18aca', edge: '#fff0ff' }),
    Object.freeze({ name: 'ForkApproachA', x: 2.0, z: 7.0, top: 3.95, width: 2.05, depth: 1.85, color: '#9d83cc', edge: '#fff0ff' }),
    Object.freeze({ name: 'FlickerBoardA_Left', x: -1.5, z: 11.0, top: 4.55, width: 1.78, depth: 1.62, color: '#9275c1', edge: '#fff0ff', choiceGroup: 'violet-route-a', choiceSide: -1, choiceTrigger: Object.freeze({ x: 2.0, z: 7.0 }), choiceRadius: 7.0, choiceDuration: 4.25, choiceCooldown: 0.85 }),
    Object.freeze({ name: 'FlickerBoardA_Right', x: 5.5, z: 11.0, top: 4.55, width: 1.78, depth: 1.62, color: '#9275c1', edge: '#fff0ff', choiceGroup: 'violet-route-a', choiceSide: 1, choiceTrigger: Object.freeze({ x: 2.0, z: 7.0 }), choiceRadius: 7.0, choiceDuration: 4.25, choiceCooldown: 0.85 }),
    Object.freeze({ name: 'VioletMergeA', x: 2.0, z: 15.0, top: 5.05, width: 2.05, depth: 1.85, color: '#9f83cb', edge: '#fff0ff' }),
    Object.freeze({ name: 'HoloRotorSouth', x: 6.0, z: 18.5, top: 5.65, width: 2.02, depth: 1.88, color: '#8065ae', edge: '#eee0ff', spinBar: true, spinLength: 3.35, spinHeight: 0.86, spinSpeed: -1.82, spinPhase: 1.25 }),
    Object.freeze({ name: 'VioletLogBeam02', x: 8.5, z: 21.7, top: 5.30, width: 0.48, depth: 1.90, color: '#665183', edge: '#eee0ff', beam: true }),
    Object.freeze({ name: 'RuinBeacon02', x: 5.0, z: 24.5, top: 6.10, width: 1.82, depth: 1.78, color: '#a48bd0', edge: '#fff0ff', checkpoint: 2 }),
    Object.freeze({ name: 'VioletMovingNorth', x: 0.5, z: 28.0, top: 6.70, width: 1.92, depth: 1.48, color: '#9276c2', edge: '#f0e4ff', movingAxis: 'z', moveRange: 1.08, moveSpeed: 1.02, movePhase: 2.0 }),
    Object.freeze({ name: 'HoloRotorNorth', x: -4.0, z: 31.5, top: 7.25, width: 2.05, depth: 1.85, color: '#8c70bb', edge: '#f0e4ff', spinBar: true, spinLength: 3.25, spinHeight: 0.84, spinSpeed: 1.95, spinPhase: 0.8 }),
    Object.freeze({ name: 'ForkApproachB', x: -5.0, z: 34.0, top: 7.65, width: 2.05, depth: 1.85, color: '#a48bd0', edge: '#fff0ff' }),
    Object.freeze({ name: 'FlickerBoardB_Left', x: -8.0, z: 37.5, top: 8.10, width: 1.78, depth: 1.58, color: '#9275c1', edge: '#fff0ff', choiceGroup: 'violet-route-b', choiceSide: -1, choiceTrigger: Object.freeze({ x: -5.0, z: 34.0 }), choiceRadius: 6.2, choiceDuration: 4.0, choiceCooldown: 0.8 }),
    Object.freeze({ name: 'FlickerBoardB_Right', x: -2.0, z: 37.5, top: 8.10, width: 1.78, depth: 1.58, color: '#9275c1', edge: '#fff0ff', choiceGroup: 'violet-route-b', choiceSide: 1, choiceTrigger: Object.freeze({ x: -5.0, z: 34.0 }), choiceRadius: 6.2, choiceDuration: 4.0, choiceCooldown: 0.8 }),
    Object.freeze({ name: 'RuinBeacon03', x: -5.2, z: 40.0, top: 8.42, width: 1.92, depth: 1.82, color: '#ae96d8', edge: '#fff5ff', checkpoint: 3 }),
    Object.freeze({ name: 'VioletFinishDeck', x: -5.2, z: 44.0, top: 8.72, width: 4.0, depth: 3.45, color: '#c3a8ec', edge: '#fff5ff', finish: true })
  ])
});

export const level4 = {
  id: 4, name: 'Violet Gyrofall', token: 'quest:v3:level-4', mechanic: 'parkour',
  checkpointLabel: 'Ruin Beacon',
  finishTrigger: LEVEL_FOUR_PARKOUR.finishTrigger,
  finishRequirements: Object.freeze({ checkpoints: true, mechanic: false }),
  color: '#8065ae', bright: '#e2c6ff', trigger: LEVEL_ENTRY_PORTALS[3].trigger, itemX: -5.2,
  mechanicIntro: 'LEVEL 4: Violet Gyrofall. Mulai langsung dari start deck, daki lintasan setinggi 8,7 meter, seimbangkan tiga papan bergerak, lewati tiga batang holo berputar, dan pilih jalur papan fase yang berubah acak. Collider papan fase hanya bertahan beberapa detik. Aktifkan tiga Ruin Beacon sebelum FINISH.',
  reward: { pawTokens: 400, badge: 'Gyrofall Conqueror', unlock: 'Violet Singularity' },
  obstacles: []
};

export const puzzleSequence4 = [[-3.0,-5.2,2.65],[5.0,24.5,6.10],[-5.2,40.0,8.42]];
