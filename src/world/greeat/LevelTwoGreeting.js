import './LevelTwoGreeting.css';
import blueAngelArt from './blue-angel.png';
import { applyTranslations } from '../../core/Localization.js';
import { startTypingFx, stopTypingFx } from '../sound/SoundEvents.js';

export function showLevelTwoGreeting({ onStart } = {}) {
  if (typeof document === 'undefined' || document.getElementById('level-two-greeting')) return null;

  const gameRoot = document.getElementById('game') || document.body;
  const root = document.createElement('div');
  root.id = 'level-two-greeting';
  root.className = 'level-two-greeting';
  root.innerHTML = `
    <img class="level-two-greeting__angel" src="${blueAngelArt}" alt="" draggable="false" />
    <section class="level-two-greeting__card" role="dialog" aria-modal="false"
      aria-labelledby="level-two-greeting-title" aria-describedby="level-two-greeting-message">
      <div class="level-two-greeting__copy">
        <span class="level-two-greeting__eyebrow" data-i18n="levelTwoGreeting.eyebrow"></span>
        <h2 id="level-two-greeting-title" data-i18n="levelTwoGreeting.title"></h2>
        <p id="level-two-greeting-message" data-i18n="levelTwoGreeting.message" aria-live="polite"></p>
      </div>
      <span class="level-two-greeting__hint" data-i18n="levelTwoGreeting.start"></span>
    </section>
  `;

  gameRoot.append(root);
  gameRoot.classList.add('level-two-greeting-active');
  applyTranslations(root);

  const message = root.querySelector('#level-two-greeting-message');
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
    typingTimer = window.setTimeout(typeNext, 24);
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
      gameRoot.classList.remove('level-two-greeting-active');
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
