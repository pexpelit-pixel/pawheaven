export const QUALITY_PRESETS = Object.freeze({
  // Hardware MSAA is enabled in every profile. Low trims distance/effects first to protect frame time.
  low: Object.freeze({ label: 'LOW · PERFORMANCE', pixelRatio: 1.0, shadows: false, matcap: false, bloom: false, shadowMapSize: 256, drawDistance: 64 }),
  medium: Object.freeze({ label: 'MEDIUM · BALANCED', pixelRatio: 1.0, shadows: true, matcap: false, bloom: false, shadowMapSize: 512, drawDistance: 70 }),
  // High keeps the full shelter visibility range; bloom remains desktop-only.
  high: Object.freeze({ label: 'HIGH · DETAIL', pixelRatio: 1.25, shadows: true, matcap: false, bloom: true, shadowMapSize: 1024, drawDistance: 84 })
});

export function detectDefaultQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const compact = matchMedia('(max-width: 900px)').matches;
  if (compact || cores <= 4 || memory <= 4) return 'low';
  if (cores >= 8 && memory >= 8) return 'high';
  return 'medium';
}
