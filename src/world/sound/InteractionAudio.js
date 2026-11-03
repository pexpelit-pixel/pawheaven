import cardboardClose from './SFX/interaction/cardboard_box_close.wav';
import cardboardDrop from './SFX/interaction/cardboard_drop.wav';
import cardboardPickup from './SFX/interaction/cardboard_pick_up.wav';
import cardboardPush from './SFX/interaction/cardboard_push.wav';
import itemEquip from './SFX/interaction/item_equip.wav';
import metalClang from './SFX/interaction/metal_clang.wav';
import woodDrop from './SFX/interaction/wood_small_drop.wav';
import woodHollow from './SFX/interaction/wood_small_hollow.wav';
import woodPickup from './SFX/interaction/wood_small_pickup.wav';

const POOL_SIZE = 3;
const COOLDOWNS_MS = Object.freeze({
  pickup: 85,
  drop: 95,
  equip: 70,
  push: 165,
  'gift-open': 600,
  'gift-close': 600
});

let players = null;
let cursor = 0;
let lastPlayedAt = new Map();
let visibilityHandler = null;

function createPlayer() {
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.24;
  audio.setAttribute('playsinline', '');
  audio._rdsSource = '';
  audio.addEventListener('error', () => {
    // Interaction audio is optional and must never interrupt gameplay.
  });
  return audio;
}

function ensurePlayers() {
  if (players) return;
  players = Array.from({ length: POOL_SIZE }, createPlayer);
  if (typeof document !== 'undefined') {
    visibilityHandler = () => {
      if (!document.hidden) return;
      for (const audio of players || []) {
        audio.pause();
        try { audio.currentTime = 0; } catch { /* Ignore unloaded media. */ }
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }
}

function describeTarget(target) {
  if (typeof target === 'string') return target.toLowerCase();
  if (!target || typeof target !== 'object') return '';
  return [
    target.id,
    target.objectId,
    target.propId,
    target.name,
    target.type
  ].filter((value) => typeof value === 'string').join(' ').toLowerCase();
}

function resolveSound(kind, target) {
  const descriptor = describeTarget(target);
  const cardboard = /crate|cardboard|carton|box/.test(descriptor);
  const metal = /metal|gear|water[- ]?bowl|bowl/.test(descriptor);

  if (kind === 'pickup') {
    return cardboard
      ? { source: cardboardPickup, volume: 0.24 }
      : { source: woodPickup, volume: 0.22 };
  }
  if (kind === 'drop') {
    return cardboard
      ? { source: cardboardDrop, volume: 0.25 }
      : { source: woodDrop, volume: 0.24 };
  }
  if (kind === 'equip') return { source: itemEquip, volume: 0.22 };
  if (kind === 'push') {
    if (cardboard) return { source: cardboardPush, volume: 0.23 };
    if (metal) return { source: metalClang, volume: 0.20 };
    return { source: woodHollow, volume: 0.19 };
  }
  if (kind === 'gift-open') return { source: cardboardPush, volume: 0.22 };
  if (kind === 'gift-close') return { source: cardboardClose, volume: 0.24 };
  return null;
}

export function playInteractionFx(kind, target = null) {
  const sound = resolveSound(kind, target);
  if (!sound || typeof Audio === 'undefined') return;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const cooldown = COOLDOWNS_MS[kind] || 100;
  const previous = lastPlayedAt.get(kind) || -Infinity;
  if (now - previous < cooldown) return;
  lastPlayedAt.set(kind, now);

  ensurePlayers();
  const audio = players[cursor++ % players.length];
  try {
    audio.pause();
    if (audio._rdsSource !== sound.source) {
      audio.src = sound.source;
      audio._rdsSource = sound.source;
      audio.load();
    }
    try { audio.currentTime = 0; } catch { /* Metadata may still be loading. */ }
    audio.volume = sound.volume;
    audio.playbackRate = 1;
    const playback = audio.play();
    playback?.catch?.(() => {
      // Browser autoplay policy and device audio focus are non-fatal.
    });
  } catch {
    // Never let an audio failure interrupt an interaction or physics step.
  }
}

export function disposeInteractionFx() {
  if (typeof document !== 'undefined' && visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
  }
  visibilityHandler = null;
  for (const audio of players || []) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  players = null;
  cursor = 0;
  lastPlayedAt.clear();
}
