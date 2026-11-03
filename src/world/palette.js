import WORLD_RULES from './worldrules.json';

/** Shared cozy pastel palette. Keep this as flat, cached material colors across all quality profiles. */
const DEFAULT_PALETTE = {
  wall: '#f2d9d4', wallShade: '#e9bec7', sage: '#a6cbb6', sageDark: '#718f7d',
  cream: '#fff3de', wood: '#c89069', woodDark: '#88604d', coral: '#f09caa',
  butter: '#f4d58c', sky: '#b8dbe8', navy: '#46526a', mint: '#c8e7d6',
  floorA: '#f0d9d4', floorB: '#f8eadd', metal: '#9db8bd', dark: '#4f5868',
  pink: '#f5bdcd', blue: '#bfdfe7', lavender: '#c9b8e8', peach: '#f5c9b6'
};

export const PALETTE = Object.freeze({
  ...DEFAULT_PALETTE,
  ...(WORLD_RULES.room?.palette || {})
});
