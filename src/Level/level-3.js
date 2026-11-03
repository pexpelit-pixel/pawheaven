import { LEVEL_ENTRY_PORTALS } from '../world/LevelAnchors.js';

export const LEVEL_THREE_PARKOUR = Object.freeze({
  spawn: Object.freeze({ x: 0, y: 0.34, z: -26.0, yaw: Math.PI }),
  finishTrigger: Object.freeze({ x: 10.0, z: 27.5, rx: 1.35, rz: 1.1 }),
  platforms: Object.freeze([
    Object.freeze({ name: 'TimberStartDeck', x: 0, z: -26.0, top: 0.34, width: 9.4, depth: 5.8, color: '#a86e45', edge: '#ffd18a', start: true }),
    Object.freeze({ name: 'TimberStep01', x: -5.8, z: -20.5, top: 0.82, width: 1.6, depth: 1.45, color: '#bd8350', edge: '#ffe0a5', checkpoint: 1 }),
    Object.freeze({ name: 'MovingBoardWest', x: -9.5, z: -16.5, top: 1.3, width: 2.0, depth: 1.5, color: '#b77b4d', edge: '#ffe0a5', movingAxis: 'z', moveRange: 0.9, moveSpeed: 0.62, movePhase: 0.25 }),
    Object.freeze({ name: 'NarrowLogBeam', x: -13.0, z: -12.7, top: 0.98, width: 0.55, depth: 1.9, color: '#8d593d', edge: '#ffdf9c', beam: true }),
    Object.freeze({ name: 'TimberBeacon02', x: -9.0, z: -9.5, top: 1.5, width: 1.45, depth: 1.45, color: '#d09258', edge: '#fff0c3', checkpoint: 2 }),
    Object.freeze({ name: 'MovingBoardEast', x: -4.4, z: -6.0, top: 2.1, width: 1.9, depth: 1.5, color: '#a86e45', edge: '#ffd18a', movingAxis: 'x', moveRange: 1.1, moveSpeed: 0.7, movePhase: 1.4 }),
    Object.freeze({ name: 'TimberStep03', x: 0.0, z: -2.5, top: 1.65, width: 1.25, depth: 1.25, color: '#bd8350', edge: '#ffe0a5' }),
    Object.freeze({ name: 'SplitRail', x: 4.0, z: 0.0, top: 2.2, width: 0.52, depth: 1.95, color: '#8d593d', edge: '#fff0c3', beam: true }),
    Object.freeze({ name: 'MovingBoardSouth', x: 8.0, z: 3.5, top: 2.8, width: 2.0, depth: 1.5, color: '#a86e45', edge: '#ffd18a', movingAxis: 'z', moveRange: 1.0, moveSpeed: 0.78, movePhase: 2.05 }),
    Object.freeze({ name: 'TimberBeacon03', x: 5.5, z: 7.4, top: 2.2, width: 1.45, depth: 1.45, color: '#d09258', edge: '#fff0c3', checkpoint: 3 }),
    Object.freeze({ name: 'SawtoothLedge', x: 1.5, z: 11.0, top: 2.75, width: 1.32, depth: 1.32, color: '#96603f', edge: '#ffd18a', saw: true }),
    Object.freeze({ name: 'TimberNarrowBridge', x: -2.0, z: 13.6, top: 2.2, width: 0.5, depth: 1.9, color: '#8d593d', edge: '#fff0c3', beam: true }),
    Object.freeze({ name: 'MovingBoardNorth', x: -5.5, z: 16.0, top: 2.9, width: 1.9, depth: 1.45, color: '#bd8350', edge: '#ffe0a5', movingAxis: 'x', moveRange: 1.2, moveSpeed: 0.88, movePhase: 0.8 }),
    Object.freeze({ name: 'LanternTurn', x: -2.0, z: 19.0, top: 2.35, width: 1.35, depth: 1.35, color: '#a86e45', edge: '#ffd18a' }),
    Object.freeze({ name: 'LastTimberStep', x: 2.0, z: 21.5, top: 2.85, width: 1.35, depth: 1.35, color: '#bd8350', edge: '#ffe0a5' }),
    Object.freeze({ name: 'MovingBoardCrown', x: 6.0, z: 24.5, top: 3.2, width: 2.0, depth: 1.55, color: '#bd8350', edge: '#fff0c3', movingAxis: 'z', moveRange: 0.75, moveSpeed: 0.88, movePhase: 1.1 }),
    Object.freeze({ name: 'TimberFinishDeck', x: 10.0, z: 27.5, top: 3.0, width: 3.8, depth: 3.4, color: '#d99c61', edge: '#fff3d7', finish: true })
  ])
});

export const level3 = {
  id: 3, name: 'Timberfall Gauntlet XL', token: 'quest:v3:level-3', mechanic: 'parkour',
  checkpointLabel: 'Timber Beacon',
  finishRequirements: Object.freeze({ checkpoints: true, mechanic: false }),
  color: '#c76d4a', bright: '#ffbd72', trigger: LEVEL_ENTRY_PORTALS[2].trigger, itemX: 10.0,
  finishTrigger: LEVEL_THREE_PARKOUR.finishTrigger,
  mechanicIntro: 'LEVEL 3 XL: Timberfall Gauntlet. Lintasi arena raksasa sepanjang lebih dari 50 meter, dorong balok ke target sebagai tantangan bonus, atur timing lima papan bergerak, seberangi log beam tipis, hindari gergaji, dan aktifkan tiga Timber Beacon. Injak pressure plate di FINISH untuk kembali ke shelter. Jatuh mengembalikanmu ke checkpoint terakhir.',
  reward: { pawTokens: 300, badge: 'Timberfall Daredevil', unlock: 'Gyro Tread' },
  obstacles: []
};

export const puzzleSequence3 = [[-5.8,-20.5,0.82],[-9.0,-9.5,1.5],[5.5,7.4,2.2]];
