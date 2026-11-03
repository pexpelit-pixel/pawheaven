import carpet1 from './SFX/movement/foley_footstep_carpet_1.wav';
import carpet2 from './SFX/movement/foley_footstep_carpet_2.wav';
import carpet3 from './SFX/movement/foley_footstep_carpet_3.wav';
import carpet4 from './SFX/movement/foley_footstep_carpet_4.wav';
import wood1 from './SFX/movement/digital_footstep_wood_1.wav';
import wood2 from './SFX/movement/digital_footstep_wood_2.wav';
import wood3 from './SFX/movement/digital_footstep_wood_3.wav';
import wood4 from './SFX/movement/digital_footstep_wood_4.wav';
import jump from './SFX/movement/jump.wav';
import jumpShort from './SFX/movement/jump_short.wav';
import fallQuick from './SFX/movement/fall_quick.wav';
import whoosh from './SFX/movement/whoosh_1.wav';
import powerUp from './SFX/movement/power_up.wav';
import powerDown from './SFX/movement/power_down.wav';

const FOOTSTEPS = Object.freeze({
  carpet: [carpet1, carpet2, carpet3, carpet4],
  wood: [wood1, wood2, wood3, wood4]
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const createPlayer = () => {
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.25;
  audio.setAttribute('playsinline', '');
  audio._rdsSource = '';
  audio.addEventListener('error', () => {
    // Movement sounds are non-essential and must never interrupt physics.
  });
  return audio;
};

export class MovementAudio {
  constructor() {
    // Small fixed pools allow a step and its next paw impact to overlap naturally.
    // Sources load on demand; no extra decode loop, raycast, or per-frame allocation is added.
    this.stepPlayers = [createPlayer(), createPlayer(), createPlayer(), createPlayer()];
    this.effectPlayers = [createPlayer(), createPlayer()];
    this.stepVariantCursor = 0;
    this.effectCursor = 0;
    this.disposed = false;

    this.onVisibilityChange = () => {
      if (document.hidden) this.stopAll();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  playOneShot(audio, source, volume, playbackRate = 1) {
    if (this.disposed || !audio || !source) return;
    try {
      audio.pause();
      if (audio._rdsSource !== source) {
        audio.src = source;
        audio._rdsSource = source;
        audio.load();
      }
      try { audio.currentTime = 0; } catch { /* Metadata may still be loading. */ }
      audio.volume = clamp(volume, 0, 1);
      audio.playbackRate = clamp(playbackRate, 0.82, 1.22);
      const playback = audio.play();
      playback?.catch?.(() => {
        // Browser audio policy/device focus may reject a one-shot; gameplay continues.
      });
    } catch {
      // Never let an audio failure interrupt movement or collision handling.
    }
  }

  playFootstep(surface = 'wood', sprinting = false, volumeOverride = null) {
    if (this.disposed) return;
    const variants = FOOTSTEPS[surface] || FOOTSTEPS.wood;
    const variantIndex = this.stepVariantCursor++ % variants.length;
    const source = variants[variantIndex];
    const player = this.stepPlayers[variantIndex];
    const baseVolume = surface === 'carpet' ? 0.19 : 0.22;
    const volume = Number.isFinite(volumeOverride)
      ? volumeOverride
      : baseVolume + (sprinting ? 0.055 : 0);
    this.playOneShot(player, source, volume, sprinting ? 1.06 : 1);
  }

  playLanding(surface = 'wood') {
    this.playFootstep(surface, false, surface === 'carpet' ? 0.46 : 0.50);
  }

  playTakeoff(sprinting = false, moving = false) {
    const source = sprinting ? whoosh : moving ? jump : jumpShort;
    this.playEffect(source, sprinting ? 0.30 : 0.34, sprinting ? 1.08 : 1);
  }

  playFall() {
    this.playEffect(fallQuick, 0.34, 1);
  }

  playPowerUp() {
    this.playEffect(powerUp, 0.20, 1);
  }

  playPowerDown() {
    this.playEffect(powerDown, 0.17, 1);
  }

  playEffect(source, volume, playbackRate = 1) {
    const player = this.effectPlayers[this.effectCursor++ % this.effectPlayers.length];
    this.playOneShot(player, source, volume, playbackRate);
  }

  stopAll() {
    for (const audio of [...this.stepPlayers, ...this.effectPlayers]) {
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
    this.stopAll();
    for (const audio of [...this.stepPlayers, ...this.effectPlayers]) {
      audio.removeAttribute('src');
      audio.load();
    }
    this.stepPlayers.length = 0;
    this.effectPlayers.length = 0;
  }
}
