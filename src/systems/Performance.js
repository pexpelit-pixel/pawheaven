export class PerformanceMonitor {
  constructor(onSample, onAdaptiveScale) {
    this.onSample = onSample;
    this.onAdaptiveScale = onAdaptiveScale;
    this.elapsed = 0;
    this.frames = 0;
    this.last = performance.now();
    this.adaptiveScale = 1;
    this.lowFpsStreak = 0;
    this.highFpsStreak = 0;
  }

  resetAdaptiveScale() {
    this.adaptiveScale = 1;
    this.lowFpsStreak = 0;
    this.highFpsStreak = 0;
    this.onAdaptiveScale?.(1);
  }

  update(dt) {
    this.elapsed += dt;
    this.frames += 1;
    // One-second samples smooth short RAF jitter on mobile displays before updating HUD/adaptive quality.
    if (this.elapsed < 1.0) return;

    const now = performance.now();
    const fps = this.frames / Math.max(this.elapsed, 0.001);
    this.onSample?.(fps, now - this.last);
    this.last = now;
    this.elapsed = 0;
    this.frames = 0;

    // Orbiting reveals GPU-bound frame drops quickly. Adapt below a 42 FPS floor,
    // and recover only after stable 52+ FPS so resolution does not oscillate.
    if (fps < 42) {
      this.lowFpsStreak += 1;
      this.highFpsStreak = 0;
    } else if (fps >= 52) {
      this.highFpsStreak += 1;
      this.lowFpsStreak = 0;
    } else {
      this.lowFpsStreak = 0;
      this.highFpsStreak = 0;
    }

    // Emergency downscale remains available for severe GPU pressure; normal adaptation is more conservative to preserve MSAA clarity.
    if (fps < 18 && this.adaptiveScale > 0.38) {
      this.adaptiveScale = Math.max(0.38, this.adaptiveScale - 0.18);
      this.onAdaptiveScale?.(this.adaptiveScale);
      this.lowFpsStreak = 0;
    } else if (this.lowFpsStreak >= 2 && this.adaptiveScale > 0.48) {
      this.adaptiveScale = Math.max(0.48, this.adaptiveScale - 0.1);
      this.onAdaptiveScale?.(this.adaptiveScale);
      this.lowFpsStreak = 0;
    } else if (this.highFpsStreak >= 2 && this.adaptiveScale < 1) {
      // Restore render resolution promptly after stable recovery, rather than leaving edges soft for many seconds.
      this.adaptiveScale = Math.min(1, this.adaptiveScale + 0.08);
      this.onAdaptiveScale?.(this.adaptiveScale);
      this.highFpsStreak = 0;
    }
  }
}
