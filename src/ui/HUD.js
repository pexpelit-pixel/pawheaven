import { QUALITY_PRESETS } from '../core/Quality.js';
import { t } from '../core/Localization.js';
import pawIcon from './icon/paw.svg';
import settingsIcon from './icon/settings.svg';
import eyeIcon from './icon/eye.svg';
import eyeOffIcon from './icon/eye-off.svg';
import zoomInIcon from './icon/zoom-in.svg';
import zoomOutIcon from './icon/zoom-out.svg';
import cameraResetIcon from './icon/camera-reset.svg';
import jumpIcon from './icon/jump.svg';
import runIcon from './icon/run.svg';
import sitIcon from './icon/sit.svg';
import standIcon from './icon/stand.svg';
import fullscreenIcon from './icon/fullscreen.svg';
import closeIcon from './icon/close.svg';
import targetIcon from './icon/target.svg';
import activityIcon from './icon/activity.svg';
import speedIcon from './icon/speed.svg';
import alertIcon from './icon/alert.svg';
import chevronDownIcon from './icon/chevron-down.svg';
import arrowUpRightIcon from './icon/arrow-up-right.svg';
import sparklesIcon from './icon/sparkles.svg';
import code2Icon from './icon/code-2.svg';
import packageIcon from './icon/package.svg';

const ICON_ASSETS = Object.freeze({
  paw: pawIcon,
  settings: settingsIcon,
  eye: eyeIcon,
  'eye-off': eyeOffIcon,
  'zoom-in': zoomInIcon,
  'zoom-out': zoomOutIcon,
  'camera-reset': cameraResetIcon,
  jump: jumpIcon,
  run: runIcon,
  sit: sitIcon,
  stand: standIcon,
  fullscreen: fullscreenIcon,
  close: closeIcon,
  target: targetIcon,
  activity: activityIcon,
  speed: speedIcon,
  alert: alertIcon,
  'chevron-down': chevronDownIcon,
  'arrow-up-right': arrowUpRightIcon,
  sparkles: sparklesIcon,
  'code-2': code2Icon,
  'package': packageIcon
});

export class HUD {
  constructor(onQualityChange, cameraController = null, onSettingsVisibilityChange = null, inputController = null) {
    this.onQualityChange = onQualityChange;
    this.camera = cameraController;
    this.onSettingsVisibilityChange = onSettingsVisibilityChange;
    this.inputController = inputController;
    this.fps = document.getElementById('fps-value');
    this.qualityLabel = document.getElementById('quality-label');
    this.settings = document.getElementById('settings-panel');
    this.gameRoot = document.getElementById('game');
    this.isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.developerMode = this.readDeveloperModePreference();
    this.developerModeToggle = document.getElementById('developer-mode-toggle');
    this.advancedSettings = document.getElementById('advanced-settings');
    this.fpsToggle = document.getElementById('fps-toggle');
    this.morningCheckToggle = document.getElementById('morning-check-toggle');
    this.showFPS = this.developerMode && this.readFPSPreference();
    this.showMorningCheck = this.readMorningCheckPreference();
    this.activityState = 'idle';
    this.activitySpeed = 0;
    this.onLocaleChange = () => {
      this.applyIcons();
      const selectedQuality = document.querySelector('[data-quality].selected')?.dataset.quality || 'medium';
      this.setQuality(selectedQuality);
      this.setActivity(this.activityState, this.activitySpeed);
      this.setDeveloperMode(this.developerMode, false);
      this.setFPSVisible(this.showFPS, false);
      this.setMorningCheckVisible(this.showMorningCheck, false);
    };
    this.onIconRequest = () => this.applyIcons();
    this.onHudHotkey = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (event.code === 'KeyH') {
        event.preventDefault();
        this.toggleHUD();
      } else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
        this.camera?.zoomStep(-1);
      } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
        this.camera?.zoomStep(1);
      } else if (event.code === 'Escape' && this.settings && !this.settings.hidden) {
        this.closeSettings();
      }
    };
    this.applyIcons();
    this.setDeveloperMode(this.developerMode, false);
    this.setFPSVisible(this.showFPS, false);
    this.setMorningCheckVisible(this.showMorningCheck, false);
    this.bindUI();
    document.addEventListener('paw-haven-icons-change', this.onIconRequest);
    document.addEventListener('paw-haven-locale-change', this.onLocaleChange);
    window.addEventListener('keydown', this.onHudHotkey);
  }

  setIcon(name, element) {
    const asset = ICON_ASSETS[name];
    if (!asset || !element) return;
    element.classList.add('ui-icon');
    element.dataset.icon = name;
    element.style.setProperty('--ui-icon-url', `url("${asset}")`);
    element.setAttribute('aria-hidden', 'true');
  }

  applyIcons() {
    for (const element of document.querySelectorAll('[data-icon]')) {
      this.setIcon(element.dataset.icon, element);
    }
  }

  bindUI() {
    const open = document.getElementById('settings-toggle');
    const close = document.getElementById('settings-close');
    const done = document.getElementById('settings-done');
    const fullscreenButtons = document.querySelectorAll('[data-fullscreen]');
    const hudToggle = document.getElementById('ui-toggle');
    this.developerModeToggle = document.getElementById('developer-mode-toggle');
    this.fpsToggle = document.getElementById('fps-toggle');
    this.morningCheckToggle = document.getElementById('morning-check-toggle');

    const autoRunThresholdSlider = document.getElementById('auto-run-threshold');
    const autoRunThresholdValue = document.getElementById('auto-run-threshold-value');
    if (autoRunThresholdSlider) {
      const initialThreshold = this.inputController?.autoRunThresholdPercent ?? 70;
      autoRunThresholdSlider.value = String(initialThreshold);
      if (autoRunThresholdValue) autoRunThresholdValue.textContent = initialThreshold + '%';
      autoRunThresholdSlider.setAttribute('aria-valuetext', initialThreshold + '%');
      autoRunThresholdSlider.addEventListener('input', () => {
        const applied = this.inputController?.setAutoRunThresholdPercent(
          Number(autoRunThresholdSlider.value)
        ) ?? Number(autoRunThresholdSlider.value);
        autoRunThresholdSlider.value = String(applied);
        autoRunThresholdSlider.setAttribute('aria-valuetext', applied + '%');
        if (autoRunThresholdValue) autoRunThresholdValue.textContent = applied + '%';
      });
    }

    open?.setAttribute('aria-expanded', String(Boolean(this.settings && !this.settings.hidden)));
    open?.addEventListener('click', () => {
      if (!this.settings) return;
      this.settings.hidden = !this.settings.hidden;
      const settingsOpen = !this.settings.hidden;
      this.gameRoot?.classList.toggle('settings-open', settingsOpen);
      open.setAttribute('aria-expanded', String(settingsOpen));
      this.onSettingsVisibilityChange?.(settingsOpen);
      if (settingsOpen) close?.focus({ preventScroll: true });
    });
    close?.addEventListener('click', () => this.closeSettings());
    done?.addEventListener('click', () => this.closeSettings());
    this.developerModeToggle?.addEventListener('click', () => this.setDeveloperMode(!this.developerMode));
    this.fpsToggle?.addEventListener('click', () => {
      if (this.developerMode) this.setFPSVisible(!this.showFPS);
    });
    this.morningCheckToggle?.addEventListener('click', () => this.setMorningCheckVisible(!this.showMorningCheck));
    for (const button of fullscreenButtons) button.addEventListener('click', () => this.toggleFullscreen());
    hudToggle?.addEventListener('click', () => this.toggleHUD());

    for (const button of document.querySelectorAll('[data-camera-zoom]')) {
      button.addEventListener('click', () => {
        const action = button.dataset.cameraZoom;
        if (action === 'in') this.camera?.zoomStep(-1);
        else if (action === 'out') this.camera?.zoomStep(1);
        else if (action === 'reset') this.camera?.resetView();
      });
    }

    for (const button of document.querySelectorAll('[data-quality]')) {
      button.addEventListener('click', () => {
        const quality = button.dataset.quality;
        if (!QUALITY_PRESETS[quality]) return;
        this.setQuality(quality);
        this.onQualityChange?.(quality);
        this.toast(`${QUALITY_PRESETS[quality].label.toLowerCase()} applied`);
      });
    }

    document.addEventListener('fullscreenchange', () => {
      const fullscreen = Boolean(document.fullscreenElement);
      for (const button of document.querySelectorAll('[data-fullscreen]')) {
        const label = button.querySelector('[data-button-label]');
        if (label) label.textContent = t(fullscreen ? 'quality.fullscreenExit' : 'quality.fullscreen');
        button.setAttribute('aria-label', t(fullscreen ? 'quality.fullscreenExit' : 'quality.fullscreenEnter'));
        this.setIcon('fullscreen', button.querySelector('[data-icon]'));
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.toast('K-09 is pausing its patrol.');
    });
  }

  closeSettings() {
    const wasOpen = Boolean(this.settings && !this.settings.hidden);
    if (this.settings) this.settings.hidden = true;
    this.gameRoot?.classList.remove('settings-open');
    document.getElementById('settings-toggle')?.setAttribute('aria-expanded', 'false');
    if (wasOpen) this.onSettingsVisibilityChange?.(false);
  }

  toggleHUD() {
    const hidden = this.gameRoot?.classList.toggle('hud-hidden') ?? false;
    if (hidden) this.closeSettings();
    const button = document.getElementById('ui-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(hidden));
      button.setAttribute('aria-label', t(hidden ? 'header.showInterface' : 'header.hideInterface'));
      button.title = t(hidden ? 'header.showInterfaceHotkey' : 'header.hideInterfaceHotkey');
      this.setIcon(hidden ? 'eye' : 'eye-off', button.querySelector('[data-icon]'));
    }
  }

  setQuality(name) {
    const profile = QUALITY_PRESETS[name] || QUALITY_PRESETS.medium;
    if (this.qualityLabel) this.qualityLabel.textContent = t(`quality.${name in QUALITY_PRESETS ? name : 'medium'}.label`);
    for (const button of document.querySelectorAll('[data-quality]')) {
      button.classList.toggle('selected', button.dataset.quality === name);
      button.setAttribute('aria-pressed', String(button.dataset.quality === name));
    }
  }

  readDeveloperModePreference() {
    try {
      return localStorage.getItem('paw-haven-developer-mode') === 'true';
    } catch { /* Storage may be disabled in private browsing. */ }
    return false;
  }

  setDeveloperMode(enabled, persist = true) {
    this.developerMode = Boolean(enabled);

    if (this.advancedSettings) {
      this.advancedSettings.hidden = !this.developerMode;
      this.advancedSettings.open = this.developerMode;
    }

    const toggle = this.developerModeToggle;
    if (toggle) {
      toggle.setAttribute('aria-checked', String(this.developerMode));
      toggle.setAttribute('aria-label', t(this.developerMode ? 'settings.disableDeveloper' : 'settings.enableDeveloper'));
      toggle.title = t(this.developerMode ? 'settings.disableDeveloper' : 'settings.enableDeveloper');
      toggle.textContent = t(this.developerMode ? 'state.on' : 'state.off');
    }

    if (this.developerMode) {
      this.setFPSVisible(this.readFPSPreference(), false);
    } else {
      this.setFPSVisible(false, false);
    }

    if (persist) {
      try { localStorage.setItem('paw-haven-developer-mode', String(this.developerMode)); }
      catch { /* The setting still applies for this session if storage is unavailable. */ }
    }
  }

  readFPSPreference() {
    try {
      const stored = localStorage.getItem('paw-haven-show-fps');
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch { /* Storage may be disabled in private browsing. */ }
    return !this.isTouch;
  }

  setFPSVisible(visible, persist = true) {
    this.showFPS = Boolean(visible);
    this.gameRoot?.classList.toggle('show-fps', this.showFPS);
    if (this.fpsToggle) {
      this.fpsToggle.setAttribute('aria-checked', String(this.showFPS));
      this.fpsToggle.setAttribute('aria-label', t(this.showFPS ? 'settings.hideFPS' : 'settings.showFPSCounter'));
      this.fpsToggle.title = t(this.showFPS ? 'settings.hideFPS' : 'settings.showFPSCounter');
      this.fpsToggle.textContent = t(this.showFPS ? 'state.on' : 'state.off');
    }
    if (persist) {
      try { localStorage.setItem('paw-haven-show-fps', String(this.showFPS)); }
      catch { /* The setting still applies for this session if storage is unavailable. */ }
    }
  }

  readMorningCheckPreference() {
    try {
      const stored = localStorage.getItem('paw-haven-morning-check');
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch { /* Storage may be disabled in private browsing. */ }
    return true;
  }

  setMorningCheckVisible(visible, persist = true) {
    this.showMorningCheck = Boolean(visible);
    this.gameRoot?.classList.toggle('morning-check-disabled', !this.showMorningCheck);

    const toggle = this.morningCheckToggle;
    if (toggle) {
      toggle.setAttribute('aria-checked', String(this.showMorningCheck));
      toggle.setAttribute('aria-label', t(this.showMorningCheck ? 'settings.disableMorningCheck' : 'settings.enableMorningCheck'));
      toggle.title = t(this.showMorningCheck ? 'settings.disableMorningCheck' : 'settings.enableMorningCheck');
      toggle.textContent = t(this.showMorningCheck ? 'state.on' : 'state.off');
    }

    const clockLabel = document.getElementById('clock-label');
    if (clockLabel) clockLabel.textContent = t(this.showMorningCheck ? 'header.morningRoutine' : 'header.shelterPatrol');

    if (persist) {
      try { localStorage.setItem('paw-haven-morning-check', String(this.showMorningCheck)); }
      catch { /* The setting still applies for this session if storage is unavailable. */ }
    }
  }

  setFPS(fps) {
    if (this.fps) this.fps.textContent = Number.isFinite(fps) ? String(Math.round(fps)) : '--';
    const indicator = document.querySelector('.fps-pill i');
    if (indicator) indicator.style.background = fps < 32 ? '#ff7a61' : fps < 50 ? '#f4cb63' : '#9df28b';
  }

  setCompassFromCamera(camera, target) {
    if (!camera?.position || !target || !this.compass) return;
    // Use the rendered camera offset, not the controller's yaw convention. This remains
    // correct when the camera rig is replaced by an older implementation.
    const dx = camera.position.x - target.x;
    const dz = camera.position.z - target.z;
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || (Math.abs(dx) + Math.abs(dz)) < 0.001) return;
    this.setCompassYaw(Math.atan2(dx, dz));
  }

  setCompassYaw(yaw = 0) {
    if (!this.compass || !Number.isFinite(yaw)) return;
    // Quantize to whole degrees so the compass does not force a CSS update every frame.
    const degrees = `${Math.round(yaw * 180 / Math.PI)}deg`;
    if (this.compass.style.getPropertyValue('--compass-yaw') !== degrees) {
      this.compass.style.setProperty('--compass-yaw', degrees);
    }
  }

  setActivity(state, speed = 0) {
    this.activityState = state;
    this.activitySpeed = speed;
    const labelKeys = {
      idle: ['activity.idle.title', 'activity.idle.caption'],
      sit: ['activity.sit.title', 'activity.sit.caption'],
      landing: ['activity.landing.title', 'activity.landing.caption'],
      walk: ['activity.walk.title', 'activity.walk.caption'],
      run: ['activity.run.title', 'activity.run.caption'],
      jump: ['activity.jump.title', 'activity.jump.caption'],
      air: ['activity.air.title', 'activity.air.caption']
    };
    const [titleKey, captionKey] = labelKeys[state] || labelKeys.idle;
    const title = t(titleKey);
    const caption = t(captionKey);
    const targetTitle = document.getElementById('activity-title');
    const targetCaption = document.getElementById('activity-caption');
    if (targetTitle && targetTitle.textContent !== title) targetTitle.textContent = title;
    if (targetCaption && targetCaption.textContent !== caption) targetCaption.textContent = caption;

    const hint = document.getElementById('center-hint');
    const hintText = document.getElementById('hint-text');
    if (hint && hintText) {
      hintText.textContent = this.isTouch
        ? t('hint.touch')
        : speed > 4.2
          ? t('hint.sprinting')
          : state === 'idle'
            ? t('hint.keyboardIdle')
            : t('hint.keyboardMoving');
      hint.classList.toggle('hidden', speed > 0.7 || state !== 'idle');
    }
  }

  toast() {
    // Permanently disabled: avoid transient overlays covering touch controls or camera swipes.
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.getElementById('game').requestFullscreen();
    } catch {
      this.toast('Fullscreen is not available in this browser.');
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.onHudHotkey);
    document.removeEventListener('paw-haven-icons-change', this.onIconRequest);
    document.removeEventListener('paw-haven-locale-change', this.onLocaleChange);
  }
}
