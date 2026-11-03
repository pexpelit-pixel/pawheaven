import coinCollect from './SFX/rewards/coin_collect.wav';
import gemCollect from './SFX/rewards/gem_collect.wav';
import heartCollect from './SFX/rewards/heart_collect.wav';
import levelComplete from './SFX/rewards/music_box_level_complete.wav';
import levelStart from './SFX/rewards/music_box_level_start.wav';
import positiveChime from './SFX/rewards/music_box_chime_positive.wav';
import mystery from './SFX/rewards/music_box_mystery.wav';
import positiveLong from './SFX/rewards/music_box_positive_long.wav';

const SOUNDS = Object.freeze({
  'level-start': { source: levelStart, volume: 0.20, cooldown: 1200 },
  checkpoint: { source: positiveChime, volume: 0.18, cooldown: 700 },
  'level-complete': { source: levelComplete, volume: 0.18, cooldown: 1200 },
  coin: { source: coinCollect, volume: 0.18, cooldown: 160 },
  gem: { source: gemCollect, volume: 0.18, cooldown: 400 },
  heart: { source: heartCollect, volume: 0.18, cooldown: 400 },
  mystery: { source: mystery, volume: 0.20, cooldown: 1400 },
  'gift-reveal': { source: positiveLong, volume: 0.23, cooldown: 5000 }
});

const MAX_PENDING = 8;
let player = null;
let queue = [];
let playing = false;
let playbackId = 0;
let lastPlayedAt = new Map();
let visibilityHandler = null;

function stopQueue() {
  queue.length = 0;
  playing = false;
  playbackId += 1;
  if (player) {
    player.pause();
    try { player.currentTime = 0; } catch { /* Ignore media that is not ready. */ }
  }
}

function playNext() {
  if (!player || playing || queue.length === 0) return;
  const entry = queue.shift();
  const currentId = ++playbackId;
  playing = true;

  try {
    player.pause();
    if (player._rdsSource !== entry.source) {
      player.src = entry.source;
      player._rdsSource = entry.source;
      player.load();
    }
    try { player.currentTime = 0; } catch { /* Metadata may still be loading. */ }
    player.volume = entry.volume;
    player.playbackRate = 1;
    const playback = player.play();
    playback?.catch?.(() => {
      if (currentId !== playbackId) return;
      stopQueue();
    });
  } catch {
    if (currentId === playbackId) stopQueue();
  }
}

function advanceQueue() {
  if (!playing) return;
  playing = false;
  playbackId += 1;
  playNext();
}

function ensurePlayer() {
  if (player || typeof Audio === 'undefined') return Boolean(player);
  player = new Audio();
  player.preload = 'none';
  player.volume = 0.2;
  player.setAttribute('playsinline', '');
  player._rdsSource = '';
  player.addEventListener('ended', advanceQueue);
  player.addEventListener('error', advanceQueue);

  if (typeof document !== 'undefined') {
    visibilityHandler = () => {
      if (document.hidden) stopQueue();
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }
  return true;
}

export function playRewardFx(kind) {
  const sound = SOUNDS[kind];
  if (!sound || !ensurePlayer()) return false;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const previous = lastPlayedAt.get(kind) ?? -Infinity;
  if (now - previous < sound.cooldown) return false;

  // Checkpoint pings are intentionally dropped while another reward cue is playing.
  // This prevents a rapid checkpoint sequence from delaying more important rewards.
  if (kind === 'checkpoint' && (playing || queue.length > 0)) return false;

  lastPlayedAt.set(kind, now);
  queue.push({ source: sound.source, volume: sound.volume });
  if (queue.length > MAX_PENDING) queue.shift();
  playNext();
  return true;
}

export function playRewardFxSequence(kinds) {
  if (!Array.isArray(kinds)) return;
  for (const kind of kinds) playRewardFx(kind);
}

export function disposeRewardFx() {
  if (typeof document !== 'undefined' && visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
  }
  visibilityHandler = null;
  stopQueue();
  if (player) {
    player.removeEventListener('ended', advanceQueue);
    player.removeEventListener('error', advanceQueue);
    player.removeAttribute('src');
    player.load();
  }
  player = null;
  queue = [];
  playing = false;
  lastPlayedAt.clear();
}
