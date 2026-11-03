import { t } from '../core/Localization.js';

export class LoadingScreen {
  constructor() {
    this.root = document.getElementById('loading-screen');
    this.progress = document.getElementById('loading-progress');
    this.percent = document.getElementById('loading-percent');
    this.title = document.getElementById('loading-title');
    this.message = document.getElementById('loading-message');
    this.value = 0;
  }

  set(value, title, message) {
    this.value = Math.max(this.value, Math.min(100, Math.round(value * 100)));
    this.progress.style.width = `${this.value}%`;
    this.percent.textContent = `${this.value}%`;
    if (title) this.title.textContent = title;
    if (message) this.message.textContent = message;
  }

  finish() {
    this.set(1, t('loading.finished.title'), t('loading.finished.message'));
    window.setTimeout(() => this.root.classList.add('is-done'), 380);
  }

  fail(error) {
    this.root.classList.add('is-done');
    const errorScreen = document.getElementById('error-screen');
    document.getElementById('error-message').textContent = error?.message || String(error || t('error.unknownStartup'));
    errorScreen.hidden = false;
  }
}
