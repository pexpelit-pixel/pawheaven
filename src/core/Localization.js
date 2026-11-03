import en from '../localization/en.json';
import id from '../localization/id.json';
import vn from '../localization/vn.json';

const CATALOGS = Object.freeze({ en, id, vn });
const DEFAULT_LOCALE = 'en';
let activeLocale = DEFAULT_LOCALE;

function normalizeLocale(value) {
  if (typeof value !== 'string') return DEFAULT_LOCALE;
  const raw = value.trim().toLowerCase().split('-')[0];
  const base = raw === 'vi' ? 'vn' : raw;
  return Object.hasOwn(CATALOGS, base) ? base : DEFAULT_LOCALE;
}

try {
  activeLocale = normalizeLocale(localStorage.getItem('paw-haven-locale'));
} catch {
  activeLocale = DEFAULT_LOCALE;
}

export function getLocale() {
  return activeLocale;
}

export function t(key, variables = {}) {
  const lookupKey = String(key ?? '');
  const template = CATALOGS[activeLocale]?.[lookupKey] ?? CATALOGS[DEFAULT_LOCALE]?.[lookupKey] ?? lookupKey;
  return String(template).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name) => {
    const value = variables[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function applyTranslations(root = document) {
  const selector = '[data-i18n], [data-i18n-aria-label], [data-i18n-title], [data-i18n-content], [data-i18n-placeholder]';
  const nodes = [];
  if (root?.matches?.(selector)) nodes.push(root);
  if (root?.querySelectorAll) nodes.push(...root.querySelectorAll(selector));

  for (const node of nodes) {
    if (node.dataset.i18n) node.textContent = t(node.dataset.i18n);
    if (node.dataset.i18nAriaLabel) node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    if (node.dataset.i18nTitle) node.setAttribute('title', t(node.dataset.i18nTitle));
    if (node.dataset.i18nContent) node.setAttribute('content', t(node.dataset.i18nContent));
    if (node.dataset.i18nPlaceholder) node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = activeLocale === 'vn' ? 'vi' : activeLocale;
  }
}

export function setLocale(locale) {
  activeLocale = normalizeLocale(locale);
  try {
    localStorage.setItem('paw-haven-locale', activeLocale);
  } catch {
    // The selected language still works for the current session when storage is unavailable.
  }
  applyTranslations();
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('paw-haven-locale-change', { detail: { locale: activeLocale } }));
  }
  return activeLocale;
}

export const SUPPORTED_LOCALES = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'vn', label: 'Tiếng Việt' }
]);
