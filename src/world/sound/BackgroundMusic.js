import homeTrackUrl from './BGM/morning_in_the_toy_box.ogg';
import levelTrackUrl from './BGM/clear_the_stage.ogg';

const TRACKS = Object.freeze({ home: homeTrackUrl, level: levelTrackUrl });
const TRACK_VOLUME = Object.freeze({ home: 0.19, level: 0.17 });
const FADE_DURATION_MS = 1100;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

export class BackgroundMusic {
  constructor() {
    this.disposed = false;
    this.players = {
      home: this.createPlayer('home'),
      level: this.createPlayer('level')
    };
    this.audioContext = null;
    this.desiredMode = 'home';
    this.activeMode = null;
    this.unlocked = false;
    this.fadeFrame = 0;
    this.transitionToken = 0;

    this.unlockHandler = () => this.unlock();
    this.visibilityHandler = () => this.handleVisibilityChange();
    this.pageHideHandler = () => this.pauseAll();

    // Wait for a real gesture so mobile browsers do not reject audible autoplay.
    document.addEventListener('pointerdown', this.unlockHandler, { capture: true, passive: true });
    document.addEventListener('keydown', this.unlockHandler, { capture: true });
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('pagehide', this.pageHideHandler);
  }

  createPlayer(mode) {
    const audio = new Audio();
    audio.preload = 'none';
    audio.loop = true;
    audio.volume = 0;
    audio.playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.addEventListener('error', () => {
      if (!this.disposed) console.warn('[BGM] Failed to load ' + mode + ' track.', audio.error?.code || 'unknown error');
    });
    return audio;
  }

  prepareVolumeControl() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    try {
      // Create and resume the audio graph inside the real PLAY gesture for iOS Safari.
      this.audioContext ||= new AudioContextClass();
      for (const audio of Object.values(this.players)) {
        if (audio._rdsGainNode) continue;
        const source = this.audioContext.createMediaElementSource(audio);
        const gain = this.audioContext.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(this.audioContext.destination);
        audio._rdsSourceNode = source;
        audio._rdsGainNode = gain;
        // Once routed through Web Audio, leave element volume at unity and control gain here.
        audio.volume = 1;
      }
      const resume = this.audioContext.resume();
      if (resume && typeof resume.catch === 'function') {
        resume.catch((error) => console.warn('[BGM] AudioContext resume failed.', error?.name || error));
      }
      return true;
    } catch (error) {
      console.warn('[BGM] Web Audio volume control unavailable; using native volume.', error?.name || error);
      return false;
    }
  }

  getPlayerVolume(audio) {
    return audio?._rdsGainNode
      ? audio._rdsGainNode.gain.value
      : (audio?.volume ?? 0);
  }

  setPlayerVolume(audio, value) {
    const volume = clamp01(value);
    if (audio?._rdsGainNode) {
      audio._rdsGainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      return;
    }
    if (audio) audio.volume = volume;
  }

  setMode(mode) {
    if (this.disposed || (mode !== 'home' && mode !== 'level') || this.desiredMode === mode) return;
    this.desiredMode = mode;
    if (this.unlocked && !document.hidden) this.transitionTo(mode);
  }

  unlock() {
    if (this.disposed || this.unlocked) return;
    this.unlocked = true;
    document.removeEventListener('pointerdown', this.unlockHandler, true);
    document.removeEventListener('keydown', this.unlockHandler, true);
    this.prepareVolumeControl();
    if (!document.hidden) this.transitionTo(this.desiredMode);
  }

  transitionTo(mode) {
    const target = this.players[mode];
    if (this.disposed || !target || document.hidden) return;
    // Assign the asset URL only when this mode is actually requested.
    if (!target.src) target.src = TRACKS[mode];

    const token = ++this.transitionToken;
    if (this.fadeFrame) cancelAnimationFrame(this.fadeFrame);
    this.fadeFrame = 0;

    const startingVolumes = {
      home: this.getPlayerVolume(this.players.home),
      level: this.getPlayerVolume(this.players.level)
    };
    if (target.paused) {
      this.setPlayerVolume(target, 0);
      startingVolumes[mode] = 0;
    }

    let playback;
    try {
      // Invoke play synchronously from the user gesture that unlocks audio.
      playback = target.play();
    } catch (error) {
      this.handlePlaybackFailure(mode, target, token, error);
      return;
    }

    const beginFade = () => {
      if (this.disposed || token !== this.transitionToken || document.hidden) return;
      const startedAt = performance.now();
      const updateFade = (now) => {
        if (this.disposed || token !== this.transitionToken) return;
        const progress = clamp01((now - startedAt) / FADE_DURATION_MS);

        for (const key of ['home', 'level']) {
          const destination = key === mode ? TRACK_VOLUME[key] : 0;
          const nextVolume = startingVolumes[key]
            + (destination - startingVolumes[key]) * progress;
          this.setPlayerVolume(this.players[key], nextVolume);
        }

        if (progress >= 1) {
          for (const key of ['home', 'level']) {
            if (key === mode) continue;
            this.players[key].pause();
            this.setPlayerVolume(this.players[key], 0);
          }
          this.activeMode = mode;
          this.fadeFrame = 0;
          return;
        }
        this.fadeFrame = requestAnimationFrame(updateFade);
      };
      this.fadeFrame = requestAnimationFrame(updateFade);
    };

    if (playback && typeof playback.then === 'function') {
      playback.then(beginFade).catch((error) => this.handlePlaybackFailure(mode, target, token, error));
    } else {
      beginFade();
    }
  }

  handlePlaybackFailure(mode, target, token, error) {
    if (token !== this.transitionToken || this.disposed) return;
    target.pause();
    this.setPlayerVolume(target, 0);
    console.warn('[BGM] Playback blocked for ' + mode + ' track.', error?.name || error);
  }

  pauseAll() {
    this.transitionToken++;
    if (this.fadeFrame) cancelAnimationFrame(this.fadeFrame);
    this.fadeFrame = 0;
    for (const audio of Object.values(this.players || {})) {
      audio.pause();
      this.setPlayerVolume(audio, 0);
    }
    this.activeMode = null;
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.pauseAll();
    } else if (this.unlocked) {
      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume().catch((error) => console.warn('[BGM] AudioContext resume failed.', error?.name || error));
      }
      this.transitionTo(this.desiredMode);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('pointerdown', this.unlockHandler, true);
    document.removeEventListener('keydown', this.unlockHandler, true);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('pagehide', this.pageHideHandler);
    this.pauseAll();
    for (const audio of Object.values(this.players)) {
      audio._rdsSourceNode?.disconnect();
      audio._rdsGainNode?.disconnect();
      audio.removeAttribute('src');
      audio.load();
    }
    this.players = {};
    this.audioContext?.close?.().catch(() => {});
    this.audioContext = null;
  }
}
