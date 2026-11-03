import ambientWind from './SFX/environment/ambient_wind.wav';
import doorClose from './SFX/environment/door_close.wav';
import doorOpen from './SFX/environment/door_open.wav';
import waterBabbling from './SFX/environment/water_babbling_loop.wav';
import waterDrop from './SFX/environment/water_drop_medium.wav';
import waterSplashing from './SFX/environment/water_splashing.wav';

const WATER_BAR = Object.freeze({ x: 10.5, z: -13.55, radius: 4.7 });
const UPDATE_INTERVAL = 0.25;
const ONE_SHOT_POOL_SIZE = 3;

let oneShotPlayers = null;
let oneShotCursor = 0;

function createAudioPlayer(volume = 0.2) {
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = volume;
  audio.setAttribute('playsinline', '');
  audio._rdsSource = '';
  audio.addEventListener('error', () => {
    // Environmental audio is optional and must never interrupt gameplay.
  });
  return audio;
}

function ensureOneShotPlayers() {
  if (oneShotPlayers) return;
  oneShotPlayers = Array.from({ length: ONE_SHOT_POOL_SIZE }, () => createAudioPlayer());
}

function playOneShot(source, volume) {
  if (typeof Audio === 'undefined' || !source) return;
  ensureOneShotPlayers();
  const audio = oneShotPlayers[oneShotCursor++ % oneShotPlayers.length];
  try {
    audio.pause();
    if (audio._rdsSource !== source) {
      audio.src = source;
      audio._rdsSource = source;
      audio.load();
    }
    try { audio.currentTime = 0; } catch { /* Metadata may still be loading. */ }
    audio.loop = false;
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.playbackRate = 1;
    const playback = audio.play();
    playback?.catch?.(() => {
      // Browser autoplay policy or device audio focus is non-fatal.
    });
  } catch {
    // Sound must never block a portal transition or environment update.
  }
}

export function playPortalTransitionFx(toBlack) {
  playOneShot(toBlack ? doorClose : doorOpen, toBlack ? 0.20 : 0.22);
}

export class EnvironmentAudio {
  constructor() {
    this.windAudio = null;
    this.waterAudio = null;
    this.updateElapsed = UPDATE_INTERVAL;
    this.dripElapsed = 0;
    this.nextDripAt = 10 + Math.random() * 5;
    this.wasNearWater = false;
    this.disposed = false;
    this.onVisibilityChange = () => {
      if (document.hidden) this.stopAll();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  setLoopAudio(field, source, active, volume) {
    if (this.disposed || typeof Audio === 'undefined') return;
    let audio = this[field];
    if (!active) {
      if (audio && !audio.paused) {
        audio.pause();
        try { audio.currentTime = 0; } catch { /* Ignore unloaded media. */ }
      }
      return;
    }

    if (!audio) {
      audio = createAudioPlayer(volume);
      audio.loop = true;
      this[field] = audio;
    }
    if (audio._rdsSource !== source) {
      audio.src = source;
      audio._rdsSource = source;
      audio.load();
    }
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, volume));
    if (audio.paused) {
      try {
        const playback = audio.play();
        playback?.catch?.(() => {
          // Retry on a later coarse update if the browser has not unlocked audio yet.
        });
      } catch {
        // A blocked ambience loop is retried later without affecting gameplay.
      }
    }
  }

  update(dt, position, inLevel = false) {
    if (this.disposed || !position) return;
    this.updateElapsed += Math.min(0.1, Math.max(0, Number(dt) || 0));
    if (this.updateElapsed < UPDATE_INTERVAL) return;
    const step = this.updateElapsed;
    this.updateElapsed = 0;

    const levelActive = inLevel === true;
    this.setLoopAudio('windAudio', ambientWind, levelActive, 0.11);

    const dx = position.x - WATER_BAR.x;
    const dz = position.z - WATER_BAR.z;
    const distanceSq = dx * dx + dz * dz;
    const nearWaterBar = !levelActive && distanceSq <= WATER_BAR.radius * WATER_BAR.radius;

    if (nearWaterBar) {
      const distance = Math.sqrt(distanceSq);
      const proximity = Math.max(0, 1 - distance / WATER_BAR.radius);
      this.setLoopAudio('waterAudio', waterBabbling, true, 0.035 + proximity * 0.065);
      if (!this.wasNearWater) playOneShot(waterSplashing, 0.12);

      this.dripElapsed += step;
      if (this.dripElapsed >= this.nextDripAt) {
        playOneShot(waterDrop, 0.13);
        this.dripElapsed = 0;
        this.nextDripAt = 12 + Math.random() * 7;
      }
    } else {
      this.setLoopAudio('waterAudio', waterBabbling, false, 0);
      this.dripElapsed = 0;
    }

    this.wasNearWater = nearWaterBar;
  }

  stopAmbience() {
    this.setLoopAudio('windAudio', ambientWind, false, 0);
    this.setLoopAudio('waterAudio', waterBabbling, false, 0);
    this.wasNearWater = false;
    this.dripElapsed = 0;
  }

  stopAll() {
    for (const audio of [this.windAudio, this.waterAudio, ...(oneShotPlayers || [])]) {
      if (!audio) continue;
      audio.pause();
      try { audio.currentTime = 0; } catch { /* Ignore unloaded media. */ }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    for (const audio of [this.windAudio, this.waterAudio]) {
      if (!audio) continue;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.windAudio = null;
    this.waterAudio = null;
    for (const audio of oneShotPlayers || []) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    oneShotPlayers = null;
    oneShotCursor = 0;
  }
}
