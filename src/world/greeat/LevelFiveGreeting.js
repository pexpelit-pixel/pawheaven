import './LevelFiveGreeting.css';
import specialAngelArt from './spesial-angel.png';
import { applyTranslations } from '../../core/Localization.js';
import { startTypingFx, stopTypingFx } from '../sound/SoundEvents.js';

const SLIDES = Object.freeze({
  gallery: {
    eyebrow: 'levelFiveGreeting.gallery.eyebrow',
    title: 'levelFiveGreeting.gallery.title',
    message: 'levelFiveGreeting.gallery.message',
    hint: 'levelFiveGreeting.gallery.hint',
    number: '01 / 02'
  },
  observatory: {
    eyebrow: 'levelFiveGreeting.observatory.eyebrow',
    title: 'levelFiveGreeting.observatory.title',
    message: 'levelFiveGreeting.observatory.message',
    hint: 'levelFiveGreeting.observatory.hint',
    number: '02 / 02'
  }
});

export function showLevelFiveGreeting({ slide = 'gallery', onStart } = {}) {
  if (typeof document === 'undefined' || document.getElementById('level-five-greeting')) return null;

  const selected = SLIDES[slide] || SLIDES.gallery;
  const gameRoot = document.getElementById('game') || document.body;
  const root = document.createElement('div');
  root.id = 'level-five-greeting';
  root.className = 'level-five-greeting level-five-greeting--' + (slide === 'observatory' ? 'observatory' : 'gallery');
  root.innerHTML = `
    <div class="level-five-greeting__stars" aria-hidden="true"></div>
    <img class="level-five-greeting__angel" src="${specialAngelArt}" alt="" draggable="false" />
    <section class="level-five-greeting__card" role="dialog" aria-modal="false"
      aria-labelledby="level-five-greeting-title" aria-describedby="level-five-greeting-message">
      <div class="level-five-greeting__copy">
        <span class="level-five-greeting__eyebrow" data-i18n="${selected.eyebrow}"></span>
        <h2 id="level-five-greeting-title" data-i18n="${selected.title}"></h2>
        <p id="level-five-greeting-message" data-i18n="${selected.message}" aria-live="polite"></p>
      </div>
      <div class="level-five-greeting__footer">
        <span class="level-five-greeting__page">${selected.number}</span>
        <span class="level-five-greeting__hint" data-i18n="${selected.hint}"></span>
      </div>
    </section>
  `;

  gameRoot.append(root);
  gameRoot.classList.add('level-five-greeting-active');
  applyTranslations(root);

  const message = root.querySelector('#level-five-greeting-message');
  const fullMessage = message?.textContent || '';
  const characters = Array.from(fullMessage);
  let characterIndex = 0;
  let typingTimer = 0;
  let typingComplete = false;
  let closed = false;

  const finishTyping = () => {
    if (typingComplete) return;
    typingComplete = true;
    stopTypingFx();
    if (typingTimer) window.clearTimeout(typingTimer);
    typingTimer = 0;
    if (message) {
      message.textContent = fullMessage;
      message.classList.remove('is-typing');
    }
  };

  const typeNext = () => {
    if (closed || typingComplete || !message) return;
    characterIndex = Math.min(characters.length, characterIndex + 2);
    message.textContent = characters.slice(0, characterIndex).join('');
    if (characterIndex >= characters.length) {
      finishTyping();
      return;
    }
    typingTimer = window.setTimeout(typeNext, 22);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    stopTypingFx();
    if (typingTimer) window.clearTimeout(typingTimer);
    document.removeEventListener('keydown', onKeyDown);
    try {
      onStart?.();
    } finally {
      gameRoot.classList.remove('level-five-greeting-active');
      root.remove();
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') close();
  };

  if (message) {
    message.textContent = '';
    message.classList.add('is-typing');
  }
  root.addEventListener('click', close);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      close();
    }
  });
  root.tabIndex = 0;
  document.addEventListener('keydown', onKeyDown);

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finishTyping();
  else {
    startTypingFx();
    typingTimer = window.setTimeout(typeNext, 220);
  }

  return close;
}
