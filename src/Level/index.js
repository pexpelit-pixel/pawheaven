import { level1, LEVEL_ONE_PARKOUR, puzzleSequence1 } from './level-1.js';
import { level2, LEVEL_TWO_PARKOUR, puzzleSequence2 } from './level-2.js';
import { level3, LEVEL_THREE_PARKOUR, puzzleSequence3 } from './level-3.js';
import { level4, LEVEL_FOUR_PARKOUR, puzzleSequence4 } from './level-4.js';
import { level5, LEVEL_FIVE_PARKOUR, puzzleSequence5 } from './level-5.js';

// One registry entry per playable level. Runtime systems consume this shared registry.
export const LEVELS = [level1, level2, level3, level4, level5];

export const PARKOUR_COURSES = Object.freeze({
  1: LEVEL_ONE_PARKOUR,
  2: LEVEL_TWO_PARKOUR,
  3: LEVEL_THREE_PARKOUR,
  4: LEVEL_FOUR_PARKOUR,
  5: LEVEL_FIVE_PARKOUR
});

export { LEVEL_ONE_PARKOUR, LEVEL_TWO_PARKOUR, LEVEL_THREE_PARKOUR, LEVEL_FOUR_PARKOUR, LEVEL_FIVE_PARKOUR };

export const PUZZLE_SEQUENCES = {
  1: puzzleSequence1,
  2: puzzleSequence2,
  3: puzzleSequence3,
  4: puzzleSequence4,
  5: puzzleSequence5
};

export function getLevelDefinition(id) {
  return LEVELS.find((level) => level.id === Number(id)) || null;
}
