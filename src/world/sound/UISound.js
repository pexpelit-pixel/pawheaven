import select1 from './SFX/ui/select_1.wav';
import select2 from './SFX/ui/select_2.wav';
import select3 from './SFX/ui/select_3.wav';
import pop1 from './SFX/ui/pop_1.wav';
import pop2 from './SFX/ui/pop_2.wav';
import pop3 from './SFX/ui/pop_3.wav';
import hover from './SFX/ui/sci_fi_hover.wav';
import confirm from './SFX/ui/sci_fi_confirm.wav';
import typing from './SFX/ui/Typing.ogg';
import victory from './SFX/rewards/Victory.ogg';

const SOURCES = Object.freeze({
  select: [select1, select2, select3],
  pop: [pop1, pop2, pop3],
  hover: [hover],
  confirm: [confirm],
  typing: [typing],
  victory: [victory]
});

const VOLUMES = Object.freeze({
  select: 0.34,
  pop: 0.31,
  hover: 0.17,
  confirm: 0.37,
  typing: 0.16,
  victory: 0.42
});

const CONTROL_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  'summary',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="range"]',
  'select',
  '[data-ui-sound]'
].join(',');

const IGNORE_SELECTOR = [
  '#game-canvas',
  '#touch-zone',
  '#touch-stick',
  '#touch-jump',
  '#touch-sit',
  '#touch-sprint',
  '#touch-interact',
  '.touch-controls',
  '[data-ui-sound="none"]'
].join(',');

const CONFIRM_SELECTOR = [
  '[data-ui-sound="confirm"]',
  '#orientation-lock-button',
  '#splash-play-button',
  '#settings-done',
  '#retry-button',
  '#inventory-drop',
  '#fullscreen-button',
  '#fullscreen-button-desktop',
  '.story-greeting__continue',
  'button[type="submit"]'
].join(',');

const POP_SELECTOR = [
  '[data-ui-sound="pop"]',
  '#settings-toggle',
  '#settings-close',
  '.close-settings',
  '#inventory-toggle',
  '#inventory-close',
  '#ui-toggle',
  '#advanced-settings > summary'
].join(',');

export class UISound {
  constructor() {
    this.disposed = false;
    this.unlocked = false;
    this.cursors = { select: 0, pop: 0, hover: 0, confirm: 0, typing: 0, victory: 0 };
    this.typingActive = false;
    this.players = Object.fromEntries(
      Object.entries(SOURCES).map(([kind, sources]) => [
        kind,
        sources.map((source) => this.createPlayer(source, kind))
      ])
    );

    this.onClick = (event) => this.handleClick(event);
    this.onPointerOver = (event) => this.handlePointerOver(event);
    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onPointerDown = () => {
      if (this.disposed) return;
      this.unlocked = true;
      if (this.typingActive && this.players.typing?.[0]?.paused) this.play('typing');
    };
    this.onTypingStart = () => {
      this.typingActive = true;
      if (this.unlocked) this.play('typing');
    };
    this.onTypingStop = () => {
      this.typingActive = false;
      this.stop('typing');
    };
    this.onVisibilityChange = () => {
      if (document.hidden) this.stopAll();
    };

    // Capture phase gives UI feedback before a button's own handler changes its state.
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('pointerover', this.onPointerOver, { capture: true, passive: true });
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('paw-haven-typing-start', this.onTypingStart);
    document.addEventListener('paw-haven-typing-stop', this.onTypingStop);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  createPlayer(source, kind) {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = VOLUMES[kind];
    audio.loop = false;
    if (kind === 'typing') {
      audio.addEventListener('ended', () => {
        if (!this.disposed && this.typingActive && this.unlocked && !document.hidden) this.play('typing');
      });
    }
    audio.setAttribute('playsinline', '');
    audio.addEventListener('error', () => {
      if (!this.disposed) console.warn('[UI SFX] Failed to load ' + kind + ' sound.');
    });
    audio.src = source;
    audio.load();
    return audio;
  }

  findControl(target) {
    if (!target || typeof target.closest !== 'function') return null;
    const control = target.closest(CONTROL_SELECTOR);
    if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return null;
    if (control.matches(IGNORE_SELECTOR) || control.closest(IGNORE_SELECTOR)) return null;
    return control;
  }

  resolveKind(control) {
    const override = control.dataset?.uiSound;
    if (override === 'none') return null;
    if (override === 'confirm' || override === 'pop' || override === 'select') return override;
    if (control.matches(CONFIRM_SELECTOR)) return 'confirm';
    if (control.matches(POP_SELECTOR)) return 'pop';
    return 'select';
  }

  handleClick(event) {
    if (this.disposed) return;
    const control = this.findControl(event.target);
    if (!control) return;
    // Only confirmed click activations produce a sound, never canceled pointer presses.
    this.unlocked = true;
    this.play(this.resolveKind(control));
  }

  handlePointerOver(event) {
    if (this.disposed || !this.unlocked || event.pointerType === 'touch') return;
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    if (typeof window.matchMedia === 'function'
      && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const control = this.findControl(event.target);
    if (!control) return;
    const previous = event.relatedTarget;
    if (previous && (previous === control || control.contains(previous))) return;
    this.play('hover');
  }

  handleKeyDown(event) {
    if (this.disposed || event.repeat) return;
    if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;
    const control = this.findControl(event.target);
    if (!control || control.tagName === 'BUTTON' || control.tagName === 'A'
      || control.tagName === 'INPUT' || control.tagName === 'SELECT' || control.tagName === 'SUMMARY') return;
    // Custom role=button elements may not emit a native click on keyboard activation.
    if (control.getAttribute('role') !== 'button') return;
    this.unlocked = true;
    this.play(this.resolveKind(control));
  }

  play(kind) {
    if (this.disposed || !kind || !this.players[kind]?.length) return;
    const group = this.players[kind];
    const index = this.cursors[kind] % group.length;
    const audio = group[index];
    this.cursors[kind] = (index + 1) % group.length;

    try {
      audio.pause();
      // Both supplied OGGs contain an approximately two-second silent lead-in.
      // Seek past it so the audible effect starts immediately when triggered.
      audio.currentTime = kind === 'typing' || kind === 'victory' ? 3 : 0;
      audio.volume = VOLUMES[kind];
      const playback = audio.play();
      playback?.catch?.(() => {
        // UI audio is non-essential; browser policy or device audio focus may block it.
      });
    } catch {
      // A sound effect must never interrupt the underlying UI action.
    }
  }

  stop(kind) {
    const group = this.players[kind];
    if (!group) return;
    for (const audio of group) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* Ignore unloaded media. */ }
    }
  }

  playVictory() {
    this.play('victory');
  }

  stopAll() {
    for (const group of Object.values(this.players)) {
      for (const audio of group) {
        audio.pause();
        try { audio.currentTime = 0; } catch { /* Ignore unloaded media. */ }
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('pointerover', this.onPointerOver, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('paw-haven-typing-start', this.onTypingStart);
    document.removeEventListener('paw-haven-typing-stop', this.onTypingStop);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopAll();

    for (const group of Object.values(this.players)) {
      for (const audio of group) {
        audio.removeAttribute('src');
        audio.load();
      }
    }
    this.players = {};
  }
}
