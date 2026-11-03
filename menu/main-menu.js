import menuBackgroundUrl from './menu-bg.webp?url';
import { getLocale, setLocale, t } from '../src/core/Localization.js';

const bundledAssets = import.meta.glob(
  '/src/**/*.{glb,gltf,bin,ktx2,ktx,png,jpg,jpeg,webp,avif,gif,svg,ogg,wav,mp3,json,woff,woff2,ttf,otf,obj,mtl,fbx,dae}',
  { eager: true, query: '?url', import: 'default' }
);

const PUBLIC_ASSETS = Object.freeze([
  './basis/basis_transcoder.js',
  './basis/basis_transcoder.wasm',
  './draco/draco_decoder.js',
  './draco/draco_decoder.wasm',
  './draco/draco_wasm_wrapper.js',
  './splash/splash.mp4'
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg']);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 240;
const REQUEST_TIMEOUT_MS = 45000;

function extensionOf(url) {
  const pathname = new URL(url, document.baseURI).pathname;
  const lastDot = pathname.lastIndexOf('.');
  return lastDot < 0 ? '' : pathname.slice(lastDot).toLowerCase();
}

function collectResourceUrls() {
  const candidates = [
    ...Object.values(bundledAssets),
    menuBackgroundUrl,
    ...PUBLIC_ASSETS.map((path) => new URL(path, document.baseURI).href)
  ];

  return [...new Set(candidates
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => new URL(value, document.baseURI).href))]
    .sort();
}

async function readPrefix(blob, length = 12) {
  return new Uint8Array(await blob.slice(0, length).arrayBuffer());
}

function prefixText(bytes) {
  return String.fromCharCode(...bytes.slice(0, 4));
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close?.();
      return;
    } catch {
      // Some browsers cannot decode SVG through createImageBitmap; try the Image path.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    if (typeof image.decode === 'function') {
      await image.decode();
      return;
    }
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Image decode failed'));
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function validateResource(blob, url) {
  if (!blob.size) throw new Error('Empty response');

  const extension = extensionOf(url);
  const prefix = await readPrefix(blob, 12);

  if (extension === '.glb') {
    if (blob.size < 12 || prefixText(prefix) !== 'glTF') {
      throw new Error('Invalid GLB header');
    }
    return;
  }

  if (extension === '.wasm') {
    if (prefix[0] !== 0 || prefix[1] !== 97 || prefix[2] !== 115 || prefix[3] !== 109) {
      throw new Error('Invalid WebAssembly header');
    }
    return;
  }

  if (extension === '.mp4') {
    if (String.fromCharCode(...prefix.slice(4, 8)) !== 'ftyp') {
      throw new Error('Invalid MP4 container header');
    }
    return;
  }

  if (extension === '.ogg' && prefixText(prefix) !== 'OggS') {
    throw new Error('Invalid OGG header');
  }

  if (extension === '.wav' && prefixText(prefix) !== 'RIFF') {
    throw new Error('Invalid WAV header');
  }

  if (extension === '.json' || extension === '.gltf') {
    try {
      JSON.parse(await blob.text());
    } catch {
      throw new Error('Invalid JSON resource');
    }
    return;
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    await decodeImage(blob);
  }
}

async function fetchAndValidate(url) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'default',
      credentials: 'same-origin',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new Error('Server returned an HTML fallback instead of the requested resource');
    }

    const blob = await response.blob();
    await validateResource(blob, url);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Download timed out after ' + Math.round(REQUEST_TIMEOUT_MS / 1000) + ' seconds');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function prepareOne(url) {
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await fetchAndValidate(url);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < MAX_ATTEMPTS) {
        await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Resource preparation failed');
}

async function prepareResources(onProgress) {
  const urls = collectResourceUrls();
  const total = urls.length;
  const failures = [];
  let loaded = 0;
  let cursor = 0;

  if (!total) {
    return { ok: false, total: 0, loaded: 0, failures: [{ url: '', message: 'No resources were discovered' }] };
  }

  const report = () => {
    const progress = total > 0 ? loaded / total : 0;
    onProgress?.({
      itemsLoaded: loaded,
      itemsTotal: total,
      progress,
      percent: Math.floor(progress * 100)
    });
  };

  report();

  const isMobile = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
  const concurrency = isMobile ? 3 : 5;
  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (cursor < total) {
      const index = cursor++;
      const url = urls[index];
      try {
        await prepareOne(url);
        loaded += 1;
      } catch (error) {
        failures.push({
          url,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      report();
    }
  });

  await Promise.all(workers);
  return { ok: failures.length === 0, total, loaded, failures };
}

export function mountMainMenu({ onPlay, prepareRuntime } = {}) {
  const root = document.getElementById('main-menu');
  const button = document.getElementById('menu-play-button');
  const progressBar = document.getElementById('menu-progress-bar');
  const percentLabel = document.getElementById('menu-progress-percent');
  const statusLabel = document.getElementById('menu-progress-status');

  if (!root || !button || !progressBar || !percentLabel || !statusLabel) {
    throw new Error('Main menu markup is incomplete.');
  }

  const progressTrack = root.querySelector('[role="progressbar"]');
  const fullscreenButton = root.querySelector('#menu-fullscreen-button');
  const fullscreenLabel = root.querySelector('#menu-fullscreen-label');
  const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);

  const updateFullscreenButton = () => {
    if (!fullscreenButton) return;
    const active = isFullscreen();
    const label = t(active ? 'menu.fullscreenExit' : 'menu.fullscreen');
    if (fullscreenLabel) fullscreenLabel.textContent = label;
    fullscreenButton.setAttribute('aria-label', t(active ? 'menu.fullscreenExit' : 'menu.fullscreenEnter'));
    fullscreenButton.setAttribute('aria-pressed', String(active));
    fullscreenButton.setAttribute('title', label);
    fullscreenButton.classList.remove('is-unavailable');
  };

  fullscreenButton?.addEventListener('click', async () => {
    try {
      if (isFullscreen()) {
        const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
        if (typeof exitFullscreen === 'function') await exitFullscreen.call(document);
      } else {
        const element = document.documentElement;
        const requestFullscreen = element.requestFullscreen || element.webkitRequestFullscreen;
        if (typeof requestFullscreen !== 'function') {
          fullscreenButton.classList.add('is-unavailable');
          fullscreenButton.setAttribute('title', t('menu.fullscreenUnavailable'));
          return;
        }
        await requestFullscreen.call(element, { navigationUI: 'hide' });
      }
    } catch (error) {
      fullscreenButton.classList.add('is-unavailable');
      fullscreenButton.setAttribute('title', t('menu.fullscreenUnavailable'));
      console.warn('[Paw Haven] Fullscreen request was not accepted:', error);
    } finally {
      updateFullscreenButton();
    }
  });

  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
  updateFullscreenButton();


  const settingsButton = root.querySelector('#menu-settings-button');
  const settingsPanel = root.querySelector('#menu-settings-panel');
  const settingsClose = root.querySelector('#menu-settings-close');
  const languageStatus = root.querySelector('#menu-language-status');
  const languageOptions = [...root.querySelectorAll('[data-menu-locale]')];

  const updateLanguageOptions = () => {
    const activeLocale = getLocale();
    for (const option of languageOptions) {
      const selected = option.dataset.menuLocale === activeLocale;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    }
  };

  const closeMenuSettings = () => {
    if (!settingsPanel) return;
    settingsPanel.hidden = true;
    settingsButton?.setAttribute('aria-expanded', 'false');
  };

  settingsButton?.addEventListener('click', () => {
    if (!settingsPanel) return;
    settingsPanel.hidden = false;
    settingsButton.setAttribute('aria-expanded', 'true');
    updateLanguageOptions();
    settingsClose?.focus();
  });

  settingsClose?.addEventListener('click', closeMenuSettings);

  settingsPanel?.addEventListener('click', (event) => {
    if (event.target === settingsPanel) closeMenuSettings();
  });

  for (const option of languageOptions) {
    option.addEventListener('click', () => {
      setLocale(option.dataset.menuLocale);
      updateLanguageOptions();
      if (languageStatus) {
        languageStatus.hidden = false;
        languageStatus.textContent = t('menu.languageSelected');
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !settingsPanel || settingsPanel.hidden) return;
    closeMenuSettings();
    settingsButton?.focus();
  });

  window.addEventListener('paw-haven-locale-change', () => {
    updateLanguageOptions();
    updateFullscreenButton();
    if (ready) statusLabel.textContent = t('menu.ready');
  });

  updateLanguageOptions();



  let ready = false;
  let started = false;
  button.disabled = true;
  statusLabel.textContent = t('menu.preparing');
  percentLabel.textContent = '0%';
  progressBar.style.width = '0%';

  button.addEventListener('click', () => {
    if (!ready || started) return;
    started = true;
    button.disabled = true;
    root.classList.add('is-hidden');
    root.setAttribute('aria-hidden', 'true');
    onPlay?.();
  });

  const assetTask = prepareResources(({ percent }) => {
    percentLabel.textContent = percent + '%';
    progressBar.style.width = percent + '%';
    progressTrack?.setAttribute('aria-valuenow', String(percent));
  });

  const runtimeTask = typeof prepareRuntime === 'function'
    ? Promise.resolve().then(() => prepareRuntime())
    : Promise.resolve();

  Promise.allSettled([assetTask, runtimeTask]).then(([assetResult, runtimeResult]) => {
    if (assetResult.status !== 'fulfilled') {
      console.error('[Paw Haven] Resource warm-up failed:', assetResult.reason);
      statusLabel.textContent = t('menu.failed', { count: 1 });
      return;
    }

    const assets = assetResult.value;
    if (!assets.ok) {
      console.error('[Paw Haven] Required resources failed validation:', assets.failures);
      const firstFailure = assets.failures[0];
      const failureName = firstFailure?.url
        ? new URL(firstFailure.url).pathname.split('/').pop()
        : 'unknown resource';
      const failureReason = firstFailure?.message || 'Unknown download error';
      statusLabel.textContent = t('menu.failed', { count: assets.failures.length })
        + ' ' + failureName + ': ' + failureReason;
      return;
    }

    if (runtimeResult.status !== 'fulfilled') {
      console.error('[Paw Haven] Physics runtime preparation failed:', runtimeResult.reason);
      statusLabel.textContent = t('menu.physicsFailed');
      return;
    }

    percentLabel.textContent = '100%';
    progressBar.style.width = '100%';
    progressTrack?.setAttribute('aria-valuenow', '100');
    statusLabel.textContent = t('menu.ready');
    ready = true;
    button.disabled = false;
  });
}
