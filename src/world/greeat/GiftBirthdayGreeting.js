import './WelcomeGreeting.css';
import './GiftBirthdayGreeting.css';
import angelOne from './angle.png';
import angelAzure from './blue-angel.png';
import angelFern from './green-angel.png';
import angelEmber from './orange-angle.png';
import angelVesper from './purple-angle.png';
import angelMemory from './spesial-angel.png';
import album0 from '../skin/object/album0.webp';
import album1 from '../skin/object/album1.webp';
import album2 from '../skin/object/album2.webp';
import album3 from '../skin/object/album3.webp';
import { t } from '../../core/Localization.js';
import { startTypingFx, stopTypingFx } from '../sound/SoundEvents.js';
import { playAngelVoice, stopAngelVoice } from '../sound/AngelVoice.js';

const ALBUM_IMAGES = [album0, album1, album2, album3];

export function showGiftBirthdayGreeting(inputController, lifecycle = {}) {
  if (typeof document === 'undefined' || document.getElementById('gift-birthday-greeting')) return null;

  const slides = [
    {
      speaker: t('giftGreeting.slide1.speaker'),
      title: t('giftGreeting.slide1.title'),
      message: t('giftGreeting.slide1.message'),
      objective: t('giftGreeting.slide1.objective'),
      angels: [{ src: angelOne, alt: t('giftGreeting.angel1.alt') }],
      voice: ['shelter']
    },
    {
      speaker: t('giftGreeting.slide2.speaker'),
      title: t('giftGreeting.slide2.title'),
      message: t('giftGreeting.slide2.message'),
      objective: t('giftGreeting.slide2.objective'),
      angels: [
        { src: angelAzure, alt: t('giftGreeting.angel2.alt') },
        { src: angelFern, alt: t('giftGreeting.angel3.alt') }
      ],
      voice: ['azure', 'fern']
    },
    {
      speaker: t('giftGreeting.slide3.speaker'),
      title: t('giftGreeting.slide3.title'),
      message: t('giftGreeting.slide3.message'),
      objective: t('giftGreeting.slide3.objective'),
      angels: [
        { src: angelEmber, alt: t('giftGreeting.angel4.alt') },
        { src: angelVesper, alt: t('giftGreeting.angel5.alt') }
      ],
      voice: ['ember', 'vesper']
    },
    {
      speaker: t('giftGreeting.slide4.speaker'),
      title: t('giftGreeting.slide4.title'),
      message: t('giftGreeting.slide4.message'),
      objective: t('giftGreeting.slide4.objective'),
      angels: [{ src: angelMemory, alt: t('giftGreeting.angel6.alt') }],
      gallery: true,
      voice: ['memory']
    },
    {
      speaker: t('giftGreeting.developerIntro.speaker'),
      title: t('giftGreeting.developerIntro.title'),
      message: t('giftGreeting.developerIntro.message'),
      objective: t('giftGreeting.developerIntro.objective'),
      angels: [{ src: angelMemory, alt: t('giftGreeting.angel6.alt') }],
      developerLetter: true,
      voice: ['memoryLetter']
    }
  ];

  const root = document.createElement('div');
  root.id = 'gift-birthday-greeting';
  root.className = 'story-greeting gift-birthday-greeting';
  root.innerHTML =
    '<section class="story-greeting__stage gift-birthday__stage" role="dialog" aria-modal="true" aria-labelledby="gift-birthday-title" aria-describedby="gift-birthday-message" tabindex="-1">' +
      '<div class="story-greeting__sky story-greeting__sky--one" aria-hidden="true"></div>' +
      '<div class="story-greeting__sky story-greeting__sky--two" aria-hidden="true"></div>' +
      '<div class="gift-birthday__scene" data-role="scene">' +
        '<div class="gift-birthday__photo-grid" data-role="gallery" hidden></div>' +
        '<div class="gift-birthday__angel-group" data-role="angels"></div>' +
        '<div class="gift-birthday__scene-glow" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="story-greeting__dialogue gift-birthday__dialogue" data-role="dialogue">' +
        '<div class="story-greeting__speaker">' +
          '<span class="story-greeting__speaker-mark" aria-hidden="true">✦</span>' +
          '<span data-role="speaker"></span>' +
        '</div>' +
        '<div class="story-greeting__copy gift-birthday__copy">' +
          '<h1 id="gift-birthday-title" data-role="title"></h1>' +
          '<p id="gift-birthday-message" data-role="message" aria-live="polite"></p>' +
        '</div>' +
        '<div class="story-greeting__footer gift-birthday__footer">' +
          '<div class="story-greeting__objective">' +
            '<span class="story-greeting__gift" aria-hidden="true">✧</span>' +
            '<span data-role="objective"></span>' +
          '</div>' +
          '<button class="story-greeting__continue" data-role="continue" type="button" disabled>' +
            '<span data-role="continue-label"></span>' +
            '<span class="story-greeting__continue-arrow" aria-hidden="true">▶</span>' +
          '</button>' +
        '</div>' +
        '<div class="story-greeting__page-mark" data-role="page" aria-hidden="true"></div>' +
      '</div>' +
      '<section class="gift-birthday__letter" data-role="letter" aria-label="' + t('giftGreeting.letter.aria') + '" hidden>' +
        '<header class="gift-birthday__letter-header">' +
          '<div class="gift-birthday__letter-kicker"><span aria-hidden="true">✦</span> ' + t('giftGreeting.letter.kicker') + '</div>' +
          '<h1>' + t('giftGreeting.letter.title') + '</h1>' +
          '<p>' + t('giftGreeting.letter.subtitle') + '</p>' +
          '<div class="gift-birthday__letter-rule" aria-hidden="true"><span>♥</span></div>' +
        '</header>' +
        '<div class="gift-birthday__letter-scroll" data-role="letter-scroll" tabindex="0" aria-label="' + t('giftGreeting.letter.scrollAria') + '">' +
          '<div class="gift-birthday__letter-body" data-role="letter-body"></div>' +
          '<div class="gift-birthday__letter-signoff">' +
            '<span class="gift-birthday__letter-signoff-caption">' + t('giftGreeting.letter.signoffCaption') + '</span>' +
            '<div class="gift-birthday__love" data-role="love" aria-live="polite"></div>' +
            '<span class="gift-birthday__love-heart" aria-hidden="true">♥</span>' +
          '</div>' +
        '</div>' +
        '<div class="gift-birthday__letter-bottom">' +
          '<div class="gift-birthday__read-progress" aria-hidden="true"><span data-role="read-progress"></span></div>' +
          '<div class="gift-birthday__letter-bottom-row">' +
            '<span data-role="letter-hint">' + t('giftGreeting.letter.scrollHint') + '</span>' +
            '<button class="story-greeting__continue gift-birthday__letter-close" data-role="letter-close" type="button" disabled>' +
              '<span>' + t('giftGreeting.finish') + '</span><span aria-hidden="true">♥</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<div class="story-greeting__hint" aria-hidden="true">✧</div>' +
    '</section>';

  const gameRoot = document.getElementById('game') || document.body;
  gameRoot.append(root);

  const stage = root.querySelector('.gift-birthday__stage');
  const scene = root.querySelector('[data-role="scene"]');
  const dialogue = root.querySelector('[data-role="dialogue"]');
  const angelGroup = root.querySelector('[data-role="angels"]');
  const gallery = root.querySelector('[data-role="gallery"]');
  const speaker = root.querySelector('[data-role="speaker"]');
  const title = root.querySelector('[data-role="title"]');
  const message = root.querySelector('[data-role="message"]');
  const objective = root.querySelector('[data-role="objective"]');
  const pageMark = root.querySelector('[data-role="page"]');
  const continueButton = root.querySelector('[data-role="continue"]');
  const continueLabel = root.querySelector('[data-role="continue-label"]');
  const letter = root.querySelector('[data-role="letter"]');
  const letterScroll = root.querySelector('[data-role="letter-scroll"]');
  const letterBody = root.querySelector('[data-role="letter-body"]');
  const letterLove = root.querySelector('[data-role="love"]');
  const letterClose = root.querySelector('[data-role="letter-close"]');
  const letterHint = root.querySelector('[data-role="letter-hint"]');
  const readProgress = root.querySelector('[data-role="read-progress"]');

  let slideIndex = 0;
  let typingTimer = 0;
  let loveTimer = 0;
  let typingComplete = false;
  let closed = false;
  let letterOpened = false;
  let loveStarted = false;
  let fullMessage = '';
  let characters = [];
  let characterIndex = 0;

  const finishTyping = () => {
    if (typingComplete) return;
    typingComplete = true;
    stopTypingFx();
    if (typingTimer) window.clearTimeout(typingTimer);
    typingTimer = 0;
    message.textContent = fullMessage;
    continueButton.disabled = false;
    continueButton.classList.add('is-ready');
  };

  const typeNext = () => {
    if (closed || typingComplete) return;
    characterIndex = Math.min(characters.length, characterIndex + 2);
    message.textContent = characters.slice(0, characterIndex).join('');
    if (characterIndex >= characters.length) {
      finishTyping();
      return;
    }
    typingTimer = window.setTimeout(typeNext, 18);
  };

  const renderArtwork = (slide) => {
    angelGroup.replaceChildren();
    gallery.replaceChildren();
    root.classList.toggle('is-gallery-slide', Boolean(slide.gallery));
    angelGroup.className = 'gift-birthday__angel-group';
    if (slide.angels.length === 1) angelGroup.classList.add('gift-birthday__angel-group--single');
    if (slide.gallery) angelGroup.classList.add('gift-birthday__angel-group--final');

    slide.angels.forEach((angel, index) => {
      const image = document.createElement('img');
      image.className = 'gift-birthday__angel-image';
      if (slide.angels.length > 1) {
        image.classList.add('gift-birthday__angel-image--pair', 'gift-birthday__angel-image--pair-' + (index + 1));
      }
      image.src = angel.src;
      image.alt = angel.alt;
      image.draggable = false;
      image.decoding = 'async';
      image.loading = 'eager';
      angelGroup.append(image);
    });

    gallery.hidden = !slide.gallery;
    if (slide.gallery) {
      ALBUM_IMAGES.forEach((src, index) => {
        const frame = document.createElement('div');
        frame.className = 'gift-birthday__photo-frame gift-birthday__photo-frame--' + (index + 1);
        const image = document.createElement('img');
        image.className = 'gift-birthday__photo';
        image.src = src;
        image.alt = t('giftGreeting.album.alt', { index: index + 1 });
        image.draggable = false;
        image.decoding = 'async';
        image.loading = 'eager';
        frame.append(image);
        gallery.append(frame);
      });
    }
  };

  const buildDeveloperLetter = () => {
    const paragraphs = [
      'giftGreeting.letter.p1',
      'giftGreeting.letter.p2',
      'giftGreeting.letter.p3',
      'giftGreeting.letter.p4',
      'giftGreeting.letter.p5',
      'giftGreeting.letter.p6',
      'giftGreeting.letter.p7'
    ];
    letterBody.replaceChildren();
    paragraphs.forEach((key, index) => {
      const p = document.createElement('p');
      p.className = 'gift-birthday__letter-paragraph' + (index === 0 ? ' gift-birthday__letter-paragraph--salutation' : '');
      p.textContent = t(key);
      letterBody.append(p);
    });
  };

  const typeLove = () => {
    if (loveStarted || closed) return;
    loveStarted = true;
    const phrase = Array.from(t('giftGreeting.letter.love'));
    let index = 0;
    letterLove.textContent = '';
    letterLove.classList.add('is-writing');

    const writeNext = () => {
      if (closed) return;
      index = Math.min(phrase.length, index + 1);
      letterLove.textContent = phrase.slice(0, index).join('');
      letterScroll.scrollTop = letterScroll.scrollHeight;
      if (index < phrase.length) {
        loveTimer = window.setTimeout(writeNext, 155);
        return;
      }
      letterLove.classList.remove('is-writing');
      letterLove.classList.add('is-written');
      stopTypingFx();
      letterClose.disabled = false;
      letterClose.classList.add('is-ready');
      letterHint.textContent = t('giftGreeting.letter.doneHint');
    };

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      letterLove.textContent = phrase.join('');
      letterScroll.scrollTop = letterScroll.scrollHeight;
      letterLove.classList.add('is-written');
      letterClose.disabled = false;
      letterClose.classList.add('is-ready');
      letterHint.textContent = t('giftGreeting.letter.doneHint');
    } else {
      startTypingFx();
      loveTimer = window.setTimeout(writeNext, 260);
    }
  };

  const checkLetterRead = () => {
    if (!letterOpened) return;
    const maxScroll = Math.max(0, letterScroll.scrollHeight - letterScroll.clientHeight);
    const progress = maxScroll <= 2 ? 1 : Math.min(1, letterScroll.scrollTop / maxScroll);
    readProgress.style.width = (progress * 100).toFixed(1) + '%';
    if (progress >= 0.995) {
      letterHint.textContent = t('giftGreeting.letter.endReached');
      typeLove();
    }
  };

  const openDeveloperLetter = () => {
    if (letterOpened) return;
    letterOpened = true;
    stopTypingFx();
    stopAngelVoice();
    if (typingTimer) window.clearTimeout(typingTimer);
    typingTimer = 0;
    scene.hidden = true;
    dialogue.hidden = true;
    letter.hidden = false;
    stage.classList.add('is-letter-open');
    buildDeveloperLetter();
    letterScroll.scrollTop = 0;
    readProgress.style.width = '0%';
    letterClose.disabled = true;
    letterClose.classList.remove('is-ready');
    letterHint.textContent = t('giftGreeting.letter.scrollHint');
    stage.setAttribute('aria-labelledby', 'gift-birthday-letter-title');
    letter.querySelector('h1').id = 'gift-birthday-letter-title';
    letter.querySelector('.gift-birthday__letter-header p').id = 'gift-birthday-letter-subtitle';
    stage.setAttribute('aria-describedby', 'gift-birthday-letter-subtitle');
    letterScroll.focus();
    window.requestAnimationFrame(checkLetterRead);
  };

  const setSlide = (index) => {
    if (typingTimer) window.clearTimeout(typingTimer);
    typingTimer = 0;
    slideIndex = index;
    const slide = slides[slideIndex];
    typingComplete = false;
    characterIndex = 0;
    fullMessage = slide.message;
    characters = Array.from(fullMessage);

    speaker.textContent = slide.speaker;
    title.textContent = slide.title;
    message.textContent = '';
    objective.textContent = slide.objective;
    pageMark.textContent = String(slideIndex + 1).padStart(2, '0') + '  /  05';
    continueLabel.textContent = slide.developerLetter
      ? t('giftGreeting.developerIntro.openLetter')
      : slideIndex === slides.length - 1
        ? t('giftGreeting.finish')
        : t('giftGreeting.next');

    continueButton.disabled = true;
    continueButton.classList.remove('is-ready');
    renderArtwork(slide);
    playAngelVoice(slide.voice);
    dialogue.scrollTop = 0;
    stage.classList.remove('is-changing');
    void stage.offsetWidth;
    stage.classList.add('is-changing');

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finishTyping();
    else {
      startTypingFx();
      typingTimer = window.setTimeout(typeNext, 260);
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    stopTypingFx();
    stopAngelVoice();
    if (typingTimer) window.clearTimeout(typingTimer);
    if (loveTimer) window.clearTimeout(loveTimer);
    document.removeEventListener('keydown', onKeyDown);
    inputController?.setLocked?.(false);
    root.remove();
    lifecycle.onClose?.();
  };

  const advance = () => {
    if (!typingComplete) {
      finishTyping();
      return;
    }
    if (slides[slideIndex].developerLetter) {
      openDeveloperLetter();
      return;
    }
    setSlide(slideIndex + 1);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (!letterOpened && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      advance();
    }
  };

  inputController?.setLocked?.(true);
  lifecycle.onOpen?.();
  document.addEventListener('keydown', onKeyDown);
  dialogue.addEventListener('click', (event) => {
    if (!event.target.closest('button') && !typingComplete) finishTyping();
  });
  continueButton.addEventListener('click', advance);
  letterScroll.addEventListener('scroll', checkLetterRead, { passive: true });
  letterClose.addEventListener('click', close);
  stage.focus();
  setSlide(0);

  return close;
}
