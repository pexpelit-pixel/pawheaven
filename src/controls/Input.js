import { t } from '../core/Localization.js';

export class Input {
  constructor(canvas, cameraController) {
    this.canvas = canvas;
    this.camera = cameraController;
    this.keys = new Set();
    this.jumpQueued = false;
    this.pointer = null;
    this.activePointers = new Map();
    this.pinchDistance = 0;
    this.touchAxes = { x: 0, y: 0 };
    // Movement is sampled every fixed tick; keep one reusable result object.
    this.movementAxes = { x: 0, y: 0 };
    this.joystickPointerId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this.autoSprint = false;
    this.autoRunLocked = false;
    this.joystickForwardPercent = 0;
    this.joystickCaptureTarget = null;
    this.autoRunThresholdPercent = this.readAutoRunThresholdPreference();
    this.touchZone = null;
    this.touchStick = null;
    this.touchKnob = null;
    this.touchJump = false;
    this.touchSprint = false;
    this.sitQueued = null;
    this.sitRequested = false;
    this.interactQueued = false;
    this.dropQueued = false;
    this.inventoryToggleQueued = false;
    this.sprintPointerId = null;
    this.jumpPointerId = null;
    this.isCoarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.locked = false;
    this.ignoreInput = () => this.locked || !document.getElementById('settings-panel')?.hidden || !document.getElementById('loading-screen')?.classList.contains('is-done');
    this.onKeyDown = (event) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (event.repeat || this.ignoreInput()) return;
      this.keys.add(event.code);
      if (event.code === 'Space' && !this.ignoreInput()) this.jumpQueued = true;
      if (event.code === 'KeyC' && !this.ignoreInput()) {
        this.sitRequested = !this.sitRequested;
        this.sitQueued = this.sitRequested;
        this.updateSitButton();
      }
      if (event.code === 'KeyE' && !this.ignoreInput()) this.interactQueued = true;
      if (event.code === 'KeyQ' && !this.ignoreInput()) this.dropQueued = true;
      if (event.code === 'KeyI' && !this.ignoreInput()) this.inventoryToggleQueued = true;
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onBlur = () => {
      this.cancelStickVisualFrame?.();
      this.keys.clear();
      this.interactQueued = false;
      this.dropQueued = false;
      this.inventoryToggleQueued = false;
      this.pointer = null;
      this.activePointers.clear();
      this.pinchDistance = 0;
      this.touchAxes.x = 0;
      this.touchAxes.y = 0;
      this.autoSprint = false;
      this.autoRunLocked = false;
      this.joystickForwardPercent = 0;
      this.joystickCaptureTarget = null;
      this.joystickPointerId = null;
      this.touchStick?.classList.remove('is-active');
      if (this.touchKnob) this.touchKnob.style.transform = 'translate(0, 0)';
      this.touchSprint = false;
      this.touchJump = false;
      this.sprintPointerId = null;
      this.jumpPointerId = null;
      this.sprintButton?.classList.remove('is-active');
      this.sprintButton?.setAttribute('aria-pressed', 'false');
      document.getElementById('touch-jump')?.classList.remove('is-active');
    };
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.bindPointerLook();
    this.bindTouchControls();
    this.onLocaleChange = () => this.updateSitButton();
    document.addEventListener('paw-haven-locale-change', this.onLocaleChange);
  }

  readAutoRunThresholdPreference() {
    try {
      // v3 restores the deliberate 85% upward swipe. The previous 70% value was
      // the old default, so migrate it to 85; retain any other user-selected value.
      const stored = localStorage.getItem('paw-haven-auto-run-threshold-v3');
      if (stored !== null) {
        const value = Number(stored);
        if (Number.isFinite(value)) {
          return Math.round(Math.max(40, Math.min(95, value)) / 5) * 5;
        }
      }

      const previous = localStorage.getItem('paw-haven-auto-run-threshold-v2');
      if (previous !== null) {
        const value = Number(previous);
        if (Number.isFinite(value)) {
          const migrated = Math.round(Math.max(40, Math.min(95, value === 70 ? 85 : value)) / 5) * 5;
          localStorage.setItem('paw-haven-auto-run-threshold-v3', String(migrated));
          return migrated;
        }
      }

      // Preserve an older custom value, but migrate its former 40% default to 85%.
      const legacy = localStorage.getItem('paw-haven-auto-run-threshold');
      if (legacy !== null) {
        const value = Number(legacy);
        if (Number.isFinite(value)) {
          const migrated = Math.round(Math.max(40, Math.min(95, value === 40 ? 85 : value)) / 5) * 5;
          localStorage.setItem('paw-haven-auto-run-threshold-v3', String(migrated));
          return migrated;
        }
      }

      localStorage.setItem('paw-haven-auto-run-threshold-v3', '85');
    } catch { /* The 85% default still works when browser storage is unavailable. */ }
    return 85;
  }

  setAutoRunThresholdPercent(percent) {
    const value = Number(percent);
    const next = Number.isFinite(value)
      ? Math.round(Math.max(40, Math.min(95, value)) / 5) * 5
      : 85;
    this.autoRunThresholdPercent = next;
    try { localStorage.setItem('paw-haven-auto-run-threshold-v3', String(next)); }
    catch { /* Apply the value for this session when storage is unavailable. */ }
    return next;
  }

  bindPointerLook() {
    this.onPointerDown = (event) => {
      if (this.ignoreInput()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (this.isCoarse && event.pointerType === 'mouse' && event.clientX < window.innerWidth * 0.43) return;
      if (event.pointerType !== 'mouse') event.preventDefault();
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
      this.canvas.setPointerCapture?.(event.pointerId);
      if (this.activePointers.size >= 2) {
        this.pointer = null;
        this.pinchDistance = this.getPinchDistance();
      } else {
        this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    };

    this.onPointerMove = (event) => {
      const tracked = this.activePointers.get(event.pointerId);
      if (!tracked) return;
      const previousX = tracked.x;
      const previousY = tracked.y;
      tracked.x = event.clientX;
      tracked.y = event.clientY;

      if (this.activePointers.size >= 2) {
        const nextDistance = this.getPinchDistance();
        if (this.pinchDistance > 0 && nextDistance > 0) {
          // Spreading two fingers zooms in; pinching them together zooms out.
          this.camera.zoom(this.pinchDistance - nextDistance);
        }
        this.pinchDistance = nextDistance;
        this.pointer = null;
        event.preventDefault?.();
        return;
      }

      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      this.camera.orbit(event.clientX - previousX, event.clientY - previousY);
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
    };

    this.onPointerUp = (event) => {
      this.activePointers.delete(event.pointerId);
      if (this.activePointers.size < 2) this.pinchDistance = 0;
      if (this.pointer?.id === event.pointerId) this.pointer = null;
      if (this.activePointers.size === 1) {
        const [id, remaining] = this.activePointers.entries().next().value;
        this.pointer = { id, x: remaining.x, y: remaining.y };
      }
    };

    this.onWheel = (event) => {
      if (this.ignoreInput()) return;
      event.preventDefault();
      this.camera.zoom(event.deltaY);
    };
    this.canvas.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    // Track camera drags at window level so mobile browsers keep delivering moves
    // even when the finger crosses overlays or the canvas capture is interrupted.
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  getPinchDistance() {
    const points = [...this.activePointers.values()].slice(0, 2);
    if (points.length < 2) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  bindTouchControls() {
    const wrap = document.getElementById('touch-controls');
    const zone = document.getElementById('touch-zone');
    const stick = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-knob');
    const percentLabel = document.getElementById('touch-percent');
    const jump = document.getElementById('touch-jump');
    const sprint = document.getElementById('touch-sprint');
    const sit = document.getElementById('touch-sit');
    this.sprintButton = sprint;
    const interact = document.getElementById('touch-interact');
    this.interactButton = interact;
    this.sitButton = sit;
    this.touchZone = zone;
    this.touchStick = stick;
    this.touchKnob = knob;
    this.joystickPercentLabel = percentLabel;
    if (!wrap || !zone || !stick || !knob) return;
    if (this.isCoarse) wrap.classList.add('touch-enabled');

    // Keep physics input immediate, but collapse visual DOM writes to one update per display frame.
    // High-rate pointer devices can emit more move events than the screen can present.
    let maxStickTravel = 46;
    let stickVisualFrame = 0;
    let pendingStickX = 0;
    let pendingStickY = 0;
    let pendingForwardPercent = 0;
    let pendingReady = false;

    const cancelStickVisualFrame = () => {
      if (stickVisualFrame) cancelAnimationFrame(stickVisualFrame);
      stickVisualFrame = 0;
    };
    this.cancelStickVisualFrame = cancelStickVisualFrame;

    const syncSprintVisual = () => {
      const active = this.autoRunLocked || this.touchSprint;
      if (sprint && sprint.classList.contains('is-active') !== active) {
        sprint.classList.toggle('is-active', active);
      }
      const pressed = String(active);
      if (sprint && sprint.getAttribute('aria-pressed') !== pressed) {
        sprint.setAttribute('aria-pressed', pressed);
      }
    };

    const flushStickVisuals = () => {
      stickVisualFrame = 0;
      if (this.joystickPointerId === null) return;

      const transform = `translate(${pendingStickX}px, ${pendingStickY}px)`;
      if (knob.style.transform !== transform) knob.style.transform = transform;

      if (percentLabel) {
        const label = `${pendingForwardPercent}%`;
        if (percentLabel.textContent !== label) percentLabel.textContent = label;
        if (percentLabel.classList.contains('is-ready') !== pendingReady) {
          percentLabel.classList.toggle('is-ready', pendingReady);
        }
      }
      syncSprintVisual();
    };

    const queueStickVisuals = () => {
      if (!stickVisualFrame) stickVisualFrame = requestAnimationFrame(flushStickVisuals);
    };

    const updateStick = (event) => {
      if (this.joystickPointerId !== event.pointerId) return;
      if (event.cancelable) event.preventDefault();

      const dx = event.clientX - this.joystickOrigin.x;
      const dy = event.clientY - this.joystickOrigin.y;
      const length = Math.hypot(dx, dy);
      const scale = Math.min(1, maxStickTravel / Math.max(1, length));
      const nx = dx * scale;
      const ny = dy * scale;
      const rawMagnitude = Math.min(1, length / maxStickTravel);
      const deadZone = 0.035;
      const magnitude = rawMagnitude <= deadZone ? 0 : (rawMagnitude - deadZone) / (1 - deadZone);
      const forwardAmount = length > 0 ? -dy / length : 0;
      const availableUpwardTravel = Math.max(1, this.joystickOrigin.y);
      const forwardPercent = Math.round(Math.max(0, Math.min(100, ((this.joystickOrigin.y - event.clientY) / availableUpwardTravel) * 100)));

      // Update the gameplay vector on the original pointer event for minimum input latency.
      this.touchAxes.x = length > 0 ? (dx / length) * magnitude : 0;
      this.touchAxes.y = length > 0 ? (dy / length) * magnitude : 0;
      this.joystickForwardPercent = forwardPercent;

      // Walking remains normal until the upward-travel threshold is reached.
      // The live analog vector remains active so the thumb can still steer while locked.
      if (!this.autoRunLocked
        && forwardPercent >= this.autoRunThresholdPercent
        && forwardAmount >= 0.84) {
        this.autoRunLocked = true;
      }

      pendingStickX = nx;
      pendingStickY = ny;
      pendingForwardPercent = forwardPercent;
      pendingReady = (forwardPercent >= this.autoRunThresholdPercent && forwardAmount >= 0.84) || this.autoRunLocked;
      queueStickVisuals();
    };

    const resetStick = (event) => {
      if (event && this.joystickPointerId !== event.pointerId) return;
      cancelStickVisualFrame();
      const pointerId = this.joystickPointerId;
      const captureTarget = this.joystickCaptureTarget;
      this.joystickPointerId = null;
      this.joystickCaptureTarget = null;
      if (pointerId !== null && captureTarget?.hasPointerCapture?.(pointerId)) {
        try { captureTarget.releasePointerCapture(pointerId); } catch { /* The browser may already have released it. */ }
      }
      this.touchAxes.x = 0;
      this.touchAxes.y = 0;
      this.joystickForwardPercent = 0;
      if (percentLabel) {
        if (percentLabel.textContent !== '0%') percentLabel.textContent = '0%';
        if (percentLabel.classList.contains('is-ready')) percentLabel.classList.remove('is-ready');
      }
      if (stick.classList.contains('is-active')) stick.classList.remove('is-active');
      if (knob.style.transform !== 'translate(0, 0)') knob.style.transform = 'translate(0, 0)';
      syncSprintVisual();
    };

    const startStick = (event) => {
      if (this.ignoreInput() || this.joystickPointerId !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      // Touch anywhere on the left playfield spawns a fresh joystick under the thumb.
      // Starting a new joystick input also releases a previously locked auto-run.
      this.autoRunLocked = false;
      this.joystickForwardPercent = 0;
      this.joystickPointerId = event.pointerId;
      this.touchAxes.x = 0;
      this.touchAxes.y = 0;

      const wrapRect = wrap.getBoundingClientRect();
      const zoneRect = zone.getBoundingClientRect();
      const size = stick.offsetWidth || 108;
      maxStickTravel = Math.min(48, Math.max(34, (stick.clientWidth || size) * 0.43));
      const leftMax = Math.max(0, Math.min(wrapRect.width, zoneRect.right - wrapRect.left) - size);
      const topMin = Math.max(0, zoneRect.top - wrapRect.top);
      const left = Math.max(0, Math.min(leftMax, event.clientX - wrapRect.left - size / 2));
      const top = Math.max(topMin, Math.min(wrapRect.height - size, event.clientY - wrapRect.top - size / 2));
      // Use inline important positioning to beat stale cached CSS in older dist bundles.
      stick.style.setProperty('left', `${left}px`, 'important');
      stick.style.setProperty('top', `${top}px`, 'important');
      stick.style.setProperty('right', 'auto', 'important');
      stick.style.setProperty('bottom', 'auto', 'important');

      this.joystickOrigin.x = event.clientX;
      this.joystickOrigin.y = event.clientY;
      // Capture on the stable movement zone, not the visual stick that CSS may
      // temporarily make pointer-transparent while it follows the thumb.
      try {
        zone.setPointerCapture(event.pointerId);
        this.joystickCaptureTarget = zone;
      } catch {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
          this.joystickCaptureTarget = event.currentTarget;
        } catch {
          this.joystickCaptureTarget = null;
        }
      }
      stick.classList.add('is-active');
      updateStick(event);
    };

    this.startStick = startStick;
    this.updateStick = updateStick;
    this.resetStick = resetStick;
    zone.addEventListener('pointerdown', this.startStick, { passive: false });
    stick.addEventListener('pointerdown', this.startStick, { passive: false });
    zone.addEventListener('lostpointercapture', this.resetStick);
    stick.addEventListener('lostpointercapture', this.resetStick);
    // Capture-phase listeners keep tracking input even when another overlay handles the event first.
    window.addEventListener('pointermove', this.updateStick, { passive: false, capture: true });
    window.addEventListener('pointerup', this.resetStick, true);
    window.addEventListener('pointercancel', this.resetStick, true);

    this.onJumpDown = (event) => {
      if (this.ignoreInput() || this.jumpPointerId !== null) return;
      event.preventDefault();
      event.stopPropagation();
      this.jumpPointerId = event.pointerId;
      try { jump?.setPointerCapture?.(event.pointerId); } catch {}
      this.jumpQueued = true;
      this.touchJump = true;
      jump?.classList.add('is-active');
    };
    this.onJumpUp = (event) => {
      if (this.jumpPointerId !== event.pointerId) return;
      this.jumpPointerId = null;
      this.touchJump = false;
      jump?.classList.remove('is-active');
    };
    jump?.addEventListener('pointerdown', this.onJumpDown, { passive: false });
    jump?.addEventListener('pointerup', this.onJumpUp);
    jump?.addEventListener('pointercancel', this.onJumpUp);
    jump?.addEventListener('lostpointercapture', this.onJumpUp);

    // RUN is hold-to-sprint: sprint only while this button is physically pressed.
    // The joystick's configurable upward-swipe threshold remains the independent auto-run control.
    this.onSprintDown = (event) => {
      if (this.ignoreInput()) return;
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.stopPropagation();
      if (this.sprintPointerId !== null) return;
      this.sprintPointerId = event.pointerId;
      this.touchSprint = true;
      try { sprint?.setPointerCapture?.(event.pointerId); } catch {}
      sprint?.classList.add('is-active');
      sprint?.setAttribute('aria-pressed', 'true');
    };
    this.onSprintUp = (event) => {
      if (this.sprintPointerId !== event.pointerId) return;
      this.sprintPointerId = null;
      this.touchSprint = false;
      sprint?.classList.toggle('is-active', this.autoRunLocked);
      sprint?.setAttribute('aria-pressed', String(this.autoRunLocked));
    };
    sprint?.addEventListener('pointerdown', this.onSprintDown, { passive: false });
    sprint?.addEventListener('pointerup', this.onSprintUp);
    sprint?.addEventListener('pointercancel', this.onSprintUp);
    sprint?.addEventListener('lostpointercapture', this.onSprintUp);

    this.onSitDown = (event) => {
      if (this.ignoreInput() || (event.button !== 0 && event.pointerType === 'mouse')) return;
      event.preventDefault();
      event.stopPropagation();
      this.sitRequested = !this.sitRequested;
      this.sitQueued = this.sitRequested;
      this.updateSitButton();
    };
    this.onSitClick = (event) => {
      event.preventDefault();
      if (this.ignoreInput() || event.detail !== 0) return;
      this.sitRequested = !this.sitRequested;
      this.sitQueued = this.sitRequested;
      this.updateSitButton();
    };
    sit?.addEventListener('pointerdown', this.onSitDown, { passive: false });
    sit?.addEventListener('click', this.onSitClick);
    this.interactHoldTimer = null;
    this.interactHoldStartedAt = 0;
    this.interactHoldPointerId = null;
    this.interactHoldTriggered = false;
    this.interactHoldFrame = null;
    this.interactLongPressQueued = false;
    this.onInteractPointerDown = (event) => {
      if (this.ignoreInput() || (event.button !== 0 && event.pointerType === 'mouse')) return;
      event.preventDefault();
      event.stopPropagation();
      this.interactHoldPointerId = event.pointerId;
      this.interactHoldTriggered = false;
      interact?.classList.add('is-holding');
      interact?.style.setProperty('--hold-progress', '0%');
      try { interact?.setPointerCapture?.(event.pointerId); } catch {}
      if (interact?.dataset.heldItem !== 'true') return;
      this.interactHoldStartedAt = performance.now();
      const updateProgress = () => {
        if (this.interactHoldPointerId !== event.pointerId || this.interactHoldTriggered) return;
        const progress = Math.min(1, (performance.now() - this.interactHoldStartedAt) / 600);
        interact?.style.setProperty('--hold-progress', `${Math.round(progress * 100)}%`);
        if (progress >= 1) {
          this.interactHoldTriggered = true;
          this.interactLongPressQueued = true;
          this.interactQueued = true;
          interact?.classList.add('hold-complete');
          return;
        }
        this.interactHoldFrame = requestAnimationFrame(updateProgress);
      };
      this.interactHoldFrame = requestAnimationFrame(updateProgress);
    };
    this.onInteractPointerUp = (event) => {
      if (this.interactHoldPointerId !== event.pointerId) return;
      const wasLongPress = this.interactHoldTriggered;
      this.interactHoldPointerId = null;
      if (this.interactHoldFrame !== null) cancelAnimationFrame(this.interactHoldFrame);
      this.interactHoldFrame = null;
      interact?.classList.remove('is-holding', 'hold-complete');
      interact?.style.setProperty('--hold-progress', '0%');
      if (!wasLongPress && event.type === 'pointerup') this.interactQueued = true;
      this.suppressInteractClickUntil = performance.now() + 700;
    };
    this.onInteractClick = (event) => {
      if (this.ignoreInput() || (event.detail !== 0 && performance.now() < (this.suppressInteractClickUntil || 0)) || (event.button !== 0 && event.pointerType === 'mouse')) return;
      event.preventDefault();
      event.stopPropagation();
      this.interactQueued = true;
    };
    interact?.addEventListener('pointerdown', this.onInteractPointerDown, { passive: false });
    interact?.addEventListener('pointerup', this.onInteractPointerUp);
    interact?.addEventListener('pointercancel', this.onInteractPointerUp);
    interact?.addEventListener('lostpointercapture', this.onInteractPointerUp);
    interact?.addEventListener('click', this.onInteractClick);
  }
  setLocked(locked) {
    this.locked = Boolean(locked);
    if (!this.locked) return;
    this.cancelStickVisualFrame?.();
    this.keys.clear();
    this.jumpQueued = false;
    this.sitQueued = null;
    this.interactQueued = false;
    this.dropQueued = false;
    this.inventoryToggleQueued = false;
    this.pointer = null;
    this.activePointers.clear();
    this.pinchDistance = 0;
    this.touchAxes.x = 0;
    this.touchAxes.y = 0;
    this.autoSprint = false;
    this.autoRunLocked = false;
    this.joystickForwardPercent = 0;
    this.joystickPointerId = null;
    this.joystickCaptureTarget = null;
    this.touchSprint = false;
    this.touchJump = false;
    this.sprintPointerId = null;
    this.jumpPointerId = null;
    this.sprintButton?.classList.remove('is-active');
    this.sprintButton?.setAttribute('aria-pressed', 'false');
    document.getElementById('touch-jump')?.classList.remove('is-active');
    this.touchStick?.classList.remove('is-active');
    if (this.touchKnob) this.touchKnob.style.transform = 'translate(0, 0)';
    if (this.joystickPercentLabel) {
      this.joystickPercentLabel.textContent = '0%';
      this.joystickPercentLabel.classList.remove('is-ready');
    }
    if (this.interactHoldFrame !== null) cancelAnimationFrame(this.interactHoldFrame);
    this.interactHoldFrame = null;
    this.interactHoldPointerId = null;
    this.interactHoldTriggered = false;
    this.interactLongPressQueued = false;
    this.interactButton?.classList.remove('is-holding', 'hold-complete');
    this.interactButton?.style.setProperty('--hold-progress', '0%');
  }

  movement() {
    const axes = this.movementAxes;
    if (this.ignoreInput()) {
      axes.x = 0;
      axes.y = 0;
      return axes;
    }
    if (this.autoRunLocked && this.joystickPointerId === null) {
      axes.x = 0;
      axes.y = 1;
      return axes;
    }
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - this.touchAxes.y;
    const strafe = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.touchAxes.x;
    const x = Math.max(-1, Math.min(1, strafe));
    const y = Math.max(-1, Math.min(1, forward));
    const length = Math.hypot(x, y);
    if (length > 1) {
      axes.x = x / length;
      axes.y = y / length;
    } else {
      axes.x = x;
      axes.y = y;
    }
    return axes;
  }

  sprinting() { return !this.ignoreInput() && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint || this.autoRunLocked); }
  hasJumpQueued() { return !this.ignoreInput() && this.jumpQueued === true; }
  consumeJump() { const value = this.jumpQueued; this.jumpQueued = false; return value; }
  consumeSit() { const value = this.sitQueued; this.sitQueued = null; return value; }
  consumeInteract() { const value = this.interactQueued; this.interactQueued = false; return value; }
  consumeLongInteract() { const value = this.interactLongPressQueued; this.interactLongPressQueued = false; return value; }
  consumeDrop() { const value = this.dropQueued; this.dropQueued = false; return value; }
  consumeInventoryToggle() { const value = this.inventoryToggleQueued; this.inventoryToggleQueued = false; return value; }
  setSitting(sitting) { this.sitRequested = Boolean(sitting); this.sitQueued = null; this.updateSitButton(); }
  updateSitButton() {
    if (!this.sitButton) return;
    this.sitButton.innerHTML = this.sitRequested
      ? `<span class="ui-icon" data-icon="stand" aria-hidden="true"></span><small>${t('controls.stand')}</small>`
      : `<span class="ui-icon" data-icon="sit" aria-hidden="true"></span><small>${t('controls.sit')}</small>`;
    document.dispatchEvent(new Event('paw-haven-icons-change'));
    this.sitButton.setAttribute('aria-label', t(this.sitRequested ? 'controls.standAriaLabel' : 'controls.sitAriaLabel'));
    this.sitButton.setAttribute('aria-pressed', String(this.sitRequested));
    this.sitButton.classList.toggle('is-active', this.sitRequested);
  }

  dispose() {
    this.cancelStickVisualFrame?.();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('paw-haven-locale-change', this.onLocaleChange);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    const jump = document.getElementById('touch-jump');
    const sprint = document.getElementById('touch-sprint');
    const sit = document.getElementById('touch-sit');
    const wrap = document.getElementById('touch-controls');
    const zone = document.getElementById('touch-zone');
    const stick = document.getElementById('touch-stick');
    zone?.removeEventListener('pointerdown', this.startStick);
    stick?.removeEventListener('pointerdown', this.startStick);
    zone?.removeEventListener('lostpointercapture', this.resetStick);
    stick?.removeEventListener('lostpointercapture', this.resetStick);
    window.removeEventListener('pointermove', this.updateStick, true);
    window.removeEventListener('pointerup', this.resetStick, true);
    window.removeEventListener('pointercancel', this.resetStick, true);
    jump?.removeEventListener('pointerdown', this.onJumpDown);
    jump?.removeEventListener('pointerup', this.onJumpUp);
    jump?.removeEventListener('pointercancel', this.onJumpUp);
    jump?.removeEventListener('lostpointercapture', this.onJumpUp);
    sprint?.removeEventListener('pointerdown', this.onSprintDown);
    sprint?.removeEventListener('pointerup', this.onSprintUp);
    sprint?.removeEventListener('pointercancel', this.onSprintUp);
    sprint?.removeEventListener('lostpointercapture', this.onSprintUp);
    sit?.removeEventListener('pointerdown', this.onSitDown);
    sit?.removeEventListener('click', this.onSitClick);
    if (this.interactHoldFrame !== null) cancelAnimationFrame(this.interactHoldFrame);
    this.interactButton?.removeEventListener('pointerdown', this.onInteractPointerDown);
    this.interactButton?.removeEventListener('pointerup', this.onInteractPointerUp);
    this.interactButton?.removeEventListener('pointercancel', this.onInteractPointerUp);
    this.interactButton?.removeEventListener('lostpointercapture', this.onInteractPointerUp);
    this.interactButton?.removeEventListener('click', this.onInteractClick);
  }
}
